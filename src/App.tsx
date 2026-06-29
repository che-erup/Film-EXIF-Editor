import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { confirm } from "@tauri-apps/plugin-dialog";
import ThumbnailPanel from "./components/Layout/ThumbnailPanel";
import PreviewPanel from "./components/Layout/PreviewPanel";
import EditFormPanel from "./components/Layout/EditFormPanel";
import StatusBar from "./components/Layout/StatusBar";
import {
  pickImageFiles,
  pickFolder,
  loadImages,
  loadImage,
  saveDate,
  saveBatch,
  type ExifTags,
  type SaveResult,
  type SaveItem,
} from "./ipc/exif";
import { looseNormalize, parseDto, formatDto, addSeconds } from "./lib/dateUtils";

/** 화면에서 다루는 한 장 */
export interface Frame {
  path: string;
  fileName: string;
  format: string;
  tags: ExifTags | null; // 선택 시 채워짐
  pendingCommon: Partial<RollCommon>; // 이 컷에 적용된 롤 공통값(메모리)
  commonApplied: boolean; // "공통 적용됨" 배지용
  pendingEdits: { dateTimeOriginal?: string }; // 이 컷의 개별 편집(메모리)
  dateApplied: boolean; // "날짜 적용됨" 배지용
}

/** 롤 공통 정보 — 한 통 전체에 동일 (적용은 단계 6) */
export interface RollCommon {
  make: string;
  model: string;
  lensMake: string;
  lensModel: string;
  filmStock: string;
  devLab: string;
}

const EMPTY_ROLL: RollCommon = {
  make: "",
  model: "",
  lensMake: "",
  lensModel: "",
  filmStock: "",
  devLab: "",
};

function App() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [listInfo, setListInfo] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const [tagError, setTagError] = useState<string | null>(null);
  const [loadingTags, setLoadingTags] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [backupOriginal, setBackupOriginal] = useState(true);

  // 배치 저장(모든 사진)
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [batchInfo, setBatchInfo] = useState<string | null>(null);

  // 롤 공통 입력 + 적용(메모리 전용 — 디스크는 안 건드림)
  const [rollCommon, setRollCommon] = useState<RollCommon>(EMPTY_ROLL);
  const onRollChange = (patch: Partial<RollCommon>) =>
    setRollCommon((prev) => ({ ...prev, ...patch }));
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [applyInfo, setApplyInfo] = useState<string | null>(null);
  const [applyDateInfo, setApplyDateInfo] = useState<string | null>(null);

  // 빈 칸을 뺀 패치 (빈 값은 덮어쓰지 않음)
  function nonEmptyPatch(): Partial<RollCommon> {
    const patch: Partial<RollCommon> = {};
    (Object.keys(rollCommon) as (keyof RollCommon)[]).forEach((k) => {
      const v = rollCommon[k].trim();
      if (v) patch[k] = v;
    });
    return patch;
  }

  function handleApplyCommon() {
    const patch = nonEmptyPatch();
    if (Object.keys(patch).length === 0 || frames.length === 0) return;
    setFrames((prev) =>
      prev.map((f) => ({
        ...f,
        pendingCommon: { ...f.pendingCommon, ...patch },
        commonApplied: true,
      }))
    );
    setHistory((prev) => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof RollCommon)[]).forEach((k) => {
        const set = new Set(next[k] ?? []);
        set.add(patch[k] as string);
        next[k] = Array.from(set);
      });
      return next;
    });
    setApplyInfo(`${frames.length}장에 공통 정보 적용됨 · 저장 전이라 파일은 아직 안 바뀜`);
  }

  // 자동완성 후보: 과거 적용값 + 불러온 사진들의 기존 EXIF
  const suggestions = useMemo(() => {
    const tagOf: Record<keyof RollCommon, string | null> = {
      make: "Make",
      model: "Model",
      lensMake: "LensMake",
      lensModel: "LensModel",
      filmStock: "Film",
      devLab: "DevLab",
    };
    const out = {} as Record<keyof RollCommon, string[]>;
    (Object.keys(tagOf) as (keyof RollCommon)[]).forEach((field) => {
      const set = new Set<string>(history[field] ?? []);
      const tk = tagOf[field];
      if (tk) {
        for (const f of frames) {
          const v = f.tags?.[tk];
          if (typeof v === "string" && v.trim()) set.add(v.trim());
        }
      }
      out[field] = Array.from(set).slice(0, 20);
    });
    return out;
  }, [frames, history]);

  const applyDisabled =
    frames.length === 0 || Object.keys(nonEmptyPatch()).length === 0;

  // 비동기 콜백에서 최신값을 읽기 위한 ref
  const framesRef = useRef<Frame[]>([]);
  const currentRef = useRef<string | null>(null);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);
  useEffect(() => {
    currentRef.current = currentPath;
  }, [currentPath]);

  const currentFrame = frames.find((f) => f.path === currentPath) ?? null;

  // 편집 의도(pendingEdits)가 있으면 그것을, 없으면 원본 촬영일을 날짜칸에 채운다
  function dtoForDisplay(
    pending: { dateTimeOriginal?: string } | undefined,
    tags: ExifTags | null
  ): string {
    if (pending?.dateTimeOriginal) return pending.dateTimeOriginal;
    return typeof tags?.DateTimeOriginal === "string" ? tags.DateTimeOriginal : "";
  }

  // UserComment에서 복원된 필름·현상소를, 폼이 비어 있을 때만 칸에 채운다(FR-10 복원)
  const seedRollFromTags = useCallback((t: ExifTags) => {
    const film = typeof t.Film === "string" ? t.Film : "";
    const dev = typeof t.DevLab === "string" ? t.DevLab : "";
    if (!film && !dev) return;
    setRollCommon((prev) => ({
      ...prev,
      filmStock: prev.filmStock || film,
      devLab: prev.devLab || dev,
    }));
  }, []);

  // 현재 프레임의 EXIF를 (없으면) 읽어 캐시하고 날짜칸을 채운다
  const ensureTags = useCallback(
    async (path: string) => {
      const cached = framesRef.current.find((f) => f.path === path);
      if (cached?.tags) {
        if (currentRef.current === path) {
          setDateInput(dtoForDisplay(cached.pendingEdits, cached.tags));
          seedRollFromTags(cached.tags);
        }
        return;
      }
      setTagError(null);
      setLoadingTags(true);
      try {
        const tags = await loadImage(path);
        setFrames((prev) => prev.map((f) => (f.path === path ? { ...f, tags } : f)));
        if (currentRef.current === path) {
          const pending = framesRef.current.find((f) => f.path === path)?.pendingEdits;
          setDateInput(dtoForDisplay(pending, tags));
          seedRollFromTags(tags);
        }
      } catch (e) {
        if (currentRef.current === path) setTagError(String(e));
      } finally {
        setLoadingTags(false);
      }
    },
    [seedRollFromTags]
  );

  const setCurrent = useCallback(
    (path: string) => {
      currentRef.current = path;
      setCurrentPath(path);
      setSaveResult(null);
      setTagError(null);
      void ensureTags(path);
    },
    [ensureTags]
  );

  // 경로 목록을 받아 프레임에 추가(중복 제외)
  const doLoad = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      try {
        const res = await loadImages(paths);
        const prev = framesRef.current;
        const existing = new Set(prev.map((f) => f.path));
        const added: Frame[] = res.frames
          .filter((f) => !existing.has(f.path))
          .map((f) => ({
            ...f,
            tags: null,
            pendingCommon: {},
            commonApplied: false,
            pendingEdits: {},
            dateApplied: false,
          }));
        const next = [...prev, ...added];
        framesRef.current = next;
        setFrames(next);
        setListInfo(
          `${added.length}장 추가 (전체 ${next.length})` +
            (res.skipped > 0 ? ` · 미지원 ${res.skipped}개 제외` : "")
        );
        if (!currentRef.current && next.length > 0) {
          setSelected(new Set([next[0].path]));
          setAnchor(0);
          setCurrent(next[0].path);
        }
      } catch (e) {
        setListInfo(`불러오기 실패: ${String(e)}`);
      }
    },
    [setCurrent]
  );

  // 드래그앤드롭 등록
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "over" || event.payload.type === "enter") {
          setDropping(true);
        } else if (event.payload.type === "drop") {
          setDropping(false);
          void doLoad(event.payload.paths);
        } else {
          setDropping(false);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [doLoad]);

  function handleSelect(
    path: string,
    e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }
  ) {
    const idx = frames.findIndex((f) => f.path === path);
    if (e.shiftKey && anchor !== null) {
      const [a, b] = anchor < idx ? [anchor, idx] : [idx, anchor];
      setSelected(new Set(frames.slice(a, b + 1).map((f) => f.path)));
      setCurrent(path);
    } else if (e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const nextSel = new Set(prev);
        if (nextSel.has(path)) nextSel.delete(path);
        else nextSel.add(path);
        return nextSel;
      });
      setAnchor(idx);
      setCurrent(path);
    } else {
      setSelected(new Set([path]));
      setAnchor(idx);
      setCurrent(path);
    }
  }

  function selectAll() {
    setSelected(new Set(frames.map((f) => f.path)));
  }

  async function handlePickFiles() {
    await doLoad(await pickImageFiles());
  }
  async function handlePickFolder() {
    const dir = await pickFolder();
    if (dir) await doLoad([dir]);
  }

  async function handleSave() {
    if (!currentPath) return;
    const norm = looseNormalize(dateInput);
    if (!norm.ok || !norm.value) {
      setSaveResult({
        ok: false,
        written: dateInput,
        verified: "",
        backup: "",
        message: norm.error ?? "날짜 형식 오류",
      });
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await saveDate(currentPath, norm.value, backupOriginal);
      setSaveResult(res);
      const tags = await loadImage(currentPath);
      setFrames((prev) => prev.map((f) => (f.path === currentPath ? { ...f, tags } : f)));
    } catch (e) {
      setSaveResult({ ok: false, written: norm.value, verified: "", backup: "", message: String(e) });
    } finally {
      setSaving(false);
    }
  }

  // 선택한 컷에만 날짜 적용 (메모리). 자동 증가 시 순서대로 +간격.
  function handleApplyDate(opts: { autoIncrement: boolean; intervalSec: number }) {
    const norm = looseNormalize(dateInput);
    if (!norm.ok || !norm.value) {
      setApplyDateInfo(`날짜 오류: ${norm.error}`);
      return;
    }
    const order = frames.filter((f) => selected.has(f.path));
    if (order.length === 0) {
      setApplyDateInfo("먼저 사진을 선택하세요");
      return;
    }
    const base = parseDto(norm.value);
    const orderIdx = new Map(order.map((f, i) => [f.path, i]));
    setFrames((prev) =>
      prev.map((f) => {
        const i = orderIdx.get(f.path);
        if (i === undefined) return f;
        const dto =
          opts.autoIncrement && base
            ? formatDto(addSeconds(base, i * opts.intervalSec))
            : norm.value!;
        return { ...f, pendingEdits: { ...f.pendingEdits, dateTimeOriginal: dto }, dateApplied: true };
      })
    );
    // 현재 프레임 입력칸도 반영
    const curIdx = currentPath ? orderIdx.get(currentPath) : undefined;
    if (curIdx !== undefined) {
      setDateInput(
        opts.autoIncrement && base
          ? formatDto(addSeconds(base, curIdx * opts.intervalSec))
          : norm.value
      );
    }
    setApplyDateInfo(
      opts.autoIncrement
        ? `${order.length}장에 적용 · 시작 ${norm.value}, +${opts.intervalSec}초씩 · 저장 전`
        : `${order.length}장에 날짜 적용됨 (${norm.value}) · 저장 전`
    );
  }

  // 모든 사진(변경 있는 컷) 한 번에 저장
  async function handleSaveAll() {
    const items: SaveItem[] = frames
      .filter((f) => f.pendingEdits.dateTimeOriginal || f.commonApplied)
      .map((f) => ({
        path: f.path,
        dateTimeOriginal: f.pendingEdits.dateTimeOriginal,
        make: f.pendingCommon.make,
        model: f.pendingCommon.model,
        lensMake: f.pendingCommon.lensMake,
        lensModel: f.pendingCommon.lensModel,
        film: f.pendingCommon.filmStock,
        devLab: f.pendingCommon.devLab,
      }));

    if (items.length === 0) {
      setBatchInfo("저장할 변경이 없습니다 (먼저 적용하세요)");
      return;
    }

    const yes = await confirm(
      `${items.length}장을 저장합니다.\n백업: ${
        backupOriginal ? "켜짐 (original 폴더에 복사)" : "꺼짐 (원본 직접 수정)"
      }\n계속할까요?`,
      { title: "모든 사진 저장" }
    );
    if (!yes) return;

    setBatchSaving(true);
    setBatchInfo(null);
    setBatchProgress({ done: 0, total: items.length });
    const unlisten = await listen<{ done: number; total: number }>(
      "save-progress",
      (e) => setBatchProgress(e.payload)
    );
    try {
      const res = await saveBatch(items, backupOriginal);
      setBatchInfo(`${res.okCount} 성공 / ${res.failCount} 실패`);
      // 저장된 컷의 태그 캐시를 비워 다음 선택 시 새로 읽게 한다
      const okPaths = new Set(res.items.filter((it) => it.ok).map((it) => it.path));
      setFrames((prev) =>
        prev.map((f) => (okPaths.has(f.path) ? { ...f, tags: null } : f))
      );
      if (currentPath && okPaths.has(currentPath)) {
        framesRef.current = framesRef.current.map((f) =>
          f.path === currentPath ? { ...f, tags: null } : f
        );
        void ensureTags(currentPath);
      }
    } catch (e) {
      setBatchInfo(`저장 실패: ${String(e)}`);
    } finally {
      unlisten();
      setBatchSaving(false);
    }
  }

  return (
    <div className="relative flex h-screen flex-col bg-ink text-paper">
      <main className="flex min-h-0 flex-1">
        <ThumbnailPanel
          frames={frames}
          selected={selected}
          currentPath={currentPath}
          onSelect={handleSelect}
          onPickFiles={handlePickFiles}
          onPickFolder={handlePickFolder}
          onSelectAll={selectAll}
          listInfo={listInfo}
        />
        <PreviewPanel
          path={currentFrame?.path ?? null}
          fileName={currentFrame?.fileName ?? null}
          tags={currentFrame?.tags ?? null}
          loading={loadingTags}
          error={tagError}
        />
        <EditFormPanel
          hasImage={!!currentPath}
          rollCommon={rollCommon}
          onRollChange={onRollChange}
          onApplyCommon={handleApplyCommon}
          applyDisabled={applyDisabled}
          applyInfo={applyInfo}
          suggestions={suggestions}
          dateInput={dateInput}
          onDateChange={setDateInput}
          onSave={handleSave}
          saving={saving}
          saveResult={saveResult}
          selectedCount={selected.size}
          onApplyDate={handleApplyDate}
          applyDateInfo={applyDateInfo}
          backupOriginal={backupOriginal}
          onBackupChange={setBackupOriginal}
        />
      </main>
      <StatusBar
        selected={selected.size}
        total={frames.length}
        onSaveAll={handleSaveAll}
        saving={batchSaving}
        batchInfo={batchInfo}
      />

      {batchSaving && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/80">
          <div className="rounded-lg border border-line bg-charcoal px-6 py-4 text-center">
            <p className="text-body text-paper">저장 중…</p>
            <p className="mt-1 font-mono text-label text-amber">
              {batchProgress.done} / {batchProgress.total}
            </p>
          </div>
        </div>
      )}

      {dropping && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-amber bg-ink/70">
          <p className="text-title text-amber">여기에 놓아 불러오기</p>
        </div>
      )}
    </div>
  );
}

export default App;

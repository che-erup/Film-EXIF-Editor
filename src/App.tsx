import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { confirm } from "@tauri-apps/plugin-dialog";
import ThumbnailPanel from "./components/Layout/ThumbnailPanel";
import PreviewPanel from "./components/Layout/PreviewPanel";
import EditFormPanel from "./components/Layout/EditFormPanel";
import StatusBar from "./components/Layout/StatusBar";
import SaveDialog from "./components/SaveDialog";
import {
  pickImageFiles,
  pickFolder,
  loadImages,
  loadImage,
  saveDate,
  saveBatch,
  cancelSave,
  loadPresets,
  savePresets,
  saveSession,
  loadSession,
  pickSaveCsv,
  pickOpenCsv,
  writeTextFile,
  readTextFile,
  type ExifTags,
  type SaveResult,
  type SaveItem,
  type BatchResult,
  type Preset,
} from "./ipc/exif";
import { looseNormalize, parseDto, formatDto, addSeconds } from "./lib/dateUtils";
import { parseCsv, toCsv } from "./lib/csv";
import { FILM_STOCKS } from "./lib/filmStocks";

/** 화면에서 다루는 한 장 */
export interface Frame {
  path: string;
  fileName: string;
  format: string;
  tags: ExifTags | null; // 선택 시 채워짐
  pendingCommon: Partial<RollCommon>; // 이 컷에 적용된 롤 공통값(메모리)
  commonApplied: boolean; // "공통 적용됨" 배지용
  pendingEdits: { dateTimeOriginal?: string; latitude?: string; longitude?: string }; // 이 컷의 개별 편집(메모리)
  dateApplied: boolean; // "날짜 적용됨" 배지용
}

/** 롤 공통 정보 — 한 통 전체에 동일 */
export interface RollCommon {
  make: string;
  model: string;
  lensMake: string;
  lensModel: string;
  filmStock: string;
  iso: string; // 필름 박스 감도 → ISOSpeedRatings
  ei: string; // 노출지수 → ExposureIndex
  devLab: string;
}

const EMPTY_ROLL: RollCommon = {
  make: "",
  model: "",
  lensMake: "",
  lensModel: "",
  filmStock: "",
  iso: "",
  ei: "",
  devLab: "",
};

/** 한 컷의 편집 의도(메모리) — 스냅샷/세션 저장 대상 */
interface FrameEditState {
  pendingCommon: Partial<RollCommon>;
  commonApplied: boolean;
  pendingEdits: { dateTimeOriginal?: string; latitude?: string; longitude?: string };
  dateApplied: boolean;
}

/** Undo/Redo 스냅샷 */
interface EditSnapshot {
  rollCommon: RollCommon;
  edits: Record<string, FrameEditState>;
}

/** 자동저장 세션 */
interface Session {
  frames: ({ path: string; fileName: string; format: string } & FrameEditState)[];
  rollCommon: RollCommon;
  currentPath: string | null;
}

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
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLon, setGpsLon] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const [backupOriginal, setBackupOriginal] = useState(true);
  const [scrubScanner, setScrubScanner] = useState(false);

  // 배치 저장(모든 사진) — 요약 → 저장 → 결과
  const [saveStage, setSaveStage] = useState<"idle" | "confirm" | "saving" | "done">("idle");
  const [saveItems, setSaveItems] = useState<SaveItem[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // 롤 공통 입력 + 적용(메모리 전용 — 디스크는 안 건드림)
  const [rollCommon, setRollCommon] = useState<RollCommon>(EMPTY_ROLL);
  const onRollChange = (patch: Partial<RollCommon>) =>
    setRollCommon((prev) => ({ ...prev, ...patch }));
  const [history, setHistory] = useState<Record<string, string[]>>({});
  const [applyInfo, setApplyInfo] = useState<string | null>(null);
  const [applyDateInfo, setApplyDateInfo] = useState<string | null>(null);

  // Undo/Redo + 세션 (FR-12,13)
  const [undoStack, setUndoStack] = useState<EditSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<EditSnapshot[]>([]);
  const [sessionReady, setSessionReady] = useState(false);

  // 프리셋 (FR-11)
  const [presets, setPresets] = useState<Preset[]>([]);
  useEffect(() => {
    loadPresets()
      .then(setPresets)
      .catch(() => {});
  }, []);

  function applyPreset(name: string) {
    const p = presets.find((x) => x.name === name);
    if (!p) return;
    pushHistory();
    const { name: _omit, ...roll } = p;
    setRollCommon(roll);
  }
  async function savePreset(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = [
      ...presets.filter((x) => x.name !== trimmed),
      { name: trimmed, ...rollCommon },
    ].sort((a, b) => a.name.localeCompare(b.name));
    setPresets(next);
    try {
      await savePresets(next);
    } catch (e) {
      console.error(e);
    }
  }
  async function deletePreset(name: string) {
    const next = presets.filter((x) => x.name !== name);
    setPresets(next);
    try {
      await savePresets(next);
    } catch (e) {
      console.error(e);
    }
  }

  // 빈 칸을 뺀 패치 (빈 값은 덮어쓰지 않음)
  function nonEmptyPatch(): Partial<RollCommon> {
    const patch: Partial<RollCommon> = {};
    (Object.keys(rollCommon) as (keyof RollCommon)[]).forEach((k) => {
      const v = rollCommon[k].trim();
      if (v) patch[k] = v;
    });
    return patch;
  }

  function applyCommonCore(selectedOnly: boolean) {
    const patch = nonEmptyPatch();
    if (Object.keys(patch).length === 0) return;

    let targets: Set<string> | null = null;
    let count = frames.length;
    if (selectedOnly) {
      const order = frames.filter((f) => selected.has(f.path));
      if (order.length === 0) {
        setApplyInfo("먼저 사진을 선택하세요");
        return;
      }
      targets = new Set(order.map((f) => f.path));
      count = order.length;
    } else if (frames.length === 0) {
      return;
    }

    pushHistory();
    setFrames((prev) =>
      prev.map((f) =>
        !targets || targets.has(f.path)
          ? { ...f, pendingCommon: { ...f.pendingCommon, ...patch }, commonApplied: true }
          : f
      )
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
    setApplyInfo(
      selectedOnly
        ? `선택 ${count}장에 공통 정보 적용됨 · 저장 전`
        : `${count}장에 공통 정보 적용됨 · 저장 전이라 파일은 아직 안 바뀜`
    );
  }
  function handleApplyCommon() {
    applyCommonCore(false);
  }
  function handleApplyCommonSelected() {
    applyCommonCore(true);
  }

  // 자동완성 후보: 과거 적용값 + 불러온 사진들의 기존 EXIF
  const suggestions = useMemo(() => {
    const tagOf: Record<keyof RollCommon, string | null> = {
      make: "Make",
      model: "Model",
      lensMake: "LensMake",
      lensModel: "LensModel",
      filmStock: "Film",
      iso: "ISO",
      ei: "ExposureIndex",
      devLab: "DevLab",
    };
    const out = {} as Record<keyof RollCommon, string[]>;
    (Object.keys(tagOf) as (keyof RollCommon)[]).forEach((field) => {
      const set = new Set<string>(history[field] ?? []);
      // 필름 칸에는 내장 필름 목록을 후보로 추가 (FR-16)
      if (field === "filmStock") FILM_STOCKS.forEach((s) => set.add(s));
      const tk = tagOf[field];
      if (tk) {
        for (const f of frames) {
          const v = f.tags?.[tk];
          const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
          if (s.trim()) set.add(s.trim());
        }
      }
      // 필름 칸은 목록이 길어 자르지 않는다(브라우저가 입력에 맞춰 필터)
      out[field] = field === "filmStock" ? Array.from(set) : Array.from(set).slice(0, 20);
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
    const asStr = (v: unknown) =>
      typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
    const film = asStr(t.Film);
    const dev = asStr(t.DevLab);
    const iso = asStr(t.ISO);
    const ei = asStr(t.ExposureIndex);
    if (!film && !dev && !iso && !ei) return;
    setRollCommon((prev) => ({
      ...prev,
      filmStock: prev.filmStock || film,
      devLab: prev.devLab || dev,
      iso: prev.iso || iso,
      ei: prev.ei || ei,
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

  // 불러온 사진 목록 초기화 (원본 파일은 그대로 — 앱 목록에서만 제거)
  async function handleClearAll() {
    if (frames.length === 0) return;
    const yes = await confirm(
      `불러온 ${frames.length}장을 목록에서 비웁니다.\n저장하지 않은 편집 내용은 사라집니다(원본 파일은 그대로). 계속할까요?`,
      { title: "목록 비우기" }
    );
    if (!yes) return;
    framesRef.current = [];
    currentRef.current = null;
    setFrames([]);
    setSelected(new Set());
    setCurrentPath(null);
    setAnchor(null);
    setDateInput("");
    setGpsLat("");
    setGpsLon("");
    setApplyInfo(null);
    setApplyDateInfo(null);
    setSaveResult(null);
    setBatchResult(null);
    setTagError(null);
    setUndoStack([]);
    setRedoStack([]);
    setListInfo(null);
    setStatusNote("목록을 비웠습니다");
    void saveSession({ frames: [], rollCommon, currentPath: null });
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
    pushHistory();
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

  // 저장 아이템 생성. includeAll=true(스캐너 정리 시)면 변경 없는 컷도 포함.
  function buildSaveItems(only?: Set<string>, includeAll = false): SaveItem[] {
    return frames
      .filter(
        (f) =>
          (!only || only.has(f.path)) &&
          (includeAll || f.pendingEdits.dateTimeOriginal || f.commonApplied)
      )
      .map((f) => ({
        path: f.path,
        dateTimeOriginal: f.pendingEdits.dateTimeOriginal,
        make: f.pendingCommon.make,
        model: f.pendingCommon.model,
        lensMake: f.pendingCommon.lensMake,
        lensModel: f.pendingCommon.lensModel,
        film: f.pendingCommon.filmStock,
        iso: f.pendingCommon.iso,
        ei: f.pendingCommon.ei,
        devLab: f.pendingCommon.devLab,
        latitude: f.pendingEdits.latitude,
        longitude: f.pendingEdits.longitude,
      }));
  }

  // 선택한 컷에 GPS 위치 적용 (메모리)
  function handleApplyGps() {
    const lat = gpsLat.trim();
    const lon = gpsLon.trim();
    if (!lat && !lon) {
      setApplyDateInfo("위도/경도를 입력하세요");
      return;
    }
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (lat && (Number.isNaN(latN) || Math.abs(latN) > 90)) {
      setApplyDateInfo("위도는 -90 ~ 90 범위입니다");
      return;
    }
    if (lon && (Number.isNaN(lonN) || Math.abs(lonN) > 180)) {
      setApplyDateInfo("경도는 -180 ~ 180 범위입니다");
      return;
    }
    const order = frames.filter((f) => selected.has(f.path));
    if (order.length === 0) {
      setApplyDateInfo("먼저 사진을 선택하세요");
      return;
    }
    pushHistory();
    const sel = new Set(order.map((f) => f.path));
    setFrames((prev) =>
      prev.map((f) =>
        sel.has(f.path)
          ? {
              ...f,
              pendingEdits: {
                ...f.pendingEdits,
                latitude: lat || undefined,
                longitude: lon || undefined,
              },
            }
          : f
      )
    );
    setApplyDateInfo(`${order.length}장에 위치 적용됨 (${lat}, ${lon}) · 저장 전`);
  }

  // 1) "모든 사진 저장" → 변경 요약 확인
  function openSave() {
    if (frames.length === 0) {
      setStatusNote("불러온 사진이 없습니다");
      return;
    }
    setStatusNote(null);
    setBatchResult(null);
    setSaveStage("confirm");
  }

  // 확인 단계에서 저장 대상(요약)을 스크럽 설정에 맞춰 갱신
  useEffect(() => {
    if (saveStage === "confirm") setSaveItems(buildSaveItems(undefined, scrubScanner));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStage, scrubScanner, frames]);

  // 2) 실제 저장 실행 (확인/재시도 공통)
  async function runSave(items: SaveItem[]) {
    setSaveItems(items);
    setSaveStage("saving");
    setBatchProgress({ done: 0, total: items.length });
    const unlisten = await listen<{ done: number; total: number }>(
      "save-progress",
      (e) => setBatchProgress(e.payload)
    );
    try {
      const res = await saveBatch(items, backupOriginal, scrubScanner);
      setBatchResult(res);
      setSaveStage("done");
      // 저장된 컷의 태그 캐시를 비워 다음 선택 시 새로 읽게 한다
      const okPaths = new Set(res.items.filter((it) => it.ok).map((it) => it.path));
      setFrames((prev) => prev.map((f) => (okPaths.has(f.path) ? { ...f, tags: null } : f)));
      if (currentPath && okPaths.has(currentPath)) {
        framesRef.current = framesRef.current.map((f) =>
          f.path === currentPath ? { ...f, tags: null } : f
        );
        void ensureTags(currentPath);
      }
    } catch (e) {
      setStatusNote(`저장 실패: ${String(e)}`);
      setSaveStage("idle");
    } finally {
      unlisten();
    }
  }

  function retryFailed() {
    if (!batchResult) return;
    const failedPaths = new Set(batchResult.items.filter((i) => !i.ok).map((i) => i.path));
    void runSave(buildSaveItems(failedPaths, scrubScanner));
  }

  // ── CSV 내보내기/가져오기 (FR-14) ──
  const CSV_COLS = [
    "fileName",
    "dateTimeOriginal",
    "make",
    "model",
    "lensMake",
    "lensModel",
    "filmStock",
    "iso",
    "ei",
    "devLab",
  ];

  async function handleExportCsv() {
    if (frames.length === 0) {
      setStatusNote("내보낼 사진이 없습니다");
      return;
    }
    const rows: string[][] = [CSV_COLS];
    for (const f of frames) {
      const date =
        f.pendingEdits.dateTimeOriginal ??
        (typeof f.tags?.DateTimeOriginal === "string" ? f.tags.DateTimeOriginal : "");
      const c = f.pendingCommon;
      rows.push([
        f.fileName,
        date,
        c.make ?? "",
        c.model ?? "",
        c.lensMake ?? "",
        c.lensModel ?? "",
        c.filmStock ?? "",
        c.iso ?? "",
        c.ei ?? "",
        c.devLab ?? "",
      ]);
    }
    const path = await pickSaveCsv();
    if (!path) return;
    try {
      await writeTextFile(path, toCsv(rows));
      setStatusNote(`CSV로 ${frames.length}장 내보냄`);
    } catch (e) {
      setStatusNote(`내보내기 실패: ${String(e)}`);
    }
  }

  async function handleImportCsv() {
    const path = await pickOpenCsv();
    if (!path) return;
    let text: string;
    try {
      text = await readTextFile(path);
    } catch (e) {
      setStatusNote(`CSV 읽기 실패: ${String(e)}`);
      return;
    }
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setStatusNote("CSV에 데이터 행이 없습니다");
      return;
    }
    const header = rows[0].map((h) => h.trim());
    const iFile = header.indexOf("fileName");
    if (iFile < 0) {
      setStatusNote("CSV에 fileName 열이 필요합니다");
      return;
    }
    const col = {
      date: header.indexOf("dateTimeOriginal"),
      make: header.indexOf("make"),
      model: header.indexOf("model"),
      lensMake: header.indexOf("lensMake"),
      lensModel: header.indexOf("lensModel"),
      filmStock: header.indexOf("filmStock"),
      iso: header.indexOf("iso"),
      ei: header.indexOf("ei"),
      devLab: header.indexOf("devLab"),
    };
    const byName = new Map<string, string[]>();
    for (let r = 1; r < rows.length; r++) {
      const fn = (rows[r][iFile] ?? "").trim();
      if (fn) byName.set(fn, rows[r]);
    }
    const matched = frames.filter((f) => byName.has(f.fileName)).length;
    if (matched === 0) {
      setStatusNote("일치하는 파일명이 없습니다 (fileName 확인)");
      return;
    }
    pushHistory();
    setFrames((prev) =>
      prev.map((f) => {
        const row = byName.get(f.fileName);
        if (!row) return f;
        const get = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

        let pendingEdits = f.pendingEdits;
        let dateApplied = f.dateApplied;
        const dateRaw = get(col.date);
        if (dateRaw) {
          const norm = looseNormalize(dateRaw);
          if (norm.ok && norm.value) {
            pendingEdits = { ...f.pendingEdits, dateTimeOriginal: norm.value };
            dateApplied = true;
          }
        }

        const patch: Partial<RollCommon> = {};
        const setIf = (key: keyof RollCommon, i: number) => {
          const v = get(i);
          if (v) patch[key] = v;
        };
        setIf("make", col.make);
        setIf("model", col.model);
        setIf("lensMake", col.lensMake);
        setIf("lensModel", col.lensModel);
        setIf("filmStock", col.filmStock);
        setIf("iso", col.iso);
        setIf("ei", col.ei);
        setIf("devLab", col.devLab);
        const hasCommon = Object.keys(patch).length > 0;

        return {
          ...f,
          pendingEdits,
          dateApplied,
          pendingCommon: hasCommon ? { ...f.pendingCommon, ...patch } : f.pendingCommon,
          commonApplied: hasCommon ? true : f.commonApplied,
        };
      })
    );
    setStatusNote(`CSV에서 ${matched}장 매칭 적용됨`);
  }

  // ── Undo/Redo (메모리 스냅샷, FR-13) ──
  function captureSnapshot(): EditSnapshot {
    const edits: Record<string, FrameEditState> = {};
    for (const f of frames) {
      edits[f.path] = {
        pendingCommon: f.pendingCommon,
        commonApplied: f.commonApplied,
        pendingEdits: f.pendingEdits,
        dateApplied: f.dateApplied,
      };
    }
    return { rollCommon, edits };
  }
  function restoreSnapshot(s: EditSnapshot) {
    setRollCommon(s.rollCommon);
    setFrames((prev) => prev.map((f) => (s.edits[f.path] ? { ...f, ...s.edits[f.path] } : f)));
  }
  function pushHistory() {
    setUndoStack((prev) => [...prev.slice(-49), captureSnapshot()]);
    setRedoStack([]);
  }
  function undo() {
    if (undoStack.length === 0) return;
    const snap = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, captureSnapshot()]);
    setUndoStack((u) => u.slice(0, -1));
    restoreSnapshot(snap);
  }
  function redo() {
    if (redoStack.length === 0) return;
    const snap = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, captureSnapshot()]);
    setRedoStack((r) => r.slice(0, -1));
    restoreSnapshot(snap);
  }

  // ── 세션 자동복원 (FR-12) ── 최초 1회 복원
  useEffect(() => {
    loadSession<Session>()
      .then((s) => {
        if (s && Array.isArray(s.frames) && s.frames.length > 0) {
          const restored: Frame[] = s.frames.map((pf) => ({
            path: pf.path,
            fileName: pf.fileName,
            format: pf.format,
            tags: null,
            pendingCommon: pf.pendingCommon ?? {},
            commonApplied: pf.commonApplied ?? false,
            pendingEdits: pf.pendingEdits ?? {},
            dateApplied: pf.dateApplied ?? false,
          }));
          framesRef.current = restored;
          setFrames(restored);
          if (s.rollCommon) setRollCommon(s.rollCommon);
          const cp =
            s.currentPath && restored.some((f) => f.path === s.currentPath)
              ? s.currentPath
              : restored[0]?.path ?? null;
          if (cp) {
            setSelected(new Set([cp]));
            setCurrent(cp);
          }
          setStatusNote(`이전 작업을 복원했습니다 (${restored.length}장)`);
        }
      })
      .catch(() => {})
      .finally(() => setSessionReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 변경 시 디바운스 자동저장
  useEffect(() => {
    if (!sessionReady) return;
    const t = setTimeout(() => {
      const session: Session = {
        frames: frames.map((f) => ({
          path: f.path,
          fileName: f.fileName,
          format: f.format,
          pendingCommon: f.pendingCommon,
          commonApplied: f.commonApplied,
          pendingEdits: f.pendingEdits,
          dateApplied: f.dateApplied,
        })),
        rollCommon,
        currentPath,
      };
      void saveSession(session);
    }, 1200);
    return () => clearTimeout(t);
  }, [frames, rollCommon, currentPath, sessionReady]);

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
          onClearAll={handleClearAll}
          onImportCsv={handleImportCsv}
          onExportCsv={handleExportCsv}
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
          presets={presets}
          onApplyPreset={applyPreset}
          onSavePreset={savePreset}
          onDeletePreset={deletePreset}
          onApplyCommon={handleApplyCommon}
          onApplyCommonSelected={handleApplyCommonSelected}
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
          gpsLat={gpsLat}
          gpsLon={gpsLon}
          onGpsLatChange={setGpsLat}
          onGpsLonChange={setGpsLon}
          onApplyGps={handleApplyGps}
          backupOriginal={backupOriginal}
          onBackupChange={setBackupOriginal}
        />
      </main>
      <StatusBar
        selected={selected.size}
        total={frames.length}
        onSaveAll={openSave}
        saving={saveStage === "saving"}
        batchInfo={statusNote}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={undo}
        onRedo={redo}
      />

      {saveStage !== "idle" && (
        <SaveDialog
          stage={saveStage}
          items={saveItems}
          backupOriginal={backupOriginal}
          scrubScanner={scrubScanner}
          onScrubChange={setScrubScanner}
          progress={batchProgress}
          result={batchResult}
          onConfirm={() => void runSave(saveItems)}
          onCancelSave={() => void cancelSave()}
          onRetryFailed={retryFailed}
          onClose={() => setSaveStage("idle")}
        />
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

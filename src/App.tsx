import { useEffect, useRef, useState, useCallback } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
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
  type ExifTags,
  type SaveResult,
} from "./ipc/exif";

/** 화면에서 다루는 한 장 */
export interface Frame {
  path: string;
  fileName: string;
  format: string;
  tags: ExifTags | null; // 선택 시 채워짐
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
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);

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

  // 현재 프레임의 EXIF를 (없으면) 읽어 캐시하고 날짜칸을 채운다
  const ensureTags = useCallback(async (path: string) => {
    const cached = framesRef.current.find((f) => f.path === path);
    if (cached?.tags) {
      if (currentRef.current === path) {
        setDateInput(
          typeof cached.tags.DateTimeOriginal === "string"
            ? cached.tags.DateTimeOriginal
            : ""
        );
      }
      return;
    }
    setTagError(null);
    setLoadingTags(true);
    try {
      const tags = await loadImage(path);
      setFrames((prev) => prev.map((f) => (f.path === path ? { ...f, tags } : f)));
      if (currentRef.current === path) {
        setDateInput(
          typeof tags.DateTimeOriginal === "string" ? tags.DateTimeOriginal : ""
        );
      }
    } catch (e) {
      if (currentRef.current === path) setTagError(String(e));
    } finally {
      setLoadingTags(false);
    }
  }, []);

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
          .map((f) => ({ ...f, tags: null }));
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
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await saveDate(currentPath, dateInput);
      setSaveResult(res);
      const tags = await loadImage(currentPath);
      setFrames((prev) => prev.map((f) => (f.path === currentPath ? { ...f, tags } : f)));
    } catch (e) {
      setSaveResult({ ok: false, written: dateInput, verified: "", backup: "", message: String(e) });
    } finally {
      setSaving(false);
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
          dateInput={dateInput}
          onDateChange={setDateInput}
          onSave={handleSave}
          saving={saving}
          saveResult={saveResult}
        />
      </main>
      <StatusBar selected={selected.size} total={frames.length} />

      {dropping && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-amber bg-ink/70">
          <p className="text-title text-amber">여기에 놓아 불러오기</p>
        </div>
      )}
    </div>
  );
}

export default App;

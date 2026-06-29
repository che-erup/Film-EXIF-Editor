import { convertFileSrc } from "@tauri-apps/api/core";
import type { Frame } from "../../App";

/**
 * 왼쪽 패널 — 썸네일 그리드 + 다중 선택 (FR-2).
 * 정사각형 격자 + 이미지 lazy 로딩(화면 밖 이미지는 로드 안 함).
 */
interface Props {
  frames: Frame[];
  selected: Set<string>;
  currentPath: string | null;
  onSelect: (
    path: string,
    e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }
  ) => void;
  onPickFiles: () => void;
  onPickFolder: () => void;
  onSelectAll: () => void;
  onImportCsv: () => void;
  onExportCsv: () => void;
  listInfo: string | null;
}

/** 웹뷰가 직접 그릴 수 있는 형식만 썸네일로 표시 */
const RENDERABLE = ["jpg", "jpeg", "png", "webp", "gif"];

export default function ThumbnailPanel({
  frames,
  selected,
  currentPath,
  onSelect,
  onPickFiles,
  onPickFolder,
  onSelectAll,
  onImportCsv,
  onExportCsv,
  listInfo,
}: Props) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-charcoal">
      <header className="border-b border-line px-3 py-3">
        <h2 className="mb-2 text-subtitle font-medium text-paper">사진 목록</h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onPickFiles}
            className="flex-1 rounded bg-amber px-2 py-1.5 text-label font-medium text-ink hover:brightness-110"
          >
            사진 추가
          </button>
          <button
            type="button"
            onClick={onPickFolder}
            className="flex-1 rounded border border-line px-2 py-1.5 text-label text-paper hover:border-amber"
          >
            폴더 추가
          </button>
        </div>
        {listInfo && <p className="mt-2 text-label text-muted">{listInfo}</p>}
      </header>

      {frames.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center">
          <p className="text-body text-muted">사진이 없습니다</p>
          <p className="text-label text-muted/70">
            창으로 끌어다 놓거나
            <br />
            위 버튼으로 추가하세요
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 overflow-y-auto p-2">
          {frames.map((f) => {
            const isSel = selected.has(f.path);
            const isCur = currentPath === f.path;
            const renderable = RENDERABLE.includes(f.format);
            return (
              <button
                key={f.path}
                type="button"
                title={f.fileName}
                onClick={(e) =>
                  onSelect(f.path, {
                    metaKey: e.metaKey,
                    ctrlKey: e.ctrlKey,
                    shiftKey: e.shiftKey,
                  })
                }
                className={`relative block h-24 w-full overflow-hidden rounded border bg-ink ${
                  isSel ? "border-amber ring-1 ring-amber" : "border-line"
                } ${isCur ? "outline outline-1 outline-paper" : ""}`}
              >
                {renderable ? (
                  <img
                    loading="lazy"
                    src={convertFileSrc(f.path)}
                    alt={f.fileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-label uppercase text-muted">
                    {f.format || "?"}
                  </span>
                )}
                {isSel && (
                  <span className="absolute right-0.5 top-0.5 rounded-full bg-sage px-1 text-label text-ink">
                    ✓
                  </span>
                )}
                {f.commonApplied && (
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-sage/90 px-1 text-label text-ink">
                    공통
                  </span>
                )}
                {f.dateApplied && (
                  <span className="absolute bottom-0.5 right-0.5 rounded bg-amber/90 px-1 text-label text-ink">
                    날짜
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <footer className="space-y-1.5 border-t border-line px-3 py-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onImportCsv}
            className="flex-1 rounded border border-line px-2 py-1.5 text-label text-paper hover:border-amber"
          >
            CSV 가져오기
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={frames.length === 0}
            className="flex-1 rounded border border-line px-2 py-1.5 text-label text-paper hover:border-amber disabled:opacity-40"
          >
            CSV 내보내기
          </button>
        </div>
        <button
          type="button"
          onClick={onSelectAll}
          disabled={frames.length === 0}
          className="w-full rounded border border-line px-3 py-1.5 text-label text-paper hover:border-amber disabled:opacity-40"
        >
          전체 선택
        </button>
      </footer>
    </aside>
  );
}

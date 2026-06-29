import type { SaveItem, BatchResult } from "../ipc/exif";

/**
 * 저장 흐름 모달 (단계 9): 변경 요약 → 진행(취소 가능) → 결과(실패분 재시도).
 */
interface Props {
  stage: "confirm" | "saving" | "done";
  items: SaveItem[];
  backupOriginal: boolean;
  scrubScanner: boolean;
  onScrubChange: (v: boolean) => void;
  progress: { done: number; total: number };
  result: BatchResult | null;
  onConfirm: () => void;
  onCancelSave: () => void;
  onRetryFailed: () => void;
  onClose: () => void;
}

const baseName = (p: string) => p.split("/").pop() ?? p;

export default function SaveDialog({
  stage,
  items,
  backupOriginal,
  scrubScanner,
  onScrubChange,
  progress,
  result,
  onConfirm,
  onCancelSave,
  onRetryFailed,
  onClose,
}: Props) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/80 p-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-charcoal p-5">
        {stage === "confirm" && (
          <Confirm
            items={items}
            backupOriginal={backupOriginal}
            scrubScanner={scrubScanner}
            onScrubChange={onScrubChange}
            onConfirm={onConfirm}
            onClose={onClose}
          />
        )}
        {stage === "saving" && (
          <div className="text-center">
            <p className="text-subtitle font-medium text-paper">저장 중…</p>
            <p className="mt-2 font-mono text-title text-amber">
              {progress.done} / {progress.total}
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-ink">
              <div
                className="h-full bg-amber transition-all"
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            <button
              type="button"
              onClick={onCancelSave}
              className="mt-4 rounded border border-rust/60 px-4 py-1.5 text-body text-rust hover:bg-rust/10"
            >
              저장 취소
            </button>
          </div>
        )}
        {stage === "done" && result && (
          <Done result={result} onRetryFailed={onRetryFailed} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function Confirm({
  items,
  backupOriginal,
  scrubScanner,
  onScrubChange,
  onConfirm,
  onClose,
}: {
  items: SaveItem[];
  backupOriginal: boolean;
  scrubScanner: boolean;
  onScrubChange: (v: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dateCount = items.filter((i) => i.dateTimeOriginal).length;
  const camCount = items.filter((i) => i.make || i.model).length;
  const lensCount = items.filter((i) => i.lensMake || i.lensModel).length;
  const filmCount = items.filter((i) => i.film || i.devLab).length;
  const nothing = items.length === 0;

  return (
    <>
      <h2 className="mb-1 text-subtitle font-medium text-paper">저장 전 확인</h2>
      <p className="mb-3 text-label text-muted">
        총 {items.length}장에 아래 변경을 기록합니다.
      </p>
      <ul className="mb-3 space-y-1 text-body text-paper">
        <li>· 촬영 날짜: {dateCount}장</li>
        <li>· 카메라(제조사/모델): {camCount}장</li>
        <li>· 렌즈(제조사/모델): {lensCount}장</li>
        <li>· 필름/현상소: {filmCount}장</li>
      </ul>

      <label className="mb-2 flex items-center gap-2 text-body text-paper">
        <input
          type="checkbox"
          checked={scrubScanner}
          onChange={(e) => onScrubChange(e.target.checked)}
        />
        스캐너 정보 지우기
      </label>
      {scrubScanner && (
        <p className="mb-3 text-label text-muted">
          스캐너/스캔SW가 남긴 태그(Software·HostComputer·메이커노트·스캐너 Make/Model 등)만 삭제합니다.
          촬영일·디지털화 날짜·입력한 카메라/렌즈/필름은 보존됩니다. (변경 없는 컷도 포함)
        </p>
      )}

      <p className="mb-4 text-label text-muted">
        백업: {backupOriginal ? "켜짐 — original 폴더에 원본 복사" : "꺼짐 — 원본 직접 수정(되돌릴 수 없음)"}
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-line px-4 py-1.5 text-body text-paper hover:border-amber"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={nothing}
          className="rounded bg-amber px-4 py-1.5 text-body font-medium text-ink hover:brightness-110 disabled:opacity-40"
        >
          저장
        </button>
      </div>
      {nothing && (
        <p className="mt-2 text-right text-label text-muted">저장할 변경이 없습니다.</p>
      )}
    </>
  );
}

function Done({
  result,
  onRetryFailed,
  onClose,
}: {
  result: BatchResult;
  onRetryFailed: () => void;
  onClose: () => void;
}) {
  const failed = result.items.filter((i) => !i.ok);
  return (
    <>
      <h2 className="mb-2 text-subtitle font-medium text-paper">저장 결과</h2>
      <p className="text-body text-paper">
        <span className="text-sage">{result.okCount} 성공</span>
        {" / "}
        <span className={result.failCount > 0 ? "text-rust" : "text-muted"}>
          {result.failCount} 실패
        </span>
        {result.cancelled > 0 && (
          <span className="text-muted"> / {result.cancelled} 취소</span>
        )}
      </p>

      {failed.length > 0 && (
        <div className="mt-3 max-h-40 overflow-y-auto rounded border border-line p-2">
          {failed.slice(0, 8).map((f) => (
            <p key={f.path} className="text-label text-muted">
              <span className="text-rust">{baseName(f.path)}</span> — {f.message}
            </p>
          ))}
          {failed.length > 8 && (
            <p className="text-label text-muted">…외 {failed.length - 8}건</p>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        {failed.length > 0 && (
          <button
            type="button"
            onClick={onRetryFailed}
            className="rounded border border-amber px-4 py-1.5 text-body text-amber hover:bg-amber/10"
          >
            실패분 재시도 ({failed.length})
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-amber px-4 py-1.5 text-body font-medium text-ink hover:brightness-110"
        >
          닫기
        </button>
      </div>
    </>
  );
}

/**
 * 하단 상태바 — 선택/전체 수, 저장 결과 요약, 모든 사진 저장 버튼.
 */
interface Props {
  selected?: number;
  total?: number;
  onSaveAll: () => void;
  saving: boolean;
  batchInfo: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export default function StatusBar({
  selected = 0,
  total = 0,
  onSaveAll,
  saving,
  batchInfo,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: Props) {
  return (
    <footer className="flex h-10 shrink-0 items-center justify-between border-t border-line bg-charcoal px-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-label text-muted">
          선택 {selected} / 전체 {total}
        </span>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="실행 취소"
          className="rounded border border-line px-2 py-0.5 text-label text-paper hover:border-amber disabled:opacity-30"
        >
          ↶ 취소
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="다시 실행"
          className="rounded border border-line px-2 py-0.5 text-label text-paper hover:border-amber disabled:opacity-30"
        >
          ↷ 다시
        </button>
      </div>
      <div className="flex items-center gap-3">
        {batchInfo && <span className="text-label text-sage">{batchInfo}</span>}
        <button
          type="button"
          onClick={onSaveAll}
          disabled={saving || total === 0}
          className="rounded bg-amber px-4 py-1 text-label font-medium text-ink hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "저장 중…" : "모든 사진 저장"}
        </button>
      </div>
    </footer>
  );
}

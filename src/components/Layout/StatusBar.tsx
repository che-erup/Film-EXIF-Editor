/**
 * 하단 상태바 — 선택/전체 수, 프리셋, 저장 버튼 자리.
 */
interface Props {
  selected?: number;
  total?: number;
}

export default function StatusBar({ selected = 0, total = 0 }: Props) {
  return (
    <footer className="flex h-10 shrink-0 items-center justify-between border-t border-line bg-charcoal px-4">
      <span className="font-mono text-label text-muted">
        선택 {selected} / 전체 {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          className="rounded border border-line px-3 py-1 text-label text-muted"
        >
          프리셋 ▾
        </button>
        <button
          type="button"
          disabled
          className="rounded bg-amber/40 px-3 py-1 text-label font-medium text-ink"
        >
          저장
        </button>
      </div>
    </footer>
  );
}

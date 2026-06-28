/**
 * 왼쪽 패널 — 썸네일 그리드 자리 (단계 4에서 실제 구현).
 * 지금은 빈 자리표시만 둔다.
 */
export default function ThumbnailPanel() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-charcoal">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-subtitle font-medium text-paper">사진 목록</h2>
        <p className="text-label text-muted">불러온 컷이 여기에 표시됩니다</p>
      </header>

      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-center text-body text-muted">
          폴더나 사진을
          <br />
          여기로 끌어다 놓으세요
        </p>
      </div>

      <footer className="border-t border-line px-4 py-3">
        <button
          type="button"
          disabled
          className="w-full rounded border border-line px-3 py-2 text-body text-muted"
        >
          전체 선택
        </button>
      </footer>
    </aside>
  );
}

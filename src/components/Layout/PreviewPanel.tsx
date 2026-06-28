/**
 * 가운데 패널 — 선택한 사진의 큰 미리보기 자리 (단계 5에서 실제 구현).
 */
export default function PreviewPanel() {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-ink">
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex aspect-[3/2] w-full max-w-2xl items-center justify-center rounded-lg border border-dashed border-line">
          <p className="text-body text-muted">선택한 사진이 여기에 크게 보입니다</p>
        </div>
      </div>
    </section>
  );
}

/**
 * 오른쪽 패널 — 메타데이터 편집 폼 자리.
 * 두 구역(롤 공통 / 컷별)으로 나뉜다. (단계 5~7에서 실제 입력 연결)
 */
export default function EditFormPanel() {
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-charcoal p-4">
      {/* 롤 공통 구역 */}
      <section className="rounded-lg border border-line p-3">
        <h2 className="mb-1 text-subtitle font-medium text-paper">롤 공통</h2>
        <p className="mb-3 text-label text-muted">한 통 전체에 동일하게 적용</p>
        <div className="space-y-3">
          <FieldPlaceholder label="카메라 제조사" />
          <FieldPlaceholder label="카메라 모델" />
          <FieldPlaceholder label="렌즈 제조사" />
          <FieldPlaceholder label="렌즈 모델" />
          <FieldPlaceholder label="필름 종류" />
          <FieldPlaceholder label="현상소" />
        </div>
        <button
          type="button"
          disabled
          className="mt-3 w-full rounded bg-amber/40 px-3 py-2 text-body font-medium text-ink"
        >
          전체에 적용
        </button>
      </section>

      {/* 컷별 구역 */}
      <section className="rounded-lg border border-line p-3">
        <h2 className="mb-1 text-subtitle font-medium text-paper">컷별 (선택분)</h2>
        <p className="mb-3 text-label text-muted">선택한 사진에만 적용</p>
        <div className="space-y-3">
          <FieldPlaceholder label="촬영 날짜·시간" />
        </div>
        <button
          type="button"
          disabled
          className="mt-3 w-full rounded border border-line px-3 py-2 text-body text-muted"
        >
          선택 항목에 적용
        </button>
      </section>
    </aside>
  );
}

/** 단계 1용 비활성 입력칸 자리표시 */
function FieldPlaceholder({ label }: { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-label text-muted">{label}</span>
      <input
        type="text"
        disabled
        placeholder="—"
        className="w-full rounded border border-line bg-ink px-2 py-1.5 text-body text-paper placeholder:text-muted focus:border-amber focus:outline-none"
      />
    </label>
  );
}

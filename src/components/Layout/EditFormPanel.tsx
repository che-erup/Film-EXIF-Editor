import { useState } from "react";
import Calendar from "../Calendar";
import type { SaveResult } from "../../ipc/exif";
import type { RollCommon } from "../../App";

/**
 * 오른쪽 패널 — 메타데이터 편집 폼 (2구역).
 * [롤 공통] 카메라·렌즈·필름·현상소 입력 (적용 동작은 단계 6)
 * [컷별]   촬영 날짜·시간(달력+직접 입력) + 이 사진 안전 저장 (단계 3)
 */
interface Props {
  hasImage: boolean;
  rollCommon: RollCommon;
  onRollChange: (patch: Partial<RollCommon>) => void;
  onApplyCommon: () => void;
  applyDisabled: boolean;
  applyInfo: string | null;
  suggestions: Record<keyof RollCommon, string[]>;
  dateInput: string;
  onDateChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  saveResult: SaveResult | null;
}

/** EXIF 표준형 간이 검사 (상세 검증은 Rust에서) */
const DTO_RE = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/;

/** "YYYY:MM:DD HH:MM:SS" → 달력/시간 입력값 { date:"YYYY-MM-DD", time:"HH:MM:SS" } */
function dtoToPickers(dto: string): { date: string; time: string } {
  const m = dto.trim().match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return { date: "", time: "" };
  const [, y, mo, d, h, mi, s] = m;
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}:${s}` };
}

/** 달력(YYYY-MM-DD) + 시간(HH:MM[:SS]) → "YYYY:MM:DD HH:MM:SS" */
function pickersToDto(date: string, time: string): string {
  if (!date) return "";
  const [y, mo, d] = date.split("-");
  const tp = (time || "12:00:00").split(":");
  const h = (tp[0] ?? "12").padStart(2, "0");
  const mi = (tp[1] ?? "00").padStart(2, "0");
  const s = (tp[2] ?? "00").padStart(2, "0");
  return `${y}:${mo}:${d} ${h}:${mi}:${s}`;
}

export default function EditFormPanel({
  hasImage,
  rollCommon,
  onRollChange,
  onApplyCommon,
  applyDisabled,
  applyInfo,
  suggestions,
  dateInput,
  onDateChange,
  onSave,
  saving,
  saveResult,
}: Props) {
  const trimmed = dateInput.trim();
  const looksValid = DTO_RE.test(trimmed);
  const showWarning = hasImage && trimmed.length > 0 && !looksValid;
  const canSave = hasImage && looksValid && !saving;

  const pickers = dtoToPickers(dateInput);
  const disabled = !hasImage || saving;
  const [showCal, setShowCal] = useState(false);

  function onDatePart(v: string) {
    // 달력에서 날짜 선택 → 기존 시간(없으면 12:00:00) 유지하며 합침
    onDateChange(v ? pickersToDto(v, pickers.time || "12:00:00") : "");
  }
  function onTimePart(v: string) {
    // 시간 선택 → 날짜가 있어야 의미 있음
    if (!pickers.date) return;
    onDateChange(pickersToDto(pickers.date, v || "00:00:00"));
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-charcoal p-4">
      {/* 롤 공통 구역 — 입력 가능, 적용 동작은 단계 6 */}
      <section className="rounded-lg border border-line p-3">
        <h2 className="mb-1 text-subtitle font-medium text-paper">롤 공통</h2>
        <p className="mb-3 text-label text-muted">한 통 전체에 동일하게 적용</p>
        <div className="space-y-2.5">
          <Field
            label="카메라 제조사"
            value={rollCommon.make}
            onChange={(v) => onRollChange({ make: v })}
            placeholder="예: Nikon"
            suggestions={suggestions.make}
          />
          <Field
            label="카메라 모델"
            value={rollCommon.model}
            onChange={(v) => onRollChange({ model: v })}
            placeholder="예: FM2"
            suggestions={suggestions.model}
          />
          <Field
            label="렌즈 제조사"
            value={rollCommon.lensMake}
            onChange={(v) => onRollChange({ lensMake: v })}
            placeholder="예: Nikon"
            suggestions={suggestions.lensMake}
          />
          <Field
            label="렌즈 모델"
            value={rollCommon.lensModel}
            onChange={(v) => onRollChange({ lensModel: v })}
            placeholder="예: 50mm f/1.4"
            suggestions={suggestions.lensModel}
          />
          <Field
            label="필름 종류"
            value={rollCommon.filmStock}
            onChange={(v) => onRollChange({ filmStock: v })}
            placeholder="예: Portra 400"
            suggestions={suggestions.filmStock}
          />
          <Field
            label="현상소"
            value={rollCommon.devLab}
            onChange={(v) => onRollChange({ devLab: v })}
            placeholder="예: ○○현상소"
            suggestions={suggestions.devLab}
          />
        </div>
        <button
          type="button"
          onClick={onApplyCommon}
          disabled={applyDisabled}
          className="mt-3 w-full rounded bg-amber px-3 py-2 text-body font-medium text-ink hover:brightness-110 disabled:opacity-40"
        >
          전체에 적용
        </button>
        {applyInfo && <p className="mt-2 text-label text-sage">{applyInfo}</p>}
      </section>

      {/* 컷별 구역 — 단계 3 활성 */}
      <section className="rounded-lg border border-line p-3">
        <h2 className="mb-1 text-subtitle font-medium text-paper">컷별 (선택분)</h2>
        <p className="mb-3 text-label text-muted">선택한 사진에만 적용</p>

        <span className="mb-1 block text-label text-muted">촬영 날짜·시간</span>

        {/* 달력 선택 버튼 + 시간 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowCal((v) => !v)}
            disabled={disabled}
            className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1.5 text-left font-mono text-body text-paper hover:border-amber disabled:opacity-50"
          >
            {pickers.date || "날짜 선택 ▾"}
          </button>
          <input
            type="time"
            step="1"
            value={pickers.time}
            onChange={(e) => onTimePart(e.target.value)}
            disabled={disabled || !pickers.date}
            style={{ colorScheme: "dark" }}
            className="w-28 shrink-0 rounded border border-line bg-ink px-2 py-1.5 font-mono text-body text-paper focus:border-amber focus:outline-none disabled:opacity-50"
            aria-label="촬영 시간"
          />
        </div>

        {/* 인라인 달력 (웹뷰 기본 달력이 없으므로 직접 구현) */}
        {showCal && !disabled && (
          <div className="mt-2">
            <Calendar
              value={pickers.date}
              onSelect={(d) => {
                onDatePart(d);
                setShowCal(false);
              }}
            />
          </div>
        )}

        {/* 직접 입력 (오래된 연도 타이핑용) */}
        <label className="mt-2 block">
          <span className="mb-1 block text-label text-muted">또는 직접 입력</span>
          <input
            type="text"
            value={dateInput}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={disabled}
            placeholder="1998:05:10 12:00:00"
            className="w-full rounded border border-line bg-ink px-2 py-1.5 font-mono text-body text-paper placeholder:text-muted focus:border-amber focus:outline-none disabled:opacity-50"
          />
          <span className="mt-1 block text-label text-muted">형식: YYYY:MM:DD HH:MM:SS</span>
          {showWarning && (
            <span className="mt-1 block text-label text-rust">
              형식이 올바르지 않습니다 (예: 1998:05:10 12:00:00)
            </span>
          )}
        </label>

        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="mt-3 w-full rounded bg-amber px-3 py-2 text-body font-medium text-ink hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "저장 중…" : "이 사진 저장"}
        </button>

        {!hasImage && (
          <p className="mt-2 text-label text-muted">먼저 왼쪽에서 사진을 선택하세요.</p>
        )}

        {saveResult && (
          <div
            className={`mt-3 rounded border p-2 ${
              saveResult.ok ? "border-sage/50 bg-sage/10" : "border-rust/50 bg-rust/10"
            }`}
          >
            <p
              className={`text-label font-medium ${
                saveResult.ok ? "text-sage" : "text-rust"
              }`}
            >
              {saveResult.ok ? "✓ 저장 완료" : "✗ 저장 실패"}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-label text-muted">
              {saveResult.message}
            </p>
            {saveResult.ok && (
              <p className="mt-1 font-mono text-label text-paper">검증값: {saveResult.verified}</p>
            )}
          </div>
        )}
      </section>
    </aside>
  );
}

/** 롤 공통 텍스트 입력칸 (과거 입력값 자동완성 포함) */
function Field({
  label,
  value,
  onChange,
  placeholder,
  suggestions = [],
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  // 라벨에서 datalist용 안전한 id 생성
  const listId = `dl-${label.replace(/\s+/g, "-")}`;
  return (
    <label className="block">
      <span className="mb-1 block text-label text-muted">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={suggestions.length > 0 ? listId : undefined}
        className="w-full rounded border border-line bg-ink px-2 py-1.5 text-body text-paper placeholder:text-muted focus:border-amber focus:outline-none"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </label>
  );
}

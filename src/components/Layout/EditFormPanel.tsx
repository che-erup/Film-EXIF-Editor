import { useState } from "react";
import Calendar from "../Calendar";
import type { SaveResult, Preset } from "../../ipc/exif";
import type { RollCommon } from "../../App";
import { looseNormalize } from "../../lib/dateUtils";

/**
 * 오른쪽 패널 — 메타데이터 편집 폼 (2구역).
 * [롤 공통] 카메라·렌즈·필름·현상소 입력 + 전체에 적용 (단계 6)
 * [컷별]   촬영 날짜·시간(달력+직접+느슨한 입력) · 선택 항목에 적용/시간 자동 증가(단계 7) · 즉시 저장(단계 3)
 */
interface Props {
  hasImage: boolean;
  rollCommon: RollCommon;
  onRollChange: (patch: Partial<RollCommon>) => void;
  presets: Preset[];
  onApplyPreset: (name: string) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
  onApplyCommon: () => void;
  onApplyCommonSelected: () => void;
  applyDisabled: boolean;
  applyInfo: string | null;
  suggestions: Record<keyof RollCommon, string[]>;
  dateInput: string;
  onDateChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  saveResult: SaveResult | null;
  selectedCount: number;
  onApplyDate: (opts: { autoIncrement: boolean; intervalSec: number }) => void;
  applyDateInfo: string | null;
  gpsLat: string;
  gpsLon: string;
  onGpsLatChange: (v: string) => void;
  onGpsLonChange: (v: string) => void;
  onApplyGps: () => void;
  backupOriginal: boolean;
  onBackupChange: (v: boolean) => void;
}

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
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onApplyCommon,
  onApplyCommonSelected,
  applyDisabled,
  applyInfo,
  suggestions,
  dateInput,
  onDateChange,
  onSave,
  saving,
  saveResult,
  selectedCount,
  onApplyDate,
  applyDateInfo,
  gpsLat,
  gpsLon,
  onGpsLatChange,
  onGpsLonChange,
  onApplyGps,
  backupOriginal,
  onBackupChange,
}: Props) {
  const trimmed = dateInput.trim();
  const norm = looseNormalize(dateInput);
  const looksValid = norm.ok;
  const showWarning = hasImage && trimmed.length > 0 && !looksValid;
  const canSave = hasImage && looksValid && !saving;
  const canApplyDate = selectedCount > 0 && looksValid;

  const pickers = dtoToPickers(dateInput);
  const disabled = !hasImage || saving;
  const [showCal, setShowCal] = useState(false);
  const [autoInc, setAutoInc] = useState(false);
  const [intervalSec, setIntervalSec] = useState(1);
  const [presetSel, setPresetSel] = useState("");
  const [presetName, setPresetName] = useState("");

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

        {/* 프리셋 (FR-11) */}
        <div className="mb-3 space-y-1.5">
          <div className="flex gap-1.5">
            <select
              value={presetSel}
              onChange={(e) => {
                setPresetSel(e.target.value);
                if (e.target.value) onApplyPreset(e.target.value);
              }}
              style={{ colorScheme: "dark" }}
              className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1.5 text-body text-paper focus:border-amber focus:outline-none"
            >
              <option value="">프리셋 선택…</option>
              {presets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            {presetSel && (
              <button
                type="button"
                onClick={() => {
                  onDeletePreset(presetSel);
                  setPresetSel("");
                }}
                className="rounded border border-line px-2 py-1.5 text-label text-rust hover:border-rust"
              >
                삭제
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="새 프리셋 이름"
              className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1.5 text-label text-paper placeholder:text-muted focus:border-amber focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                onSavePreset(presetName);
                setPresetName("");
              }}
              disabled={!presetName.trim()}
              className="rounded border border-line px-2 py-1.5 text-label text-paper hover:border-amber disabled:opacity-40"
            >
              현재 값 저장
            </button>
          </div>
        </div>

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
            label="필름 감도 ISO"
            value={rollCommon.iso}
            onChange={(v) => onRollChange({ iso: v })}
            placeholder="예: 400 (박스 감도)"
            suggestions={suggestions.iso}
          />
          <Field
            label="노출지수 EI"
            value={rollCommon.ei}
            onChange={(v) => onRollChange({ ei: v })}
            placeholder="예: 800 (증감 촬영 시)"
            suggestions={suggestions.ei}
          />
          <Field
            label="현상소"
            value={rollCommon.devLab}
            onChange={(v) => onRollChange({ devLab: v })}
            placeholder="예: ○○현상소"
            suggestions={suggestions.devLab}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onApplyCommon}
            disabled={applyDisabled}
            className="flex-1 rounded bg-amber px-3 py-2 text-body font-medium text-ink hover:brightness-110 disabled:opacity-40"
          >
            전체에 적용
          </button>
          <button
            type="button"
            onClick={onApplyCommonSelected}
            disabled={applyDisabled || selectedCount === 0}
            className="flex-1 rounded border border-line px-3 py-2 text-body text-paper hover:border-amber disabled:opacity-40"
          >
            선택 적용
          </button>
        </div>
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

        {/* 직접/느슨한 입력 (오래된 연도 타이핑용) */}
        <label className="mt-2 block">
          <span className="mb-1 block text-label text-muted">또는 직접 입력</span>
          <input
            type="text"
            value={dateInput}
            onChange={(e) => onDateChange(e.target.value)}
            disabled={disabled}
            placeholder="1998 / 1998:05 / 1998:05:10 12:00:00"
            className="w-full rounded border border-line bg-ink px-2 py-1.5 font-mono text-body text-paper placeholder:text-muted focus:border-amber focus:outline-none disabled:opacity-50"
          />
          <span className="mt-1 block text-label text-muted">
            연·월만 입력해도 됩니다 (나머지는 자동 보충)
          </span>
          {showWarning && (
            <span className="mt-1 block text-label text-rust">{norm.error}</span>
          )}
        </label>

        {/* 시간 자동 증가 옵션 */}
        <label className="mt-3 flex items-center gap-2 text-label text-paper">
          <input
            type="checkbox"
            checked={autoInc}
            onChange={(e) => setAutoInc(e.target.checked)}
            disabled={!hasImage}
          />
          시간 자동 증가
          <input
            type="number"
            min={1}
            value={intervalSec}
            onChange={(e) => setIntervalSec(Math.max(1, parseInt(e.target.value || "1", 10)))}
            disabled={!hasImage || !autoInc}
            className="ml-1 w-16 rounded border border-line bg-ink px-1 py-0.5 text-center font-mono text-paper disabled:opacity-50"
          />
          초씩
        </label>

        {/* 선택 항목에 적용 (메모리) */}
        <button
          type="button"
          onClick={() => onApplyDate({ autoIncrement: autoInc, intervalSec })}
          disabled={!canApplyDate}
          className="mt-3 w-full rounded bg-amber px-3 py-2 text-body font-medium text-ink hover:brightness-110 disabled:opacity-40"
        >
          선택 {selectedCount}장에 적용
        </button>
        {applyDateInfo && <p className="mt-1 text-label text-sage">{applyDateInfo}</p>}

        {/* 촬영 위치 (GPS) — FR-15 */}
        <div className="mt-3 border-t border-line pt-3">
          <span className="mb-1 block text-label text-muted">촬영 위치 (GPS)</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={gpsLat}
              onChange={(e) => onGpsLatChange(e.target.value)}
              disabled={disabled}
              placeholder="위도 37.5665"
              className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1.5 font-mono text-body text-paper placeholder:text-muted focus:border-amber focus:outline-none disabled:opacity-50"
            />
            <input
              type="text"
              value={gpsLon}
              onChange={(e) => onGpsLonChange(e.target.value)}
              disabled={disabled}
              placeholder="경도 126.9780"
              className="min-w-0 flex-1 rounded border border-line bg-ink px-2 py-1.5 font-mono text-body text-paper placeholder:text-muted focus:border-amber focus:outline-none disabled:opacity-50"
            />
          </div>
          <span className="mt-1 block text-label text-muted">
            소수점 좌표(남위·서경은 -). 예: 37.5665, 126.9780
          </span>
          <button
            type="button"
            onClick={onApplyGps}
            disabled={!hasImage || selectedCount === 0}
            className="mt-2 w-full rounded border border-line px-3 py-2 text-body text-paper hover:border-amber disabled:opacity-40"
          >
            선택 {selectedCount}장에 위치 적용
          </button>
        </div>

        {/* 원본 백업 여부 (저장 버튼 위) */}
        <label className="mt-3 flex items-center gap-2 text-label text-paper">
          <input
            type="checkbox"
            checked={backupOriginal}
            onChange={(e) => onBackupChange(e.target.checked)}
            disabled={!hasImage}
          />
          원본 백업 (original 폴더에 복사)
        </label>
        {!backupOriginal && (
          <p className="text-label text-rust">
            백업 없이 원본을 직접 수정합니다 — 되돌릴 수 없습니다.
          </p>
        )}

        {/* 이 사진만 즉시 디스크 저장 (단계 9 배치 저장 전 단일 저장) */}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="mt-2 w-full rounded border border-line px-3 py-2 text-body text-paper hover:border-amber disabled:opacity-40"
        >
          {saving ? "저장 중…" : "이 사진만 즉시 저장"}
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
              <>
                <p className="mt-1 font-mono text-label text-paper">검증값: {saveResult.verified}</p>
                <p className="mt-0.5 break-all text-label text-muted">백업: {saveResult.backup}</p>
              </>
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

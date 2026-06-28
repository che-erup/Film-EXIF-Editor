import { useState } from "react";

/**
 * 가벼운 달력 컴포넌트 (다크 필름톤).
 * macOS 웹뷰는 기본 date 입력에 달력을 띄우지 않으므로 직접 구현한다.
 * 오래된 연도를 빠르게 넣도록 연도 입력칸을 둔다(필름 사진 특성).
 */
interface Props {
  /** 선택값 "YYYY-MM-DD" (없으면 "") */
  value: string;
  /** 날짜 클릭 시 "YYYY-MM-DD" 반환 */
  onSelect: (date: string) => void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function Calendar({ value, onSelect }: Props) {
  const init = parseIso(value) ?? new Date();
  const [year, setYear] = useState(init.getFullYear());
  const [month, setMonth] = useState(init.getMonth()); // 0~11

  const firstWeekday = new Date(year, month, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function shift(delta: number) {
    const m = month + delta;
    const ny = year + Math.floor(m / 12);
    const nm = ((m % 12) + 12) % 12;
    setYear(ny);
    setMonth(nm);
  }

  function pick(day: number) {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onSelect(`${year}-${mm}-${dd}`);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-lg border border-line bg-ink p-2">
      {/* 헤더: 이전달 · 연/월 · 다음달 */}
      <div className="mb-2 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded px-2 py-1 text-body text-muted hover:bg-charcoal"
          aria-label="이전 달"
        >
          ‹
        </button>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={year}
            onChange={(e) => {
              const y = parseInt(e.target.value, 10);
              if (!Number.isNaN(y) && y >= 1 && y <= 9999) setYear(y);
            }}
            className="w-16 rounded border border-line bg-charcoal px-1 py-0.5 text-center font-mono text-body text-paper focus:border-amber focus:outline-none"
            aria-label="연도"
          />
          <span className="w-10 text-center font-mono text-body text-paper">
            {month + 1}월
          </span>
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded px-2 py-1 text-body text-muted hover:bg-charcoal"
          aria-label="다음 달"
        >
          ›
        </button>
      </div>

      {/* 요일 */}
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-label text-muted">
            {w}
          </span>
        ))}
      </div>

      {/* 날짜 격자 */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <span key={`b${i}`} />;
          const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const selected = iso === value;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => pick(day)}
              className={`rounded py-1 text-center text-body ${
                selected
                  ? "bg-amber font-medium text-ink"
                  : "text-paper hover:bg-charcoal"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "YYYY-MM-DD" → Date (로컬). 형식이 아니면 null */
function parseIso(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// 날짜 입력 보조 (FR-6) — 느슨한 입력 정규화 + 시간 자동 증가 계산.
// EXIF 표준형: "YYYY:MM:DD HH:MM:SS"

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad4 = (n: number) => String(n).padStart(4, "0");

export interface NormResult {
  ok: boolean;
  value?: string; // 정규화된 "YYYY:MM:DD HH:MM:SS"
  error?: string;
}

export function daysInMonth(year: number, month: number): number {
  if ([1, 3, 5, 7, 8, 10, 12].includes(month)) return 31;
  if ([4, 6, 9, 11].includes(month)) return 30;
  if (month === 2)
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return 31;
}

/**
 * 느슨한 입력을 EXIF 표준형으로 정규화한다.
 * 예: "1998" → "1998:01:01 00:00:00", "1998:05:10" → "1998:05:10 00:00:00"
 * 구분자는 ':' '-' '.' 모두 허용.
 */
export function looseNormalize(input: string): NormResult {
  const s = input.trim();
  if (!s) return { ok: false, error: "날짜를 입력하세요" };

  const parts = s.split(/\s+/);
  const d = parts[0].split(/[:\-.]/).filter(Boolean);
  const t = parts[1] ? parts[1].split(/[:.]/).filter(Boolean) : [];

  if (d.length === 0 || !/^\d{1,4}$/.test(d[0])) {
    return { ok: false, error: "연도를 확인하세요 (예: 1998 또는 1998:05:10)" };
  }

  const year = parseInt(d[0], 10);
  const month = d[1] !== undefined ? parseInt(d[1], 10) : 1;
  const day = d[2] !== undefined ? parseInt(d[2], 10) : 1;
  const hour = t[0] !== undefined ? parseInt(t[0], 10) : 0;
  const min = t[1] !== undefined ? parseInt(t[1], 10) : 0;
  const sec = t[2] !== undefined ? parseInt(t[2], 10) : 0;

  if ([year, month, day, hour, min, sec].some(Number.isNaN))
    return { ok: false, error: "숫자만 입력하세요" };
  if (year < 1 || year > 9999) return { ok: false, error: `연도 범위 오류: ${year}` };
  if (month < 1 || month > 12) return { ok: false, error: `월은 1~12 입니다: ${month}` };
  const md = daysInMonth(year, month);
  if (day < 1 || day > md)
    return { ok: false, error: `${year}년 ${month}월은 1~${md}일 입니다: ${day}` };
  if (hour < 0 || hour > 23) return { ok: false, error: `시는 0~23 입니다: ${hour}` };
  if (min < 0 || min > 59) return { ok: false, error: `분은 0~59 입니다: ${min}` };
  if (sec < 0 || sec > 59) return { ok: false, error: `초는 0~59 입니다: ${sec}` };

  return {
    ok: true,
    value: `${pad4(year)}:${pad2(month)}:${pad2(day)} ${pad2(hour)}:${pad2(min)}:${pad2(sec)}`,
  };
}

/** "YYYY:MM:DD HH:MM:SS" → Date (로컬). 형식이 아니면 null */
export function parseDto(s: string): Date | null {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

export function formatDto(d: Date): string {
  return `${pad4(d.getFullYear())}:${pad2(d.getMonth() + 1)}:${pad2(
    d.getDate()
  )} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function addSeconds(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 1000);
}

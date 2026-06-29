// 간단한 CSV 파서/생성기 (RFC4180 식: 큰따옴표 감싸기, "" 이스케이프).

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // 마지막 필드/행 처리
  if (field.length > 0 || row.length > 0) endRow();

  // 완전히 빈 줄 제거
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: string[][]): string {
  const esc = (s: string) =>
    /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

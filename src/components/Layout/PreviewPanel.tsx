import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ExifTags } from "../../ipc/exif";

/**
 * 가운데 패널 — 상단에 사진 미리보기(고정), 그 아래로 EXIF 태그(스크롤).
 * 단계 3+: 어떤 사진을 편집 중인지 보이게 한다.
 */
interface Props {
  path: string | null;
  fileName: string | null;
  tags: ExifTags | null;
  loading: boolean;
  error: string | null;
}

/** 검증에 중요한 주요 태그 (Film/DevLab은 UserComment에서 복원된 값) */
const KEY_TAGS = [
  "DateTimeOriginal",
  "CreateDate",
  "Make",
  "Model",
  "LensMake",
  "LensModel",
  "Film",
  "ISO",
  "ExposureIndex",
  "DevLab",
  "UserComment",
];

export default function PreviewPanel({ path, fileName, tags, loading, error }: Props) {
  const [imgError, setImgError] = useState(false);

  // 사진이 바뀌면 이미지 오류 상태를 초기화
  useEffect(() => {
    setImgError(false);
  }, [path]);

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-ink">
      {/* 상단 고정 사진 미리보기 */}
      <div className="flex h-72 shrink-0 items-center justify-center border-b border-line bg-black/40 p-3">
        {path && !imgError ? (
          <img
            key={path}
            src={convertFileSrc(path)}
            alt={fileName ?? "선택한 사진"}
            onError={() => setImgError(true)}
            className="max-h-full max-w-full object-contain"
          />
        ) : path ? (
          <div className="text-center">
            <p className="text-body text-muted">이 형식은 화면 미리보기를 지원하지 않습니다</p>
            <p className="mt-1 text-label text-muted/70">(TIFF·DNG 등 — EXIF 편집은 정상 동작)</p>
            <p className="mt-2 break-all text-label text-paper">{fileName}</p>
          </div>
        ) : (
          <p className="text-body text-muted">사진을 선택하면 여기에 표시됩니다</p>
        )}
      </div>

      {/* 하단 EXIF (스크롤) */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {error ? (
          <div className="max-w-md rounded-lg border border-rust/50 bg-rust/10 p-4">
            <p className="mb-1 text-body font-medium text-rust">EXIF 읽기 실패</p>
            <p className="whitespace-pre-wrap break-words text-label text-muted">{error}</p>
          </div>
        ) : loading ? (
          <p className="text-body text-muted">EXIF 읽는 중…</p>
        ) : tags ? (
          <TagList fileName={fileName} tags={tags} />
        ) : (
          <p className="text-body text-muted">왼쪽에서 "사진 선택"을 누르면 EXIF가 여기에 표시됩니다</p>
        )}
      </div>
    </section>
  );
}

function TagList({ fileName, tags }: { fileName: string | null; tags: ExifTags }) {
  const entries = Object.entries(tags);
  const keyEntries = KEY_TAGS.filter((k) => k in tags).map((k) => [k, tags[k]] as const);

  return (
    <>
      <h2 className="mb-1 text-subtitle font-medium text-paper">{fileName}</h2>
      <p className="mb-4 text-label text-muted">읽어온 EXIF 태그 {entries.length}개 (읽기 전용)</p>

      <div className="mb-6 rounded-lg border border-line bg-charcoal p-4">
        <p className="mb-2 text-label text-muted">주요 태그</p>
        <dl className="space-y-1.5">
          {keyEntries.length === 0 && (
            <p className="text-body text-muted">
              이 파일에는 주요 태그가 비어 있습니다 (필름 스캔본의 전형적 상태)
            </p>
          )}
          {keyEntries.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-40 shrink-0 text-label text-amber">{k}</dt>
              <dd className="font-mono text-body text-paper">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="mb-2 text-label text-muted">전체 태그</p>
      <dl className="space-y-1">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-3 border-b border-line/50 py-1">
            <dt className="w-44 shrink-0 text-label text-muted">{k}</dt>
            <dd className="break-all font-mono text-label text-paper">{formatValue(v)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

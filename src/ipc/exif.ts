// Tauri command 래퍼 (타입 안전).
// 화면(React)은 파일을 직접 만지지 않고, 항상 이 래퍼를 통해 Rust에 요청한다.

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

/** 읽어온 EXIF 태그 묶음 (태그명 → 값) */
export type ExifTags = Record<string, unknown>;

/** 지원 이미지 확장자 (PRD FR-1) */
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "tif", "tiff", "png", "dng"];

/** 파일 선택 대화상자를 열어 이미지 1장의 절대 경로를 받는다. 취소 시 null. */
export async function pickImagePath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "이미지", extensions: IMAGE_EXTENSIONS }],
  });
  return typeof selected === "string" ? selected : null;
}

/** 여러 이미지 파일 선택. */
export async function pickImageFiles(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "이미지", extensions: IMAGE_EXTENSIONS }],
  });
  if (Array.isArray(selected)) return selected;
  return typeof selected === "string" ? [selected] : [];
}

/** 폴더 선택. 취소 시 null. */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

/** 불러온 한 장의 기본 정보 */
export interface FrameInfo {
  path: string;
  fileName: string;
  format: string;
}

export interface LoadImagesResult {
  frames: FrameInfo[];
  skipped: number;
}

/** 파일/폴더 경로들을 받아 지원 이미지를 수집한다. (폴더는 하위까지) */
export async function loadImages(paths: string[]): Promise<LoadImagesResult> {
  return await invoke<LoadImagesResult>("load_images", { paths });
}

/** 사진 경로의 기존 EXIF 태그를 읽어온다. (읽기 전용 — 파일을 수정하지 않음) */
export async function loadImage(path: string): Promise<ExifTags> {
  return await invoke<ExifTags>("load_image", { path });
}

/** 저장 결과 */
export interface SaveResult {
  ok: boolean;
  written: string;
  verified: string;
  backup: string;
  message: string;
}

/** 촬영일(DateTimeOriginal)을 바꿔 안전 저장한다. (백업→쓰기→검증읽기)
 *  backup=false 면 _original 백업 없이 제자리 수정. */
export async function saveDate(
  path: string,
  datetime: string,
  backup: boolean
): Promise<SaveResult> {
  return await invoke<SaveResult>("save_date", { path, datetime, backup });
}

/** 배치 저장 — 한 장에 적용할 편집 묶음 */
export interface SaveItem {
  path: string;
  dateTimeOriginal?: string;
  make?: string;
  model?: string;
  lensMake?: string;
  lensModel?: string;
  film?: string;
  iso?: string;
  ei?: string;
  devLab?: string;
  latitude?: string;
  longitude?: string;
}

export interface BatchItemResult {
  path: string;
  ok: boolean;
  message: string;
}

export interface BatchResult {
  total: number;
  okCount: number;
  failCount: number;
  cancelled: number;
  items: BatchItemResult[];
}

/** 여러 장을 한 번에 안전 저장. 진행률은 "save-progress" 이벤트로.
 *  scrubScanner=true 면 스캐너 메타데이터를 선별 삭제. */
export async function saveBatch(
  items: SaveItem[],
  backup: boolean,
  scrubScanner: boolean
): Promise<BatchResult> {
  return await invoke<BatchResult>("save_batch", { items, backup, scrubScanner });
}

/** 진행 중인 배치 저장 취소 요청 */
export async function cancelSave(): Promise<void> {
  await invoke("cancel_save");
}

/** 롤 공통 조합 프리셋 (FR-11) */
export interface Preset {
  name: string;
  make: string;
  model: string;
  lensMake: string;
  lensModel: string;
  filmStock: string;
  iso: string;
  ei: string;
  devLab: string;
}

export async function loadPresets(): Promise<Preset[]> {
  return await invoke<Preset[]>("load_presets");
}

export async function savePresets(presets: Preset[]): Promise<void> {
  await invoke("save_presets", { presets });
}

/** 편집 세션 자동저장/복원 (FR-12). 타입은 호출부(App)에서 지정. */
export async function saveSession(session: unknown): Promise<void> {
  await invoke("save_session", { session });
}
export async function loadSession<T>(): Promise<T | null> {
  return await invoke<T | null>("load_session");
}

/** CSV 입출력 (FR-14) */
export async function pickSaveCsv(): Promise<string | null> {
  const p = await save({
    defaultPath: "film-exif.csv",
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  return typeof p === "string" ? p : null;
}
export async function pickOpenCsv(): Promise<string | null> {
  const p = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  return typeof p === "string" ? p : null;
}
export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke("write_text_file", { path, content });
}
export async function readTextFile(path: string): Promise<string> {
  return await invoke<string>("read_text_file", { path });
}

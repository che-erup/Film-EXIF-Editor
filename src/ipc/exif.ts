// Tauri command 래퍼 (타입 안전).
// 화면(React)은 파일을 직접 만지지 않고, 항상 이 래퍼를 통해 Rust에 요청한다.

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

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

/** 촬영일(DateTimeOriginal)을 바꿔 안전 저장한다. (백업→쓰기→검증읽기) */
export async function saveDate(path: string, datetime: string): Promise<SaveResult> {
  return await invoke<SaveResult>("save_date", { path, datetime });
}

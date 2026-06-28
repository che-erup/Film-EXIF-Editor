// 프런트엔드에서 호출하는 Tauri command.
// 단계 2: load_image (EXIF 읽기) · 단계 3: save_date (1장 안전 저장)

use crate::exiftool::ExifToolService;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::State;

/// 지원 이미지 확장자 (PRD FR-1)
const SUPPORTED_EXT: [&str; 6] = ["jpg", "jpeg", "tif", "tiff", "png", "dng"];

/// 사진 경로를 받아 기존 EXIF 태그를 JSON 객체로 반환한다.
/// (저장 전 단계이므로 파일을 읽기만 하고 절대 수정하지 않는다.)
#[tauri::command]
pub async fn load_image(
    path: String,
    service: State<'_, ExifToolService>,
) -> Result<serde_json::Value, String> {
    // -j: JSON 출력, -charset: 한글 파일명/값 처리
    let args = vec![
        "-j".to_string(),
        "-charset".to_string(),
        "filename=UTF8".to_string(),
        "-charset".to_string(),
        "UTF8".to_string(),
        path.clone(),
    ];

    let raw = service.execute(args).await?;

    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("EXIF JSON 파싱 실패: {e}\n출력: {raw}"))?;

    // exiftool -j 는 배열을 반환한다. 첫 번째(유일한) 객체를 돌려준다.
    let obj = parsed
        .get(0)
        .cloned()
        .ok_or_else(|| format!("EXIF 결과가 비어 있습니다 (경로: {path})"))?;

    Ok(obj)
}

/// 불러온 한 장의 기본 정보 (EXIF는 선택 시 load_image로 따로 읽는다).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameInfo {
    pub path: String,
    pub file_name: String,
    pub format: String,
}

/// load_images 결과.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadImagesResult {
    pub frames: Vec<FrameInfo>,
    pub skipped: usize,
}

/// 파일/폴더 경로 목록을 받아 지원 이미지를 재귀로 수집한다.
/// 폴더는 하위까지 훑고, 미지원 파일은 건너뛰며 건수를 센다. (FR-1)
#[tauri::command]
pub async fn load_images(paths: Vec<String>) -> Result<LoadImagesResult, String> {
    let mut files: Vec<PathBuf> = Vec::new();
    let mut skipped = 0usize;
    for p in &paths {
        collect_images(Path::new(p), &mut files, &mut skipped);
    }
    files.sort();
    files.dedup();

    let frames = files
        .into_iter()
        .map(|f| FrameInfo {
            file_name: f
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string(),
            format: f
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase(),
            path: f.to_string_lossy().to_string(),
        })
        .collect();

    Ok(LoadImagesResult { frames, skipped })
}

/// 경로가 폴더면 하위를 재귀 수집, 파일이면 확장자로 필터.
fn collect_images(p: &Path, out: &mut Vec<PathBuf>, skipped: &mut usize) {
    if p.is_dir() {
        if let Ok(entries) = std::fs::read_dir(p) {
            for entry in entries.flatten() {
                collect_images(&entry.path(), out, skipped);
            }
        }
    } else if p.is_file() {
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());
        match ext {
            Some(e) if SUPPORTED_EXT.contains(&e.as_str()) => out.push(p.to_path_buf()),
            _ => *skipped += 1,
        }
    }
}

/// 저장 결과 — 화면에 성공/실패와 검증값을 보여주기 위함.
#[derive(Serialize)]
pub struct SaveResult {
    pub ok: bool,
    pub written: String,
    pub verified: String,
    pub backup: String,
    pub message: String,
}

/// 사진 1장의 DateTimeOriginal 을 바꿔 안전하게 저장한다.
/// 03_아키텍처설계.md §3 결정3의 4단계: ①검증 ②백업 ③쓰기 ④검증읽기.
#[tauri::command]
pub async fn save_date(
    path: String,
    datetime: String,
    service: State<'_, ExifToolService>,
) -> Result<SaveResult, String> {
    // ① 검증 + 정규화
    let canonical = crate::domain::validate_and_canonicalize_dto(&datetime)?;

    // ②+③ 쓰기 — exiftool 기본 동작이 원본을 `<파일>_original` 로 백업한다.
    //   (-overwrite_original 을 절대 쓰지 않음 → 백업 유지)
    //   바뀐 태그(DateTimeOriginal)만 쓰므로 다른 EXIF는 보존된다.
    let write_args = vec![
        "-charset".to_string(),
        "filename=UTF8".to_string(),
        format!("-DateTimeOriginal={canonical}"),
        path.clone(),
    ];
    let write_out = service.execute(write_args).await?;

    // ④ 검증읽기 — 쓴 직후 다시 읽어 의도값과 일치하는지 확인
    let read_args = vec![
        "-j".to_string(),
        "-charset".to_string(),
        "filename=UTF8".to_string(),
        "-charset".to_string(),
        "UTF8".to_string(),
        "-DateTimeOriginal".to_string(),
        path.clone(),
    ];
    let raw = service.execute(read_args).await?;
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("검증 읽기 JSON 파싱 실패: {e}\n출력: {raw}"))?;
    let verified = parsed
        .get(0)
        .and_then(|o| o.get("DateTimeOriginal"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let ok = verified == canonical;
    let message = if ok {
        "저장 및 검증 완료 — 원본은 _original 로 백업되었습니다.".to_string()
    } else {
        format!(
            "검증 불일치(저장 실패 가능). ExifTool 출력: {}",
            write_out.trim()
        )
    };

    Ok(SaveResult {
        ok,
        written: canonical,
        verified,
        backup: format!("{path}_original"),
        message,
    })
}

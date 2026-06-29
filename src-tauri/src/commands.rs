// 프런트엔드에서 호출하는 Tauri command.
// 단계 2: load_image (EXIF 읽기) · 단계 3: save_date (1장 안전 저장)

use crate::exiftool::ExifToolService;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, State};

/// 배치 저장 취소 플래그(전역 상태).
#[derive(Default)]
pub struct SaveControl {
    pub cancel: AtomicBool,
}

/// 진행 중인 배치 저장을 취소 요청한다.
#[tauri::command]
pub fn cancel_save(control: State<'_, SaveControl>) {
    control.cancel.store(true, Ordering::Relaxed);
}

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
    let mut obj = parsed
        .get(0)
        .cloned()
        .ok_or_else(|| format!("EXIF 결과가 비어 있습니다 (경로: {path})"))?;

    // UserComment를 파싱해 Film/DevLab을 별도 키로 복원해 넣는다(FR-10).
    if let Some(map) = obj.as_object_mut() {
        if let Some(uc) = map
            .get("UserComment")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
        {
            let (film, dev) = crate::domain::usercomment::parse(&uc);
            if let Some(f) = film {
                map.insert("Film".to_string(), serde_json::Value::String(f));
            }
            if let Some(d) = dev {
                map.insert("DevLab".to_string(), serde_json::Value::String(d));
            }
        }
    }

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
        // 백업 폴더(original)는 건너뛴다 — 백업본이 목록에 중복으로 들어오지 않게.
        if p.file_name().and_then(|n| n.to_str()) == Some("original") {
            return;
        }
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
    backup: bool,
    service: State<'_, ExifToolService>,
) -> Result<SaveResult, String> {
    // ① 검증 + 정규화
    let canonical = crate::domain::validate_and_canonicalize_dto(&datetime)?;

    // ② 백업 — 원본을 <폴더>/original/<파일명> 으로 복사 (이미지로 그대로 열리는 백업)
    let backup_path_str = if backup {
        backup_to_original(&path)?
    } else {
        "백업 안 함".to_string()
    };

    // ③ 쓰기 — 바뀐 태그(DateTimeOriginal)만 쓰고, 항상 -overwrite_original
    //   (백업은 위에서 직접 했으므로 _original 접미사 파일은 만들지 않는다)
    let write_args = vec![
        "-charset".to_string(),
        "filename=UTF8".to_string(),
        "-overwrite_original".to_string(),
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
        if backup {
            "저장 및 검증 완료 — 원본은 original 폴더에 백업되었습니다.".to_string()
        } else {
            "저장 및 검증 완료 — 백업 없이 원본을 직접 수정했습니다.".to_string()
        }
    } else {
        format!("검증 불일치(저장 실패 가능). ExifTool 출력: {}", write_out.trim())
    };

    Ok(SaveResult {
        ok,
        written: canonical,
        verified,
        backup: backup_path_str,
        message,
    })
}

// ───────────────────────── 배치 저장 (단계 9) ─────────────────────────

/// 한 장에 저장할 편집 묶음. (없는 필드는 건너뜀)
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveItem {
    pub path: String,
    pub date_time_original: Option<String>,
    pub make: Option<String>,
    pub model: Option<String>,
    pub lens_make: Option<String>,
    pub lens_model: Option<String>,
    pub film: Option<String>,
    pub dev_lab: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchItemResult {
    pub path: String,
    pub ok: bool,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
    pub total: usize,
    pub ok_count: usize,
    pub fail_count: usize,
    pub cancelled: usize,
    pub items: Vec<BatchItemResult>,
}

/// 여러 장을 한 번에 안전 저장한다. 컷마다 독립 처리(한 장 실패해도 계속).
/// 진행 상황은 "save-progress" 이벤트({done,total})로 보낸다. 취소 가능.
#[tauri::command]
pub async fn save_batch(
    items: Vec<SaveItem>,
    backup: bool,
    app: tauri::AppHandle,
    service: State<'_, ExifToolService>,
    control: State<'_, SaveControl>,
) -> Result<BatchResult, String> {
    let total = items.len();
    control.cancel.store(false, Ordering::Relaxed); // 시작 시 플래그 초기화
    let mut results = Vec::with_capacity(total);
    let mut ok_count = 0usize;

    for (i, item) in items.iter().enumerate() {
        if control.cancel.load(Ordering::Relaxed) {
            break; // 취소 요청 — 남은 컷은 처리하지 않음
        }
        let (ok, message) = match save_one(item, backup, &service).await {
            Ok(m) => {
                ok_count += 1;
                (true, m)
            }
            Err(e) => (false, e),
        };
        results.push(BatchItemResult {
            path: item.path.clone(),
            ok,
            message,
        });
        let _ = app.emit("save-progress", serde_json::json!({ "done": i + 1, "total": total }));
    }

    let processed = results.len();
    Ok(BatchResult {
        total,
        ok_count,
        fail_count: processed - ok_count,
        cancelled: total - processed,
        items: results,
    })
}

/// 한 장 저장: 검증 → 백업 → 쓰기 → 검증읽기.
async fn save_one(
    item: &SaveItem,
    backup: bool,
    service: &ExifToolService,
) -> Result<String, String> {
    // 1) 의도한 (EXIF 태그, 값) 목록
    let mut writes: Vec<(String, String)> = Vec::new();
    if let Some(dt) = item
        .date_time_original
        .as_deref()
        .filter(|s| !s.trim().is_empty())
    {
        let canon = crate::domain::validate_and_canonicalize_dto(dt)?;
        writes.push(("DateTimeOriginal".to_string(), canon));
    }
    push_if(&mut writes, "Make", &item.make);
    push_if(&mut writes, "Model", &item.model);
    push_if(&mut writes, "LensMake", &item.lens_make);
    push_if(&mut writes, "LensModel", &item.lens_model);
    // 필름/현상소 → UserComment (직렬화 규칙은 domain::usercomment 한 곳)
    let uc = crate::domain::usercomment::serialize(item.film.as_deref(), item.dev_lab.as_deref());
    if let Some(uc) = &uc {
        writes.push(("UserComment".to_string(), uc.clone()));
    }

    if writes.is_empty() {
        return Ok("변경 없음".to_string());
    }

    // 2) 백업
    if backup {
        backup_to_original(&item.path)?;
    }

    // 3) 쓰기 (바뀐 태그만, -overwrite_original)
    let mut args = vec![
        "-charset".to_string(),
        "filename=UTF8".to_string(),
        "-overwrite_original".to_string(),
    ];
    for (tag, val) in &writes {
        args.push(format!("-{tag}={val}"));
    }
    // 필름/현상소는 XMP에도 병행 기록(호환성). 검증은 EXIF UserComment로 한다.
    if let Some(uc) = &uc {
        args.push(format!("-XMP-exif:UserComment={uc}"));
    }
    args.push(item.path.clone());
    service.execute(args).await?;

    // 4) 검증읽기 — 쓴 태그를 다시 읽어 의도값과 비교
    let mut read_args = vec![
        "-j".to_string(),
        "-charset".to_string(),
        "filename=UTF8".to_string(),
        "-charset".to_string(),
        "UTF8".to_string(),
    ];
    for (tag, _) in &writes {
        read_args.push(format!("-{tag}"));
    }
    read_args.push(item.path.clone());
    let raw = service.execute(read_args).await?;
    let parsed: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("검증 파싱 실패: {e}"))?;
    let obj = parsed
        .get(0)
        .ok_or_else(|| "검증 결과가 비어 있습니다".to_string())?;
    for (tag, val) in &writes {
        let got = obj.get(tag).and_then(|v| v.as_str()).unwrap_or("");
        if got != val {
            return Err(format!("검증 불일치: {tag} 기대 '{val}' / 실제 '{got}'"));
        }
    }
    Ok("저장 완료".to_string())
}

fn push_if(writes: &mut Vec<(String, String)>, tag: &str, val: &Option<String>) {
    if let Some(v) = val.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        writes.push((tag.to_string(), v.to_string()));
    }
}

/// 원본을 같은 폴더의 original/ 하위에 같은 이름으로 복사하고 그 경로를 돌려준다.
fn backup_to_original(path: &str) -> Result<String, String> {
    let src = Path::new(path);
    let dir = src
        .parent()
        .ok_or_else(|| "경로의 폴더를 알 수 없습니다".to_string())?;
    let file_name = src
        .file_name()
        .ok_or_else(|| "파일명을 알 수 없습니다".to_string())?;
    let backup_dir = dir.join("original");
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("백업 폴더(original) 생성 실패: {e}"))?;
    let dest = backup_dir.join(file_name);
    // 이미 백업이 있으면(이전에 저장한 진짜 원본) 덮어쓰지 않는다.
    if !dest.exists() {
        std::fs::copy(src, &dest).map_err(|e| format!("원본 백업 복사 실패: {e}"))?;
    }
    Ok(dest.to_string_lossy().to_string())
}

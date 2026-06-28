// ExifTool 상주(stay_open) 서비스.
//
// 설계: 03_아키텍처설계.md §3 결정1.
// - 앱 시작 시 `exiftool -stay_open True -@ -` 를 단 한 번 띄운다.
// - 명령은 stdin으로 한 줄씩 보내고, 끝에 `-execute` 를 보내면
//   exiftool이 결과를 stdout에 쓰고 마지막에 `{ready}` 마커를 남긴다.
// - 프로세스가 하나뿐이므로 요청은 req_lock으로 순차 처리한다.

use tauri::async_runtime::spawn;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{mpsc, Mutex};
use tokio::time::{timeout, Duration};

/// exiftool 한 번 호출에 허용하는 최대 대기 시간.
const EXECUTE_TIMEOUT: Duration = Duration::from_secs(30);

pub struct ExifToolService {
    /// 상주 프로세스의 stdin 핸들. 종료 시 take 해서 정리한다.
    child: std::sync::Mutex<Option<CommandChild>>,
    /// stdout을 줄 단위로 전달받는 채널의 수신부.
    lines: Mutex<mpsc::UnboundedReceiver<String>>,
    /// 한 번에 하나의 요청만 처리하도록 직렬화하는 잠금.
    req_lock: Mutex<()>,
}

impl ExifToolService {
    /// 사이드카를 띄우고 서비스를 구성한다.
    ///
    /// 바이너리가 아직 없어도 앱은 떠야 하므로 실패해도 패닉하지 않는다.
    /// 실행에 실패하면 "비활성" 서비스를 돌려주고, load_image 호출 시
    /// 사용자에게 설치 안내 메시지를 보낸다.
    pub fn start(app: &AppHandle) -> Self {
        match Self::try_spawn(app) {
            Ok(service) => service,
            Err(e) => {
                eprintln!("[exiftool] 시작 실패 — 비활성 상태로 진행: {e}");
                // 닫힌 채널: execute()가 child 없음으로 처리한다.
                let (_tx, line_rx) = mpsc::unbounded_channel::<String>();
                Self {
                    child: std::sync::Mutex::new(None),
                    lines: Mutex::new(line_rx),
                    req_lock: Mutex::new(()),
                }
            }
        }
    }

    fn try_spawn(app: &AppHandle) -> Result<Self, String> {
        let mut command = app
            .shell()
            .sidecar("exiftool")
            .map_err(|e| format!("ExifTool 사이드카를 찾을 수 없습니다: {e}"))?;

        // ExifTool은 Perl 모듈(lib)이 필요하다. 사이드카는 lib 없이 복사되므로
        // lib 폴더 위치를 PERL5LIB 환경변수로 알려준다.
        if let Some(lib) = resolve_lib_dir(app) {
            command = command.env("PERL5LIB", lib);
        }

        let (mut rx, child) = command
            .args(["-stay_open", "True", "-@", "-"])
            .spawn()
            .map_err(|e| format!("ExifTool 실행 실패: {e}"))?;

        let (line_tx, line_rx) = mpsc::unbounded_channel::<String>();

        // 백그라운드에서 stdout/stderr 이벤트를 줄 단위로 채널에 흘려보낸다.
        spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        let line = String::from_utf8_lossy(&bytes).to_string();
                        if line_tx.send(line).is_err() {
                            break;
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        eprintln!("[exiftool stderr] {}", String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Terminated(payload) => {
                        eprintln!("[exiftool] 프로세스 종료: {payload:?}");
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(Self {
            child: std::sync::Mutex::new(Some(child)),
            lines: Mutex::new(line_rx),
            req_lock: Mutex::new(()),
        })
    }

    /// 인자 묶음을 보내고 `{ready}` 마커 전까지의 stdout을 모아 반환한다.
    pub async fn execute(&self, args: Vec<String>) -> Result<String, String> {
        // 프로세스가 하나뿐이므로 요청을 순차 처리.
        let _guard = self.req_lock.lock().await;

        // 1) 인자 + -execute 를 stdin에 쓴다. (동기 락은 await 전에 해제)
        {
            let mut child_guard = self
                .child
                .lock()
                .map_err(|_| "ExifTool 상태 잠금 실패".to_string())?;
            let child = child_guard.as_mut().ok_or_else(|| {
                "ExifTool이 실행되지 않았습니다. src-tauri/binaries/ 에 ExifTool 바이너리를 설치한 뒤 앱을 다시 시작하세요 (scripts/setup-exiftool.sh).".to_string()
            })?;

            for arg in &args {
                child
                    .write(format!("{arg}\n").as_bytes())
                    .map_err(|e| format!("ExifTool 입력 쓰기 실패: {e}"))?;
            }
            child
                .write(b"-execute\n")
                .map_err(|e| format!("ExifTool 실행 신호 쓰기 실패: {e}"))?;
        }

        // 2) {ready} 가 나올 때까지 stdout을 읽어 모은다.
        let mut out = String::new();
        let mut lines = self.lines.lock().await;
        loop {
            match timeout(EXECUTE_TIMEOUT, lines.recv()).await {
                Ok(Some(line)) => {
                    if line.trim() == "{ready}" {
                        break;
                    }
                    out.push_str(&line);
                    out.push('\n');
                }
                Ok(None) => return Err("ExifTool 출력이 닫혔습니다".to_string()),
                Err(_) => return Err("ExifTool 응답 시간 초과(30초)".to_string()),
            }
        }
        Ok(out)
    }
}

impl Drop for ExifToolService {
    fn drop(&mut self) {
        // 앱 종료 시 상주 프로세스를 정리한다. (best-effort)
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.write(b"-stay_open\nFalse\n");
                let _ = child.kill();
            }
        }
    }
}

/// ExifTool Perl 모듈(lib) 폴더 경로를 찾는다.
/// 1) 번들 리소스($RESOURCE/exiftool-lib) 우선  2) 개발 모드 fallback.
fn resolve_lib_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    // 1) 배포 빌드: tauri.conf.json 의 resources 로 동봉된 위치
    if let Ok(p) = app.path().resolve("exiftool-lib", BaseDirectory::Resource) {
        if p.exists() {
            return Some(p);
        }
    }
    // 2) 개발 모드: 실행파일 기준 ../../binaries/lib (= src-tauri/binaries/lib)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Ok(canon) = std::fs::canonicalize(dir.join("../../binaries/lib")) {
                return Some(canon);
            }
        }
    }
    None
}

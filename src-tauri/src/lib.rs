// 애플리케이션 코어 진입점.
// 단계 2: ExifTool 상주 서비스 + load_image command 연결.

mod commands;
mod domain;
mod exiftool;

use exiftool::ExifToolService;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::SaveControl::default())
        .setup(|app| {
            // 앱 시작 시 ExifTool 상주 프로세스를 1회 띄워 전역 상태로 관리한다.
            // (바이너리가 없어도 앱은 뜨고, 읽기 시점에 안내 메시지를 보낸다.)
            let service = ExifToolService::start(app.handle());
            app.manage(service);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_images,
            commands::load_image,
            commands::save_date,
            commands::save_batch,
            commands::cancel_save
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 애플리케이션 실행 중 오류가 발생했습니다");
}

// 애플리케이션 코어 진입점.
// 단계 1: 창을 띄우는 최소 구성만. ExifTool 서비스/커맨드는 단계 2부터 추가.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Tauri 애플리케이션 실행 중 오류가 발생했습니다");
}

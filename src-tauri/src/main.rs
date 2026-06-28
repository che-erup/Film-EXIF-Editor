// 콘솔 창이 뜨지 않도록 (Windows 릴리스 빌드)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    film_exif_tool_lib::run()
}

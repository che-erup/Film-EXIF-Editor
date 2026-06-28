import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri 개발 서버 설정
// 참고: https://v2.tauri.app/start/frontend/vite/
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],

  // Tauri는 고정 포트를 기대한다. 충돌 시 실패하게 둔다.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // src-tauri 변경은 Rust 쪽이 감시하므로 Vite는 무시
      ignored: ["**/src-tauri/**"],
    },
  },

  // 프로덕션 빌드 결과물을 Tauri가 사용
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
});

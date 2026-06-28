# 필름 EXIF 수정 툴 (Film EXIF Tool)

필름으로 찍어 스캔한 사진의 EXIF(촬영일·카메라·렌즈·필름 등)를 **쉽고 빠르게, 여러 장 한 번에** 채워 넣는 데스크톱 앱입니다.

- 기술 스택: **Tauri v2 + React + TypeScript + Tailwind CSS**
- EXIF 엔진: **ExifTool** 사이드카(`-stay_open` 상주 모드)
- 설계 문서: `docs/` 폴더 (기획 · PRD · 아키텍처 · 개발착수)

> 현재 상태: **단계 1 완료** — 다크 테마의 빈 3분할 화면 뼈대.

---

## 개발 환경 준비 (단계 0)

Mac 기준 빌드에 필요한 것:

1. **Node.js 18+** — `node --version`으로 확인
2. **Rust** — 미설치 시:
   ```sh
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
   이후 `cargo --version`으로 확인
3. **Xcode Command Line Tools** (Mac) — `xcode-select --install`
4. **ExifTool 바이너리** — https://exiftool.org 에서 받아
   `src-tauri/binaries/` 에 플랫폼 타깃 접미사를 붙여 배치 (단계 2에서 사용)
   - 예) Apple Silicon: `exiftool-aarch64-apple-darwin`

자세한 내용은 `docs/04_개발착수프롬프트.md` 참고.

---

## 실행 방법

```sh
# 1) 의존성 설치
npm install

# 2) 앱 아이콘 생성(최초 1회) — 원본 PNG로부터 각 플랫폼 아이콘 생성
npm run tauri icon src-tauri/app-icon.png

# 3) 개발 모드 실행 (다크 3분할 창이 떠야 함)
npm run tauri:dev
```

프론트엔드만 빠르게 확인하려면:

```sh
npm run dev      # http://localhost:1420
npm run build    # 타입체크 + 프로덕션 빌드
```

---

## 폴더 구조

```
EXIF_for_Film/
├─ src/                  # ① UI (React + TS)
│  ├─ components/        #   Layout(3분할), 이후 ThumbnailGrid/Preview/Form
│  ├─ store/             #   편집 세션 상태 (단계 6~)
│  ├─ ipc/               #   Tauri command 래퍼 (단계 2~)
│  └─ App.tsx
├─ src-tauri/            # ② 코어 (Rust)
│  ├─ src/               #   lib.rs(진입), 이후 commands/domain/exiftool/...
│  ├─ binaries/          #   ExifTool 사이드카
│  ├─ capabilities/      #   권한 설정
│  └─ tauri.conf.json
└─ docs/                 #   설계 문서
```

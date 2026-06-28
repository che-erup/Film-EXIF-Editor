import ThumbnailPanel from "./components/Layout/ThumbnailPanel";
import PreviewPanel from "./components/Layout/PreviewPanel";
import EditFormPanel from "./components/Layout/EditFormPanel";
import StatusBar from "./components/Layout/StatusBar";

/**
 * 앱 전체 셸 — 3분할 레이아웃 + 하단 상태바.
 * (단계 1: 화면 뼈대만. 실제 기능은 이후 단계에서 연결)
 *
 *  ┌──────────┬───────────────┬───────────────┐
 *  │ 썸네일   │  미리보기      │  편집 폼       │
 *  │ (왼쪽)   │  (가운데)      │  (오른쪽)      │
 *  └──────────┴───────────────┴───────────────┘
 *  하단 상태바
 */
function App() {
  return (
    <div className="flex h-screen flex-col bg-ink text-paper">
      <main className="flex min-h-0 flex-1">
        {/* 왼쪽: 썸네일 그리드 자리 */}
        <ThumbnailPanel />

        {/* 가운데: 큰 미리보기 자리 */}
        <PreviewPanel />

        {/* 오른쪽: 메타데이터 편집 폼 자리 */}
        <EditFormPanel />
      </main>

      {/* 하단 상태바 */}
      <StatusBar />
    </div>
  );
}

export default App;

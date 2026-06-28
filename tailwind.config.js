/** @type {import('tailwindcss').Config} */
// 색상은 01_기획_기능_구조_디자인시스템.md 4-2장의 다크 필름톤 팔레트를 따른다.
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C1A17", // 배경(다크 차콜)
        charcoal: "#26231F", // 패널 배경
        paper: "#EDE6DA", // 기본 텍스트(따뜻한 화이트)
        muted: "#9A9085", // 보조 텍스트
        amber: "#D8A24A", // 강조/주요 버튼
        sage: "#7E9B6B", // 성공/완료
        rust: "#C2603C", // 경고/주의
        line: "#3A352F", // 구분선
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        label: ["12px", "16px"],
        body: ["14px", "20px"],
        subtitle: ["16px", "22px"],
        title: ["20px", "28px"],
      },
    },
  },
  plugins: [],
};

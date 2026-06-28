#!/usr/bin/env bash
#
# ExifTool 사이드카 설치 스크립트 (macOS / Linux)
#
# 하는 일:
#  1) 현재 플랫폼의 target triple 을 알아낸다 (예: aarch64-apple-darwin)
#  2) 최신 ExifTool(Perl 배포본)을 GitHub 공식 미러에서 내려받는다
#  3) exiftool 스크립트를 src-tauri/binaries/exiftool-<triple> 로 두고
#     lib/ 폴더를 src-tauri/binaries/lib/ 로 둔다
#  4) 실행 권한을 준다
#
# macOS에는 /usr/bin/perl 이 기본 포함돼 있어 별도 설치가 필요 없다.
#
# 사용법:  bash scripts/setup-exiftool.sh

set -euo pipefail

# 프로젝트 루트 (이 스크립트의 상위 폴더)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$ROOT_DIR/src-tauri/binaries"

echo "▶ ExifTool 사이드카 설치 시작"

# 1) target triple
if rustc --print host-tuple >/dev/null 2>&1; then
  TRIPLE="$(rustc --print host-tuple)"
else
  TRIPLE="$(rustc -Vv | grep host | cut -f2 -d' ')"
fi
if [ -z "${TRIPLE:-}" ]; then
  echo "✗ target triple 을 알 수 없습니다. Rust(rustc)가 설치돼 있는지 확인하세요." >&2
  exit 1
fi
echo "  플랫폼: $TRIPLE"

# 2) 최신 버전 확인
VER="$(curl -fsSL https://exiftool.org/ver.txt | tr -d '[:space:]')"
if [ -z "${VER:-}" ]; then
  echo "✗ ExifTool 최신 버전을 확인하지 못했습니다 (네트워크 확인)." >&2
  exit 1
fi
echo "  최신 ExifTool 버전: $VER"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
TARBALL="$TMP/exiftool-$VER.tar.gz"

# 3) 다운로드 — GitHub 공식 미러(태그 아카이브) 우선, 실패 시 exiftool.org
echo "  내려받는 중: GitHub 태그 $VER …"
if ! curl -fsSL "https://github.com/exiftool/exiftool/archive/refs/tags/$VER.tar.gz" -o "$TARBALL"; then
  echo "  GitHub 실패 → exiftool.org 재시도 …"
  curl -fsSL "https://exiftool.org/Image-ExifTool-$VER.tar.gz" -o "$TARBALL"
fi

tar -xzf "$TARBALL" -C "$TMP"

# 압축 해제 폴더 자동 탐색 (exiftool-<ver> 또는 Image-ExifTool-<ver>)
SRC="$(find "$TMP" -maxdepth 1 -type d \( -name 'exiftool-*' -o -name 'Image-ExifTool-*' \) | head -1)"
if [ -z "${SRC:-}" ] || [ ! -f "$SRC/exiftool" ] || [ ! -d "$SRC/lib" ]; then
  echo "✗ 내려받은 압축에서 exiftool 스크립트와 lib/ 폴더를 찾지 못했습니다." >&2
  echo "  내용: $(ls -1 "$TMP")" >&2
  exit 1
fi

# 4) 배치
mkdir -p "$BIN_DIR"
rm -rf "$BIN_DIR/lib"
cp -R "$SRC/lib" "$BIN_DIR/lib"
cp "$SRC/exiftool" "$BIN_DIR/exiftool-$TRIPLE"
chmod +x "$BIN_DIR/exiftool-$TRIPLE"

# 5) 동작 확인
echo "  설치 확인 중 …"
if PERL5LIB="$BIN_DIR/lib" "$BIN_DIR/exiftool-$TRIPLE" -ver >/dev/null 2>&1; then
  INSTALLED_VER="$(PERL5LIB="$BIN_DIR/lib" "$BIN_DIR/exiftool-$TRIPLE" -ver)"
  echo "✓ 완료 (ExifTool $INSTALLED_VER):"
  echo "    $BIN_DIR/exiftool-$TRIPLE"
  echo "    $BIN_DIR/lib/  (ExifTool 모듈)"
  echo
  echo "이제 'npm run tauri:dev' 로 앱을 실행한 뒤 사진을 선택해 보세요."
else
  echo "✗ 설치는 됐지만 실행 확인에 실패했습니다. Perl(/usr/bin/perl) 상태를 확인하세요." >&2
  exit 1
fi

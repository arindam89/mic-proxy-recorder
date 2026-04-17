#!/usr/bin/env bash
# Downloads the official BlackHole 2ch .pkg into src-tauri/resources/blackhole/
# so `tauri build` can embed it. Run from the repository root.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="0.6.1"
URL="https://existential.audio/downloads/BlackHole2ch-${VERSION}.pkg"
OUT_DIR="$ROOT_DIR/src-tauri/resources/blackhole"
OUT_FILE="$OUT_DIR/BlackHole2ch-${VERSION}.pkg"
mkdir -p "$OUT_DIR"
echo "Downloading BlackHole ${VERSION} from existential.audio …"
curl -fL --retry 3 --retry-delay 2 -o "$OUT_FILE" "$URL"
BYTES=$(wc -c <"$OUT_FILE" | tr -d ' ')
echo "Wrote $OUT_FILE ($BYTES bytes)"
echo "Next: npm run tauri -- build (or your CI) so the pkg is copied into the app bundle."

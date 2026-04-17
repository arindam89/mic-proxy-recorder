#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

AUTO_INSTALL=0
MODE="build"
WITH_PARAKEET_VENV=0
WITH_BLACKHOLE_PKG=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes|--install)
      AUTO_INSTALL=1
      shift
      ;;
    --dev)
      MODE="dev"
      shift
      ;;
    --with-parakeet-venv)
      WITH_PARAKEET_VENV=1
      shift
      ;;
    --with-blackhole-pkg)
      WITH_BLACKHOLE_PKG=1
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [--yes] [--dev] [--with-parakeet-venv] [--with-blackhole-pkg]"
      echo "  --with-parakeet-venv  Run scripts/setup-parakeet-venv.sh before the Rust build (NeMo Parakeet)."
      echo "  --with-blackhole-pkg  Run scripts/download-blackhole-pkg.sh before Tauri pack (macOS duplex installer)."
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

info() { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33mWARN:\033[0m %s\n" "$*"; }
die() { printf "\033[1;31mERROR:\033[0m %s\n" "$*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

info "Starting full build from $ROOT_DIR"

if ! have node; then
  die "node not found. Install Node.js (16+) from https://nodejs.org or via Homebrew: 'brew install node'"
fi

if ! have npm; then
  die "npm not found. Install Node/npm"
fi

NODE_VER=$(node -v | sed 's/^v//')
NODE_MAJOR=${NODE_VER%%.*}
if [ "$NODE_MAJOR" -lt 16 ]; then
  warn "Node ${NODE_VER} detected — Node 16+ is recommended."
fi

if ! have cargo; then
  if [ "$AUTO_INSTALL" -eq 1 ]; then
    if have curl; then
      info "Installing Rust (rustup) non-interactively..."
      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y || die "rustup install failed"
      if [ -f "$HOME/.cargo/env" ]; then
        # shellcheck disable=SC1090
        # shellcheck source=/dev/null
        source "$HOME/.cargo/env"
      fi
    else
      die "cargo not found and curl not available to install rustup. Install Rust manually."
    fi
  else
    die "cargo not found. Install Rust (https://rustup.rs/) or run this script with --yes to auto-install."
  fi
fi

if ! have cmake; then
  if [ "$AUTO_INSTALL" -eq 1 ] && have brew; then
    info "Installing cmake via Homebrew..."
    brew install cmake || die "brew install cmake failed"
  else
    die "cmake not found. Install cmake (e.g., 'brew install cmake') or run with --yes to auto-install (requires Homebrew)."
  fi
fi

if ! have clang && ! have gcc && ! have c++; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if [ "$AUTO_INSTALL" -eq 1 ]; then
      info "Installing Xcode Command Line Tools..."
      xcode-select --install || warn "xcode-select --install reported an error; you may need to run it manually"
    else
      die "No C compiler found. Install Xcode Command Line Tools: 'xcode-select --install' or run with --yes to attempt auto install."
    fi
  else
    die "No C/C++ compiler found (clang/gcc). Install a C compiler and retry."
  fi
fi

info "Installing JS dependencies (npm install)..."
npm install || die "npm install failed"

if [ "$WITH_PARAKEET_VENV" -eq 1 ]; then
  info "Creating Parakeet virtualenv (scripts/setup-parakeet-venv.sh)..."
  bash "$ROOT_DIR/scripts/setup-parakeet-venv.sh" || die "Parakeet venv setup failed"
fi

if [ "$WITH_BLACKHOLE_PKG" -eq 1 ]; then
  if [[ "$(uname -s)" != "Darwin" ]]; then
    warn "--with-blackhole-pkg is intended for macOS packagers; downloading anyway for a universal resource bundle."
  fi
  info "Downloading BlackHole 2ch .pkg into src-tauri/resources/blackhole/ …"
  bash "$ROOT_DIR/scripts/download-blackhole-pkg.sh" || die "BlackHole pkg download failed"
fi

info "Building frontend (npm run build)..."
npm run build || die "npm run build failed"

if [ ! -d "$ROOT_DIR/dist" ]; then
  warn "dist/ directory not found after build — Tauri packaging may fail."
fi

info "Building Rust backend (src-tauri)..."
pushd src-tauri >/dev/null
cargo build || { popd >/dev/null; die "cargo build failed"; }
popd >/dev/null

if [ "$MODE" = "dev" ]; then
  info "Launching Tauri in dev mode (npm run tauri -- dev)..."
  npm run tauri -- dev || die "npm run tauri -- dev failed"
else
  info "Packaging with Tauri (npm run tauri -- build)..."
  npm run tauri -- build || die "npm run tauri -- build failed"
fi

info "Build finished successfully."

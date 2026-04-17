# Mic Proxy Recorder — User Guide

## Overview

This repo is a Tauri desktop application (Rust backend + React frontend) that provides a local microphone proxy, noise cancellation, recording, and offline speech-to-text.

## Prerequisites

- macOS: Homebrew (recommended)
- Node.js (16+), npm
- Rust toolchain (rustup + cargo)
- Xcode Command Line Tools
- `cmake` and a C/C++ compiler (required for native crates such as `whisper-rs`)

Example Homebrew install on macOS:

```bash
brew install node rust cmake pkg-config llvm
xcode-select --install
```

## Install dependencies

From the project root:

```bash
npm install
```

## Development

- Frontend only (runs the Vite dev server at port 1420):

```bash
npm run dev
```

- Full native dev (recommended) — launches a Tauri window and the dev server:

```bash
npm run tauri -- dev
```

Notes:
- The app uses Tauri's injected JS API. Running `npm run dev` alone opens the app in a normal browser without Tauri's runtime; calling Tauri APIs (like `invoke`) will fail in that environment. Use `npm run tauri -- dev` when you need the native backend.

## Build / Package

- Build frontend assets + type-check:

```bash
npm run build
```

- Build native installers (Tauri will run the frontend build as configured):

```bash
npm run tauri -- build
```

The Tauri config is in `src-tauri/tauri.conf.json` and the frontend build output is expected in `../dist`.

## Tests

- JavaScript/TypeScript: there are no Jest/Vitest tests configured in this repo. Type-checking is performed by `tsc` as part of `npm run build`.
- Rust: run any Rust tests in the `src-tauri` crate:

```bash
cd src-tauri
cargo test
```

## Troubleshooting

- Error: `TypeError: Cannot read properties of undefined (reading 'invoke')`
  - Cause: The Tauri JS API isn’t available when you open the frontend in a plain browser (for example, after `npm run dev`). The frontend is trying to call `invoke(...)` but `window.__TAURI__` is undefined.
  - Quick fix: Run the app via the Tauri dev command so the Tauri runtime is injected:

    ```bash
    npm run tauri -- dev
    ```

  - Long-term fix (what this repo now includes): the frontend guards Tauri API calls and surfaces a helpful error when the runtime is missing. See `src/App.tsx` for the safe `invoke` wrapper.

- Building `whisper-rs` / other native crates
  - These require `cmake`, a working C/C++ toolchain, and `libclang` at build time. On macOS, ensure Xcode CLT is installed and use Homebrew to install `cmake` and `llvm` if needed.

- Error: `The \`frontendDist\` configuration is set to "../dist" but this path doesn't exist`
  - Cause: The Tauri `generate_context!()` macro validates the configured `frontendDist` path at compile time. When you run `cargo build` (or `npm run tauri -- dev` which compiles the Rust side), it expects the frontend build output to be present at `../dist` (relative to `src-tauri`).
  - Fixes:
    - Recommended: build the frontend so `dist/` exists:

      ```bash
      npm run build
      # then
      npm run tauri -- dev
      ```

    - Quick workaround (only to bypass the check): create an empty `dist` folder so the compile-time check passes. Note: the app will not have the real frontend assets unless you run a real build.

      ```bash
      mkdir dist
      npm run tauri -- dev
      ```

  - Notes: `tauri.conf.json` already has a `devUrl` and `beforeDevCommand` configured, but the Rust compile step still validates `frontendDist`. Building the frontend (`npm run build`) is the robust solution.

## Quick Command Summary

```bash
# install deps
npm install

# run native dev window
npm run tauri -- dev

# build frontend and package native installers
npm run tauri -- build

# run Rust tests
cd src-tauri && cargo test
```

If you need help running a specific step (dev, package, or test) I can run it in your environment and report back.

## Automated build script

This repository includes a helper script that performs an end-to-end build from the project root. It checks prerequisites (Node, npm, Rust/cargo, cmake, and a C/C++ compiler), installs JS deps, builds the frontend, compiles the Rust backend, and runs the Tauri packaging step.

- Interactive usage (prompts before auto-installing native deps):

```bash
bash ./scripts/build.sh
```

- Non-interactive / CI usage (attempts to auto-install rustup/cmake with Homebrew):

```bash
bash ./scripts/build.sh --yes
# or via npm
npm run build:all:ci
```

Notes:
- On macOS the script will attempt to use Homebrew to install `cmake` when `--yes` is provided. It will attempt a non-interactive `rustup` install to provide `cargo` as well. You can also install these manually if you prefer.
- If you only want to build the frontend assets, run `npm run build`.

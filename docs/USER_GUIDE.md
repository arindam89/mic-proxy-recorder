# Mic Proxy Recorder — User Guide

## Overview

This repo is a Tauri desktop application (Rust backend + React frontend) that provides a local microphone proxy, noise cancellation, recording, and offline speech-to-text.

### Meeting bridge (Google Meet / Zoom) — duplex relay

1. Install **[BlackHole](https://existential.audio/blackhole/)** (or another virtual cable listed as **both** input and output with the **same** name).
2. On **Recorder → Meeting bridge**, set **Virtual cable** to that device (e.g. “BlackHole 2ch”). The menu only lists devices macOS exposes as **both** input and output with the same name; built-in **MacBook Air Speakers** are playback-only and cannot be used as the virtual cable.
3. Set **Speakers** to your **real** headphones or built-in speakers (**not** the same BlackHole device as the virtual cable — that would feed the call back into the cable and can break the recording). **Default** is usually correct.
4. Click **Start meeting bridge**. The app routes your **physical microphone** (optional denoise) into the virtual cable, plays Meet’s side from the cable to your speakers, and subtracts your own uplink from that capture (BlackHole mixes playback onto its input — this avoids the “booping” self-resonance). It records a **stereo** WAV (`meeting-duplex-*.wav`): **left = you**, **right = Meet** (remote-heavy).
5. In **Google Meet**, set **both** the **microphone** and the **speaker** to that same virtual device. If Meet’s speaker is still your built-in speakers while the mic is BlackHole, you will get echo/feedback.
6. Click **Stop meeting bridge** when the call ends; transcribe or download from the meeting card or **Recordings**.

**Optional embedded installer (maintainers / CI):** run `bash scripts/download-blackhole-pkg.sh` before `npm run tauri -- build` so `BlackHole2ch-0.6.1.pkg` is copied into the app bundle; **Settings → Meet / Zoom** on macOS has **Open BlackHole installer** / **Download**. Details: **`specs/BLACKHOLE_BUNDLE.md`**. Or **scripts/build.sh --with-blackhole-pkg** before packaging.

See **`specs/VIRTUAL_AUDIO.md`** and **`specs/RELAY_HUB_ARCHITECTURE.md`** for routing diagrams and edge cases.

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

Equivalent shortcuts (optional):

```bash
npm run tori:dev
# or: npm run tori -- dev
```

Notes:
- The app uses Tauri's injected JS API. Running `npm run dev` alone opens the app in a normal browser without Tauri's runtime; calling Tauri APIs (like `invoke`) will fail in that environment. Use `npm run tauri -- dev` when you need the native backend.
- Tauri v2 does not expose `window.__TAURI__` unless `withGlobalTauri` is enabled; the UI detects the desktop runtime with `isTauri()` from `@tauri-apps/api/core` so `invoke` works in the real app.

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

- Optional **full script** (Rust, frontend, then Tauri package): `bash scripts/build.sh`. Add **`--with-parakeet-venv`** to run `scripts/setup-parakeet-venv.sh` first so the Parakeet Python environment exists before you package (the venv itself is **not** copied into the app bundle by default—only `scripts/` is bundled as resources; keep using `.venv-parakeet` beside the repo for development).

## Recording and transcription

### Recorder UI (start / stop / timer)

Start and stop return the active `Recording` from the Rust backend immediately, so the red indicator, timer, and Stop / Pause controls stay in sync. The timer only advances while status is **recording** (it pauses when you pause). If you previously saw “Already recording” while the UI still showed **Record**, that was a race where the `recording-started` event could fire before the event listener finished registering; the command return value fixes that.

While **recording** or **paused**, the current take card shows an **input level** bar (normalized peak from the capture callback) so you can see when the mic is picking up signal.

### Names, playback, download, rename

- Each new take gets a **display name** derived from the last few folders of the recordings directory plus a **UTC timestamp** (for example `com_micproxyrecorder_app_recordings_2026-04-17_20-30-45`). The on-disk file remains a stable `recording-{uuid}.wav` name.
- After **Stop**, use the built-in **audio player** on the Recorder screen or open **Recordings** for the same controls on every clip. Playback uses Tauri’s **asset protocol** for files under app data (`src-tauri/tauri.conf.json` → `app.security.assetProtocol`).
- **Download** copies the WAV to a path you choose (default filename uses the display name). The save dialog requires the **`dialog:default`** permission in `src-tauri/capabilities/default.json`.
- **Rename** edits only the display name (safe for transcription paths); use **Rename** on the Recorder card or on each row in **Recordings**.
- On **Recordings**, each clip keeps **transcript** (copy / .txt / .srt and search highlights) **inside that clip’s card** so context stays with the take. Use **Download transcript** for a **Markdown** (`.md`) export. The **search** field filters by **display name** or **transcript text**; matches are highlighted in the title and in transcript lines.
- **Settings → Virtual routing** stores **proxy mic** and **speaker / loopback** labels for your own documentation (for example how you named an Aggregate device in Audio MIDI Setup). The app does not create a virtual driver; see **`specs/VIRTUAL_AUDIO.md`** for Zoom / BlackHole-style setups. **Playback devices** lists outputs on this Mac as a reference when you build a Multi-Output device.

### Whisper (bundled whisper.cpp)

1. Download a GGUF or compatible `.bin` model (see Settings in the app for a link).
2. In **Settings**, choose **Whisper (GGUF)** and browse to the model file.
3. After you **Stop** a take, use **Transcribe** on the recorder strip or on the **Recordings** tab.

### Parakeet (NVIDIA NeMo, local Python)

Parakeet runs in a separate Python process using `scripts/parakeet_transcribe.py`. The default Hugging Face checkpoint is configurable with the environment variable **`PARAKEET_NEMO_MODEL`** (default: `nvidia/parakeet-tdt-0.6b-v2`). When NVIDIA publishes a newer Parakeet checkpoint (for example a “v3” name on Hugging Face), set that variable to the model id before launching the app.

1. From the **repository root**, create the Parakeet venv and install NeMo (large download; may take several minutes). The setup script prefers **Python 3.12, 3.11, or 3.10** (NeMo / ONNX are not reliable on **3.13+**). Install one of those if needed (e.g. `brew install python@3.12` on macOS).

   ```bash
   bash scripts/setup-parakeet-venv.sh
   ```

   Equivalent manual steps (example with Homebrew Python 3.11):

   ```bash
   /opt/homebrew/bin/python3.11 -m venv .venv-parakeet
   source .venv-parakeet/bin/activate
   pip install -r scripts/requirements-parakeet.txt
   ```

2. Restart the **Mic Proxy Recorder** desktop app. The Rust backend prefers **`.venv-parakeet/bin/python3`** in the repo when that file exists, so you normally do **not** need to change your global `PATH`.

3. In **Settings**, choose **Parakeet (NeMo, local)** and save. No Whisper GGUF path is required for this mode.

4. Transcribe a saved WAV as with Whisper.

### Transcript export

On the transcript card, use **Copy text**, **Download .txt**, or **Download .srt** (segments with timestamps when available). On **Recordings**, use **Download transcript** for a Markdown export of the stored transcript.

### Settings persistence

**Settings** (including **Parakeet** vs **Whisper**, device, noise cancellation, and model path) are written to **`settings.json`** in the app data directory when you save from the Settings screen, and reloaded the next time you launch the app.

## Tests

- JavaScript/TypeScript: there are no Jest/Vitest tests configured in this repo. Type-checking is performed by `tsc` as part of `npm run build`.
- Rust: run any Rust tests in the `src-tauri` crate:

```bash
cd src-tauri
cargo test
```

## Troubleshooting

- **Google Meet only shows “MacBook Air Microphone” — I don’t see Mic Proxy Recorder as a mic**  
  Expected: this app does **not** install a system microphone. Meet lists devices macOS knows about (built-in, USB, **BlackHole**, aggregates you create in **Audio MIDI Setup**, etc.). To get an extra entry in Meet, install a virtual driver such as **[BlackHole](https://existential.audio/blackhole/)** and/or create an **Aggregate Device** that combines your mic with BlackHole, then pick that device in Meet and the same device in Mic Proxy Recorder. See **`specs/VIRTUAL_AUDIO.md`** (“Google Meet”).

- Error: `TypeError: Cannot read properties of undefined (reading 'invoke')`
  - Cause: The Tauri JS API isn’t available when you open the frontend in a plain browser (for example, after `npm run dev`).
  - Quick fix: Run the app via the Tauri dev command so the Tauri runtime is injected:

    ```bash
    npm run tauri -- dev
    ```

  - Long-term fix (what this repo includes): the frontend guards Tauri API calls with `isTauri()` from `@tauri-apps/api/core` and surfaces a helpful error when the runtime is missing. See `src/App.tsx` for the safe `invoke` wrapper.

- Error: `dialog.save not allowed` / save or open dialogs failing
  - Cause: Tauri v2 requires **capabilities** that list plugin permissions (for example `dialog:allow-save`).
  - Fix: This repo ships `src-tauri/capabilities/default.json` attached to the window labeled `main`, including `dialog:default`. Rebuild/restart the desktop app after pulling changes.

- HTML `<audio>` shows **Error** for a recording under *Mic Proxy Recorder*
  - Cause: Local WAV paths must be exposed to the webview via the **asset protocol** (`convertFileSrc`).
  - Fix: `tauri.conf.json` enables `app.security.assetProtocol` with scopes that include app data and (on macOS) `Library/Application Support`. Restart the app after config changes.

- Parakeet: **NeMo is not installed** / import errors after `pip install`
  - Cause: The default `python3` on some systems is **3.13 or 3.14**, where NeMo and its ONNX stack often break.
  - Fix: Use **Python 3.10–3.12** for `.venv-parakeet` only: run `bash scripts/setup-parakeet-venv.sh` (it picks `python3.12`, `python3.11`, or `python3.10` from your `PATH`). Install one of those if needed, remove the old `.venv-parakeet` folder, and run the script again.

- Parakeet: **returned non-JSON stdout** (Rust error) while stderr shows NeMo/tqdm logs
  - Cause: NeMo and **tqdm** were writing progress to **stdout**; the desktop app only parses a single JSON line from stdout.
  - Fix: `scripts/parakeet_transcribe.py` redirects NeMo’s stdout to stderr, sets `TQDM_DISABLE=1`, and emits JSON only on the real stdout. Pull latest and retry transcribe.

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

# Recordings metadata and files

## `Recording` (Rust / JSON)

- `path` / `filename`: actual WAV on disk (`recording-{uuid8}.wav`).
- `display_name`: user-facing label; default from `default_display_name_for_dir()` (path tail + `YYYY-MM-DD_HH-MM-SS` UTC).
- `rename_recording` updates `display_name` in `recordings.json` only (file path unchanged).
- `export_recording` copies bytes to a user-selected path (`std::fs::copy`).

## Playback

The webview loads local audio via `convertFileSrc` from `@tauri-apps/api/core` (`RecordingAudio.tsx`). That requires **`app.security.assetProtocol.enable: true`** and a **`scope`** that includes the app’s data directory (see `tauri.conf.json`).

## Tauri capabilities

`src-tauri/capabilities/default.json` grants **`dialog:default`** (save/open dialogs), **`fs:default`**, **`core:default`**, and other plugin defaults for the window labeled **`main`** (`tauri.conf.json` → `windows[0].label`).

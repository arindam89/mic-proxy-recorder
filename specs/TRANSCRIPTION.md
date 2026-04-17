# Transcription

## Engines

| Backend   | Implementation                         | User configuration                          |
| --------- | -------------------------------------- | ------------------------------------------- |
| `whisper` | `whisper-rs` → whisper.cpp             | Local path to GGUF/bin model (`model_path`) |
| `parakeet`| Python `scripts/parakeet_transcribe.py` | NeMo install + optional `PARAKEET_NEMO_MODEL` |

`transcription_backend` lives in `Settings` (Rust) and is mirrored in `AppSettings` (TypeScript).

## Parakeet venv

- Repo-local **`.venv-parakeet`** (Python **3.10–3.12**): create with `bash scripts/setup-parakeet-venv.sh`.
- Rust (`parakeet.rs`) runs **`.venv-parakeet/bin/python3`** (or `Scripts\python.exe` on Windows) when that file exists, else system `python3` / `python`. Packaged builds may also use **`$RESOURCES/parakeet-venv/.../python`** if you ship a venv there (optional; large).
- The helper script is resolved from **`resource_dir()/scripts/parakeet_transcribe.py`** when bundled (`tauri.conf.json` → `bundle.resources`), else from the repo `scripts/` tree in development.
- The script must emit **only JSON on stdout**; NeMo/tqdm spam is redirected to stderr and `parse_parakeet_json_stdout` can fall back to the last JSON line if needed.

## IPC

- `transcribe_recording` accepts `recording_path` only; backend and model path are read from `AppState.settings`.
- Completion emits `transcription-done` with **`{ transcript, recordingPath }`** from a `spawn_blocking` task; the backend merges `transcript` into `recordings.json` for that path. Errors use `transcription-error { message }`.

## Recording UI

`start_recording` / `stop_recording` return `Recording` so the webview does not depend on `listen` completing before `emit` (avoids missed `recording-started`).

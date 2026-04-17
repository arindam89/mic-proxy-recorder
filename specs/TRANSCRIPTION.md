# Transcription

## Engines

| Backend   | Implementation                         | User configuration                          |
| --------- | -------------------------------------- | ------------------------------------------- |
| `whisper` | `whisper-rs` → whisper.cpp             | Local path to GGUF/bin model (`model_path`) |
| `parakeet`| Python `scripts/parakeet_transcribe.py` | NeMo install + optional `PARAKEET_NEMO_MODEL` |

`transcription_backend` lives in `Settings` (Rust) and is mirrored in `AppSettings` (TypeScript).

## Parakeet venv

- Repo-local **`.venv-parakeet`** (Python **3.10–3.12**): create with `bash scripts/setup-parakeet-venv.sh`.
- Rust (`parakeet.rs`) runs **`.venv-parakeet/bin/python3`** when that file exists, else system `python3` / `python`.

## IPC

- `transcribe_recording` accepts `recording_path` only; backend and model path are read from `AppState.settings`.
- Completion uses the existing `transcription-done` / `transcription-error` events from a `spawn_blocking` task.

## Recording UI

`start_recording` / `stop_recording` return `Recording` so the webview does not depend on `listen` completing before `emit` (avoids missed `recording-started`).

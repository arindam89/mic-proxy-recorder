# Mic Proxy Recorder — Product & Technical Specification

## 1. Product Vision

Mic Proxy Recorder is a privacy-first, offline-capable desktop application that captures microphone audio with real-time noise cancellation, records lossless audio files, and transcribes speech to text entirely on-device using a local Whisper model. No audio or transcripts ever leave the user's machine.

### Goals
- Zero cloud dependency: all processing is local
- Cross-platform: Windows 10+, macOS 12+, Linux (glibc ≥ 2.31)
- Low latency noise cancellation (< 10 ms frame latency via RNNoise)
- High-quality transcription via whisper.cpp (GGUF models)
- Export transcripts as .txt and .srt subtitle files
- Global hotkey push-to-transcribe mode

### Non-goals (vs commercial Voice AI such as [Krisp](https://krisp.ai/))
- Replacing full meeting-stack products (system-wide virtual mic in Meet/Teams, AI summaries, CRM sync, Chrome extensions) without the drivers and services those products ship. See **`specs/KRISP_STYLE_GOALS.md`** for a feature matrix and phased technical options.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│               Tauri Shell (Rust)                │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │   Commands  │  │      Event Emitter       │  │
│  └──────┬──────┘  └───────────┬──────────────┘  │
│         │                     │                 │
│  ┌──────▼──────────────────────▼──────────────┐  │
│  │              AppState (Mutex)              │  │
│  └─────────────────────────────────────────── ┘  │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Audio Module │  │  Transcription Module    │  │
│  │  cpal        │  │  whisper-rs              │  │
│  │  nnnoiseless │  │  (whisper.cpp)           │  │
│  │  hound       │  │                          │  │
│  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────┘
              ↕ IPC (invoke/emit)
┌─────────────────────────────────────────────────┐
│           React Frontend (TypeScript)           │
│  App → DeviceSelector, RecorderControls,        │
│        NoiseCancelPanel, TranscriptPane,        │
│        RecordingsList, SettingsPanel            │
└─────────────────────────────────────────────────┘
```

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS v3 |
| Audio capture | cpal 0.15 |
| Noise cancellation | nnnoiseless 0.5 (pure-Rust RNNoise) |
| WAV recording | hound 3.5 |
| Transcription | whisper-rs 0.11 (whisper.cpp bindings) |
| Async runtime | tokio 1 |
| Serialization | serde + serde_json |
| Unique IDs | uuid v4 |
| Time | chrono |

---

## 3. Component Specifications

### 3.1 Audio Capture (`src-tauri/src/audio/capture.rs`)
- Enumerates all system audio input devices via `cpal::HostTrait`
- Returns `AudioDevice { id, name, is_default }` for each
- `get_input_device(id)` resolves a device by name or returns the system default

### 3.2 Audio Processor (`src-tauri/src/audio/processor.rs`)
- Wraps `nnnoiseless::DenoiseState` (RNNoise algorithm)
- Operates on 480-sample frames at 48 kHz (10 ms frames)
- Blends original and denoised signal by a `level` factor:
  - `off` = 0.0 (bypass)
  - `low` = 0.40
  - `medium` = 0.75
  - `high` = 1.00
- Includes linear-interpolation resampler for rate conversion
- Stereo→mono downmix by channel averaging

### 3.3 Audio Recorder (`src-tauri/src/audio/recorder.rs`)
- Builds a `cpal` input stream for the selected device
- Pipeline: capture → (optional resample to 48 kHz) → (optional RNNoise) → WAV write
- WAV written via `hound` at 16-bit signed integer, mono, 48 kHz (NC on) or native rate (NC off)
- `RecorderHandle` exposes `toggle_pause()` and `stop() → Recording`
- File naming: `recording-{uuid[..8]}.wav` in `$APPDATA/recordings/`

### 3.4 Transcription (`src-tauri/src/transcription/whisper.rs`)
- Loads WAV file and resamples to 16 kHz mono f32 PCM (whisper.cpp requirement)
- Initializes `WhisperContext` from a local GGUF/bin model path
- Runs greedy sampling strategy with `best_of=1`
- Thread count: `min(num_cpus, 4)`
- Returns `Transcript { recording_id, text, segments[], language, created_at }`
- `TranscriptSegment { id, start_ms, end_ms, text }`
- Whisper timestamp units are centiseconds → multiply by 10 for milliseconds

### 3.5 Commands (`src-tauri/src/commands.rs`)
See Section 4 (API Contracts) for full command listing.

### 3.6 State (`src-tauri/src/state.rs`)
- `AppState { recorder: Option<RecorderHandle>, settings: Settings }`
- Held in `Arc<Mutex<AppState>>` and registered with Tauri's `.manage()`

### 3.7 Settings (`src-tauri/src/settings.rs`)
- Persisted to `$APPDATA/settings.json` on save; loaded at startup in `lib.rs` setup.
- Fields: `noise_cancel_enabled`, `noise_cancel_level`, `input_device_id`, `output_format`, `model_path`, `transcription_backend`, `proxy_mic_display_name`, `proxy_speaker_display_name`

---

## 4. API Contracts (Tauri Commands)

### `list_audio_devices() → AudioDevice[]`
Returns all available microphone inputs.

### `list_playback_devices() → AudioDevice[]`
Returns playback (output) devices from the OS — used in Settings as a reference for virtual routing docs.

### `get_recording_meter() → { peak: number }`
While a recording session is active, returns a normalized **0..1** peak level from the last input buffer (UI applies decay). Errors if not recording.

### `start_recording(deviceId?, noiseCancelEnabled, noiseCancelLevel, outputFormat) → void`
Starts audio capture. Emits `recording-started { recording: Recording }`.

### `stop_recording() → void`
Stops the active recording, finalizes the WAV file. Emits `recording-stopped { recording: Recording }`.

### `toggle_pause_recording() → void`
Toggles the active recording between paused and playing.

### `transcribe_recording(recordingPath) → void`
Starts an async transcription job (backend and model path come from `AppState.settings`). On success emits `transcription-done { transcript: Transcript, recordingPath: string }` and updates `recordings.json` with the transcript. On failure emits `transcription-error { message: string }`.

### `list_recordings() → Recording[]`
Returns all persisted recordings sorted newest-first.

### `delete_recording(recordingId) → void`
Deletes the recording file and removes it from the persisted list.

### `get_settings() → AppSettings`
Returns current application settings.

### `save_settings(settings: AppSettings) → void`
Persists new settings to `settings.json` under the app data directory and updates in-memory state.

---

## 5. Data Models

### Recording
```typescript
interface Recording {
  id: string;            // UUID v4
  path: string;          // Absolute path to the WAV file
  filename: string;      // Basename (e.g., "recording-a1b2c3d4.wav")
  display_name?: string; // User-visible label
  transcript?: Transcript | null; // Last successful transcript (persisted in recordings.json)
  duration_secs: number; // Duration in whole seconds
  created_at: string;    // ISO 8601 timestamp
}
```

### Transcript
```typescript
interface Transcript {
  recording_id: string;
  text: string;                 // Full concatenated text
  segments: TranscriptSegment[];
  language: string;             // Detected language code
  created_at: string;
}

interface TranscriptSegment {
  id: number;
  start_ms: number;  // milliseconds
  end_ms: number;
  text: string;
}
```

### AppSettings
```typescript
interface AppSettings {
  noise_cancel_enabled: boolean;
  noise_cancel_level: "off" | "low" | "medium" | "high";
  input_device_id: string | null;
  output_format: "wav" | "flac";
  model_path: string | null;
  transcription_backend: "whisper" | "parakeet";
  proxy_mic_display_name: string;
  proxy_speaker_display_name: string;
}
```

---

## 6. UI Layout Spec

```
┌──────────────────────────────────────────────────────────────┐
│  🎙 Mic Proxy Recorder        [Recorder] [Recordings] [Settings] │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌───────────────────────────────────────┐ │
│  │ Input Device   │  │  Current Recording Card (when active) │ │
│  │ [select ▼]     │  │  filename.wav  [Transcribe]           │ │
│  ├────────────────┤  ├───────────────────────────────────────┤ │
│  │ Noise Cancel   │  │  Input level (while recording)        │ │
│  │ [toggle]       │  │  Transcript (inside card when idle)   │ │
│  │ Low Med High   │  │  [Export .txt] [Export .srt]          │ │
│  ├────────────────┤  │  00:01  Hello world...                │ │
│  │ Recorder       │  │  00:05  This is a test...             │ │
│  │  00:00         │  │                                       │ │
│  │  [● Record]    │  │                                       │ │
│  └────────────────┘  └───────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│  Error bar (conditional)                          [Dismiss]  │
└──────────────────────────────────────────────────────────────┘
```

### Views
1. **Recorder** (default): Left panel (device, noise cancel, controls) + right panel (current recording card + transcript)
2. **Recordings**: Full-width list of past recordings with Transcribe/Delete buttons
3. **Settings**: Whisper model path browser + output format selector

### Dark Theme
- Background: `#0f172a` (surface-900)
- Surface cards: `#1e293b` (surface-800)
- Border: `#334155` (surface-700)
- Primary accent: `#2563eb` (primary-600)
- Text primary: white
- Text muted: `#9ca3af` (gray-400)

---

## 7. CI/CD Spec

### Triggers
- `push` to `main` or `develop`
- `pull_request` to `main`
- `workflow_dispatch` (manual)

### Build Matrix
| OS | Artifact |
|----|----------|
| ubuntu-22.04 | `.deb`, `.AppImage` |
| windows-2022 | `.msi`, `.exe` (NSIS) |
| macos-14 (arm64) | `.dmg`, `.app` |

### Build Steps (each platform)
1. Install system dependencies:
   - Linux: `libasound2-dev`, `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, cmake, clang, libclang-dev
   - macOS: brew install cmake
   - Windows: choco install cmake
2. Install Rust stable toolchain
3. Install Node.js 20 + npm install
4. `cargo build --release` (with whisper.cpp compilation)
5. `tauri build`
6. Upload installer artifacts

### Model Distribution
Models are NOT bundled with the installer (too large). Users download from Hugging Face and configure the path in Settings.

---

## 8. Security Considerations

- All file I/O is scoped to `$APPDATA`, `$DOCUMENT`, `$DOWNLOAD`, `$HOME` via Tauri FS plugin ACL
- No network access required or requested at runtime
- CSP is null (relaxed) in dev; production should set appropriate CSP
- No telemetry, no analytics, no external calls

---

## 9. Known Limitations (v0.1)

- Settings are not persisted to disk yet (in-memory only)
- FLAC output format is UI-only; actual recording always uses WAV
- Pause/resume toggles the stream but does not produce a clean WAV splice
- whisper-rs requires native build dependencies (cmake, clang, C++ compiler)
- No global hotkey push-to-transcribe implemented yet (plugin registered, feature pending)

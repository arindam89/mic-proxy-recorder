# mic-proxy-recorder

A native cross-platform app with a local mic proxy, built-in recorder, and local speech-to-text.

## Not the same as [Krisp](https://krisp.ai/)

Products like **Krisp** integrate **at the system and browser level** (noise cancellation, transcription, AI notes, Meet/Teams/Zoom compatibility, optional [AI Voice SDK](https://krisp.ai/)). **Mic Proxy Recorder** focuses on **local capture + offline transcription** from devices the OS already exposes. It does **not** install a virtual microphone driver or a Meet Chrome extension. If you need Krisp-style in-call processing for Google Meet, use **Krisp** (or similar) alongside this app, or follow **`specs/VIRTUAL_AUDIO.md`** for BlackHole / aggregate routing. For a full gap analysis and phased roadmap, see **`specs/KRISP_STYLE_GOALS.md`**.

## Selected foundation

### Technology stack
- **Desktop app shell:** Tauri (Rust backend + web UI) for cross-platform native installers (Windows/macOS/Linux).
- **Audio engine:** Rust (`cpal` + DSP pipeline) with local processing chain inspired by EasyEffects.
- **Noise cancellation path:** RNNoise + WebRTC Audio Processing (noise suppression, AGC, VAD).
- **Recorder output:** lossless **FLAC** (default) and WAV fallback.

### Local model choice
- **Primary local STT model:** `whisper.cpp` with `large-v3-turbo` quantized model (`q5_0`) for high-quality offline transcription.
- **Fallback profile:** `medium` quantized model for lower-resource devices.

### Interface choice
- **Main UI:** simple recorder-first layout:
  - input/source selector
  - noise-cancel toggle + quality preset
  - record/pause/stop controls
  - transcript pane + export (`.txt`, `.srt`)
- **Secondary mode:** global hotkey push-to-transcribe (for text inputs).

## CI/CD: cross-platform installable binaries

This repository includes a GitHub Actions workflow:

- `.github/workflows/build-installers.yml`

It is designed to build Tauri installers for:
- Linux (`.AppImage`, `.deb`)
- Windows (`.msi`)
- macOS (`.dmg`)

The workflow also supports optional model bundling during manual runs.

# mic-proxy-recorder

A native cross-platform app for **local** microphone capture, optional noise cancellation, **meeting bridge** (duplex relay: your mic → virtual cable for Meet; Meet’s playback from that cable → your real speakers; **stereo** WAV with you on the left and remote on the right — see [BlackHole](https://existential.audio/blackhole/)), WAV recording, and offline speech-to-text (Whisper or Parakeet).

Install **BlackHole** (or similar) once. In Meet, set **both** microphone and speaker to that cable so the full call path goes through the app and avoids speaker→mic feedback. The app does not ship its own kernel driver.

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
  - **Meeting bridge** (virtual cable for Meet mic + Meet speakers; hear the call on real output) + normal record/pause/stop
  - noise-cancel toggle + quality preset
  - transcript + export (`.txt`, `.srt`)
- **Secondary mode:** global hotkey push-to-transcribe (for text inputs).

## CI/CD: cross-platform installable binaries

This repository includes a GitHub Actions workflow:

- `.github/workflows/build-installers.yml`

It is designed to build Tauri installers for:
- Linux (`.AppImage`, `.deb`)
- Windows (`.msi`)
- macOS (`.dmg`)

The workflow also supports optional model bundling during manual runs.

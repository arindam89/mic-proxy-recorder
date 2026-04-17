# Krisp-style goals vs this repository

[Krisp](https://krisp.ai/) is a commercial **Voice AI platform**: system-wide noise cancellation, meeting transcription and recording, AI notes and summaries, accent conversion, CRM sync, Chrome extensions for Meet, and optional [**AI Voice SDK**](https://krisp.ai/) for embedding in other products. It works **at the audio driver / OS integration layer** so Zoom, Google Meet, Teams, and Slack see processed audio without per-app hacks.

**Mic Proxy Recorder** is a smaller, **privacy-first** project: local recording from `cpal`, RNNoise-style suppression in our pipeline, and **offline** transcription (Whisper / Parakeet). It does **not** replace Krisp end-to-end and cannot “become Krisp” without major new subsystems (below).

Use this document to align expectations and to plan work in **phases** if you want to move closer to a Krisp-like experience over time.

---

## Feature matrix

| Krisp-style capability | In Mic Proxy Recorder today | What it would take |
| ---------------------- | --------------------------- | ------------------ |
| Noise cancellation on captured audio | Yes (during record, in our DSP path) | Already present (`nnnoiseless` / pipeline in `src-tauri/src/audio/`). |
| NC / processing **inside Meet without a separate virtual device** | No | Needs OS-level virtual mic + processed tap (driver or signed helper), or a **browser extension** that processes getUserMedia (separate product surface). |
| Virtual microphone visible in Meet | No | macOS **CoreAudio driver** (e.g. DriverKit HAL) or user-installed third party such as [BlackHole](https://existential.audio/blackhole/) + aggregates; see `VIRTUAL_AUDIO.md`. |
| Live transcription in Meet | No | Would require capturing Meet’s audio (loopback) + streaming ASR + UI; Krisp uses their cloud/on-device stack. |
| AI meeting notes / summaries / CRM | No | Would need LLM integration, auth, and product scope beyond this repo. |
| Chrome extension for Meet | No | Separate Chromium extension repo + store policies. |
| Krisp SDK (NC, accent, etc. in **your** app) | No | Possible **only** with a Krisp license and their SDK; different architecture from our pure-local stack. |

---

## Recommended combinations today

1. **Meet clarity + Krisp’s stack**  
   Use [Krisp](https://krisp.ai/) (or similar) for **in-meeting** noise cancellation and notes where you need driver-level integration. Use **Mic Proxy Recorder** when you want a **local WAV + offline transcript** under your control.

2. **All-local, no Krisp**  
   Use **BlackHole** + **Audio MIDI Setup** aggregates so Meet and this app can share a sensible routing; accept that Meet will list **BlackHole / aggregate names**, not “Mic Proxy Recorder”. See `VIRTUAL_AUDIO.md`.

---

## Phased roadmap (if this repo should move toward Krisp-like behavior)

**Phase A — Documentation and UX (current direction)**  
Clear in-app copy, user guide, and specs so users are not surprised that Meet’s device list is OS-driven.

**Phase B — Richer local capture**  
Optional second input (loopback), stereo or dual-file mix, better level metering — still **no** automatic Meet listing.

**Phase C — Virtual audio (large engineering)**  
macOS: DriverKit / HAL plug-in, signing, notarization, and ongoing OS compatibility. Windows: different virtual audio APIs. This is effectively a **separate product** or a dependency on an existing virtual cable (BlackHole, VB-Audio, etc.).

**Phase D — Meeting-integrated AI**  
Transcription streaming, summaries, calendar bots — separate roadmap, likely cloud or heavy on-device models.

Phases C–D are **not committed** in this repository; they are listed so stakeholders can size effort honestly.

---

## References

- Krisp product and positioning: [https://krisp.ai/](https://krisp.ai/)  
- Virtual loopback on macOS (common companion to any “process then re-route” story): [https://existential.audio/blackhole/](https://existential.audio/blackhole/)

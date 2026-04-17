# Virtual microphone, speaker capture, and Zoom

This application **does not install a macOS CoreAudio driver**. It uses **cpal** to capture from real inputs and, for calls, can **play your processed microphone into a playback device** such as [BlackHole](https://existential.audio/blackhole/) so Meet/Zoom can select that device as the microphone (`src-tauri/src/audio/meeting_bridge.rs`).

## Meeting bridge (simple call flow)

1. Install **BlackHole 2ch** (or similar) so macOS gains a new playback + recording device.
2. In **Mic Proxy Recorder → Recorder → Meeting bridge**, set **To Meet / Zoom** to **BlackHole 2ch** (or your aggregate that includes it).
3. **Start meeting bridge**: the app captures your chosen **physical mic**, applies optional denoise, writes a mono WAV locally, and feeds the same audio to BlackHole’s **input** path via its **output** API (standard BlackHole routing).
4. In **Google Meet**, choose **BlackHole 2ch** (or your aggregate) as the **microphone**.
5. **Stop meeting bridge** when finished; open **Recordings** or the meeting card to transcribe.

This is the supported way to get a “virtual mic” experience without shipping a custom driver.

## Google Meet: why “Mic Proxy Recorder” never appears in the mic list

Google Meet (running in the browser) asks macOS for **audio input devices**. The list is built from **CoreAudio** — built-in microphones, USB headsets, and any **kernel extension / DriverKit driver** that registers an input (for example **BlackHole 2ch** after you install it).

**Mic Proxy Recorder is a normal app.** It is not an audio driver, so macOS does not expose it as a microphone. Saving a “proxy mic label” in Settings is only a **note for you**; it does not create hardware.

### What to do instead (macOS)

1. Install a virtual audio device that **does** register with the OS, for example **[BlackHole 2ch](https://existential.audio/blackhole/)** (free).
2. Open **Audio MIDI Setup** (Spotlight: “Audio MIDI Setup”).
3. Click **+** in the lower-left corner and create an **Aggregate Device**. Enable your **MacBook microphone** and **BlackHole 2ch** (or only BlackHole if you only need loopback).
4. Optionally rename the aggregate in the left sidebar (this is the name you will tend to see in Meet).
5. In **Google Meet** → microphone menu, pick that **aggregate** (or “BlackHole 2ch” if you use it alone). It appears because the **driver** installed it, not because of this recorder app.
6. In **Mic Proxy Recorder**, choose the **same** input you want to record (often the aggregate or BlackHole, depending on your routing).

Until you complete steps 1–4, Meet will typically only show **MacBook Air Microphone (Built-in)** — which matches what you see in a default setup.

## What the Settings labels do

**Proxy mic display name** and **Proxy speaker display name** are **saved labels only**: they help you remember what you named an aggregate device or how you described routing in Zoom. They do **not** rename hardware or create devices.

## Practical setup (macOS)

1. **Virtual / loopback audio**  
   Use a third-party tool such as **BlackHole** (free) or **Loopback** (paid) so the system can route audio between apps.

2. **Hear speakers while recording “what you hear”**  
   Typical pattern: create a **Multi-Output Device** in **Audio MIDI Setup** that includes your real speakers **and** BlackHole, set it as the system output, then in this app choose **BlackHole** (or the aggregate input) as the **microphone input** if it appears as an input — or use an **Aggregate Device** that combines your physical mic and BlackHole for a single stereo/session recording strategy. Exact wiring depends on your MacOS version and hardware.

3. **Zoom / Meet**  
   In the app’s audio settings, choose the **aggregate** or **virtual** input you created as the microphone — the one macOS lists after you install BlackHole (or similar) and optionally build an aggregate. Use the display names you saved in Mic Proxy Recorder’s Settings as a reminder in documentation or team runbooks; they do not change Meet’s list.

## Recording “mic + speaker” in one file

Fully mixing **two independent hardware streams** (physical mic + system loopback) with different clocks and buffer sizes is **not implemented** in this repo yet. A future version could add a second input stream or a dedicated mix-down path. Until then, prefer **one** aggregate or virtual device that already combines the sources, if your driver stack supports it.

## Windows / Linux

Patterns differ (e.g. WASAPI loopback on Windows). The same limitation applies: the app records from **inputs that the OS exposes** to `cpal`, not from an in-process virtual driver unless the OS lists such a device.

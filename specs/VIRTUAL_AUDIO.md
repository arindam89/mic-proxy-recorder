# Virtual microphone, speaker capture, and Zoom

This application **does not install a macOS CoreAudio driver** or create a true system-wide virtual microphone by itself. It records from **existing** input devices using `cpal` (see `src-tauri/src/audio/recorder.rs`).

## What the Settings labels do

**Proxy mic display name** and **Proxy speaker display name** are **saved labels only**: they help you remember what you named an aggregate device or how you described routing in Zoom. They do **not** rename hardware or create devices.

## Practical setup (macOS)

1. **Virtual / loopback audio**  
   Use a third-party tool such as **BlackHole** (free) or **Loopback** (paid) so the system can route audio between apps.

2. **Hear speakers while recording “what you hear”**  
   Typical pattern: create a **Multi-Output Device** in **Audio MIDI Setup** that includes your real speakers **and** BlackHole, set it as the system output, then in this app choose **BlackHole** (or the aggregate input) as the **microphone input** if it appears as an input — or use an **Aggregate Device** that combines your physical mic and BlackHole for a single stereo/session recording strategy. Exact wiring depends on your MacOS version and hardware.

3. **Zoom**  
   In Zoom’s audio settings, choose the **aggregate** or **virtual** input you created as the microphone. Use the display names you saved in Settings as a reminder in documentation or team runbooks.

## Recording “mic + speaker” in one file

Fully mixing **two independent hardware streams** (physical mic + system loopback) with different clocks and buffer sizes is **not implemented** in this repo yet. A future version could add a second input stream or a dedicated mix-down path. Until then, prefer **one** aggregate or virtual device that already combines the sources, if your driver stack supports it.

## Windows / Linux

Patterns differ (e.g. WASAPI loopback on Windows). The same limitation applies: the app records from **inputs that the OS exposes** to `cpal`, not from an in-process virtual driver unless the OS lists such a device.

# Bundling BlackHole for the duplex meeting bridge

## What “embedded” can mean here

macOS does **not** let a normal app register a virtual microphone or speaker without a **separate audio driver** package. BlackHole is that driver (GPL-3.0, by Existential Audio).

This repo therefore supports **embedding the official installer `.pkg`** inside the Tauri app **resources** (optional), not reimplementing CoreAudio inside Rust.

## Maintainer / release workflow

1. From the repo root, download the pinned upstream 2ch package:

   ```bash
   bash scripts/download-blackhole-pkg.sh
   ```

   This writes `src-tauri/resources/blackhole/BlackHole2ch-0.6.1.pkg` (gitignored).

2. Build or package: `npm run tauri -- build`  
   `tauri.conf.json` includes `resources/blackhole`, so the `.pkg` is copied into the app bundle when present.

3. Ship **`THIRD_PARTY_NOTICES.md`** next to the pkg in that folder (already in git). Comply with [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) for any distribution of BlackHole binaries.

4. Optional CI: run the download script before `tauri build` (see `scripts/build.sh --with-blackhole-pkg`).

## Runtime behaviour (macOS)

- `blackhole_installer_state` — whether a `BlackHole*.pkg` was found in `resource_dir/blackhole/`.
- `open_blackhole_installer` — runs `open` on the bundled `.pkg` if found; otherwise opens the same file’s HTTPS URL so the user can download and run it manually.

## Duplex “configuration”

The app **cannot** change Google Meet’s device menus programmatically. Duplex configuration is:

1. Install BlackHole (user runs Apple’s installer from the bundled or downloaded pkg).
2. In **Meet**: microphone **and** speaker → **BlackHole 2ch** (same device).
3. In **this app**: **Virtual cable** → BlackHole; **Hear the call on** → real headphones/speakers.

See **`RELAY_HUB_ARCHITECTURE.md`** for the signal flow.

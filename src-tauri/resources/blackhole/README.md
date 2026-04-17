# BlackHole 2ch (optional bundled installer)

The meeting bridge needs a **duplex** virtual device (same name as **input** and **output**). [BlackHole 2ch](https://existential.audio/blackhole/) provides that on macOS.

## What is committed to git

- This folder’s **documentation** and **THIRD_PARTY_NOTICES.md** (GPL v3 attribution).
- The **`.pkg` installer is not committed** (binary artifact; optional per-build).

## Shipping the installer inside the app bundle

From the repository root:

```bash
bash scripts/download-blackhole-pkg.sh
```

Then build or package as usual (`npm run tauri -- build`). Tauri copies `src-tauri/resources/blackhole/` into the app’s **Resources**. The UI command **Install BlackHole** opens the local `.pkg` with macOS `open` when present; otherwise it opens the same file’s **HTTPS URL** in the browser.

## License

BlackHole is **GPL-3.0**. If you distribute its installer with this app, keep **THIRD_PARTY_NOTICES.md** in this directory and comply with the GPL (source: [ExistentialAudio/BlackHole](https://github.com/ExistentialAudio/BlackHole)). This application’s own license is unchanged; bundling is an **optional aggregate** for user convenience—consult counsel if you need a formal compliance review.

import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, readFile } from "@tauri-apps/plugin-fs";
import { useEffect, useState } from "react";

interface Props {
  filePath: string;
  className?: string;
}

function basenameFromPath(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}

/** Playback for WAVs under app data `recordings/` (blob URL via fs plugin; falls back to asset URL). */
export default function RecordingAudio({ filePath, className }: Props) {
  const [src, setSrc] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !isTauri() || !filePath) {
      setSrc("");
      setLoadError(null);
      return;
    }

    let cancelled = false;
    let objectUrl = "";

    (async () => {
      setDecodeError(false);
      setLoadError(null);
      setSrc("");
      const name = basenameFromPath(filePath);
      if (!name || !/\.(wav|flac)$/i.test(name)) {
        setLoadError("Unsupported file type for preview.");
        return;
      }
      try {
        const bytes = await readFile(`recordings/${name}`, { baseDir: BaseDirectory.AppData });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(
          new Blob([bytes], { type: name.toLowerCase().endsWith(".flac") ? "audio/flac" : "audio/wav" })
        );
        setSrc(objectUrl);
      } catch (e) {
        try {
          const asset = convertFileSrc(filePath);
          if (!cancelled) setSrc(asset);
        } catch {
          if (!cancelled) setLoadError(String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filePath]);

  if (!isTauri()) {
    return (
      <p className="text-xs text-gray-500">
        Playback is only available inside the Tauri desktop app.
      </p>
    );
  }

  if (loadError) {
    return <p className="text-xs text-red-400">Could not load audio: {loadError}</p>;
  }

  if (!src) {
    return <p className="text-xs text-gray-500">Loading preview…</p>;
  }

  return (
    <div className="space-y-1">
      <audio
        key={src}
        controls
        className={className ?? "h-9 w-full max-w-md rounded-lg bg-surface-900"}
        preload="metadata"
        src={src}
        onError={() => setDecodeError(true)}
      >
        Your browser does not support audio playback.
      </audio>
      {decodeError ? (
        <p className="text-xs text-amber-400">
          This file did not decode in the built-in player. Use <strong>Download</strong> to open it in another app,
          or confirm the take finished writing before playback.
        </p>
      ) : null}
    </div>
  );
}

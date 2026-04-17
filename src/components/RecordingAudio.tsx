import { convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { useMemo } from "react";

interface Props {
  filePath: string;
  className?: string;
}

/** Native playback for a WAV under the app data directory (Tauri asset URL). */
export default function RecordingAudio({ filePath, className }: Props) {
  const src = useMemo(() => {
    if (typeof window === "undefined" || !isTauri() || !filePath) return "";
    try {
      return convertFileSrc(filePath);
    } catch {
      return "";
    }
  }, [filePath]);

  if (!src) {
    return (
      <p className="text-xs text-gray-500">
        Playback is only available inside the Tauri desktop app.
      </p>
    );
  }

  return (
    <audio
      controls
      className={className ?? "h-9 w-full max-w-md rounded-lg bg-surface-900"}
      preload="metadata"
      src={src}
    >
      Your browser does not support audio playback.
    </audio>
  );
}

import { useEffect, useRef, useState } from "react";
import { invoke as _tauriInvoke, isTauri } from "@tauri-apps/api/core";
import type { RecordingStatus } from "../types";

interface Props {
  status: RecordingStatus;
}

/** Decayed peak for a smoother meter (input updates ~ per audio buffer). */
export default function RecordingLevelMeter({ status }: Props) {
  const [level, setLevel] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    if (status !== "recording" && status !== "paused") {
      displayRef.current = 0;
      setLevel(0);
      return;
    }

    const tick = () => {
      invoke<{ peak: number }>("get_recording_meter")
        .then(({ peak }) => {
          const p = Number.isFinite(peak) ? Math.min(1, Math.max(0, peak)) : 0;
          const prev = displayRef.current;
          displayRef.current = Math.max(p, prev * 0.88);
          setLevel(displayRef.current);
        })
        .catch(() => {
          displayRef.current *= 0.9;
          setLevel(displayRef.current);
        });
    };

    tick();
    const id = window.setInterval(tick, 60);
    return () => window.clearInterval(id);
  }, [status]);

  if (status !== "recording" && status !== "paused") {
    return null;
  }

  const pct = Math.round(level * 100);
  const warm = level > 0.85;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Input level</span>
        <span className="font-mono text-gray-400">{pct}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-800"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Microphone input level"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-75 ease-out ${
            warm ? "bg-amber-500" : "bg-primary-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function invoke<T = unknown>(cmd: string): Promise<T> {
  if (typeof window !== "undefined" && isTauri()) {
    return _tauriInvoke(cmd) as Promise<T>;
  }
  return Promise.reject(new Error("Tauri unavailable"));
}

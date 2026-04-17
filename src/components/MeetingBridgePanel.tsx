import { useEffect, useState } from "react";
import type { AudioDevice } from "../types";

interface Props {
  inputDevices: AudioDevice[];
  playbackDevices: AudioDevice[];
  physicalInputId: string | null;
  bridgeOutputId: string;
  onBridgeOutputIdChange: (id: string) => void;
  noiseCancelEnabled: boolean;
  noiseCancelLevel: string;
  meetingBridgeActive: boolean;
  recorderBusy: boolean;
  onStart: () => void;
  onStop: () => void;
}

export default function MeetingBridgePanel({
  inputDevices,
  playbackDevices,
  physicalInputId,
  bridgeOutputId,
  onBridgeOutputIdChange,
  noiseCancelEnabled,
  noiseCancelLevel,
  meetingBridgeActive,
  recorderBusy,
  onStart,
  onStop,
}: Props) {
  const [hintDismissed, setHintDismissed] = useState(false);

  useEffect(() => {
    if (bridgeOutputId || playbackDevices.length === 0) return;
    const bh = playbackDevices.find((d) => /blackhole/i.test(d.name));
    onBridgeOutputIdChange(bh?.id ?? playbackDevices[0]?.id ?? "");
  }, [playbackDevices, bridgeOutputId, onBridgeOutputIdChange]);

  const physicalLabel =
    inputDevices.find((d) => d.id === physicalInputId)?.name ??
    inputDevices.find((d) => d.is_default)?.name ??
    "Default microphone";

  return (
    <div className="card space-y-3 border border-primary-900/40 bg-surface-900/40">
      <div>
        <h3 className="text-sm font-semibold text-white">Meeting bridge</h3>
        <p className="mt-1 text-xs text-gray-400">
          Send your <span className="text-gray-300">real microphone</span> (left) to a{" "}
          <span className="text-gray-300">playback device</span> such as{" "}
          <a
            href="https://existential.audio/blackhole/"
            target="_blank"
            rel="noreferrer"
            className="text-primary-400 hover:text-primary-300"
          >
            BlackHole
          </a>
          . In Google Meet, choose that same device as the <span className="text-gray-300">microphone</span>. This app
          records your voice to a local WAV while the bridge runs. One-time install of BlackHole is required — the app
          cannot create a macOS driver by itself.
        </p>
      </div>

      {!hintDismissed && (
        <div className="flex justify-between gap-2 rounded-lg bg-surface-800 px-2 py-1.5 text-xs text-gray-400">
          <span>
            Mic in use: <span className="text-gray-200">{physicalLabel}</span> (same as Recorder input). Denoise:{" "}
            {noiseCancelEnabled ? noiseCancelLevel : "off"}.
          </span>
          <button type="button" className="shrink-0 text-gray-500 hover:text-gray-300" onClick={() => setHintDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">To Meet / Zoom (playback device)</span>
        <select
          value={bridgeOutputId}
          onChange={(e) => onBridgeOutputIdChange(e.target.value)}
          disabled={meetingBridgeActive}
          className="rounded-lg border border-surface-600 bg-surface-900 px-2 py-2 text-sm text-white disabled:opacity-50"
        >
          {playbackDevices.length === 0 ? (
            <option value="">No playback devices found</option>
          ) : (
            playbackDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.is_default ? " (default output)" : ""}
              </option>
            ))
          )}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {!meetingBridgeActive ? (
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={recorderBusy || !bridgeOutputId || playbackDevices.length === 0}
            onClick={onStart}
          >
            Start meeting bridge
          </button>
        ) : (
          <button type="button" className="btn-primary bg-red-700 text-sm hover:bg-red-600" onClick={onStop}>
            Stop meeting bridge
          </button>
        )}
      </div>
    </div>
  );
}

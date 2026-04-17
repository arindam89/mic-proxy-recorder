import { useEffect, useMemo } from "react";
import type { AudioDevice } from "../types";

interface Props {
  inputDevices: AudioDevice[];
  playbackDevices: AudioDevice[];
  bridgeOutputId: string;
  onBridgeOutputIdChange: (id: string) => void;
  bridgeSpeakersOutputId: string | null;
  onBridgeSpeakersOutputIdChange: (id: string | null) => void;
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
  bridgeOutputId,
  onBridgeOutputIdChange,
  bridgeSpeakersOutputId,
  onBridgeSpeakersOutputIdChange,
  noiseCancelEnabled,
  noiseCancelLevel,
  meetingBridgeActive,
  recorderBusy,
  onStart,
  onStop,
}: Props) {
  const duplexCableDevices = useMemo(
    () => playbackDevices.filter((p) => inputDevices.some((i) => i.id === p.id)),
    [playbackDevices, inputDevices]
  );

  useEffect(() => {
    if (meetingBridgeActive) return;
    if (duplexCableDevices.length === 0) {
      if (bridgeOutputId) onBridgeOutputIdChange("");
      return;
    }
    const validIds = new Set(duplexCableDevices.map((d) => d.id));
    if (!bridgeOutputId || !validIds.has(bridgeOutputId)) {
      const bh = duplexCableDevices.find((d) => /blackhole/i.test(d.name));
      onBridgeOutputIdChange(bh?.id ?? duplexCableDevices[0].id);
    }
  }, [meetingBridgeActive, duplexCableDevices, bridgeOutputId, onBridgeOutputIdChange]);

  /** Do not play the call back into the virtual cable (would re-inject into the bridge). */
  const speakerOptions = useMemo(
    () => playbackDevices.filter((d) => d.id !== bridgeOutputId),
    [playbackDevices, bridgeOutputId]
  );

  useEffect(() => {
    if (meetingBridgeActive) return;
    if (bridgeSpeakersOutputId != null && bridgeSpeakersOutputId === bridgeOutputId) {
      onBridgeSpeakersOutputIdChange(null);
    }
  }, [meetingBridgeActive, bridgeOutputId, bridgeSpeakersOutputId, onBridgeSpeakersOutputIdChange]);

  return (
    <div className="card space-y-3 border border-primary-900/40 bg-surface-900/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Meeting bridge</h3>
        <span className="text-[11px] text-gray-500">
          Denoise: {noiseCancelEnabled ? noiseCancelLevel : "off"}
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Virtual cable</span>
        <select
          value={bridgeOutputId}
          onChange={(e) => onBridgeOutputIdChange(e.target.value)}
          disabled={meetingBridgeActive || duplexCableDevices.length === 0}
          className="rounded-lg border border-surface-600 bg-surface-900 px-2 py-2 text-sm text-white disabled:opacity-50"
        >
          {duplexCableDevices.length === 0 ? (
            <option value="">
              {playbackDevices.length === 0 ? "No devices" : "No duplex cable (e.g. BlackHole)"}
            </option>
          ) : (
            duplexCableDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.is_default ? " (default)" : ""}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Speakers</span>
        <select
          value={bridgeSpeakersOutputId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onBridgeSpeakersOutputIdChange(v === "" ? null : v);
          }}
          disabled={meetingBridgeActive}
          className="rounded-lg border border-surface-600 bg-surface-900 px-2 py-2 text-sm text-white disabled:opacity-50"
        >
          <option value="">Default</option>
          {speakerOptions.map((d) => (
            <option key={`spk-${d.id}`} value={d.id}>
              {d.name}
              {d.is_default ? " (default)" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        {!meetingBridgeActive ? (
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={recorderBusy || !bridgeOutputId || duplexCableDevices.length === 0}
            onClick={onStart}
          >
            Start
          </button>
        ) : (
          <button type="button" className="btn-primary bg-red-700 text-sm hover:bg-red-600" onClick={onStop}>
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

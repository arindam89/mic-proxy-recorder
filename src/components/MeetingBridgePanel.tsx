import { useEffect, useMemo, useState } from "react";
import type { AudioDevice } from "../types";

interface Props {
  inputDevices: AudioDevice[];
  playbackDevices: AudioDevice[];
  physicalInputId: string | null;
  /** Virtual cable: playback side (Meet reads as mic) + same name as input (Meet plays here). */
  bridgeOutputId: string;
  onBridgeOutputIdChange: (id: string) => void;
  /** Real speakers/headphones; `null` = system default output. */
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
  physicalInputId,
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
  const [hintDismissed, setHintDismissed] = useState(false);

  /** Virtual cable must be capturable as Meet "speakers" → needs same name in input + output lists. */
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

  const physicalLabel =
    inputDevices.find((d) => d.id === physicalInputId)?.name ??
    inputDevices.find((d) => d.is_default)?.name ??
    "Default microphone";

  const speakersLabel =
    bridgeSpeakersOutputId == null
      ? "Default output (system speakers / headphones)"
      : (playbackDevices.find((d) => d.id === bridgeSpeakersOutputId)?.name ?? bridgeSpeakersOutputId);

  return (
    <div className="card space-y-3 border border-primary-900/40 bg-surface-900/40">
      <div>
        <h3 className="text-sm font-semibold text-white">Meeting bridge (duplex relay)</h3>
        <p className="mt-1 text-xs text-gray-400">
          Full call path runs through this app so you can record it: your{" "}
          <span className="text-gray-300">real microphone</span> is sent to a{" "}
          <span className="text-gray-300">virtual cable</span> (e.g.{" "}
          <a
            href="https://existential.audio/blackhole/"
            target="_blank"
            rel="noreferrer"
            className="text-primary-400 hover:text-primary-300"
          >
            BlackHole
          </a>
          ) for Meet/Zoom to use as the <span className="text-gray-300">microphone</span>. Meet&apos;s{" "}
          <span className="text-gray-300">speaker</span> must be the <strong>same</strong> cable so remote audio does
          not leak into your room mic (feedback). The app plays that virtual capture to your{" "}
          <span className="text-gray-300">real speakers</span> and writes a <strong>stereo</strong> WAV (left = you,
          right = Meet). One-time BlackHole install required — the app does not ship a macOS driver. Architecture:{" "}
          <code className="rounded bg-surface-800 px-1 text-[11px] text-primary-200">specs/RELAY_HUB_ARCHITECTURE.md</code>.
        </p>
      </div>

      {!hintDismissed && (
        <div className="flex justify-between gap-2 rounded-lg bg-amber-950/40 px-2 py-1.5 text-xs text-amber-100/90">
          <span>
            In Meet: set <strong>both</strong> mic and speaker to the virtual cable. Mic in app:{" "}
            <span className="text-white">{physicalLabel}</span>. Hear call on:{" "}
            <span className="text-white">{speakersLabel}</span>. Denoise:{" "}
            {noiseCancelEnabled ? noiseCancelLevel : "off"}.
          </span>
          <button type="button" className="shrink-0 text-amber-200/70 hover:text-amber-100" onClick={() => setHintDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Virtual cable (Meet mic + Meet speakers)</span>
        <p className="text-[11px] leading-snug text-gray-500">
          Only devices that macOS lists as <strong>both</strong> a mic and a speaker appear here (e.g. BlackHole). Your
          laptop speakers are output-only and cannot be the cable.
        </p>
        <select
          value={bridgeOutputId}
          onChange={(e) => onBridgeOutputIdChange(e.target.value)}
          disabled={meetingBridgeActive || duplexCableDevices.length === 0}
          className="rounded-lg border border-surface-600 bg-surface-900 px-2 py-2 text-sm text-white disabled:opacity-50"
        >
          {duplexCableDevices.length === 0 ? (
            <option value="">
              {playbackDevices.length === 0
                ? "No playback devices found"
                : "No duplex cable — install BlackHole (input + output with same name)"}
            </option>
          ) : (
            duplexCableDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.is_default ? " (default output)" : ""}
              </option>
            ))
          )}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Hear the call on (real speakers / headphones)</span>
        <select
          value={bridgeSpeakersOutputId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onBridgeSpeakersOutputIdChange(v === "" ? null : v);
          }}
          disabled={meetingBridgeActive}
          className="rounded-lg border border-surface-600 bg-surface-900 px-2 py-2 text-sm text-white disabled:opacity-50"
        >
          <option value="">Default (system output)</option>
          {playbackDevices.map((d) => (
            <option key={`spk-${d.id}`} value={d.id}>
              {d.name}
              {d.is_default ? " (default output)" : ""}
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

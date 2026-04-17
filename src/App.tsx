import { useCallback, useEffect, useState } from "react";
import { invoke as _tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { listen as _tauriListen } from "@tauri-apps/api/event";
import {
  recordingDisplayLabel,
  recordingExportBasename,
  type AppSettings,
  type AudioDevice,
  type BlackHoleInstallerState,
  type Recording,
  type RecordingStatus,
  type Transcript,
  type TranscriptionStatus,
} from "./types";
import DeviceSelector from "./components/DeviceSelector";
import RecorderControls from "./components/RecorderControls";
import NoiseCancelPanel from "./components/NoiseCancelPanel";
import TranscriptPane from "./components/TranscriptPane";
import MeetingBridgePanel from "./components/MeetingBridgePanel";
import RecordingLevelMeter from "./components/RecordingLevelMeter";
import { save } from "@tauri-apps/plugin-dialog";
import RecordingAudio from "./components/RecordingAudio";
import RecordingsList from "./components/RecordingsList";
import SettingsPanel from "./components/SettingsPanel";
import StatusBar from "./components/StatusBar";

type View = "recorder" | "recordings" | "settings";

export default function App() {
  const [view, setView] = useState<View>("recorder");
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    noise_cancel_enabled: true,
    noise_cancel_level: "medium",
    input_device_id: null,
    output_format: "wav",
    model_path: null,
    transcription_backend: "whisper",
    proxy_mic_display_name: "",
    proxy_speaker_display_name: "",
  });
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>("idle");
  const [transcribingPath, setTranscribingPath] = useState<string | null>(null);
  const [playbackDevices, setPlaybackDevices] = useState<AudioDevice[]>([]);
  const [bridgeOutputId, setBridgeOutputId] = useState("");
  /** `null` = OS default playback (headphones / speakers you hear the call on). */
  const [bridgeSpeakersOutputId, setBridgeSpeakersOutputId] = useState<string | null>(null);
  const [meetingBridgeActive, setMeetingBridgeActive] = useState(false);
  const [bridgeSessionRecording, setBridgeSessionRecording] = useState<Recording | null>(null);
  const [bridgeSeconds, setBridgeSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renamingCurrent, setRenamingCurrent] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [blackHoleInstaller, setBlackHoleInstaller] = useState<BlackHoleInstallerState | null>(null);

  const refreshAudioDevices = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [inputs, outputs] = await Promise.all([
        invoke<AudioDevice[]>("list_audio_devices"),
        invoke<AudioDevice[]>("list_playback_devices"),
      ]);
      setDevices(inputs);
      setPlaybackDevices(outputs);
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  const handleOpenBlackHoleInstaller = useCallback(async () => {
    if (!isTauri()) return;
    setErrorMessage(null);
    try {
      await invoke("open_blackhole_installer");
      const st = await invoke<BlackHoleInstallerState>("blackhole_installer_state");
      setBlackHoleInstaller(st);
      await refreshAudioDevices();
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, [refreshAudioDevices]);

  useEffect(() => {
    invoke<AudioDevice[]>("list_audio_devices")
      .then(setDevices)
      .catch((e) => setErrorMessage(String(e)));

    invoke<AudioDevice[]>("list_playback_devices")
      .then(setPlaybackDevices)
      .catch(console.error);

    invoke<Recording[]>("list_recordings")
      .then(setRecordings)
      .catch(console.error);

    invoke<AppSettings>("get_settings")
      .then((s) =>
        setSettings((prev) => ({
          ...prev,
          ...s,
          transcription_backend: s.transcription_backend ?? "whisper",
          proxy_mic_display_name: s.proxy_mic_display_name ?? "",
          proxy_speaker_display_name: s.proxy_speaker_display_name ?? "",
        }))
      )
      .catch(console.error);

    invoke<BlackHoleInstallerState>("blackhole_installer_state")
      .then(setBlackHoleInstaller)
      .catch(() => setBlackHoleInstaller(null));
  }, []);

  useEffect(() => {
    const unlisten1 = listen<{
      transcript: Transcript;
      recordingPath: string;
    }>("transcription-done", ({ payload }) => {
      setTranscribingPath(null);
      setTranscriptionStatus("done");
      setRecordings((prev) =>
        prev.map((r) =>
          r.path === payload.recordingPath ? { ...r, transcript: payload.transcript } : r
        )
      );
      setCurrentRecording((cur) =>
        cur && cur.path === payload.recordingPath ? { ...cur, transcript: payload.transcript } : cur
      );
      setBridgeSessionRecording((cur) =>
        cur && cur.path === payload.recordingPath ? { ...cur, transcript: payload.transcript } : cur
      );
    });

    const unlisten2 = listen<{ message: string }>("transcription-error", ({ payload }) => {
      setErrorMessage(payload.message);
      setTranscriptionStatus("error");
    });

    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (status !== "recording") return;
    const id = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => {
    if (!meetingBridgeActive) return;
    const id = setInterval(() => setBridgeSeconds((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [meetingBridgeActive]);

  const handleStartRecording = useCallback(async () => {
    if (meetingBridgeActive) {
      setErrorMessage("Stop the meeting bridge before using the normal recorder.");
      return;
    }
    setErrorMessage(null);
    try {
      const rec = await invoke<Recording>("start_recording", {
        deviceId: settings.input_device_id,
        noiseCancelEnabled: settings.noise_cancel_enabled,
        noiseCancelLevel: settings.noise_cancel_level,
        outputFormat: settings.output_format,
      });
      setCurrentRecording(rec);
      setRecordingTime(0);
      setStatus("recording");
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, [settings, meetingBridgeActive]);

  const handleStartMeetingBridge = useCallback(async () => {
    if (status === "recording" || status === "paused") {
      setErrorMessage("Stop the normal recording before starting the meeting bridge.");
      return;
    }
    if (!bridgeOutputId) {
      setErrorMessage("Select a playback device (e.g. BlackHole) for the meeting bridge.");
      return;
    }
    setErrorMessage(null);
    try {
      const rec = await invoke<Recording>("start_meeting_bridge", {
        physicalInputId: settings.input_device_id,
        physicalSpeakersOutputId: bridgeSpeakersOutputId,
        bridgeOutputId,
        noiseCancelEnabled: settings.noise_cancel_enabled,
        noiseCancelLevel: settings.noise_cancel_level,
      });
      setBridgeSessionRecording(rec);
      setMeetingBridgeActive(true);
      setBridgeSeconds(0);
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, [
    status,
    bridgeOutputId,
    bridgeSpeakersOutputId,
    settings.input_device_id,
    settings.noise_cancel_enabled,
    settings.noise_cancel_level,
  ]);

  const handleStopMeetingBridge = useCallback(async () => {
    try {
      const rec = await invoke<Recording>("stop_meeting_bridge");
      setMeetingBridgeActive(false);
      setBridgeSessionRecording(rec);
      setRecordings((prev) => [rec, ...prev]);
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    try {
      const rec = await invoke<Recording>("stop_recording");
      setCurrentRecording(rec);
      setRenamingCurrent(false);
      setRenameDraft("");
      setStatus("idle");
      setRecordingTime(0);
      setRecordings((prev) => [rec, ...prev]);
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  const handlePauseRecording = useCallback(async () => {
    setStatus((prev) => (prev === "recording" ? "paused" : "recording"));
    try {
      await invoke("toggle_pause_recording");
    } catch (e) {
      setStatus((prev) => (prev === "paused" ? "recording" : "paused"));
      setErrorMessage(String(e));
    }
  }, []);

  const handleTranscribe = useCallback(
    async (recording: Recording) => {
      if (settings.transcription_backend === "whisper" && !settings.model_path) {
        setErrorMessage("No Whisper model path configured. Go to Settings to set it.");
        return;
      }
      setErrorMessage(null);
      setTranscribingPath(recording.path);
      setTranscriptionStatus("transcribing");
      try {
        await invoke("transcribe_recording", {
          recordingPath: recording.path,
        });
      } catch (e) {
        setTranscribingPath(null);
        setErrorMessage(String(e));
        setTranscriptionStatus("error");
      }
    },
    [settings.transcription_backend, settings.model_path]
  );

  const handleDeleteRecording = useCallback(async (id: string) => {
    try {
      await invoke("delete_recording", { recordingId: id });
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      setBridgeSessionRecording((b) => (b?.id === id ? null : b));
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  const handleRenameRecording = useCallback(async (id: string, displayName: string) => {
    try {
      const updated = await invoke<Recording>("rename_recording", {
        recordingId: id,
        displayName,
      });
      setRecordings((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setCurrentRecording((cur) => (cur && cur.id === id ? updated : cur));
      setBridgeSessionRecording((cur) => (cur && cur.id === id ? updated : cur));
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  const handleExportRecording = useCallback(async (recordingPath: string, destinationPath: string) => {
    try {
      await invoke("export_recording", { recordingPath, destinationPath });
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  const handleDownloadCurrentRecording = useCallback(async () => {
    if (!currentRecording) return;
    try {
      const dest = await save({
        defaultPath: `${recordingExportBasename(currentRecording)}.wav`,
        filters: [{ name: "WAV Audio", extensions: ["wav"] }],
      });
      if (dest) await handleExportRecording(currentRecording.path, dest);
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, [currentRecording, handleExportRecording]);

  const handleDownloadBridgeRecording = useCallback(async () => {
    if (!bridgeSessionRecording) return;
    try {
      const dest = await save({
        defaultPath: `${recordingExportBasename(bridgeSessionRecording)}.wav`,
        filters: [{ name: "WAV Audio", extensions: ["wav"] }],
      });
      if (dest) await handleExportRecording(bridgeSessionRecording.path, dest);
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, [bridgeSessionRecording, handleExportRecording]);

  const beginRenameCurrent = useCallback(() => {
    if (!currentRecording) return;
    setRenameDraft(recordingDisplayLabel(currentRecording));
    setRenamingCurrent(true);
  }, [currentRecording]);

  const saveRenameCurrent = useCallback(async () => {
    if (!currentRecording) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    try {
      await handleRenameRecording(currentRecording.id, trimmed);
      setRenamingCurrent(false);
    } finally {
      setRenameSaving(false);
    }
  }, [currentRecording, renameDraft, handleRenameRecording]);

  const handleSaveSettings = useCallback(async (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      await invoke("save_settings", { settings: newSettings });
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-900 text-white">
      <header className="flex items-center justify-between border-b border-surface-700 bg-surface-800 px-6 py-3">
        <div className="flex items-center gap-2">
          <MicIcon className="h-6 w-6 text-primary-500" />
          <span className="text-lg font-semibold tracking-tight">Mic Proxy Recorder</span>
        </div>
        <nav className="flex gap-1">
          {(["recorder", "recordings", "settings"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                view === v
                  ? "bg-primary-600 text-white"
                  : "text-gray-400 hover:bg-surface-700 hover:text-white"
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {view === "recorder" && (
          <div className="flex flex-1 gap-6 overflow-y-auto p-6">
            <div className="flex w-80 flex-shrink-0 flex-col gap-4">
              <DeviceSelector
                devices={devices}
                selectedId={settings.input_device_id}
                onSelect={(id) => setSettings((s) => ({ ...s, input_device_id: id }))}
                disabled={meetingBridgeActive}
              />
              <NoiseCancelPanel
                enabled={settings.noise_cancel_enabled}
                level={settings.noise_cancel_level}
                onToggle={(enabled) =>
                  setSettings((s) => ({ ...s, noise_cancel_enabled: enabled }))
                }
                onLevelChange={(level) =>
                  setSettings((s) => ({ ...s, noise_cancel_level: level }))
                }
                disabled={meetingBridgeActive}
              />
              <MeetingBridgePanel
                inputDevices={devices}
                playbackDevices={playbackDevices}
                physicalInputId={settings.input_device_id}
                bridgeOutputId={bridgeOutputId}
                onBridgeOutputIdChange={setBridgeOutputId}
                bridgeSpeakersOutputId={bridgeSpeakersOutputId}
                onBridgeSpeakersOutputIdChange={setBridgeSpeakersOutputId}
                blackHoleInstaller={blackHoleInstaller}
                onRefreshAudioDevices={() => void refreshAudioDevices()}
                onOpenBlackHoleInstaller={() => void handleOpenBlackHoleInstaller()}
                noiseCancelEnabled={settings.noise_cancel_enabled}
                noiseCancelLevel={settings.noise_cancel_level}
                meetingBridgeActive={meetingBridgeActive}
                recorderBusy={status === "recording" || status === "paused"}
                onStart={() => void handleStartMeetingBridge()}
                onStop={() => void handleStopMeetingBridge()}
              />
              <RecorderControls
                status={status}
                recordingTime={recordingTime}
                onStart={handleStartRecording}
                onStop={handleStopRecording}
                onPause={handlePauseRecording}
                disabled={meetingBridgeActive}
              />
            </div>

            <div className="flex flex-1 flex-col gap-4">
              {(meetingBridgeActive || bridgeSessionRecording) && (
                <div className="card space-y-3 border border-primary-800/40">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-medium text-primary-200">Meeting bridge</p>
                      <p className="text-xs text-gray-500">
                        {bridgeSessionRecording?.filename}
                        {meetingBridgeActive ? (
                          <span className="ml-2 text-red-400">Live</span>
                        ) : null}
                      </p>
                      <p className="font-mono text-sm text-gray-300">
                        {formatClock(meetingBridgeActive ? bridgeSeconds : bridgeSessionRecording?.duration_secs ?? 0)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {meetingBridgeActive
                          ? "Audio is sent to the playback device you picked (e.g. BlackHole). In Meet, choose that device as the microphone."
                          : "Bridge stopped. Transcribe or download below."}
                      </p>
                    </div>
                    {!meetingBridgeActive && bridgeSessionRecording ? (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          onClick={() => void handleDownloadBridgeRecording()}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className="btn-primary text-sm"
                          onClick={() => handleTranscribe(bridgeSessionRecording)}
                          disabled={transcriptionStatus === "transcribing"}
                        >
                          {transcriptionStatus === "transcribing" ? "Transcribing\u2026" : "Transcribe"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {meetingBridgeActive ? <RecordingLevelMeter status="bridge" /> : null}
                  {!meetingBridgeActive && bridgeSessionRecording ? (
                    <>
                      <RecordingAudio filePath={bridgeSessionRecording.path} />
                      <TranscriptPane
                        transcript={bridgeSessionRecording.transcript}
                        status={transcriptionStatus}
                        recordingPath={bridgeSessionRecording.path}
                        activeTranscribePath={transcribingPath}
                        emptyHint="Press Transcribe to attach text to this meeting recording."
                      />
                    </>
                  ) : null}
                </div>
              )}
              {currentRecording && (
                <div className="card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      {status === "idle" && renamingCurrent ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveRenameCurrent();
                              if (e.key === "Escape") {
                                setRenamingCurrent(false);
                              }
                            }}
                            className="min-w-[10rem] flex-1 rounded-lg border border-surface-600 bg-surface-900 px-2 py-1 text-sm text-white"
                            autoFocus
                            disabled={renameSaving}
                          />
                          <button
                            type="button"
                            className="btn-primary text-xs"
                            disabled={renameSaving || !renameDraft.trim()}
                            onClick={() => void saveRenameCurrent()}
                          >
                            {renameSaving ? "Saving\u2026" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            disabled={renameSaving}
                            onClick={() => setRenamingCurrent(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{recordingDisplayLabel(currentRecording)}</p>
                          {status === "idle" && (
                            <button
                              type="button"
                              onClick={beginRenameCurrent}
                              className="text-xs text-primary-400 hover:text-primary-300"
                            >
                              Rename
                            </button>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">{currentRecording.filename}</p>
                      <p className="text-xs text-gray-400">
                        {status === "idle" ? "Ready to transcribe or play back" : "Recording\u2026"}
                      </p>
                    </div>
                    {status === "idle" && !renamingCurrent && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          onClick={() => void handleDownloadCurrentRecording()}
                        >
                          Download
                        </button>
                        <button
                          type="button"
                          className="btn-primary text-sm"
                          onClick={() => handleTranscribe(currentRecording)}
                          disabled={transcriptionStatus === "transcribing"}
                        >
                          {transcriptionStatus === "transcribing" ? "Transcribing\u2026" : "Transcribe"}
                        </button>
                      </div>
                    )}
                  </div>
                  <RecordingLevelMeter status={status} />
                  {status === "idle" && <RecordingAudio filePath={currentRecording.path} />}
                  {status === "idle" && (
                    <TranscriptPane
                      transcript={currentRecording.transcript}
                      status={transcriptionStatus}
                      recordingPath={currentRecording.path}
                      activeTranscribePath={transcribingPath}
                      emptyHint="When this take is saved, press Transcribe above to attach text here."
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {view === "recordings" && (
          <RecordingsList
            recordings={recordings}
            onTranscribe={handleTranscribe}
            onDelete={handleDeleteRecording}
            onRename={handleRenameRecording}
            onExportRecording={handleExportRecording}
            transcriptionStatus={transcriptionStatus}
            activeTranscribePath={transcribingPath}
          />
        )}

        {view === "settings" && (
          <SettingsPanel settings={settings} onSave={handleSaveSettings} />
        )}
      </main>

      <StatusBar errorMessage={errorMessage} onDismissError={() => setErrorMessage(null)} />
    </div>
  );
}

// Safe invoke wrapper: when running the Vite dev server in a normal browser,
// Tauri is not present. In Tauri v2, `window.__TAURI__` is only set when
// `withGlobalTauri` is true; IPC uses `isTauri()` / internals instead — use
// `isTauri()` so the real desktop app is detected correctly.
function invoke<T = unknown>(cmd: string, params?: Record<string, unknown>): Promise<T> {
  if (typeof window !== "undefined" && isTauri()) {
    return _tauriInvoke(cmd, params) as Promise<T>;
  }
  return Promise.reject(
    new Error("Tauri API unavailable. Run the app with `npm run tauri -- dev` or build the Tauri app.")
  );
}

function listen<T = unknown>(event: string, handler: (e: any) => void): Promise<() => void> {
  if (typeof window !== "undefined" && isTauri()) {
    return _tauriListen<T>(event, handler) as Promise<() => void>;
  }
  // No-op unlisten when not running inside Tauri
  return Promise.resolve(() => {});
}
function formatClock(secs: number) {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

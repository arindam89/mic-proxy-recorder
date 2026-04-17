import { useCallback, useEffect, useRef, useState } from "react";
import { invoke as _tauriInvoke, isTauri } from "@tauri-apps/api/core";
import { listen as _tauriListen } from "@tauri-apps/api/event";
import type {
  AppSettings,
  AudioDevice,
  Recording,
  RecordingStatus,
  Transcript,
  TranscriptionStatus,
} from "./types";
import DeviceSelector from "./components/DeviceSelector";
import RecorderControls from "./components/RecorderControls";
import NoiseCancelPanel from "./components/NoiseCancelPanel";
import TranscriptPane from "./components/TranscriptPane";
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
  });
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    invoke<AudioDevice[]>("list_audio_devices")
      .then(setDevices)
      .catch((e) => setErrorMessage(String(e)));

    invoke<Recording[]>("list_recordings")
      .then(setRecordings)
      .catch(console.error);

    invoke<AppSettings>("get_settings")
      .then((s) => setSettings((prev) => ({ ...prev, ...s })))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const unlisten1 = listen<{ recording: Recording }>("recording-started", ({ payload }) => {
      setCurrentRecording(payload.recording);
      setStatus("recording");
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    });

    const unlisten2 = listen<{ recording: Recording }>("recording-stopped", ({ payload }) => {
      setCurrentRecording(payload.recording);
      setStatus("idle");
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
      setRecordings((prev) => [payload.recording, ...prev]);
    });

    const unlisten3 = listen<{ transcript: Transcript }>("transcription-done", ({ payload }) => {
      setTranscript(payload.transcript);
      setTranscriptionStatus("done");
    });

    const unlisten4 = listen<{ message: string }>("transcription-error", ({ payload }) => {
      setErrorMessage(payload.message);
      setTranscriptionStatus("error");
    });

    return () => {
      unlisten1.then((f) => f());
      unlisten2.then((f) => f());
      unlisten3.then((f) => f());
      unlisten4.then((f) => f());
    };
  }, []);

  const handleStartRecording = useCallback(async () => {
    setErrorMessage(null);
    try {
      await invoke("start_recording", {
        deviceId: settings.input_device_id,
        noiseCancelEnabled: settings.noise_cancel_enabled,
        noiseCancelLevel: settings.noise_cancel_level,
        outputFormat: settings.output_format,
      });
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, [settings]);

  const handleStopRecording = useCallback(async () => {
    try {
      await invoke("stop_recording");
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  const handlePauseRecording = useCallback(async () => {
    setStatus((prev) => (prev === "recording" ? "paused" : "recording"));
    try {
      await invoke("toggle_pause_recording");
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  const handleTranscribe = useCallback(
    async (recording: Recording) => {
      if (!settings.model_path) {
        setErrorMessage("No Whisper model path configured. Go to Settings to set it.");
        return;
      }
      setTranscriptionStatus("transcribing");
      setTranscript(null);
      try {
        await invoke("transcribe_recording", {
          recordingPath: recording.path,
          modelPath: settings.model_path,
        });
      } catch (e) {
        setErrorMessage(String(e));
        setTranscriptionStatus("error");
      }
    },
    [settings.model_path]
  );

  const handleDeleteRecording = useCallback(async (id: string) => {
    try {
      await invoke("delete_recording", { recordingId: id });
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

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
              />
              <RecorderControls
                status={status}
                recordingTime={recordingTime}
                onStart={handleStartRecording}
                onStop={handleStopRecording}
                onPause={handlePauseRecording}
              />
            </div>

            <div className="flex flex-1 flex-col gap-4">
              {currentRecording && (
                <div className="card flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{currentRecording.filename}</p>
                    <p className="text-xs text-gray-400">
                      {status === "idle" ? "Ready to transcribe" : "Recording\u2026"}
                    </p>
                  </div>
                  {status === "idle" && (
                    <button
                      className="btn-primary"
                      onClick={() => handleTranscribe(currentRecording)}
                      disabled={transcriptionStatus === "transcribing"}
                    >
                      {transcriptionStatus === "transcribing" ? "Transcribing\u2026" : "Transcribe"}
                    </button>
                  )}
                </div>
              )}
              <TranscriptPane transcript={transcript} status={transcriptionStatus} />
            </div>
          </div>
        )}

        {view === "recordings" && (
          <RecordingsList
            recordings={recordings}
            onTranscribe={handleTranscribe}
            onDelete={handleDeleteRecording}
            activeTranscript={transcript}
            transcriptionStatus={transcriptionStatus}
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

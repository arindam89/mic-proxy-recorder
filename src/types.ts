export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export type RecordingStatus = "idle" | "recording" | "paused" | "processing";

export type TranscriptionStatus = "idle" | "transcribing" | "done" | "error";

export interface Recording {
  id: string;
  path: string;
  filename: string;
  /** User-visible name (default includes path hint + timestamp). */
  display_name?: string;
  duration_secs: number;
  created_at: string;
}

export function recordingDisplayLabel(r: Recording): string {
  const d = r.display_name?.trim();
  if (d) return d;
  return r.filename.replace(/\.wav$/i, "") || r.filename;
}

/** Safe basename for Save dialog default (no path separators). */
export function recordingExportBasename(r: Recording): string {
  const s = recordingDisplayLabel(r).replace(/[/\\?%*:|"<>]/g, "_").trim();
  return s.slice(0, 120) || "recording";
}

export interface Transcript {
  recording_id: string;
  text: string;
  segments: TranscriptSegment[];
  language: string;
  created_at: string;
}

export interface TranscriptSegment {
  id: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

export type TranscriptionBackend = "whisper" | "parakeet";

export interface AppSettings {
  noise_cancel_enabled: boolean;
  noise_cancel_level: NoiseCancelLevel;
  input_device_id: string | null;
  output_format: "wav" | "flac";
  model_path: string | null;
  transcription_backend: TranscriptionBackend;
}

export type NoiseCancelLevel = "off" | "low" | "medium" | "high";

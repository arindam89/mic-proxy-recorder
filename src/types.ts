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
  duration_secs: number;
  created_at: string;
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

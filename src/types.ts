export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export type RecordingStatus = "idle" | "recording" | "paused" | "processing" | "bridge";

export type TranscriptionStatus = "idle" | "transcribing" | "done" | "error";

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

export interface Recording {
  id: string;
  path: string;
  filename: string;
  /** User-visible name (default includes path hint + timestamp). */
  display_name?: string;
  /** Persisted with the recording when transcription has completed at least once. */
  transcript?: Transcript | null;
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

/** Title + transcript body for search (case-insensitive match in the UI). */
export function recordingSearchHaystack(r: Recording): string {
  const label = recordingDisplayLabel(r);
  const body = (r.transcript?.text ?? "").trim();
  return `${label}\n${body}`;
}

/** Markdown document for saving a transcript to disk. */
export function recordingTranscriptMarkdown(r: Recording): string {
  const t = r.transcript;
  if (!t) return "";
  const title = recordingDisplayLabel(r);
  let out = `# ${title}\n\n`;
  out += `- **File:** \`${r.filename}\`\n`;
  out += `- **Recorded:** ${r.created_at}\n`;
  out += `- **Transcribed:** ${t.created_at}\n`;
  out += `- **Language:** ${t.language}\n\n`;
  out += `## Full text\n\n${t.text.trim()}\n\n`;
  if (t.segments.length > 0) {
    out += `## Segments\n\n`;
    for (const seg of t.segments) {
      const t0 = (seg.start_ms / 1000).toFixed(2);
      out += `### ${t0}s\n\n${seg.text.trim()}\n\n`;
    }
  }
  return out;
}

export type TranscriptionBackend = "whisper" | "parakeet";

export interface AppSettings {
  noise_cancel_enabled: boolean;
  noise_cancel_level: NoiseCancelLevel;
  input_device_id: string | null;
  output_format: "wav" | "flac";
  model_path: string | null;
  transcription_backend: TranscriptionBackend;
  /** Label you use in Zoom/Meet when routing via an aggregate or virtual device (saved for your reference). */
  proxy_mic_display_name: string;
  /** Label for speaker / loopback side of your routing setup (informational). */
  proxy_speaker_display_name: string;
}

export type NoiseCancelLevel = "off" | "low" | "medium" | "high";

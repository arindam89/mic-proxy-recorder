import { useCallback, type ReactNode } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Transcript, TranscriptSegment, TranscriptionStatus } from "../types";

export interface TranscriptPaneProps {
  transcript: Transcript | null | undefined;
  status: TranscriptionStatus;
  /** Path of the WAV this block belongs to (used to match transcribe / error state). */
  recordingPath: string;
  /** Which recording is currently being transcribed, if any. */
  activeTranscribePath: string | null;
  /** Shown when there is no transcript yet and this row is not active. */
  emptyHint?: string;
  /** When set, matching substrings in transcript text are highlighted (e.g. recordings search). */
  highlightQuery?: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightMatches({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-500/35 px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function toSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => {
      const fmt = (ms: number) => {
        const totalSecs = Math.floor(ms / 1000);
        const ms2 = ms % 1000;
        const m = Math.floor(totalSecs / 60);
        const h = Math.floor(m / 60);
        return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(
          totalSecs % 60
        ).padStart(2, "0")},${String(ms2).padStart(3, "0")}`;
      };
      return `${i + 1}\n${fmt(seg.start_ms)} --> ${fmt(seg.end_ms)}\n${seg.text.trim()}\n`;
    })
    .join("\n");
}

export default function TranscriptPane({
  transcript,
  status,
  recordingPath,
  activeTranscribePath,
  emptyHint,
  highlightQuery,
}: TranscriptPaneProps) {
  const isThisActive = activeTranscribePath === recordingPath;
  const transcribingHere = status === "transcribing" && isThisActive;
  const errorHere = status === "error" && isThisActive;

  const handleCopy = useCallback(async () => {
    if (!transcript?.text) return;
    try {
      await navigator.clipboard.writeText(transcript.text);
    } catch (e) {
      console.error(e);
    }
  }, [transcript]);

  const handleExportTxt = useCallback(async () => {
    if (!transcript) return;
    try {
      const path = await save({ filters: [{ name: "Text", extensions: ["txt"] }] });
      if (path) await writeTextFile(path, transcript.text);
    } catch (e) {
      console.error(e);
    }
  }, [transcript]);

  const handleExportSrt = useCallback(async () => {
    if (!transcript) return;
    try {
      const path = await save({ filters: [{ name: "SRT Subtitle", extensions: ["srt"] }] });
      if (path) await writeTextFile(path, toSrt(transcript.segments));
    } catch (e) {
      console.error(e);
    }
  }, [transcript]);

  return (
    <div className="space-y-2 rounded-lg border border-surface-700 bg-surface-950/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Transcript</span>
        {transcript ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleCopy} className="btn-secondary text-xs">
              Copy text
            </button>
            <button type="button" onClick={handleExportTxt} className="btn-secondary text-xs">
              Download .txt
            </button>
            <button type="button" onClick={handleExportSrt} className="btn-secondary text-xs">
              Download .srt
            </button>
          </div>
        ) : null}
      </div>

      <div className="max-h-52 overflow-y-auto text-sm leading-relaxed text-gray-200">
        {transcribingHere && (
          <div className="flex items-center gap-2 text-gray-400">
            <span className="inline-block animate-spin">&#8635;</span>
            Transcribing&hellip; this may take a moment.
          </div>
        )}
        {errorHere && (
          <p className="text-red-400">Transcription failed. Check the status message and settings.</p>
        )}
        {!transcribingHere && !errorHere && !transcript && emptyHint && (
          <p className="text-gray-500">{emptyHint}</p>
        )}
        {!transcribingHere && !errorHere && transcript && (
          <div className="space-y-2">
            {transcript.segments.length > 0
              ? transcript.segments.map((seg) => (
                  <p key={seg.id} className="rounded bg-surface-800/80 p-2">
                    <span className="mr-2 font-mono text-xs text-gray-500">{formatMs(seg.start_ms)}</span>
                    <HighlightMatches text={seg.text} query={highlightQuery ?? ""} />
                  </p>
                ))
              : (
                  <HighlightMatches text={transcript.text} query={highlightQuery ?? ""} />
                )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatMs(ms: number) {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  return `${String(m).padStart(2, "0")}:${String(totalSecs % 60).padStart(2, "0")}`;
}

import { useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Transcript, TranscriptSegment, TranscriptionStatus } from "../types";

interface Props {
  transcript: Transcript | null;
  status: TranscriptionStatus;
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

export default function TranscriptPane({ transcript, status }: Props) {
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
    <div className="card flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Transcript</label>
        {transcript && (
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
        )}
      </div>

      <div className="flex-1 overflow-y-auto rounded-lg bg-surface-900 p-4 text-sm leading-relaxed text-gray-200">
        {status === "transcribing" && (
          <div className="flex items-center gap-2 text-gray-400">
            <span className="animate-spin inline-block">&#8635;</span>
            Transcribing&hellip; this may take a moment.
          </div>
        )}
        {status === "error" && (
          <p className="text-red-400">Transcription failed. Check settings and try again.</p>
        )}
        {status === "idle" && !transcript && (
          <p className="text-gray-500">
            Record audio and click Transcribe to generate a transcript.
          </p>
        )}
        {transcript && (
          <div className="space-y-3">
            {transcript.segments.length > 0
              ? transcript.segments.map((seg) => (
                  <p key={seg.id} className="rounded bg-surface-800 p-2">
                    <span className="mr-2 font-mono text-xs text-gray-500">
                      {formatMs(seg.start_ms)}
                    </span>
                    {seg.text}
                  </p>
                ))
              : transcript.text}
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

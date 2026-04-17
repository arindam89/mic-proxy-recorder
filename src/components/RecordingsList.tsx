import { useCallback, useMemo, useState, type ReactNode } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Recording, TranscriptionStatus } from "../types";
import {
  recordingDisplayLabel,
  recordingExportBasename,
  recordingSearchHaystack,
  recordingTranscriptMarkdown,
} from "../types";
import RecordingAudio from "./RecordingAudio";
import TranscriptPane from "./TranscriptPane";

interface Props {
  recordings: Recording[];
  onTranscribe: (r: Recording) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, displayName: string) => Promise<void>;
  onExportRecording: (recordingPath: string, destinationPath: string) => Promise<void>;
  transcriptionStatus: TranscriptionStatus;
  activeTranscribePath: string | null;
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

export default function RecordingsList({
  recordings,
  onTranscribe,
  onDelete,
  onRename,
  onExportRecording,
  transcriptionStatus,
  activeTranscribePath,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return recordings;
    return recordings.filter((r) => recordingSearchHaystack(r).toLowerCase().includes(q));
  }, [recordings, searchQuery]);

  const startEdit = useCallback((r: Recording) => {
    setEditingId(r.id);
    setEditValue(recordingDisplayLabel(r));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  const saveEdit = useCallback(
    async (id: string) => {
      const trimmed = editValue.trim();
      if (!trimmed) return;
      setSavingId(id);
      try {
        await onRename(id, trimmed);
        cancelEdit();
      } finally {
        setSavingId(null);
      }
    },
    [editValue, onRename, cancelEdit]
  );

  const handleDownload = useCallback(
    async (r: Recording) => {
      const label = recordingExportBasename(r);
      const path = await save({
        defaultPath: `${label}.wav`,
        filters: [{ name: "WAV Audio", extensions: ["wav"] }],
      });
      if (path) await onExportRecording(r.path, path);
    },
    [onExportRecording]
  );

  const handleDownloadTranscript = useCallback(async (r: Recording) => {
    const md = recordingTranscriptMarkdown(r);
    if (!md.trim()) return;
    const label = recordingExportBasename(r);
    const path = await save({
      defaultPath: `${label}-transcript.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (path) await writeTextFile(path, md);
  }, []);

  if (recordings.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        No recordings yet. Go to Recorder to start.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-lg font-semibold">Recordings</h2>
        <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-md">
          <span className="text-xs text-gray-500">Search titles and transcripts</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter…"
            className="rounded-lg border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-white placeholder:text-gray-600"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No recordings match your search.</p>
      ) : null}
      <ul className="space-y-4">
        {filtered.map((r) => (
          <li key={r.id} className="card space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                {editingId === r.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveEdit(r.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      className="min-w-[12rem] flex-1 rounded-lg border border-surface-600 bg-surface-900 px-2 py-1 text-sm text-white"
                      autoFocus
                      disabled={savingId === r.id}
                    />
                    <button
                      type="button"
                      onClick={() => void saveEdit(r.id)}
                      disabled={savingId === r.id || !editValue.trim()}
                      className="btn-primary text-xs"
                    >
                      {savingId === r.id ? "Saving\u2026" : "Save"}
                    </button>
                    <button type="button" onClick={cancelEdit} className="btn-secondary text-xs">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-white">
                      <HighlightMatches text={recordingDisplayLabel(r)} query={searchQuery} />
                    </p>
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="shrink-0 text-xs text-primary-400 hover:text-primary-300"
                    >
                      Rename
                    </button>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  File: <span className="font-mono text-gray-400">{r.filename}</span>
                </p>
                <p className="text-xs text-gray-400">
                  {formatDuration(r.duration_secs)} &middot;{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onTranscribe(r)}
                  disabled={transcriptionStatus === "transcribing"}
                  className="btn-primary text-xs"
                >
                  Transcribe
                </button>
                <button type="button" onClick={() => void handleDownload(r)} className="btn-secondary text-xs">
                  Download
                </button>
                {r.transcript ? (
                  <button
                    type="button"
                    onClick={() => void handleDownloadTranscript(r)}
                    className="btn-secondary text-xs"
                  >
                    Download transcript
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  className="btn-secondary text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
            <TranscriptPane
              transcript={r.transcript}
              status={transcriptionStatus}
              recordingPath={r.path}
              activeTranscribePath={activeTranscribePath}
              emptyHint="Transcribe this clip to attach text here."
              highlightQuery={searchQuery}
            />
            <RecordingAudio filePath={r.path} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

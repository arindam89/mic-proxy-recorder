import { useCallback, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { Recording, TranscriptionStatus } from "../types";
import { recordingDisplayLabel, recordingExportBasename } from "../types";
import RecordingAudio from "./RecordingAudio";

interface Props {
  recordings: Recording[];
  onTranscribe: (r: Recording) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, displayName: string) => Promise<void>;
  onExportRecording: (recordingPath: string, destinationPath: string) => Promise<void>;
  transcriptionStatus: TranscriptionStatus;
}

export default function RecordingsList({
  recordings,
  onTranscribe,
  onDelete,
  onRename,
  onExportRecording,
  transcriptionStatus,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

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

  if (recordings.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        No recordings yet. Go to Recorder to start.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="mb-4 text-lg font-semibold">Recordings</h2>
      <ul className="space-y-4">
        {recordings.map((r) => (
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
                    <p className="truncate font-medium text-white">{recordingDisplayLabel(r)}</p>
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
                <button
                  type="button"
                  onClick={() => onDelete(r.id)}
                  className="btn-secondary text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
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

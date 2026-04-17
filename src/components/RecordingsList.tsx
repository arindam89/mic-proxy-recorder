import type { Recording, Transcript, TranscriptionStatus } from "../types";

interface Props {
  recordings: Recording[];
  onTranscribe: (r: Recording) => void;
  onDelete: (id: string) => void;
  activeTranscript: Transcript | null;
  transcriptionStatus: TranscriptionStatus;
}

export default function RecordingsList({
  recordings,
  onTranscribe,
  onDelete,
  transcriptionStatus,
}: Props) {
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
      <ul className="space-y-3">
        {recordings.map((r) => (
          <li key={r.id} className="card flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.filename}</p>
              <p className="text-xs text-gray-400">
                {formatDuration(r.duration_secs)} &middot;{" "}
                {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onTranscribe(r)}
                disabled={transcriptionStatus === "transcribing"}
                className="btn-primary text-xs"
              >
                Transcribe
              </button>
              <button
                onClick={() => onDelete(r.id)}
                className="btn-secondary text-xs text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
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

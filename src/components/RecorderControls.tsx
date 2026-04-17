import type { RecordingStatus } from "../types";

interface Props {
  status: RecordingStatus;
  recordingTime: number;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function RecorderControls({
  status,
  recordingTime,
  onStart,
  onStop,
  onPause,
}: Props) {
  const isRecording = status === "recording" || status === "paused";

  return (
    <div className="card space-y-4">
      <label className="label">Recorder</label>

      <div className="flex items-center justify-center">
        <div className="flex items-center gap-3">
          {isRecording && (
            <span
              className={`h-3 w-3 rounded-full ${
                status === "recording" ? "animate-pulse bg-red-500" : "bg-yellow-400"
              }`}
            />
          )}
          <span className="font-mono text-4xl font-light tabular-nums text-white">
            {formatTime(recordingTime)}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {!isRecording ? (
          <button
            onClick={onStart}
            disabled={status === "processing"}
            className="btn-primary flex-1"
          >
            <RecordIcon className="h-4 w-4" />
            {status === "processing" ? "Processing\u2026" : "Record"}
          </button>
        ) : (
          <>
            <button onClick={onPause} className="btn-secondary flex-1">
              {status === "paused" ? (
                <ResumeIcon className="h-4 w-4" />
              ) : (
                <PauseIcon className="h-4 w-4" />
              )}
              {status === "paused" ? "Resume" : "Pause"}
            </button>
            <button onClick={onStop} className="btn-danger flex-1">
              <StopIcon className="h-4 w-4" />
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RecordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}
function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
function ResumeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}
function StopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

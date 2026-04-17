import type { NoiseCancelLevel } from "../types";

interface Props {
  enabled: boolean;
  level: NoiseCancelLevel;
  onToggle: (enabled: boolean) => void;
  onLevelChange: (level: NoiseCancelLevel) => void;
}

const LEVELS: NoiseCancelLevel[] = ["off", "low", "medium", "high"];

export default function NoiseCancelPanel({ enabled, level, onToggle, onLevelChange }: Props) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Noise Cancellation</label>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            enabled ? "bg-primary-600" : "bg-surface-700"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {enabled && (
        <div>
          <label className="label">Intensity</label>
          <div className="flex gap-2">
            {LEVELS.filter((l) => l !== "off").map((l) => (
              <button
                key={l}
                onClick={() => onLevelChange(l)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  level === l
                    ? "bg-primary-600 text-white"
                    : "bg-surface-700 text-gray-300 hover:bg-surface-600"
                }`}
              >
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

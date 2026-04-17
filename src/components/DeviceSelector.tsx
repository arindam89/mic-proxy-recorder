import type { AudioDevice } from "../types";

interface Props {
  devices: AudioDevice[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function DeviceSelector({ devices, selectedId, onSelect }: Props) {
  return (
    <div className="card">
      <label className="label">Input Device</label>
      {devices.length === 0 ? (
        <p className="text-sm text-gray-400">No audio devices found</p>
      ) : (
        <select
          value={selectedId ?? ""}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
        >
          <option value="">Default device</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} {d.is_default ? "(default)" : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

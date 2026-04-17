import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppSettings } from "../types";

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
}

export default function SettingsPanel({ settings, onSave }: Props) {
  const [local, setLocal] = useState<AppSettings>(settings);

  async function handleBrowseModel() {
    const path = await open({
      filters: [{ name: "Whisper model", extensions: ["bin", "gguf"] }],
    });
    if (typeof path === "string") {
      setLocal((s) => ({ ...s, model_path: path }));
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="mb-6 text-lg font-semibold">Settings</h2>
      <div className="max-w-lg space-y-6">
        <div className="card space-y-3">
          <label className="label">Whisper Model Path</label>
          <p className="text-xs text-gray-400">
            Point to a local whisper.cpp GGUF/bin model file (e.g.,
            ggml-large-v3-turbo-q5_0.bin). Download from:{" "}
            <span className="text-primary-500">
              https://huggingface.co/ggerganov/whisper.cpp
            </span>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={local.model_path ?? ""}
              readOnly
              placeholder="No model selected"
              className="flex-1 rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-gray-300"
            />
            <button onClick={handleBrowseModel} className="btn-secondary">
              Browse&hellip;
            </button>
          </div>
        </div>

        <div className="card space-y-3">
          <label className="label">Recording Format</label>
          <div className="flex gap-3">
            {(["wav", "flac"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setLocal((s) => ({ ...s, output_format: fmt }))}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  local.output_format === fmt
                    ? "bg-primary-600 text-white"
                    : "bg-surface-700 text-gray-300"
                }`}
              >
                {fmt.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button onClick={() => onSave(local)} className="btn-primary w-full">
          Save Settings
        </button>
      </div>
    </div>
  );
}

#!/usr/bin/env python3
"""
Local speech-to-text via NVIDIA NeMo Parakeet (TDT).

Install (heavy; use a venv):
  pip install -r scripts/requirements-parakeet.txt

Optional: PARAKEET_NEMO_MODEL — Hugging Face model id (default: nvidia/parakeet-tdt-0.6b-v2).

Writes one JSON object to stdout: {"text": "...", "language": "en", "segments": [...]}
On failure: {"error": "..."} and non-zero exit.
"""

from __future__ import annotations

import json
import os
import sys


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: parakeet_transcribe.py <path-to-wav>"}))
        sys.exit(1)

    wav_path = sys.argv[1]
    model_name = os.environ.get("PARAKEET_NEMO_MODEL", "nvidia/parakeet-tdt-0.6b-v2")

    try:
        import nemo.collections.asr as nemo_asr
    except ImportError:
        print(
            json.dumps(
                {
                    "error": "NeMo is not installed or the venv uses an unsupported Python (use 3.10–3.12). From the repo root run: bash scripts/setup-parakeet-venv.sh — it creates .venv-parakeet and installs requirements. The desktop app uses that venv’s python when present."
                }
            )
        )
        sys.exit(1)

    try:
        model = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name)
        hypotheses = model.transcribe([wav_path])
    except Exception as e:  # noqa: BLE001 — surface to Rust UI
        print(json.dumps({"error": f"Parakeet inference failed: {e}"}))
        sys.exit(1)

    if not hypotheses:
        print(json.dumps({"text": "", "language": "en", "segments": []}))
        return

    first = hypotheses[0]
    if hasattr(first, "text"):
        text = str(first.text).strip()
    else:
        text = str(first).strip()

    segments = [
        {
            "id": 0,
            "start_ms": 0,
            "end_ms": 0,
            "text": text,
        }
    ]
    out = {"text": text, "language": "en", "segments": segments}
    print(json.dumps(out))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Local speech-to-text via NVIDIA NeMo Parakeet (TDT).

Install (heavy; use a venv):
  bash scripts/setup-parakeet-venv.sh

Optional: PARAKEET_NEMO_MODEL — Hugging Face model id (default: nvidia/parakeet-tdt-0.6b-v2).

Writes exactly one JSON object to stdout (nothing else). Logs/progress go to stderr.
On failure: {"error": "..."} on stdout and non-zero exit.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import sys


def _emit_json(obj: dict) -> None:
    """Single line JSON — only place we write to real stdout."""
    sys.__stdout__.write(json.dumps(obj) + "\n")
    sys.__stdout__.flush()


def _silence_loggers() -> None:
    logging.root.setLevel(logging.ERROR)
    for name in list(logging.root.manager.loggerDict.keys()):
        try:
            logging.getLogger(name).setLevel(logging.ERROR)
        except Exception:
            pass


@contextlib.contextmanager
def _nemo_stdout_to_stderr():
    """NeMo / tqdm often print to stdout; subprocess captures stdout for JSON only."""
    real_out = sys.__stdout__
    real_err = sys.__stderr__
    sys.stdout = real_err
    try:
        yield
    finally:
        sys.stdout = real_out


def main() -> None:
    # Progress bars and stray prints must not land on stdout (Rust reads only stdout).
    os.environ.setdefault("TQDM_DISABLE", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    if len(sys.argv) < 2:
        _emit_json({"error": "usage: parakeet_transcribe.py <path-to-wav>"})
        sys.exit(1)

    wav_path = sys.argv[1]
    model_name = os.environ.get("PARAKEET_NEMO_MODEL", "nvidia/parakeet-tdt-0.6b-v2")

    try:
        with _nemo_stdout_to_stderr():
            import nemo.collections.asr as nemo_asr  # noqa: WPS433

            _silence_loggers()
            model = nemo_asr.models.ASRModel.from_pretrained(model_name=model_name)
            hypotheses = model.transcribe([wav_path])
    except ImportError:
        _emit_json(
            {
                "error": "NeMo is not installed or the venv uses an unsupported Python (use 3.10–3.12). From the repo root run: bash scripts/setup-parakeet-venv.sh — it creates .venv-parakeet and installs requirements. The desktop app uses that venv’s python when present."
            }
        )
        sys.exit(1)
    except Exception as e:  # noqa: BLE001 — after ImportError branch
        _emit_json({"error": f"Parakeet inference failed: {e}"})
        sys.exit(1)

    if not hypotheses:
        _emit_json({"text": "", "language": "en", "segments": []})
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
    _emit_json({"text": text, "language": "en", "segments": segments})


if __name__ == "__main__":
    main()

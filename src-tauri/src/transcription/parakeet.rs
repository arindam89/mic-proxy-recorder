//! Local ASR via NVIDIA NeMo Parakeet — runs the bundled Python helper script.

use crate::transcription::{Transcript, TranscriptSegment};
use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Deserialize)]
struct ParakeetJson {
    text: Option<String>,
    language: Option<String>,
    segments: Option<Vec<ParakeetSegmentJson>>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ParakeetSegmentJson {
    id: Option<i32>,
    start_ms: Option<i64>,
    end_ms: Option<i64>,
    text: Option<String>,
}

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

fn script_path() -> PathBuf {
    project_root().join("scripts").join("parakeet_transcribe.py")
}

/// Prefer repo-local `.venv-parakeet` so the desktop app finds NeMo without changing global PATH.
fn resolve_python_executable() -> PathBuf {
    let venv_python = if cfg!(windows) {
        project_root()
            .join(".venv-parakeet")
            .join("Scripts")
            .join("python.exe")
    } else {
        project_root()
            .join(".venv-parakeet")
            .join("bin")
            .join("python3")
    };
    if venv_python.is_file() {
        return venv_python;
    }
    PathBuf::from(if cfg!(windows) { "python" } else { "python3" })
}

/// Transcribe using NeMo Parakeet (see `scripts/parakeet_transcribe.py`).
pub fn transcribe(recording_path: &Path, recording_id: &str) -> Result<Transcript> {
    let script = script_path();
    if !script.is_file() {
        anyhow::bail!(
            "Parakeet helper script missing at {}. Ensure scripts/parakeet_transcribe.py exists.",
            script.display()
        );
    }

    let py = resolve_python_executable();
    let output = Command::new(&py)
        .arg(&script)
        .arg(recording_path)
        .output()
        .with_context(|| {
            format!(
                "Failed to run {} (create .venv-parakeet per docs or install Python)",
                py.display()
            )
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    let parsed: ParakeetJson = serde_json::from_str(trimmed).with_context(|| {
        format!(
            "Parakeet returned non-JSON stdout. stderr:\n{}",
            String::from_utf8_lossy(&output.stderr)
        )
    })?;

    if let Some(err) = parsed.error {
        anyhow::bail!("{}", err);
    }

    let text = parsed.text.unwrap_or_default();
    let segments: Vec<TranscriptSegment> = if let Some(segs) = parsed.segments {
        segs
            .into_iter()
            .enumerate()
            .map(|(i, s)| TranscriptSegment {
                id: s.id.unwrap_or(i as i32),
                start_ms: s.start_ms.unwrap_or(0),
                end_ms: s.end_ms.unwrap_or(0),
                text: s.text.unwrap_or_default(),
            })
            .collect()
    } else if !text.is_empty() {
        vec![TranscriptSegment {
            id: 0,
            start_ms: 0,
            end_ms: 0,
            text: text.clone(),
        }]
    } else {
        Vec::new()
    };

    Ok(Transcript {
        recording_id: recording_id.to_string(),
        text: text.clone(),
        segments,
        language: parsed.language.unwrap_or_else(|| "en".to_string()),
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

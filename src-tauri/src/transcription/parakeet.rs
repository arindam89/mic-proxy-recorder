//! Local ASR via NVIDIA NeMo Parakeet — runs the bundled Python helper script.

use crate::transcription::{Transcript, TranscriptSegment};
use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::Path;
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

fn stderr_tail(s: &str, max_chars: usize) -> String {
    let n = s.chars().count();
    if n <= max_chars {
        return s.to_string();
    }
    s.chars()
        .rev()
        .take(max_chars)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

/// NeMo may still print garbage to stdout; accept whole buffer or last JSON line.
fn parse_parakeet_json_stdout(stdout: &str) -> Result<ParakeetJson> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        anyhow::bail!("empty stdout");
    }
    if let Ok(v) = serde_json::from_str::<ParakeetJson>(trimmed) {
        return Ok(v);
    }
    for line in trimmed.lines().rev() {
        let line = line.trim();
        if line.starts_with('{') {
            if let Ok(v) = serde_json::from_str::<ParakeetJson>(line) {
                return Ok(v);
            }
        }
    }
    anyhow::bail!("stdout did not contain a JSON object")
}

/// Transcribe using NeMo Parakeet. `script_path` / `python_exe` come from the app (dev tree or bundled resources).
pub fn transcribe(
    recording_path: &Path,
    recording_id: &str,
    script_path: &Path,
    python_exe: &Path,
) -> Result<Transcript> {
    if !script_path.is_file() {
        anyhow::bail!(
            "Parakeet helper script missing at {}. Run the build with scripts bundled or use a dev checkout.",
            script_path.display()
        );
    }

    let output = Command::new(python_exe)
        .arg(script_path)
        .arg(recording_path)
        .output()
        .with_context(|| {
            format!(
                "Failed to run {} (create .venv-parakeet per docs or install Python)",
                python_exe.display()
            )
        })?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let parsed = parse_parakeet_json_stdout(&stdout).with_context(|| {
        format!(
            "Parakeet returned no parseable JSON on stdout (status {}). stderr tail:\n{}",
            output.status,
            stderr_tail(&stderr, 4000)
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

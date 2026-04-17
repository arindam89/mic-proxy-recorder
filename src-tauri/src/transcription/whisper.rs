//! Offline transcription using whisper-rs (whisper.cpp Rust bindings).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    pub recording_id: String,
    pub text: String,
    pub segments: Vec<TranscriptSegment>,
    pub language: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: i32,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

/// Transcribe a WAV audio file using a local whisper.cpp model.
pub fn transcribe(
    recording_path: &Path,
    model_path: &Path,
    recording_id: &str,
) -> Result<Transcript> {
    let pcm_16k = load_wav_as_16k_mono(recording_path)?;

    let ctx_params = WhisperContextParameters::default();
    let ctx = WhisperContext::new_with_params(
        model_path.to_str().context("Invalid model path")?,
        ctx_params,
    )
    .context("Failed to load Whisper model")?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(num_cpus::get().min(4) as i32);
    params.set_translate(false);
    params.set_language(Some("auto"));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(true);
    params.set_token_timestamps(false);

    let mut state = ctx.create_state().context("Failed to create whisper state")?;
    state
        .full(params, &pcm_16k)
        .context("Whisper inference failed")?;

    let num_segments = state.full_n_segments().context("Failed to count segments")?;
    let mut segments = Vec::new();
    let mut full_text = String::new();

    for i in 0..num_segments {
        let text = state
            .full_get_segment_text(i)
            .context("Failed to get segment text")?;
        let start_ms = state
            .full_get_segment_t0(i)
            .context("Failed to get segment start")?;
        let end_ms = state
            .full_get_segment_t1(i)
            .context("Failed to get segment end")?;

        full_text.push_str(&text);
        full_text.push(' ');

        segments.push(TranscriptSegment {
            id: i,
            start_ms: start_ms * 10,
            end_ms: end_ms * 10,
            text,
        });
    }

    let language = state
        .full_lang_id()
        .ok()
        .and_then(|id| whisper_rs::get_lang_str(id).ok())
        .unwrap_or("unknown")
        .to_string();

    Ok(Transcript {
        recording_id: recording_id.to_string(),
        text: full_text.trim().to_string(),
        segments,
        language,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn load_wav_as_16k_mono(path: &Path) -> Result<Vec<f32>> {
    let mut reader = hound::WavReader::open(path).context("Failed to open WAV file")?;
    let spec = reader.spec();
    let channels = spec.channels as usize;
    let sample_rate = spec.sample_rate;

    let raw_samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            let max = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader
                .samples::<i32>()
                .map(|s| s.unwrap() as f32 / max)
                .collect()
        }
        hound::SampleFormat::Float => reader.samples::<f32>().map(|s| s.unwrap()).collect(),
    };

    let mono: Vec<f32> = if channels > 1 {
        raw_samples
            .chunks(channels)
            .map(|ch| ch.iter().sum::<f32>() / channels as f32)
            .collect()
    } else {
        raw_samples
    };

    if sample_rate == 16000 {
        return Ok(mono);
    }

    let ratio = sample_rate as f64 / 16000.0;
    let out_len = (mono.len() as f64 / ratio).ceil() as usize;
    let resampled: Vec<f32> = (0..out_len)
        .map(|i| {
            let src = i as f64 * ratio;
            let idx = src as usize;
            let frac = (src - idx as f64) as f32;
            let a = mono.get(idx).copied().unwrap_or(0.0);
            let b = mono.get(idx + 1).copied().unwrap_or(0.0);
            a + (b - a) * frac
        })
        .collect();

    Ok(resampled)
}

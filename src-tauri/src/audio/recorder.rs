//! Audio recording with noise cancellation pipeline.

use crate::audio::capture::get_input_device;
use crate::audio::processor::{
    level_to_factor, resample_mono, stereo_to_mono, NoiseProcessor, DENOISE_SAMPLE_RATE,
    FRAME_SIZE,
};
use anyhow::{Context, Result};
use chrono::Utc;
use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, StreamConfig};
use hound::{WavSpec, WavWriter};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recording {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub duration_secs: u32,
    pub created_at: String,
}

// WavWriter<BufWriter<File>> is not Send, so we wrap it.
struct SendWavWriter(WavWriter<std::io::BufWriter<std::fs::File>>);
// SAFETY: We only access this behind a Mutex, so there is no concurrent access.
unsafe impl Send for SendWavWriter {}

pub struct RecorderHandle {
    pub recording: Recording,
    stream: cpal::Stream,
    paused: Arc<AtomicBool>,
    writer: Arc<Mutex<Option<SendWavWriter>>>,
    start_time: std::time::Instant,
}

// SAFETY: cpal::Stream is marked as !Send for cross-platform compatibility guarantees.
// In this app we only move/use RecorderHandle behind the global app-state mutex and invoke
// stream control methods (play/pause/drop) in a non-concurrent manner.
unsafe impl Send for RecorderHandle {}

impl RecorderHandle {
    pub fn toggle_pause(&self) {
        let was_paused = self.paused.fetch_xor(true, Ordering::SeqCst);
        if was_paused {
            let _ = self.stream.play();
        } else {
            let _ = self.stream.pause();
        }
    }

    pub fn stop(self) -> Result<Recording> {
        let _ = self.stream.pause();
        drop(self.stream);
        let duration_secs = self.start_time.elapsed().as_secs() as u32;

        if let Ok(mut guard) = self.writer.lock() {
            if let Some(writer) = guard.take() {
                writer.0.finalize().context("Failed to finalize WAV file")?;
            }
        }

        Ok(Recording {
            duration_secs,
            ..self.recording
        })
    }
}

/// Start recording from the given device with optional noise cancellation.
pub fn start_recording(
    device_id: Option<&str>,
    noise_cancel_enabled: bool,
    noise_cancel_level: &str,
    recordings_dir: PathBuf,
) -> Result<RecorderHandle> {
    let device = get_input_device(device_id)?;
    let supported_config = device
        .default_input_config()
        .context("No default input config")?;

    let channels = supported_config.channels();
    let sample_rate = supported_config.sample_rate().0;
    let config = StreamConfig {
        channels,
        sample_rate: SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };

    std::fs::create_dir_all(&recordings_dir).context("Failed to create recordings dir")?;
    let id = Uuid::new_v4().to_string();
    let filename = format!("recording-{}.wav", &id[..8]);
    let path = recordings_dir.join(&filename);

    let wav_spec = WavSpec {
        channels: 1,
        sample_rate: if noise_cancel_enabled {
            DENOISE_SAMPLE_RATE
        } else {
            sample_rate
        },
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let writer = WavWriter::create(&path, wav_spec).context("Failed to create WAV file")?;
    let writer = Arc::new(Mutex::new(Some(SendWavWriter(writer))));
    let writer_clone = Arc::clone(&writer);

    let paused = Arc::new(AtomicBool::new(false));
    let paused_clone = Arc::clone(&paused);

    let nc_level = level_to_factor(noise_cancel_level);
    let nc_enabled = noise_cancel_enabled;

    let processor: Arc<Mutex<Option<NoiseProcessor>>> = Arc::new(Mutex::new(if nc_enabled {
        Some(NoiseProcessor::new(nc_level))
    } else {
        None
    }));

    let accumulator: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));

    let stream = match supported_config.sample_format() {
        SampleFormat::F32 => build_stream::<f32>(
            &device,
            &config,
            writer_clone,
            processor,
            accumulator,
            paused_clone,
            sample_rate,
            channels,
            nc_enabled,
        )?,
        SampleFormat::I16 => build_stream::<i16>(
            &device,
            &config,
            writer_clone,
            processor,
            accumulator,
            paused_clone,
            sample_rate,
            channels,
            nc_enabled,
        )?,
        SampleFormat::U16 => build_stream::<u16>(
            &device,
            &config,
            writer_clone,
            processor,
            accumulator,
            paused_clone,
            sample_rate,
            channels,
            nc_enabled,
        )?,
        _ => anyhow::bail!("Unsupported sample format"),
    };

    stream.play().context("Failed to start audio stream")?;

    let recording = Recording {
        id,
        path: path.to_string_lossy().into_owned(),
        filename,
        duration_secs: 0,
        created_at: Utc::now().to_rfc3339(),
    };

    Ok(RecorderHandle {
        recording,
        stream,
        paused,
        writer,
        start_time: std::time::Instant::now(),
    })
}

fn build_stream<T: cpal::Sample + cpal::SizedSample + IntoF32 + Send + 'static>(
    device: &cpal::Device,
    config: &StreamConfig,
    writer: Arc<Mutex<Option<SendWavWriter>>>,
    processor: Arc<Mutex<Option<NoiseProcessor>>>,
    accumulator: Arc<Mutex<Vec<f32>>>,
    paused: Arc<AtomicBool>,
    device_sample_rate: u32,
    channels: u16,
    noise_cancel_enabled: bool,
) -> Result<cpal::Stream> {
    let stream = device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            if paused.load(Ordering::SeqCst) {
                return;
            }

            let mut float_samples: Vec<f32> =
                data.iter().map(|s| s.into_f32() * 32768.0).collect();

            if channels > 1 {
                float_samples = stereo_to_mono(&float_samples);
            }

            if noise_cancel_enabled {
                let resampled =
                    resample_mono(&float_samples, device_sample_rate, DENOISE_SAMPLE_RATE);

                let mut acc = accumulator.lock().unwrap();
                acc.extend_from_slice(&resampled);

                while acc.len() >= FRAME_SIZE {
                    let chunk: Vec<f32> = acc.drain(..FRAME_SIZE).collect();
                    let mut frame = [0.0f32; FRAME_SIZE];
                    frame.copy_from_slice(&chunk);

                    if let Ok(mut proc) = processor.lock() {
                        if let Some(p) = proc.as_mut() {
                            p.process_frame(&mut frame);
                        }
                    }

                    if let Ok(mut guard) = writer.lock() {
                        if let Some(w) = guard.as_mut() {
                            for &s in &frame {
                                let _ = w.0.write_sample(s.clamp(-32768.0, 32767.0) as i16);
                            }
                        }
                    }
                }
            } else {
                if let Ok(mut guard) = writer.lock() {
                    if let Some(w) = guard.as_mut() {
                        for &s in &float_samples {
                            let _ = w.0.write_sample(s.clamp(-32768.0, 32767.0) as i16);
                        }
                    }
                }
            }
        },
        |err| log::error!("Audio stream error: {}", err),
        None,
    )?;

    Ok(stream)
}

/// Helper trait to convert cpal sample types to f32.
pub trait IntoF32 {
    fn into_f32(self) -> f32;
}

impl IntoF32 for f32 {
    fn into_f32(self) -> f32 {
        self
    }
}

impl IntoF32 for i16 {
    fn into_f32(self) -> f32 {
        self as f32 / 32768.0
    }
}

impl IntoF32 for u16 {
    fn into_f32(self) -> f32 {
        (self as f32 - 32768.0) / 32768.0
    }
}

//! Route the physical microphone (optional denoise) to a **playback** device such as
//! [BlackHole](https://existential.audio/blackhole/) so Meet/Zoom can select that device
//! as the microphone, while writing the same audio to a local mono WAV.
//!
//! This does **not** install a driver; the user installs BlackHole (or similar) once.

use crate::audio::capture::{get_input_device, get_output_device};
use crate::audio::processor::{
    level_to_factor, resample_mono, stereo_to_mono, NoiseProcessor, DENOISE_SAMPLE_RATE, FRAME_SIZE,
};
use crate::audio::recorder::{default_display_name_for_dir, Recording};
use anyhow::{Context, Result};
use chrono::Utc;
use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, SizedSample, StreamConfig};
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

const RING_CAP: usize = 48000 * 3;

struct SendWavWriter(WavWriter<std::io::BufWriter<std::fs::File>>);
unsafe impl Send for SendWavWriter {}

struct BridgeShared {
    ring: Mutex<VecDeque<f32>>,
    writer: Mutex<Option<SendWavWriter>>,
    mic_accumulator: Mutex<Vec<f32>>,
}

impl Drop for BridgeShared {
    fn drop(&mut self) {
        if let Ok(mut g) = self.writer.lock() {
            if let Some(w) = g.take() {
                let _ = w.0.finalize();
            }
        }
    }
}

pub struct MeetingBridgeHandle {
    /// Keeps ring + WAV writer alive until input/output streams are dropped.
    _shared: Arc<BridgeShared>,
    input_stream: cpal::Stream,
    output_stream: cpal::Stream,
    pub recording: Recording,
    pub meter_peak_milli: Arc<AtomicU32>,
    start_time: std::time::Instant,
}

unsafe impl Send for MeetingBridgeHandle {}

fn store_meter_peak(meter: &AtomicU32, samples: &[f32]) {
    let mut pk = 0.0f32;
    for &s in samples {
        pk = pk.max(s.abs());
    }
    let milli = ((pk / 32768.0).min(1.0) * 1000.0) as u32;
    meter.store(milli, Ordering::Relaxed);
}

fn push_ring(shared: &Arc<BridgeShared>, mono: &[f32]) {
    let mut ring = shared.ring.lock().unwrap();
    for &s in mono {
        if ring.len() >= RING_CAP {
            ring.pop_front();
        }
        ring.push_back(s);
    }
}

fn write_wav_mono(shared: &Arc<BridgeShared>, mono: &[f32]) {
    if let Ok(mut w) = shared.writer.lock() {
        if let Some(writer) = w.as_mut() {
            for &s in mono {
                let _ = writer
                    .0
                    .write_sample(s.clamp(-32768.0, 32767.0) as i16);
            }
        }
    }
}

pub fn start_meeting_bridge(
    physical_input_id: Option<&str>,
    bridge_output_id: &str,
    noise_cancel_enabled: bool,
    noise_cancel_level: &str,
    recordings_dir: PathBuf,
) -> Result<MeetingBridgeHandle> {
    std::fs::create_dir_all(&recordings_dir).context("Failed to create recordings dir")?;

    let in_dev = get_input_device(physical_input_id)?;
    let out_dev = get_output_device(Some(bridge_output_id))?;

    let in_conf = in_dev.default_input_config()?;
    let out_conf = out_dev.default_output_config()?;

    let in_sr = in_conf.sample_rate().0;
    let out_sr = out_conf.sample_rate().0;
    let in_ch = in_conf.channels();
    let out_ch = out_conf.channels() as usize;

    let in_cfg = StreamConfig {
        channels: in_ch,
        sample_rate: SampleRate(in_sr),
        buffer_size: cpal::BufferSize::Default,
    };
    let out_cfg = StreamConfig {
        channels: out_conf.channels(),
        sample_rate: SampleRate(out_sr),
        buffer_size: cpal::BufferSize::Default,
    };

    let id = uuid::Uuid::new_v4().to_string();
    let filename = format!("meeting-{}.wav", &id[..8]);
    let path = recordings_dir.join(&filename);
    let wav_spec = WavSpec {
        channels: 1,
        sample_rate: out_sr,
        bits_per_sample: 16,
        sample_format: HoundSampleFormat::Int,
    };
    let writer = WavWriter::create(&path, wav_spec).context("Failed to create meeting WAV")?;

    let shared = Arc::new(BridgeShared {
        ring: Mutex::new(VecDeque::new()),
        writer: Mutex::new(Some(SendWavWriter(writer))),
        mic_accumulator: Mutex::new(Vec::new()),
    });

    let nc_level = level_to_factor(noise_cancel_level);
    let processor: Arc<Mutex<Option<NoiseProcessor>>> = Arc::new(Mutex::new(if noise_cancel_enabled {
        Some(NoiseProcessor::new(nc_level))
    } else {
        None
    }));

    let meter = Arc::new(AtomicU32::new(0));

    let input_stream = match in_conf.sample_format() {
        SampleFormat::F32 => build_input_to_ring::<f32>(
            &in_dev,
            &in_cfg,
            in_sr,
            in_ch,
            noise_cancel_enabled,
            Arc::clone(&shared),
            Arc::clone(&processor),
            out_sr,
            Arc::clone(&meter),
        )?,
        SampleFormat::I16 => build_input_to_ring::<i16>(
            &in_dev,
            &in_cfg,
            in_sr,
            in_ch,
            noise_cancel_enabled,
            Arc::clone(&shared),
            Arc::clone(&processor),
            out_sr,
            Arc::clone(&meter),
        )?,
        SampleFormat::U16 => build_input_to_ring::<u16>(
            &in_dev,
            &in_cfg,
            in_sr,
            in_ch,
            noise_cancel_enabled,
            Arc::clone(&shared),
            Arc::clone(&processor),
            out_sr,
            Arc::clone(&meter),
        )?,
        _ => anyhow::bail!("Unsupported input sample format for meeting bridge"),
    };

    let output_stream = match out_conf.sample_format() {
        SampleFormat::F32 => build_output_from_ring_f32(&out_dev, &out_cfg, out_ch, Arc::clone(&shared))?,
        SampleFormat::I16 => build_output_from_ring_i16(&out_dev, &out_cfg, out_ch, Arc::clone(&shared))?,
        SampleFormat::U16 => build_output_from_ring_u16(&out_dev, &out_cfg, out_ch, Arc::clone(&shared))?,
        _ => anyhow::bail!("Unsupported output sample format for meeting bridge"),
    };

    input_stream.play().context("Failed to start bridge input")?;
    output_stream.play().context("Failed to start bridge output")?;

    let created_at = Utc::now().to_rfc3339();
    let display_name = format!("{} (meeting bridge)", default_display_name_for_dir(&recordings_dir));

    let recording = Recording {
        id,
        path: path.to_string_lossy().into_owned(),
        filename,
        display_name,
        transcript: None,
        duration_secs: 0,
        created_at,
    };

    Ok(MeetingBridgeHandle {
        _shared: shared,
        input_stream,
        output_stream,
        recording,
        meter_peak_milli: meter,
        start_time: std::time::Instant::now(),
    })
}

impl MeetingBridgeHandle {
    pub fn stop(self) -> Result<Recording> {
        let _ = self.input_stream.pause();
        let _ = self.output_stream.pause();
        let duration_secs = self.start_time.elapsed().as_secs() as u32;
        let rec = self.recording.clone();
        let MeetingBridgeHandle {
            _shared,
            input_stream,
            output_stream,
            recording: _,
            meter_peak_milli: _,
            start_time: _,
        } = self;
        drop(output_stream);
        drop(input_stream);
        drop(_shared);
        Ok(Recording {
            duration_secs,
            ..rec
        })
    }
}

trait IntoF32 {
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

fn build_input_to_ring<T: cpal::Sample + SizedSample + IntoF32 + Send + 'static>(
    device: &cpal::Device,
    config: &StreamConfig,
    device_sample_rate: u32,
    channels: u16,
    noise_cancel_enabled: bool,
    shared: Arc<BridgeShared>,
    processor: Arc<Mutex<Option<NoiseProcessor>>>,
    out_sample_rate: u32,
    meter: Arc<AtomicU32>,
) -> Result<cpal::Stream> {
    let stream = device.build_input_stream(
        config,
        move |data: &[T], _| {
            let mut float_samples: Vec<f32> = data.iter().map(|s| s.into_f32() * 32768.0).collect();
            if channels > 1 {
                float_samples = stereo_to_mono(&float_samples);
            }
            let mono_out_rate: Vec<f32> = if noise_cancel_enabled {
                let resampled = resample_mono(&float_samples, device_sample_rate, DENOISE_SAMPLE_RATE);
                let mut acc = shared.mic_accumulator.lock().unwrap();
                acc.extend_from_slice(&resampled);
                let mut out_chunks: Vec<f32> = Vec::new();
                while acc.len() >= FRAME_SIZE {
                    let chunk: Vec<f32> = acc.drain(..FRAME_SIZE).collect();
                    let mut frame = [0.0f32; FRAME_SIZE];
                    frame.copy_from_slice(&chunk);
                    if let Ok(mut proc) = processor.lock() {
                        if let Some(p) = proc.as_mut() {
                            p.process_frame(&mut frame);
                        }
                    }
                    let at_out = resample_mono(&frame[..], DENOISE_SAMPLE_RATE, out_sample_rate);
                    out_chunks.extend(at_out);
                }
                out_chunks
            } else {
                resample_mono(&float_samples, device_sample_rate, out_sample_rate)
            };
            if !mono_out_rate.is_empty() {
                store_meter_peak(&meter, &mono_out_rate);
                write_wav_mono(&shared, &mono_out_rate);
                push_ring(&shared, &mono_out_rate);
            }
        },
        |e| log::error!("Bridge input error: {}", e),
        None,
    )?;
    Ok(stream)
}

fn build_output_from_ring_f32(
    device: &cpal::Device,
    config: &StreamConfig,
    out_channels: usize,
    shared: Arc<BridgeShared>,
) -> Result<cpal::Stream> {
    let ch = out_channels.max(1);
    let stream = device.build_output_stream(
        config,
        move |data: &mut [f32], _| {
            let total = data.len();
            let mono_n = total / ch;
            let mut ring = shared.ring.lock().unwrap();
            for i in 0..mono_n {
                let m = ring.pop_front().unwrap_or(0.0);
                let norm = (m / 32768.0).clamp(-1.0, 1.0);
                for c in 0..ch {
                    data[i * ch + c] = norm;
                }
            }
        },
        |e| log::error!("Bridge output error: {}", e),
        None,
    )?;
    Ok(stream)
}

fn build_output_from_ring_i16(
    device: &cpal::Device,
    config: &StreamConfig,
    out_channels: usize,
    shared: Arc<BridgeShared>,
) -> Result<cpal::Stream> {
    let ch = out_channels.max(1);
    let stream = device.build_output_stream(
        config,
        move |data: &mut [i16], _| {
            let total = data.len();
            let mono_n = total / ch;
            let mut ring = shared.ring.lock().unwrap();
            for i in 0..mono_n {
                let m = ring.pop_front().unwrap_or(0.0);
                let s = (m.clamp(-32768.0, 32767.0)) as i16;
                for c in 0..ch {
                    data[i * ch + c] = s;
                }
            }
        },
        |e| log::error!("Bridge output error: {}", e),
        None,
    )?;
    Ok(stream)
}

fn build_output_from_ring_u16(
    device: &cpal::Device,
    config: &StreamConfig,
    out_channels: usize,
    shared: Arc<BridgeShared>,
) -> Result<cpal::Stream> {
    let ch = out_channels.max(1);
    let stream = device.build_output_stream(
        config,
        move |data: &mut [u16], _| {
            let total = data.len();
            let mono_n = total / ch;
            let mut ring = shared.ring.lock().unwrap();
            for i in 0..mono_n {
                let m = ring.pop_front().unwrap_or(0.0);
                let s = ((m.clamp(-32768.0, 32767.0) + 32768.0) as i32).clamp(0, 65535) as u16;
                for c in 0..ch {
                    data[i * ch + c] = s;
                }
            }
        },
        |e| log::error!("Bridge output error: {}", e),
        None,
    )?;
    Ok(stream)
}

//! Duplex **relay hub**: physical mic → virtual playback (Meet mic), virtual capture
//! (Meet speakers) → physical speakers, plus **stereo WAV** (L = you, R = Meet).
//!
//! Requires a virtual cable (e.g. [BlackHole](https://existential.audio/blackhole/)).
//! In Meet, set **both** microphone and speaker to that cable to avoid acoustic feedback.
//! See `specs/RELAY_HUB_ARCHITECTURE.md`.

use crate::audio::capture::{get_input_device, get_output_device};
use crate::audio::processor::{
    level_to_factor, resample_mono, stereo_to_mono, NoiseProcessor, DENOISE_SAMPLE_RATE, FRAME_SIZE,
};
use crate::audio::recorder::{default_display_name_for_dir, Recording};
use anyhow::{Context, Result};
use chrono::Utc;
use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{SampleFormat, SampleRate, StreamConfig};
use hound::{SampleFormat as HoundSampleFormat, WavSpec, WavWriter};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

const RING_CAP: usize = 48000 * 3;
/// Stereo WAV sample rate (fixed pairing rate).
const WAV_SR: u32 = 48000;
const REMOTE_CAP: usize = 48000 * 2;

struct SendStereoWavWriter(WavWriter<std::io::BufWriter<std::fs::File>>);
unsafe impl Send for SendStereoWavWriter {}

struct DuplexShared {
    /// Mic (processed) → virtual **playback** (Meet reads as mic).
    to_meet_ring: Arc<Mutex<VecDeque<f32>>>,
    /// Virtual capture (Meet playback) → physical speakers.
    to_speaker_ring: Arc<Mutex<VecDeque<f32>>>,
    /// Meet side at WAV_SR for stereo R channel (paired in mic callback).
    remote_at_wav: Arc<Mutex<VecDeque<f32>>>,
    stereo_writer: Mutex<Option<SendStereoWavWriter>>,
    mic_accumulator: Mutex<Vec<f32>>,
}

impl Drop for DuplexShared {
    fn drop(&mut self) {
        if let Ok(mut g) = self.stereo_writer.lock() {
            if let Some(w) = g.take() {
                let _ = w.0.finalize();
            }
        }
    }
}

pub struct MeetingBridgeHandle {
    _shared: Arc<DuplexShared>,
    mic_input: cpal::Stream,
    virtual_input: cpal::Stream,
    virtual_output: cpal::Stream,
    physical_output: cpal::Stream,
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

fn push_ring(q: &Arc<Mutex<VecDeque<f32>>>, mono: &[f32]) {
    let mut ring = q.lock().unwrap();
    for &s in mono {
        if ring.len() >= RING_CAP {
            ring.pop_front();
        }
        ring.push_back(s);
    }
}

fn push_remote_capped(q: &Arc<Mutex<VecDeque<f32>>>, mono: &[f32]) {
    let mut r = q.lock().unwrap();
    for &s in mono {
        while r.len() >= REMOTE_CAP {
            r.pop_front();
        }
        r.push_back(s);
    }
}

fn write_stereo_from_mic_chunk(
    shared: &Arc<DuplexShared>,
    left_at_wav_sr: &[f32],
) {
    let mut remote = shared.remote_at_wav.lock().unwrap();
    let mut w = match shared.stereo_writer.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    let Some(writer) = w.as_mut() else {
        return;
    };
    for &l in left_at_wav_sr {
        let rr = remote.pop_front().unwrap_or(0.0);
        let _ = writer.0.write_sample(l.clamp(-32768.0, 32767.0) as i16);
        let _ = writer.0.write_sample(rr.clamp(-32768.0, 32767.0) as i16);
    }
}

fn require_f32(label: &str, fmt: SampleFormat) -> Result<()> {
    if fmt != SampleFormat::F32 {
        anyhow::bail!(
            "{}: sample format {:?} not supported for duplex bridge yet. In Audio MIDI Setup, set the device to 32-bit float if possible.",
            label,
            fmt
        );
    }
    Ok(())
}

pub fn start_meeting_bridge(
    physical_mic_id: Option<&str>,
    physical_speakers_id: Option<&str>,
    virtual_cable_id: &str,
    noise_cancel_enabled: bool,
    noise_cancel_level: &str,
    recordings_dir: PathBuf,
) -> Result<MeetingBridgeHandle> {
    std::fs::create_dir_all(&recordings_dir).context("Failed to create recordings dir")?;

    let mic_dev = get_input_device(physical_mic_id)?;
    let virt_in_dev = get_input_device(Some(virtual_cable_id))?;
    let virt_out_dev = get_output_device(Some(virtual_cable_id))?;
    let speaker_dev = get_output_device(physical_speakers_id)?;

    let mic_conf = mic_dev.default_input_config()?;
    let vi_conf = virt_in_dev.default_input_config()?;
    let vo_conf = virt_out_dev.default_output_config()?;
    let sp_conf = speaker_dev.default_output_config()?;

    require_f32("Physical microphone", mic_conf.sample_format())?;
    require_f32("Virtual cable (input / Meet playback)", vi_conf.sample_format())?;
    require_f32("Virtual cable (output / Meet mic)", vo_conf.sample_format())?;
    require_f32("Physical speakers", sp_conf.sample_format())?;

    let mic_sr = mic_conf.sample_rate().0;
    let vi_sr = vi_conf.sample_rate().0;
    let vo_sr = vo_conf.sample_rate().0;
    let sp_sr = sp_conf.sample_rate().0;

    let mic_ch = mic_conf.channels();
    let vi_ch = vi_conf.channels();
    let vo_ch = vo_conf.channels() as usize;
    let sp_ch = sp_conf.channels() as usize;

    let mic_cfg = StreamConfig {
        channels: mic_ch,
        sample_rate: SampleRate(mic_sr),
        buffer_size: cpal::BufferSize::Default,
    };
    let vi_cfg = StreamConfig {
        channels: vi_ch,
        sample_rate: SampleRate(vi_sr),
        buffer_size: cpal::BufferSize::Default,
    };
    let vo_cfg = StreamConfig {
        channels: vo_conf.channels(),
        sample_rate: SampleRate(vo_sr),
        buffer_size: cpal::BufferSize::Default,
    };
    let sp_cfg = StreamConfig {
        channels: sp_conf.channels(),
        sample_rate: SampleRate(sp_sr),
        buffer_size: cpal::BufferSize::Default,
    };

    let id = uuid::Uuid::new_v4().to_string();
    let filename = format!("meeting-duplex-{}.wav", &id[..8]);
    let path = recordings_dir.join(&filename);
    let wav_spec = WavSpec {
        channels: 2,
        sample_rate: WAV_SR,
        bits_per_sample: 16,
        sample_format: HoundSampleFormat::Int,
    };
    let writer = WavWriter::create(&path, wav_spec).context("Failed to create duplex WAV")?;

    let shared = Arc::new(DuplexShared {
        to_meet_ring: Arc::new(Mutex::new(VecDeque::new())),
        to_speaker_ring: Arc::new(Mutex::new(VecDeque::new())),
        remote_at_wav: Arc::new(Mutex::new(VecDeque::new())),
        stereo_writer: Mutex::new(Some(SendStereoWavWriter(writer))),
        mic_accumulator: Mutex::new(Vec::new()),
    });

    let nc_level = level_to_factor(noise_cancel_level);
    let processor: Arc<Mutex<Option<NoiseProcessor>>> = Arc::new(Mutex::new(if noise_cancel_enabled {
        Some(NoiseProcessor::new(nc_level))
    } else {
        None
    }));

    let meter = Arc::new(AtomicU32::new(0));

    let mic_input = build_mic_duplex_f32(
        &mic_dev,
        &mic_cfg,
        mic_sr,
        mic_ch,
        noise_cancel_enabled,
        Arc::clone(&shared),
        Arc::clone(&processor),
        vo_sr,
        Arc::clone(&meter),
    )?;

    let virtual_input = build_virtual_in_duplex_f32(
        &virt_in_dev,
        &vi_cfg,
        vi_sr,
        vi_ch,
        sp_sr,
        Arc::clone(&shared),
    )?;

    let virtual_output = build_output_from_ring_f32(&virt_out_dev, &vo_cfg, vo_ch, Arc::clone(&shared.to_meet_ring))?;

    let physical_output =
        build_output_from_ring_f32(&speaker_dev, &sp_cfg, sp_ch, Arc::clone(&shared.to_speaker_ring))?;

    mic_input.play().context("mic input")?;
    virtual_input.play().context("virtual input")?;
    virtual_output.play().context("virtual output")?;
    physical_output.play().context("physical output")?;

    let created_at = Utc::now().to_rfc3339();
    let display_name = format!("{} (call stereo)", default_display_name_for_dir(&recordings_dir));

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
        mic_input,
        virtual_input,
        virtual_output,
        physical_output,
        recording,
        meter_peak_milli: meter,
        start_time: std::time::Instant::now(),
    })
}

impl MeetingBridgeHandle {
    pub fn stop(self) -> Result<Recording> {
        let _ = self.mic_input.pause();
        let _ = self.virtual_input.pause();
        let _ = self.virtual_output.pause();
        let _ = self.physical_output.pause();
        let duration_secs = self.start_time.elapsed().as_secs() as u32;
        let rec = self.recording.clone();
        let MeetingBridgeHandle {
            _shared,
            mic_input,
            virtual_input,
            virtual_output,
            physical_output,
            recording: _,
            meter_peak_milli: _,
            start_time: _,
        } = self;
        drop(physical_output);
        drop(virtual_output);
        drop(virtual_input);
        drop(mic_input);
        drop(_shared);
        Ok(Recording {
            duration_secs,
            ..rec
        })
    }
}

fn build_mic_duplex_f32(
    device: &cpal::Device,
    config: &StreamConfig,
    device_sample_rate: u32,
    channels: u16,
    noise_cancel_enabled: bool,
    shared: Arc<DuplexShared>,
    processor: Arc<Mutex<Option<NoiseProcessor>>>,
    virt_out_sr: u32,
    meter: Arc<AtomicU32>,
) -> Result<cpal::Stream> {
    let stream = device.build_input_stream(
        config,
        move |data: &[f32], _| {
            let mut float_samples: Vec<f32> = data.iter().map(|s| *s * 32768.0).collect();
            if channels > 1 {
                float_samples = stereo_to_mono(&float_samples);
            }
            let uplink: Vec<f32> = if noise_cancel_enabled {
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
                    let at_virt = resample_mono(&frame[..], DENOISE_SAMPLE_RATE, virt_out_sr);
                    out_chunks.extend(at_virt);
                }
                out_chunks
            } else {
                resample_mono(&float_samples, device_sample_rate, virt_out_sr)
            };
            if uplink.is_empty() {
                return;
            }
            store_meter_peak(&meter, &uplink);
            push_ring(&shared.to_meet_ring, &uplink);
            let left_wav = resample_mono(&uplink, virt_out_sr, WAV_SR);
            write_stereo_from_mic_chunk(&shared, &left_wav);
        },
        |e| log::error!("Duplex mic input: {}", e),
        None,
    )?;
    Ok(stream)
}

fn build_virtual_in_duplex_f32(
    device: &cpal::Device,
    config: &StreamConfig,
    vi_sr: u32,
    channels: u16,
    sp_sr: u32,
    shared: Arc<DuplexShared>,
) -> Result<cpal::Stream> {
    let stream = device.build_input_stream(
        config,
        move |data: &[f32], _| {
            let mut float_samples: Vec<f32> = data.iter().map(|s| *s * 32768.0).collect();
            if channels > 1 {
                float_samples = stereo_to_mono(&float_samples);
            }
            let at_wav = resample_mono(&float_samples, vi_sr, WAV_SR);
            push_remote_capped(&shared.remote_at_wav, &at_wav);
            let to_spk = resample_mono(&float_samples, vi_sr, sp_sr);
            push_ring(&shared.to_speaker_ring, &to_spk);
        },
        |e| log::error!("Duplex virtual input: {}", e),
        None,
    )?;
    Ok(stream)
}

fn build_output_from_ring_f32(
    device: &cpal::Device,
    config: &StreamConfig,
    out_channels: usize,
    ring: Arc<Mutex<VecDeque<f32>>>,
) -> Result<cpal::Stream> {
    let ch = out_channels.max(1);
    let stream = device.build_output_stream(
        config,
        move |data: &mut [f32], _| {
            let total = data.len();
            let mono_n = total / ch;
            let mut q = ring.lock().unwrap();
            for i in 0..mono_n {
                let m = q.pop_front().unwrap_or(0.0);
                let norm = (m / 32768.0).clamp(-1.0, 1.0);
                for c in 0..ch {
                    data[i * ch + c] = norm;
                }
            }
        },
        |e| log::error!("Duplex output: {}", e),
        None,
    )?;
    Ok(stream)
}

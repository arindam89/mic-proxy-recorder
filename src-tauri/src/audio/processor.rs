//! Noise cancellation processing using nnnoiseless (RNNoise).

use nnnoiseless::DenoiseState;

/// The sample rate nnnoiseless operates at (48 kHz).
pub const DENOISE_SAMPLE_RATE: u32 = 48000;
/// Frame size required by nnnoiseless (480 samples = 10 ms at 48 kHz).
pub const FRAME_SIZE: usize = DenoiseState::FRAME_SIZE;

pub struct NoiseProcessor {
    state: Box<DenoiseState<'static>>,
    level: f32,
}

impl NoiseProcessor {
    pub fn new(level: f32) -> Self {
        Self {
            state: DenoiseState::new(),
            level: level.clamp(0.0, 1.0),
        }
    }

    /// Process a frame of exactly FRAME_SIZE f32 samples in-place.
    /// Input and output are float PCM in the range [-32768.0, 32767.0].
    pub fn process_frame(&mut self, samples: &mut [f32; FRAME_SIZE]) {
        if self.level < f32::EPSILON {
            return;
        }

        let mut output = [0.0f32; FRAME_SIZE];
        self.state.process_frame(&mut output, samples);

        for (i, s) in samples.iter_mut().enumerate() {
            *s = *s * (1.0 - self.level) + output[i] * self.level;
        }
    }
}

/// Convert a NoiseCancelLevel string to a processing blend factor.
pub fn level_to_factor(level: &str) -> f32 {
    match level {
        "off" => 0.0,
        "low" => 0.4,
        "medium" => 0.75,
        "high" => 1.0,
        _ => 0.75,
    }
}

/// Resample a mono f32 stream from `from_rate` to `to_rate` using linear interpolation.
pub fn resample_mono(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return input.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (input.len() as f64 / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 * ratio;
        let src_idx = src_pos as usize;
        let frac = (src_pos - src_idx as f64) as f32;
        let a = input.get(src_idx).copied().unwrap_or(0.0);
        let b = input.get(src_idx + 1).copied().unwrap_or(0.0);
        output.push(a + (b - a) * frac);
    }
    output
}

/// Convert stereo interleaved f32 to mono by averaging channels.
pub fn stereo_to_mono(stereo: &[f32]) -> Vec<f32> {
    stereo
        .chunks(2)
        .map(|ch| (ch[0] + ch.get(1).copied().unwrap_or(ch[0])) / 2.0)
        .collect()
}

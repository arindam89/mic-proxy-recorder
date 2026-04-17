use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub noise_cancel_enabled: bool,
    pub noise_cancel_level: NoiseCancelLevel,
    pub input_device_id: Option<String>,
    pub output_format: OutputFormat,
    pub model_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NoiseCancelLevel {
    Off,
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Wav,
    Flac,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            noise_cancel_enabled: true,
            noise_cancel_level: NoiseCancelLevel::Medium,
            input_device_id: None,
            output_format: OutputFormat::Wav,
            model_path: None,
        }
    }
}

impl Settings {
    pub fn load_or_default() -> Self {
        Self::default()
    }

    pub fn save(&self) -> anyhow::Result<()> {
        Ok(())
    }
}

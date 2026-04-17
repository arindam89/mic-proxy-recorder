use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub noise_cancel_enabled: bool,
    pub noise_cancel_level: NoiseCancelLevel,
    pub input_device_id: Option<String>,
    pub output_format: OutputFormat,
    /// Whisper GGUF model file path (when using Whisper backend).
    pub model_path: Option<String>,
    #[serde(default)]
    pub transcription_backend: TranscriptionBackend,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TranscriptionBackend {
    Whisper,
    Parakeet,
}

impl Default for TranscriptionBackend {
    fn default() -> Self {
        Self::Whisper
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            noise_cancel_enabled: true,
            noise_cancel_level: NoiseCancelLevel::Medium,
            input_device_id: None,
            output_format: OutputFormat::Wav,
            model_path: None,
            transcription_backend: TranscriptionBackend::Whisper,
        }
    }
}

impl Settings {
    fn file_path(app: &AppHandle) -> Result<PathBuf, String> {
        app.path()
            .app_data_dir()
            .map(|p| p.join("settings.json"))
            .map_err(|e| e.to_string())
    }

    pub fn load_from_disk(app: &AppHandle) -> Result<Self, String> {
        let path = Self::file_path(app)?;
        if !path.exists() {
            return Ok(Self::default());
        }
        let data = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    }

    pub fn save_to_disk(&self, app: &AppHandle) -> anyhow::Result<()> {
        let path = Self::file_path(app).map_err(|e| anyhow::anyhow!(e))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let data = serde_json::to_string_pretty(self)?;
        std::fs::write(path, data)?;
        Ok(())
    }
}

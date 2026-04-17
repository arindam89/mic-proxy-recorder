use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// List all available audio input devices on the system.
pub fn list_input_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_device = host.default_input_device();
    let default_name = default_device
        .as_ref()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let devices = host
        .input_devices()
        .context("Failed to enumerate input devices")?;

    let mut result = Vec::new();
    for device in devices {
        let name = device.name().unwrap_or_else(|_| "Unknown device".into());
        let is_default = name == default_name;
        result.push(AudioDevice {
            id: name.clone(),
            name,
            is_default,
        });
    }

    Ok(result)
}

/// List output (playback) devices — useful when documenting Multi-Output / aggregate setups.
pub fn list_output_devices() -> Result<Vec<AudioDevice>> {
    let host = cpal::default_host();
    let default_device = host.default_output_device();
    let default_name = default_device
        .as_ref()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let devices = host
        .output_devices()
        .context("Failed to enumerate output devices")?;

    let mut result = Vec::new();
    for device in devices {
        let name = device.name().unwrap_or_else(|_| "Unknown device".into());
        let is_default = name == default_name;
        result.push(AudioDevice {
            id: name.clone(),
            name,
            is_default,
        });
    }

    Ok(result)
}

/// Get the default input device, or the device matching `device_id`.
pub fn get_input_device(device_id: Option<&str>) -> Result<cpal::Device> {
    let host = cpal::default_host();

    if let Some(id) = device_id {
        let devices = host
            .input_devices()
            .context("Failed to enumerate input devices")?;
        for device in devices {
            if let Ok(name) = device.name() {
                if name == id {
                    return Ok(device);
                }
            }
        }
        anyhow::bail!("Audio device '{}' not found", id);
    } else {
        host.default_input_device()
            .context("No default input device available")
    }
}

/// Output (playback) device by exact name, or default when `device_id` is `None`.
pub fn get_output_device(device_id: Option<&str>) -> Result<cpal::Device> {
    let host = cpal::default_host();

    if let Some(id) = device_id {
        let devices = host
            .output_devices()
            .context("Failed to enumerate output devices")?;
        for device in devices {
            if let Ok(name) = device.name() {
                if name == id {
                    return Ok(device);
                }
            }
        }
        anyhow::bail!("Output device '{}' not found", id);
    } else {
        host.default_output_device()
            .context("No default output device available")
    }
}

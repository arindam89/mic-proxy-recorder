use crate::audio::{capture::list_input_devices, recorder::start_recording as audio_start_recording};
use crate::settings::Settings;
use crate::state::AppState;
use crate::transcription::whisper::transcribe;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

type AppStateHandle = Arc<Mutex<AppState>>;

#[tauri::command]
pub async fn list_audio_devices(
    state: State<'_, AppStateHandle>,
) -> Result<Vec<crate::audio::capture::AudioDevice>, String> {
    let _s = state.lock().await;
    list_input_devices().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_recording(
    app: AppHandle,
    state: State<'_, AppStateHandle>,
    device_id: Option<String>,
    noise_cancel_enabled: bool,
    noise_cancel_level: String,
    output_format: String,
) -> Result<(), String> {
    let mut s = state.lock().await;
    if s.recorder.is_some() {
        return Err("Already recording".into());
    }

    let recordings_dir = get_recordings_dir(&app);
    let handle = audio_start_recording(
        device_id.as_deref(),
        noise_cancel_enabled,
        &noise_cancel_level,
        recordings_dir,
    )
    .map_err(|e| e.to_string())?;

    let recording = handle.recording.clone();
    s.recorder = Some(handle);

    app.emit("recording-started", serde_json::json!({ "recording": recording }))
        .map_err(|e| e.to_string())?;

    // suppress unused variable warning
    let _ = output_format;

    Ok(())
}

#[tauri::command]
pub async fn stop_recording(
    app: AppHandle,
    state: State<'_, AppStateHandle>,
) -> Result<(), String> {
    let mut s = state.lock().await;
    let handle = s.recorder.take().ok_or("Not recording")?;
    let recording = handle.stop().map_err(|e| e.to_string())?;

    let _ = append_recording_to_list(&app, &recording);

    app.emit("recording-stopped", serde_json::json!({ "recording": recording }))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn toggle_pause_recording(
    state: State<'_, AppStateHandle>,
) -> Result<(), String> {
    let s = state.lock().await;
    let handle = s.recorder.as_ref().ok_or("Not recording")?;
    handle.toggle_pause();
    Ok(())
}

#[tauri::command]
pub async fn transcribe_recording(
    app: AppHandle,
    recording_path: String,
    model_path: String,
) -> Result<(), String> {
    let recording_id = std::path::Path::new(&recording_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    tokio::task::spawn_blocking(move || {
        let result = transcribe(
            std::path::Path::new(&recording_path),
            std::path::Path::new(&model_path),
            &recording_id,
        );

        match result {
            Ok(transcript) => {
                let _ = app.emit(
                    "transcription-done",
                    serde_json::json!({ "transcript": transcript }),
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "transcription-error",
                    serde_json::json!({ "message": e.to_string() }),
                );
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn list_recordings(
    app: AppHandle,
) -> Result<Vec<crate::audio::recorder::Recording>, String> {
    load_recordings_list(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_recording(
    app: AppHandle,
    recording_id: String,
) -> Result<(), String> {
    let mut recordings = load_recordings_list(&app).map_err(|e| e.to_string())?;
    if let Some(pos) = recordings.iter().position(|r| r.id == recording_id) {
        let path = recordings[pos].path.clone();
        recordings.remove(pos);
        let _ = std::fs::remove_file(&path);
        save_recordings_list(&app, &recordings).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppStateHandle>) -> Result<Settings, String> {
    let s = state.lock().await;
    Ok(s.settings.clone())
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppStateHandle>,
    settings: Settings,
) -> Result<(), String> {
    let mut s = state.lock().await;
    settings.save().map_err(|e| e.to_string())?;
    s.settings = settings;
    Ok(())
}

fn get_recordings_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("recordings")
}

fn recordings_list_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("recordings.json")
}

fn load_recordings_list(app: &AppHandle) -> anyhow::Result<Vec<crate::audio::recorder::Recording>> {
    let path = recordings_list_path(app);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&json)?)
}

fn save_recordings_list(
    app: &AppHandle,
    recordings: &[crate::audio::recorder::Recording],
) -> anyhow::Result<()> {
    let path = recordings_list_path(app);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(recordings)?;
    std::fs::write(path, json)?;
    Ok(())
}

fn append_recording_to_list(
    app: &AppHandle,
    recording: &crate::audio::recorder::Recording,
) -> anyhow::Result<()> {
    let mut recordings = load_recordings_list(app)?;
    recordings.insert(0, recording.clone());
    save_recordings_list(app, &recordings)
}

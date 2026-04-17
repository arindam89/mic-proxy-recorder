mod audio;
mod commands;
mod settings;
mod state;
mod transcription;

use commands::*;
use settings::Settings;
use state::AppState;
use std::sync::Arc;
use tokio::sync::Mutex;

pub fn run() {
    env_logger::init();

    let state = Arc::new(Mutex::new(AppState::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .manage(state.clone())
        .setup(move |app| {
            let loaded = match Settings::load_from_disk(app.handle()) {
                Ok(s) => s,
                Err(e) => {
                    log::warn!("Failed to load settings from disk ({}); using defaults", e);
                    Settings::default()
                }
            };
            tauri::async_runtime::block_on(async {
                let mut g = state.lock().await;
                g.settings = loaded;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            list_playback_devices,
            get_recording_meter,
            start_recording,
            stop_recording,
            toggle_pause_recording,
            transcribe_recording,
            list_recordings,
            delete_recording,
            rename_recording,
            export_recording,
            get_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

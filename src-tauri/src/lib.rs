mod audio;
mod commands;
mod settings;
mod state;
mod transcription;

use commands::*;
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
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            start_recording,
            stop_recording,
            toggle_pause_recording,
            transcribe_recording,
            list_recordings,
            delete_recording,
            get_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

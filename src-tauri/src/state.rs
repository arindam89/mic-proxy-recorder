use crate::audio::recorder::RecorderHandle;
use crate::settings::Settings;

pub struct AppState {
    pub recorder: Option<RecorderHandle>,
    pub settings: Settings,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            recorder: None,
            settings: Settings::load_or_default(),
        }
    }
}

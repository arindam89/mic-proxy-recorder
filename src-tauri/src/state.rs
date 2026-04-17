use crate::audio::meeting_bridge::MeetingBridgeHandle;
use crate::audio::recorder::RecorderHandle;
use crate::settings::Settings;

pub struct AppState {
    pub recorder: Option<RecorderHandle>,
    pub meeting_bridge: Option<MeetingBridgeHandle>,
    pub settings: Settings,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            recorder: None,
            meeting_bridge: None,
            settings: Settings::default(),
        }
    }
}

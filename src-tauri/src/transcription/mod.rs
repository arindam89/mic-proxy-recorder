pub mod parakeet;
pub mod whisper;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    pub recording_id: String,
    pub text: String,
    pub segments: Vec<TranscriptSegment>,
    pub language: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub id: i32,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

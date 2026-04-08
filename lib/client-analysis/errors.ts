// Enum-like error codes for client analysis failures.
// NEVER put raw model output or PII into these codes — they're stored in
// session_client_insights.error column (visible to admins via RLS).

export type AnalysisErrorCode =
  | 'file_too_large'
  | 'download_failed'
  | 'whisper_api_error'
  | 'claude_api_error'
  | 'invalid_json_response'
  | 'no_client_tracks'
  | 'insufficient_consent'
  | 'identify_speakers_failed'
  | 'unknown';

export class AnalysisError extends Error {
  constructor(public code: AnalysisErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AnalysisError';
  }
}

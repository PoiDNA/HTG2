export type RateLimitAction =
  | 'admin_user_search'
  | 'recordings_participants'
  | 'recordings_assign_single'
  | 'recordings_assign_bulk'
  | 'recordings_remove_access'
  | 'booking_recording_token'
  | 'fragment_token'
  | 'share_token_lookup';

export interface RateLimitActionConfig {
  /** Max requests allowed in the window. */
  max: number;
  /** Window size in minutes. */
  windowMinutes: number;
}

-- Change community notification defaults to OFF for all users
-- and update existing records that still have the old defaults

-- 1. Change column defaults
ALTER TABLE community_user_preferences
  ALTER COLUMN email_digest SET DEFAULT 'off',
  ALTER COLUMN push_enabled SET DEFAULT false,
  ALTER COLUMN push_comments SET DEFAULT false,
  ALTER COLUMN push_mentions SET DEFAULT false;

-- 2. Update ALL existing records to disabled
UPDATE community_user_preferences
SET
  email_digest = 'off',
  push_enabled = false,
  push_comments = false,
  push_mentions = false,
  push_reactions = false,
  updated_at = now();

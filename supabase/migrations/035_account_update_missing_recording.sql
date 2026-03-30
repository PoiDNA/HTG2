-- Add 'missing_recording' to allowed categories for account_update_requests
ALTER TABLE public.account_update_requests
  DROP CONSTRAINT IF EXISTS account_update_requests_category_check;

ALTER TABLE public.account_update_requests
  ADD CONSTRAINT account_update_requests_category_check
  CHECK (category IN (
    'session_single', 'session_monthly', 'session_yearly',
    'individual_1on1', 'individual_asysta', 'individual_para',
    'missing_recording'
  ));

-- Migration 028: Add zoom_url to booking_slots for per-session Zoom links
ALTER TABLE public.booking_slots ADD COLUMN IF NOT EXISTS zoom_url TEXT;

COMMENT ON COLUMN public.booking_slots.zoom_url IS 'Fixed Zoom meeting URL for this session slot';

-- Migration 004: Natalia-first slot model
-- =========================================
-- Assistants no longer set their own availability.
-- Only Natalia defines start times; assistants "join" her slots.
-- booking_slots gains assistant_id to track which assistant joined.

-- Add assistant tracking to booking_slots
ALTER TABLE public.booking_slots
  ADD COLUMN IF NOT EXISTS assistant_id UUID REFERENCES public.staff_members(id);

-- Index for assistant lookups
CREATE INDEX IF NOT EXISTS idx_slots_assistant ON public.booking_slots(assistant_id)
  WHERE assistant_id IS NOT NULL;

-- RLS: staff members can read slots relevant to their role
-- (Existing policies: slots_user_read + slots_admin_all remain)
-- Add policy for staff members to see all available slots (for joining)
CREATE POLICY slots_staff_read ON public.booking_slots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Allow staff to update slots they are assigned to (for join/leave)
CREATE POLICY slots_staff_update ON public.booking_slots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Allow practitioners to insert slots
CREATE POLICY slots_staff_insert ON public.booking_slots FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_members
      WHERE user_id = auth.uid() AND is_active = true AND role = 'practitioner'
    )
  );

-- Allow practitioners to delete their available slots
CREATE POLICY slots_staff_delete ON public.booking_slots FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_members
      WHERE user_id = auth.uid() AND is_active = true AND role = 'practitioner'
    )
    AND status = 'available'
  );

COMMENT ON COLUMN public.booking_slots.assistant_id IS
'References the assistant (Agata/Justyna) who joined this slot.
NULL = natalia_solo (2h). When set, session_type becomes natalia_agata or natalia_justyna (1.5h).';

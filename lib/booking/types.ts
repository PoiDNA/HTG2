export type SessionType = 'natalia_solo' | 'natalia_agata' | 'natalia_justyna' | 'natalia_przemek' | 'pre_session' | 'natalia_para' | 'natalia_asysta' | 'natalia_interpreter';
export type PaymentStatus = 'confirmed_paid' | 'installments' | 'partial_payment' | 'pending_verification';
export type StaffRole = 'practitioner' | 'assistant';
export type SlotStatus = 'available' | 'held' | 'booked' | 'completed' | 'cancelled';
export type BookingStatus = 'pending_confirmation' | 'confirmed' | 'completed' | 'cancelled' | 'transferred';
export type AccelerationStatus = 'waiting' | 'offered' | 'accepted' | 'expired' | 'cancelled';

export interface StaffMember {
  id: string;
  user_id: string | null;
  name: string;
  slug: string;
  role: StaffRole;
  session_types: SessionType[];
  email: string | null;
  is_active: boolean;
}

export interface AvailabilityRule {
  id: string;
  staff_id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  start_time: string;  // HH:MM
  end_time: string;
  is_active: boolean;
  solo_only: boolean;  // true = 1:1 only, assistants cannot join
}

export interface AvailabilityException {
  id: string;
  staff_id: string;
  exception_date: string; // YYYY-MM-DD
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
}

export interface BookingSlot {
  id: string;
  session_type: SessionType;
  slot_date: string;    // YYYY-MM-DD
  start_time: string;   // HH:MM
  end_time: string;
  status: SlotStatus;
  held_for_user: string | null;
  held_until: string | null;
  is_extra: boolean;
  notes: string | null;
  assistant_id: string | null;
  created_at: string;
  // Joined data
  assistant?: Pick<StaffMember, 'id' | 'name' | 'slug' | 'role'>;
}

export interface Booking {
  id: string;
  user_id: string;
  slot_id: string;
  session_type: SessionType;
  order_id: string | null;
  entitlement_id: string | null;
  status: BookingStatus;
  topics: string | null;
  assigned_at: string;
  confirmed_at: string | null;
  expires_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  live_session_id: string | null;
  payment_status: PaymentStatus;
  payment_comment: string | null;
  // Joined data
  slot?: BookingSlot;
  user?: { email: string; display_name: string };
  // Payment info (from orders)
  orders?: {
    id: string;
    total_amount: number;
    status: string;
    created_at: string;
    metadata?: {
      payment_mode?: string;
      installment_number?: string;
      installments_total?: string;
      total_amount?: string;
    };
  }[];
}

export interface AccelerationEntry {
  id: string;
  user_id: string;
  session_type: SessionType;
  booking_id: string | null;
  priority: number;
  status: AccelerationStatus;
  offered_slot_id: string | null;
  offered_at: string | null;
  responded_at: string | null;
  notes: string | null;
  // Joined
  booking?: Booking;
  offered_slot?: BookingSlot;
  user?: { email: string; display_name: string };
}

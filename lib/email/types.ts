// ============================================================
// HTG Communication Hub — Type definitions
// ============================================================

export interface CustomerCard {
  userId: string | null;
  email: string;
  displayName: string | null;
  role: string | null;
  createdAt: string | null;
  isGuest: boolean;
  // Only populated when user_link_verified = true
  recentOrders?: { id: string; status: string; amount: number; created_at: string }[];
  activeEntitlements?: { type: string; valid_until: string; product_name: string }[];
  upcomingBookings?: { slot_date: string; start_time: string; session_type: string; status: string }[];
  totalBookings?: number;
  hasActiveSubscription?: boolean;
  recentThreads?: { subject: string; status: string; last_message_at: string }[];
}

export interface Conversation {
  id: string;
  mailbox_id: string | null;
  channel: 'email' | 'sms' | 'internal';
  subject: string | null;
  from_address: string;
  from_name: string | null;
  to_address: string | null;
  user_id: string | null;
  user_link_verified: boolean;
  user_link_method: 'auto_spf' | 'manual' | 'magic_link' | null;
  status: 'open' | 'pending' | 'closed' | 'spam';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  ai_category: string | null;
  ai_sentiment: string | null;
  ai_summary: string | null;
  ai_suggested_reply: string | null;
  assigned_to: string | null;
  tags: string[];
  last_message_at: string;
  created_at: string;
  // Joined data
  messages?: Message[];
  customerCard?: CustomerCard;
  mailbox?: Mailbox;
}

export interface Message {
  id: string;
  conversation_id: string;
  channel: string;
  direction: 'inbound' | 'outbound' | 'internal';
  from_address: string;
  to_address: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  provider_metadata: Record<string, any>;
  provider_message_id: string | null;
  smtp_message_id: string | null;
  smtp_in_reply_to: string | null;
  smtp_references: string[];
  cc: string[];
  bcc: string[];
  sent_by: string | null;
  template_id: string | null;
  has_attachments: boolean;
  attachments: AttachmentMeta[];
  processing_status: 'pending' | 'processing' | 'done' | 'failed' | 'spam';
  locked_until: string | null;
  retry_count: number;
  created_at: string;
}

export interface AttachmentMeta {
  filename: string;
  content_type: string;
  size: number;
  bunny_path: string;
}

export interface Mailbox {
  id: string;
  address: string;
  name: string;
  channel: string;
  is_default: boolean;
  is_active: boolean;
}

export interface InboundWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    reply_to?: string;
    subject: string;
    message_id?: string;
    headers?: Record<string, string>;
    attachments?: { filename: string; content_type: string; content_disposition: string }[];
  };
}

export interface AIAnalysisResult {
  category: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  suggestedReply: string;
  suggestedPriority: 'low' | 'normal' | 'high' | 'urgent';
}

export interface ThreadFilter {
  status?: string;
  priority?: string;
  category?: string;
  mailbox_id?: string;
  assigned_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

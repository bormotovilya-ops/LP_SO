export type CrmRole = "admin" | "manager" | "viewer";

export type CrmProfileRow = {
  id: string;
  role: CrmRole;
  display_name: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type LeadTemperature = "cold" | "warm" | "hot";

export type CrmContactRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  telegram_id: number | null;
  source_channel: string;
  source_detail?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  segment?: string | null;
  lead_temperature?: LeadTemperature;
  is_duplicate?: boolean;
  consent_personal_data?: boolean;
  current_stage_id: string | null;
  owner_user_id: string | null;
  last_activity_at: string | null;
  next_action_at: string | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmPipelineStageRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

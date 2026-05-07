// supabase/types.ts
//
// Hand-typed mirror of the schema defined by
// `supabase/migrations/20260506184634_0001_initial_schema.sql`.
//
// REGENERATE this file with the Supabase CLI once it's installed:
//
//   supabase gen types typescript --local > supabase/types.ts
//
// Until then, this file is the source of truth for client typings. Keep
// it in sync with the migration if you make schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      units: {
        Row: {
          id: string;
          name: string;
          stake_name: string | null;
          unit_number: string | null;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          stake_name?: string | null;
          unit_number?: string | null;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          stake_name?: string | null;
          unit_number?: string | null;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      unit_memberships: {
        Row: {
          id: string;
          user_id: string;
          unit_id: string;
          role: Database["public"]["Enums"]["unit_membership_role"];
          calling_title: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          unit_id: string;
          role?: Database["public"]["Enums"]["unit_membership_role"];
          calling_title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          unit_id?: string;
          role?: Database["public"]["Enums"]["unit_membership_role"];
          calling_title?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          unit_id: string;
          quorum_class: Database["public"]["Enums"]["quorum_class"];
          first_name: string;
          last_name: string;
          preferred_name: string | null;
          birthdate: string;
          parent_contacts: Json;
          notes: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          quorum_class: Database["public"]["Enums"]["quorum_class"];
          first_name: string;
          last_name: string;
          preferred_name?: string | null;
          birthdate: string;
          parent_contacts?: Json;
          notes?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          quorum_class?: Database["public"]["Enums"]["quorum_class"];
          first_name?: string;
          last_name?: string;
          preferred_name?: string | null;
          birthdate?: string;
          parent_contacts?: Json;
          notes?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      activities: {
        Row: {
          id: string;
          unit_id: string;
          quorum_class: Database["public"]["Enums"]["quorum_class"];
          title: string;
          description: string | null;
          starts_at: string;
          ends_at: string | null;
          location: string | null;
          category: Database["public"]["Enums"]["activity_category"];
          planned_by: string | null;
          status: Database["public"]["Enums"]["activity_status"];
          ai_suggested: boolean;
          source_suggestion_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          quorum_class: Database["public"]["Enums"]["quorum_class"];
          title: string;
          description?: string | null;
          starts_at: string;
          ends_at?: string | null;
          location?: string | null;
          category: Database["public"]["Enums"]["activity_category"];
          planned_by?: string | null;
          status?: Database["public"]["Enums"]["activity_status"];
          ai_suggested?: boolean;
          source_suggestion_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          quorum_class?: Database["public"]["Enums"]["quorum_class"];
          title?: string;
          description?: string | null;
          starts_at?: string;
          ends_at?: string | null;
          location?: string | null;
          category?: Database["public"]["Enums"]["activity_category"];
          planned_by?: string | null;
          status?: Database["public"]["Enums"]["activity_status"];
          ai_suggested?: boolean;
          source_suggestion_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          unit_id: string;
          activity_id: string;
          member_id: string;
          status: Database["public"]["Enums"]["attendance_status"];
          absence_reason_kind:
            | Database["public"]["Enums"]["absence_reason_kind"]
            | null;
          absence_reason_note: string | null;
          recorded_by: string | null;
          recorded_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          activity_id: string;
          member_id: string;
          status?: Database["public"]["Enums"]["attendance_status"];
          absence_reason_kind?:
            | Database["public"]["Enums"]["absence_reason_kind"]
            | null;
          absence_reason_note?: string | null;
          recorded_by?: string | null;
          recorded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          activity_id?: string;
          member_id?: string;
          status?: Database["public"]["Enums"]["attendance_status"];
          absence_reason_kind?:
            | Database["public"]["Enums"]["absence_reason_kind"]
            | null;
          absence_reason_note?: string | null;
          recorded_by?: string | null;
          recorded_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lessons: {
        Row: {
          id: string;
          unit_id: string;
          quorum_class: Database["public"]["Enums"]["quorum_class"];
          taught_on: string;
          manual: string;
          manual_reference: string;
          teacher_user_id: string | null;
          outline: Json | null;
          notes: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          quorum_class: Database["public"]["Enums"]["quorum_class"];
          taught_on: string;
          manual: string;
          manual_reference: string;
          teacher_user_id?: string | null;
          outline?: Json | null;
          notes?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          quorum_class?: Database["public"]["Enums"]["quorum_class"];
          taught_on?: string;
          manual?: string;
          manual_reference?: string;
          teacher_user_id?: string | null;
          outline?: Json | null;
          notes?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      usage_events: {
        Row: {
          id: string;
          unit_id: string;
          agent_name: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_creation_tokens: number;
          latency_ms: number;
          request_hash: string;
          user_hash: string;
          redaction_summary: Json;
          error_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          agent_name: string;
          model: string;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          cache_creation_tokens?: number;
          latency_ms?: number;
          request_hash: string;
          user_hash: string;
          redaction_summary?: Json;
          error_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          agent_name?: string;
          model?: string;
          input_tokens?: number;
          output_tokens?: number;
          cache_read_tokens?: number;
          cache_creation_tokens?: number;
          latency_ms?: number;
          request_hash?: string;
          user_hash?: string;
          redaction_summary?: Json;
          error_code?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          unit_id: string;
          actor_user_id: string | null;
          action: string;
          target_table: string;
          target_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          actor_user_id?: string | null;
          action: string;
          target_table: string;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          actor_user_id?: string | null;
          action?: string;
          target_table?: string;
          target_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      agent_suggestions: {
        Row: {
          id: string;
          unit_id: string;
          agent_name: string;
          input_hash: string;
          output: Json;
          accepted_by: string | null;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          agent_name: string;
          input_hash: string;
          output: Json;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          agent_name?: string;
          input_hash?: string;
          output?: Json;
          accepted_by?: string | null;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          unit_id: string;
          email: string;
          role: Database["public"]["Enums"]["unit_membership_role"];
          calling_title: string | null;
          invited_by: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          unit_id: string;
          email: string;
          role: Database["public"]["Enums"]["unit_membership_role"];
          calling_title?: string | null;
          invited_by: string;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          unit_id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["unit_membership_role"];
          calling_title?: string | null;
          invited_by?: string;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      accept_pending_invitations: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: {
      unit_membership_role: "leader" | "presidency" | "admin";
      quorum_class:
        | "deacons"
        | "teachers"
        | "priests"
        | "yw_12_13"
        | "yw_14_15"
        | "yw_16_17"
        | "sunday_school";
      activity_category:
        | "spiritual"
        | "service"
        | "social"
        | "physical"
        | "skill";
      activity_status: "draft" | "confirmed" | "completed" | "cancelled";
      attendance_status: "present" | "excused" | "absent" | "unknown";
      absence_reason_kind:
        | "sports"
        | "family_event"
        | "travel"
        | "sick"
        | "work"
        | "school_event"
        | "no_response"
        | "unknown"
        | "other";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

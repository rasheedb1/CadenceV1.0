export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      cadences: {
        Row: {
          id: string
          user_id: string
          name: string
          status: 'draft' | 'active'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          status?: 'draft' | 'active'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          status?: 'draft' | 'active'
          created_at?: string
          updated_at?: string
        }
      }
      cadence_steps: {
        Row: {
          id: string
          cadence_id: string
          type: 'send_email' | 'send_email_business_case' | 'linkedin_message' | 'linkedin_connect' | 'linkedin_like' | 'linkedin_comment' | 'whatsapp_message' | 'call_manual'
          label: string
          day_offset: number
          order_in_day: number
          template_id: string | null
          status: 'locked' | 'available' | 'completed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cadence_id: string
          type: 'send_email' | 'send_email_business_case' | 'linkedin_message' | 'linkedin_connect' | 'linkedin_like' | 'linkedin_comment' | 'whatsapp_message' | 'call_manual'
          label: string
          day_offset: number
          order_in_day: number
          template_id?: string | null
          status?: 'locked' | 'available' | 'completed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cadence_id?: string
          type?: 'send_email' | 'send_email_business_case' | 'linkedin_message' | 'linkedin_connect' | 'linkedin_like' | 'linkedin_comment' | 'whatsapp_message' | 'call_manual'
          label?: string
          day_offset?: number
          order_in_day?: number
          template_id?: string | null
          status?: 'locked' | 'available' | 'completed'
          created_at?: string
          updated_at?: string
        }
      }
      leads: {
        Row: {
          id: string
          user_id: string
          first_name: string
          last_name: string
          email: string | null
          company: string | null
          title: string | null
          linkedin_url: string | null
          phone: string | null
          cadence_id: string | null
          current_step_id: string | null
          status: 'active' | 'pending' | 'generated' | 'sent' | 'failed' | 'paused' | 'scheduled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          first_name: string
          last_name: string
          email?: string | null
          company?: string | null
          title?: string | null
          linkedin_url?: string | null
          phone?: string | null
          cadence_id?: string | null
          current_step_id?: string | null
          status?: 'active' | 'pending' | 'generated' | 'sent' | 'failed' | 'paused' | 'scheduled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          first_name?: string
          last_name?: string
          email?: string | null
          company?: string | null
          title?: string | null
          linkedin_url?: string | null
          phone?: string | null
          cadence_id?: string | null
          current_step_id?: string | null
          status?: 'active' | 'pending' | 'generated' | 'sent' | 'failed' | 'paused' | 'scheduled'
          created_at?: string
          updated_at?: string
        }
      }
      schedules: {
        Row: {
          id: string
          cadence_id: string
          cadence_step_id: string
          lead_id: string
          scheduled_at: string
          timezone: string
          status: 'scheduled' | 'executed' | 'canceled' | 'skipped_due_to_state_change' | 'failed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cadence_id: string
          cadence_step_id: string
          lead_id: string
          scheduled_at: string
          timezone?: string
          status?: 'scheduled' | 'executed' | 'canceled' | 'skipped_due_to_state_change' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cadence_id?: string
          cadence_step_id?: string
          lead_id?: string
          scheduled_at?: string
          timezone?: string
          status?: 'scheduled' | 'executed' | 'canceled' | 'skipped_due_to_state_change' | 'failed'
          created_at?: string
          updated_at?: string
        }
      }
      templates: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'send_email' | 'send_email_business_case' | 'linkedin_message' | 'linkedin_connect' | 'linkedin_like' | 'linkedin_comment' | 'whatsapp_message' | 'call_manual'
          subject: string | null
          body: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: 'send_email' | 'send_email_business_case' | 'linkedin_message' | 'linkedin_connect' | 'linkedin_like' | 'linkedin_comment' | 'whatsapp_message' | 'call_manual'
          subject?: string | null
          body: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'send_email' | 'send_email_business_case' | 'linkedin_message' | 'linkedin_connect' | 'linkedin_like' | 'linkedin_comment' | 'whatsapp_message' | 'call_manual'
          subject?: string | null
          body?: string
          created_at?: string
          updated_at?: string
        }
      }
      linkedin_conversations: {
        Row: {
          id: string
          lead_id: string
          status: 'not_messaged' | 'awaiting_reply' | 'replied' | 'failed'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          status?: 'not_messaged' | 'awaiting_reply' | 'replied' | 'failed'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          status?: 'not_messaged' | 'awaiting_reply' | 'replied' | 'failed'
          created_at?: string
          updated_at?: string
        }
      }
      linkedin_messages: {
        Row: {
          id: string
          conversation_id: string
          direction: 'inbound' | 'outbound'
          content: string
          status: 'pending' | 'sent' | 'delivered' | 'failed'
          sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          direction: 'inbound' | 'outbound'
          content: string
          status?: 'pending' | 'sent' | 'delivered' | 'failed'
          sent_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          direction?: 'inbound' | 'outbound'
          content?: string
          status?: 'pending' | 'sent' | 'delivered' | 'failed'
          sent_at?: string | null
          created_at?: string
        }
      }
      activity_logs: {
        Row: {
          id: string
          user_id: string
          lead_id: string | null
          cadence_id: string | null
          step_id: string | null
          action: string
          result: string | null
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          lead_id?: string | null
          cadence_id?: string | null
          step_id?: string | null
          action: string
          result?: string | null
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string | null
          cadence_id?: string | null
          step_id?: string | null
          action?: string
          result?: string | null
          details?: Json | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      schema_assets: {
        Row: {
          checksum: string
          created_at: string
          id: string
          key: string
          name: string
          owner_id: string
          size: number
          state: string
          type: string
        }
        Insert: {
          checksum: string
          created_at?: string
          id: string
          key: string
          name: string
          owner_id: string
          size: number
          state?: string
          type: string
        }
        Update: {
          checksum?: string
          created_at?: string
          id?: string
          key?: string
          name?: string
          owner_id?: string
          size?: number
          state?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "schema_assets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "schema_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_consent_choices: {
        Row: {
          enabled: boolean
          notice_version: string
          owner_id: string
          purpose: string
          updated_at: string
        }
        Insert: {
          enabled: boolean
          notice_version: string
          owner_id: string
          purpose: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          notice_version?: string
          owner_id?: string
          purpose?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schema_consent_choices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "schema_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_consent_events: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          notice_version: string
          owner_id: string
          purpose: string
        }
        Insert: {
          created_at?: string
          enabled: boolean
          id?: string
          notice_version: string
          owner_id: string
          purpose: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          notice_version?: string
          owner_id?: string
          purpose?: string
        }
        Relationships: [
          {
            foreignKeyName: "schema_consent_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "schema_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_entries: {
        Row: {
          ai_allowed: boolean
          blocks: Json
          body: string
          created_at: string
          date: string
          favorite: boolean
          id: string
          layout: string
          mood: string
          owner_id: string
          people: Json
          place: string
          tags: Json
          theme: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          ai_allowed?: boolean
          blocks?: Json
          body?: string
          created_at?: string
          date: string
          favorite?: boolean
          id: string
          layout?: string
          mood?: string
          owner_id: string
          people?: Json
          place?: string
          tags?: Json
          theme?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          ai_allowed?: boolean
          blocks?: Json
          body?: string
          created_at?: string
          date?: string
          favorite?: boolean
          id?: string
          layout?: string
          mood?: string
          owner_id?: string
          people?: Json
          place?: string
          tags?: Json
          theme?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "schema_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "schema_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_entry_assets: {
        Row: {
          asset_id: string
          entry_id: string
          owner_id: string
          position: number
        }
        Insert: {
          asset_id: string
          entry_id: string
          owner_id: string
          position: number
        }
        Update: {
          asset_id?: string
          entry_id?: string
          owner_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "schema_entry_assets_owner_id_asset_id_fkey"
            columns: ["owner_id", "asset_id"]
            isOneToOne: false
            referencedRelation: "schema_assets"
            referencedColumns: ["owner_id", "id"]
          },
          {
            foreignKeyName: "schema_entry_assets_owner_id_entry_id_fkey"
            columns: ["owner_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "schema_entries"
            referencedColumns: ["owner_id", "id"]
          },
        ]
      }
      schema_jobs: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          dedupe_key: string
          error_code: string | null
          id: string
          kind: string
          lease_token: string | null
          lease_until: string | null
          owner_id: string
          state: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          dedupe_key: string
          error_code?: string | null
          id?: string
          kind: string
          lease_token?: string | null
          lease_until?: string | null
          owner_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          dedupe_key?: string
          error_code?: string | null
          id?: string
          kind?: string
          lease_token?: string | null
          lease_until?: string | null
          owner_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schema_jobs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "schema_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_profiles: {
        Row: {
          ai_consent: boolean
          archive_revision: number
          birthday: string | null
          created_at: string
          id: string
          name: string
          onboarded: boolean
          onboarding_step: string
          plan: string
          preferences_version: number
          question_mode: string
          quiet: boolean
          status: string
          storage_bytes: number
          storage_limit: number
          text_size: string
          theme: string
        }
        Insert: {
          ai_consent?: boolean
          archive_revision?: number
          birthday?: string | null
          created_at?: string
          id: string
          name?: string
          onboarded?: boolean
          onboarding_step?: string
          plan?: string
          preferences_version?: number
          question_mode?: string
          quiet?: boolean
          status?: string
          storage_bytes?: number
          storage_limit?: number
          text_size?: string
          theme?: string
        }
        Update: {
          ai_consent?: boolean
          archive_revision?: number
          birthday?: string | null
          created_at?: string
          id?: string
          name?: string
          onboarded?: boolean
          onboarding_step?: string
          plan?: string
          preferences_version?: number
          question_mode?: string
          quiet?: boolean
          status?: string
          storage_bytes?: number
          storage_limit?: number
          text_size?: string
          theme?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      schema_api: { Args: { action: string; payload?: Json }; Returns: Json }
      schema_worker: { Args: { action: string; payload?: Json }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const


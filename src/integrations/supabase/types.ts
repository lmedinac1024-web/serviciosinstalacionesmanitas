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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      jobs: {
        Row: {
          cantidad: number
          ciudad: string | null
          cliente: string
          codigo_postal: string | null
          created_at: string
          direccion: string
          estado: Database["public"]["Enums"]["job_status"]
          fecha: string
          finalizado_at: string | null
          foto_final: string | null
          foto_inicio: string | null
          hora: string | null
          id: string
          importe: number
          motivo_cancelacion: string | null
          observaciones: string | null
          piso: string | null
          puerta: string | null
          servicio: string | null
          telefono: string | null
          telegram_final_msg_id: string | null
          telegram_inicio_msg_id: string | null
          total: number | null
          user_id: string
        }
        Insert: {
          cantidad?: number
          ciudad?: string | null
          cliente: string
          codigo_postal?: string | null
          created_at?: string
          direccion: string
          estado?: Database["public"]["Enums"]["job_status"]
          fecha?: string
          finalizado_at?: string | null
          foto_final?: string | null
          foto_inicio?: string | null
          hora?: string | null
          id?: string
          importe?: number
          motivo_cancelacion?: string | null
          observaciones?: string | null
          piso?: string | null
          puerta?: string | null
          servicio?: string | null
          telefono?: string | null
          telegram_final_msg_id?: string | null
          telegram_inicio_msg_id?: string | null
          total?: number | null
          user_id: string
        }
        Update: {
          cantidad?: number
          ciudad?: string | null
          cliente?: string
          codigo_postal?: string | null
          created_at?: string
          direccion?: string
          estado?: Database["public"]["Enums"]["job_status"]
          fecha?: string
          finalizado_at?: string | null
          foto_final?: string | null
          foto_inicio?: string | null
          hora?: string | null
          id?: string
          importe?: number
          motivo_cancelacion?: string | null
          observaciones?: string | null
          piso?: string | null
          puerta?: string | null
          servicio?: string | null
          telefono?: string | null
          telegram_final_msg_id?: string | null
          telegram_inicio_msg_id?: string | null
          total?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      job_status:
        | "pendiente"
        | "en_proceso"
        | "realizado"
        | "cancelado_cliente"
        | "cancelado_no_estaba"
        | "cancelado_direccion"
        | "cancelado_otro"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      job_status: [
        "pendiente",
        "en_proceso",
        "realizado",
        "cancelado_cliente",
        "cancelado_no_estaba",
        "cancelado_direccion",
        "cancelado_otro",
      ],
    },
  },
} as const

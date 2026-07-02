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
      clientes: {
        Row: {
          ciudad: string | null
          codigo_postal: string | null
          created_at: string
          created_by: string | null
          direccion: string
          id: string
          nombre: string
          notas: string | null
          piso: string | null
          puerta: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          ciudad?: string | null
          codigo_postal?: string | null
          created_at?: string
          created_by?: string | null
          direccion: string
          id?: string
          nombre: string
          notas?: string | null
          piso?: string | null
          puerta?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          ciudad?: string | null
          codigo_postal?: string | null
          created_at?: string
          created_by?: string | null
          direccion?: string
          id?: string
          nombre?: string
          notas?: string | null
          piso?: string | null
          puerta?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          display_name: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          display_name?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      servicios: {
        Row: {
          actualizado_en: string
          anulado_por: string | null
          assigned_by: string | null
          ciudad: string | null
          cliente: string
          cliente_id: string | null
          codigo_postal: string | null
          creado_en: string
          direccion: string
          direccion_lat: number | null
          direccion_lng: number | null
          direccion_validada_llegada: boolean
          distancia_llegada_metros: number | null
          eliminado_logico: boolean
          empleado_id: string | null
          estado: Database["public"]["Enums"]["job_status"]
          fecha: string
          fecha_anulacion: string | null
          foto_cancelacion: string | null
          foto_final: string | null
          foto_inicio: string | null
          ganancia: number | null
          gps_cancelacion_lat: number | null
          gps_cancelacion_lng: number | null
          gps_final_lat: number | null
          gps_final_lng: number | null
          gps_llegada_lat: number | null
          gps_llegada_lng: number | null
          hora_fin: string | null
          hora_llegada: string | null
          hora_programada: string | null
          id: string
          importe: number
          motivo_anulacion: string | null
          motivo_cancelacion: string | null
          observaciones: string | null
          piso: string | null
          precio_llegada: number
          puerta: string | null
          referencia: string | null
          telefono_cliente: string | null
          telegram_cancel_msg_id: string | null
          telegram_final_msg_id: string | null
          telegram_inicio_msg_id: string | null
          tipo_servicio: string | null
          user_id: string
        }
        Insert: {
          actualizado_en?: string
          anulado_por?: string | null
          assigned_by?: string | null
          ciudad?: string | null
          cliente: string
          cliente_id?: string | null
          codigo_postal?: string | null
          creado_en?: string
          direccion: string
          direccion_lat?: number | null
          direccion_lng?: number | null
          direccion_validada_llegada?: boolean
          distancia_llegada_metros?: number | null
          eliminado_logico?: boolean
          empleado_id?: string | null
          estado?: Database["public"]["Enums"]["job_status"]
          fecha?: string
          fecha_anulacion?: string | null
          foto_cancelacion?: string | null
          foto_final?: string | null
          foto_inicio?: string | null
          ganancia?: number | null
          gps_cancelacion_lat?: number | null
          gps_cancelacion_lng?: number | null
          gps_final_lat?: number | null
          gps_final_lng?: number | null
          gps_llegada_lat?: number | null
          gps_llegada_lng?: number | null
          hora_fin?: string | null
          hora_llegada?: string | null
          hora_programada?: string | null
          id?: string
          importe?: number
          motivo_anulacion?: string | null
          motivo_cancelacion?: string | null
          observaciones?: string | null
          piso?: string | null
          precio_llegada?: number
          puerta?: string | null
          referencia?: string | null
          telefono_cliente?: string | null
          telegram_cancel_msg_id?: string | null
          telegram_final_msg_id?: string | null
          telegram_inicio_msg_id?: string | null
          tipo_servicio?: string | null
          user_id: string
        }
        Update: {
          actualizado_en?: string
          anulado_por?: string | null
          assigned_by?: string | null
          ciudad?: string | null
          cliente?: string
          cliente_id?: string | null
          codigo_postal?: string | null
          creado_en?: string
          direccion?: string
          direccion_lat?: number | null
          direccion_lng?: number | null
          direccion_validada_llegada?: boolean
          distancia_llegada_metros?: number | null
          eliminado_logico?: boolean
          empleado_id?: string | null
          estado?: Database["public"]["Enums"]["job_status"]
          fecha?: string
          fecha_anulacion?: string | null
          foto_cancelacion?: string | null
          foto_final?: string | null
          foto_inicio?: string | null
          ganancia?: number | null
          gps_cancelacion_lat?: number | null
          gps_cancelacion_lng?: number | null
          gps_final_lat?: number | null
          gps_final_lng?: number | null
          gps_llegada_lat?: number | null
          gps_llegada_lng?: number | null
          hora_fin?: string | null
          hora_llegada?: string | null
          hora_programada?: string | null
          id?: string
          importe?: number
          motivo_anulacion?: string | null
          motivo_cancelacion?: string | null
          observaciones?: string | null
          piso?: string | null
          precio_llegada?: number
          puerta?: string | null
          referencia?: string | null
          telefono_cliente?: string | null
          telegram_cancel_msg_id?: string | null
          telegram_final_msg_id?: string | null
          telegram_inicio_msg_id?: string | null
          tipo_servicio?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifas_empleado: {
        Row: {
          created_at: string
          empleado_id: string
          id: string
          precio: number
          servicio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empleado_id: string
          id?: string
          precio?: number
          servicio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empleado_id?: string
          id?: string
          precio?: number
          servicio_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_destinos: {
        Row: {
          activo: boolean
          chat_id: string
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          chat_id: string
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          chat_id?: string
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          telegram_chat_id: string | null
          telegram_destino_default_id: string | null
          telegram_destinos_favoritos: string[]
          telegram_destinos_permitidos: string[]
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          telegram_chat_id?: string | null
          telegram_destino_default_id?: string | null
          telegram_destinos_favoritos?: string[]
          telegram_destinos_permitidos?: string[]
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          telegram_chat_id?: string | null
          telegram_destino_default_id?: string | null
          telegram_destinos_favoritos?: string[]
          telegram_destinos_permitidos?: string[]
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_telegram_destino_default_id_fkey"
            columns: ["telegram_destino_default_id"]
            isOneToOne: false
            referencedRelation: "telegram_destinos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "empleado" | "super_admin"
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
      app_role: ["admin", "empleado", "super_admin"],
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

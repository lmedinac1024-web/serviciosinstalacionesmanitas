import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "empleado";

export function useUserRole() {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async (): Promise<{ userId: string; role: Role; username: string; displayName: string } | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user;
      if (!u) return null;
      const [rolesRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", u.id),
        supabase.from("profiles").select("username, display_name").eq("user_id", u.id).maybeSingle(),
      ]);
      const isAdmin = (rolesRes.data ?? []).some((r) => r.role === "admin");
      return {
        userId: u.id,
        role: isAdmin ? "admin" : "empleado",
        username: profileRes.data?.username ?? u.email?.split("@")[0] ?? "",
        displayName: profileRes.data?.display_name ?? profileRes.data?.username ?? "",
      };
    },
    staleTime: 60_000,
  });
}

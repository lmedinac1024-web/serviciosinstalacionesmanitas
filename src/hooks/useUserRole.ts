import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "super_admin" | "admin" | "empleado";

export function useUserRole() {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async (): Promise<{
      userId: string;
      role: Role;
      isAdmin: boolean;
      isSuperAdmin: boolean;
      username: string;
      displayName: string;
    } | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user;
      if (!u) return null;
      const [rolesRes, profileRes] = await Promise.all([
        // super_admin no está tipado aún en Database types → castear a string.
        supabase.from("user_roles").select("role").eq("user_id", u.id),
        supabase.from("profiles").select("username, display_name").eq("user_id", u.id).maybeSingle(),
      ]);
      const roles = (rolesRes.data ?? []).map((r) => r.role as string);
      const isSuperAdmin = roles.includes("super_admin");
      const isAdmin = isSuperAdmin || roles.includes("admin");
      const role: Role = isSuperAdmin ? "super_admin" : isAdmin ? "admin" : "empleado";
      return {
        userId: u.id,
        role,
        isAdmin,
        isSuperAdmin,
        username: profileRes.data?.username ?? u.email?.split("@")[0] ?? "",
        displayName: profileRes.data?.display_name ?? profileRes.data?.username ?? u.email?.split("@")[0] ?? "",
      };
    },
    staleTime: 60_000,
  });
}

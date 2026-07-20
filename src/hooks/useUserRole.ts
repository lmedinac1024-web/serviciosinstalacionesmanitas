import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "super_admin" | "admin" | "supervisor" | "empleado";

type UserRoleData = {
  userId: string;
  role: Role;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isSupervisor: boolean;
  /** Puede crear/importar/anular servicios (admin, super_admin o supervisor). */
  canManage: boolean;
  username: string;
  displayName: string;
};

const ROLE_CACHE_KEY = "servihogar-user-role-v1";

function readCachedRole(userId?: string): UserRoleData | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem(ROLE_CACHE_KEY) || "null") as UserRoleData | null;
    if (!cached || (userId && cached.userId !== userId)) return null;
    return cached;
  } catch {
    return null;
  }
}

function cacheRole(role: UserRoleData) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(role)); } catch { /* noop */ }
}

export function useUserRole() {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async (): Promise<UserRoleData | null> => {
      let u = null;
      try {
        const { data: userData } = await supabase.auth.getUser();
        u = userData.user;
      } catch {
        const { data: sessionData } = await supabase.auth.getSession();
        u = sessionData.session?.user ?? null;
      }
      if (!u) return null;

      const cached = readCachedRole(u.id);
      let rolesRes, profileRes;
      try {
        [rolesRes, profileRes] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", u.id),
          supabase.from("profiles").select("username, display_name").eq("user_id", u.id).maybeSingle(),
        ]);
      } catch (e) {
        if (cached) return cached;
        throw e;
      }
      if (rolesRes.error) {
        if (cached) return cached;
        throw rolesRes.error;
      }
      const roles = (rolesRes.data ?? []).map((r) => r.role as string);
      // Anti-degradación: si el fetch devuelve una lista vacía (típico hipo de red / RLS
      // transitorio) y ya teníamos rol en caché, conservamos el rol cacheado en vez de
      // rebajar a "empleado" (eso provocaba el "a ratos sí, a ratos no" al abrir admin,
      // crear/editar servicio o importar orden).
      if (roles.length === 0 && cached && cached.role !== "empleado") {
        return cached;
      }
      const isSuperAdmin = roles.includes("super_admin");
      const isAdmin = isSuperAdmin || roles.includes("admin");
      const isSupervisor = roles.includes("supervisor");
      const canManage = isAdmin || isSupervisor;
      const role: Role = isSuperAdmin
        ? "super_admin"
        : isAdmin
          ? "admin"
          : isSupervisor
            ? "supervisor"
            : "empleado";
      const result: UserRoleData = {
        userId: u.id,
        role,
        isAdmin,
        isSuperAdmin,
        isSupervisor,
        canManage,
        username: profileRes.data?.username ?? u.email?.split("@")[0] ?? "",
        displayName: profileRes.data?.display_name ?? profileRes.data?.username ?? u.email?.split("@")[0] ?? "",
      };
      cacheRole(result);
      return result;
    },
    staleTime: 60_000,
    retry: 2,
    refetchOnWindowFocus: false,

  });
}

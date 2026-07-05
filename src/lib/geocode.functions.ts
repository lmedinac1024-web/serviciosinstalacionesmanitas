import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

export const geocodeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { direccion: string; codigo_postal?: string | null; ciudad?: string | null }) => d)
  .handler(async ({ data, context }) => {
    // Admin / super_admin / supervisor pueden geocodificar (crea servicios).
    const [{ data: isAdmin }, { data: isSuper }, { data: isSup }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
    ]);
    if (!isAdmin && !isSuper && !isSup) {
      return { ok: false as const, reason: "forbidden" as const };
    }
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return { ok: false as const, reason: "not_connected" as const };
    }
    const address = [data.direccion, data.codigo_postal, data.ciudad].filter(Boolean).join(", ");
    if (!address.trim()) return { ok: false as const, reason: "empty" as const };


    try {
      const url = `${GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(address)}`;
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        },
      });
      const j = await r.json();
      if (!r.ok || j.status !== "OK" || !j.results?.[0]?.geometry?.location) {
        return { ok: false as const, reason: "not_found" as const, status: j.status ?? `HTTP ${r.status}` };
      }
      const loc = j.results[0].geometry.location;
      return { ok: true as const, lat: Number(loc.lat), lng: Number(loc.lng), formatted: j.results[0].formatted_address as string };
    } catch (e) {
      return { ok: false as const, reason: "error" as const, error: e instanceof Error ? e.message : "unknown" };
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { haversineMeters } from "@/lib/geo";

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

type JobPoint = { id: string; lat: number; lng: number };

function toLatLngWaypoint(p: { lat: number; lng: number }) {
  return {
    waypoint: {
      location: { latLng: { latitude: p.lat, longitude: p.lng } },
    },
  };
}

export const computeTransitRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { origin: { lat: number; lng: number }; jobs: JobPoint[] }) => d,
  )
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return { ok: false as const, reason: "not_connected" as const };
    }

    const validJobs = data.jobs.filter(
      (j) =>
        j != null &&
        Number.isFinite(j.lat) &&
        Number.isFinite(j.lng) &&
        !Number.isNaN(j.lat) &&
        !Number.isNaN(j.lng),
    );

    if (validJobs.length === 0) {
      return {
        ok: true as const,
        sorted: data.jobs.map((j) => j.id),
        legs: [] as { jobId: string; durationSeconds: number; distanceMeters?: number }[],
        fallback: true as const,
      };
    }

    // Origins: current location + every job. Destinations: every job.
    // Matrix size: (N+1) × N. Google Route Matrix supports up to 625 elements,
    // so this is safe for the list sizes used in the app.
    const origins = [data.origin, ...validJobs];
    const destinations = validJobs;

    const body = {
      origins: origins.map(toLatLngWaypoint),
      destinations: destinations.map(toLatLngWaypoint),
      travelMode: "TRANSIT",
      languageCode: "es",
      units: "METRIC",
      // routingPreference no se aplica al modo TRANSIT; lo omitimos.
    };

    try {
      const r = await fetch(
        `${GATEWAY}/routes/distanceMatrix/v2:computeRouteMatrix`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
            "Content-Type": "application/json",
            "X-Goog-FieldMask": "duration,distance_meters,origin_index,destination_index",
          },
          body: JSON.stringify(body),
        },
      );

      if (r.status === 403) {
        const j = await r.json().catch(() => ({}));
        const details: Array<{ reason?: string }> = j?.error?.details ?? [];
        const reason = details.find((d) => d.reason)?.reason;
        if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
          return {
            ok: false as const,
            reason: "forbidden" as const,
            detail:
              "La clave de Google Maps está restringida por referrer. Configúrala como 'Ninguna' o 'Direcciones IP' en Google Cloud Console.",
          };
        }
        if (reason === "API_KEY_SERVICE_BLOCKED") {
          return {
            ok: false as const,
            reason: "forbidden" as const,
            detail:
              "La clave de Google Maps no permite la API de Rutas. Actívala en Google Cloud Console.",
          };
        }
        return {
          ok: false as const,
          reason: "forbidden" as const,
          detail: "Google Maps rechazó la solicitud. Revisa la clave en Google Cloud Console.",
        };
      }

      if (!r.ok) {
        const text = await r.text();
        return { ok: false as const, reason: "api_error" as const, detail: text };
      }

      const j = await r.json();
      // Routes API v2 computeRouteMatrix returns a flat array of elements.
      const elements: Array<{
        originIndex?: number;
        destinationIndex?: number;
        duration?: string;
        distanceMeters?: number;
        condition?: string;
      }> = Array.isArray(j) ? j : [];

      const durations: (number | null)[][] = [];
      const distances: (number | null)[][] = [];
      elements.forEach((el) => {
        const o = el.originIndex ?? 0;
        const d = el.destinationIndex ?? 0;
        if (!durations[o]) durations[o] = [];
        if (!distances[o]) distances[o] = [];
        const seconds = el.duration ? Number(el.duration.replace("s", "")) : null;
        durations[o][d] = Number.isFinite(seconds) ? seconds : null;
        distances[o][d] = el.distanceMeters ?? null;
      });

      const jobIndexById = new Map(validJobs.map((j, i) => [j.id, i]));

      const sorted: string[] = [];
      const legs: { jobId: string; durationSeconds: number; distanceMeters?: number }[] = [];
      const remaining = new Set(validJobs.map((j) => j.id));
      let currentIdx = 0; // 0 == origin

      while (remaining.size > 0) {
        let bestId: string | null = null;
        let bestDuration = Infinity;

        for (const jobId of remaining) {
          const destIdx = jobIndexById.get(jobId);
          if (destIdx == null) continue;
          const seconds = durations[currentIdx]?.[destIdx];
          if (seconds != null && seconds < bestDuration) {
            bestDuration = seconds;
            bestId = jobId;
          }
        }

        if (!bestId) {
          // No transit route to any remaining job; append the rest in original order.
          for (const jobId of remaining) sorted.push(jobId);
          break;
        }

        remaining.delete(bestId);
        sorted.push(bestId);
        const destIdx = jobIndexById.get(bestId)!;
        legs.push({
          jobId: bestId,
          durationSeconds: bestDuration,
          distanceMeters: distances[currentIdx]?.[destIdx] ?? undefined,
        });
        currentIdx = destIdx + 1; // job origins start at index 1
      }

      // Jobs without valid coordinates go to the end.
      const invalidIds = data.jobs
        .filter((j) => !validJobs.some((v) => v.id === j.id))
        .map((j) => j.id);

      return {
        ok: true as const,
        sorted: [...sorted, ...invalidIds],
        legs,
        fallback: false as const,
      };
    } catch (e) {
      return {
        ok: false as const,
        reason: "error" as const,
        error: e instanceof Error ? e.message : "unknown",
      };
    }
  });

/** Fallback route builder using straight-line distance (Haversine). */
export function buildHaversineRoute<T extends { id: string; direccion_lat?: number | string | null; direccion_lng?: number | string | null }>(
  jobs: T[],
  origin: { lat: number; lng: number } | null,
  active: boolean,
): { sorted: T[]; legs: Map<string, number>; order: Map<string, number> } {
  const legs = new Map<string, number>();
  const order = new Map<string, number>();

  if (!active || !origin) {
    jobs.forEach((j, i) => order.set(j.id, i + 1));
    return { sorted: jobs, legs, order };
  }

  const getCoord = (j: T) => {
    const lat = j.direccion_lat != null ? Number(j.direccion_lat) : null;
    const lng = j.direccion_lng != null ? Number(j.direccion_lng) : null;
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  };

  const withCoords: { j: T; c: { lat: number; lng: number } }[] = [];
  const withoutCoords: T[] = [];
  jobs.forEach((j) => {
    const c = getCoord(j);
    if (c) withCoords.push({ j, c });
    else withoutCoords.push(j);
  });

  const route: T[] = [];
  let current = origin;
  while (withCoords.length > 0) {
    let bestIdx = 0;
    let bestDist = haversineMeters(current, withCoords[0].c);
    for (let i = 1; i < withCoords.length; i++) {
      const d = haversineMeters(current, withCoords[i].c);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = withCoords.splice(bestIdx, 1);
    legs.set(next.j.id, bestDist);
    route.push(next.j);
    current = next.c;
  }

  const sorted = [...route, ...withoutCoords];
  sorted.forEach((j, i) => order.set(j.id, i + 1));
  return { sorted, legs, order };
}

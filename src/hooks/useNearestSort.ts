import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getCurrentPosition, haversineMeters } from "@/lib/geo";
import type { Job } from "@/lib/jobs";

export function useNearestSort() {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (active) {
      setActive(false);
      return;
    }
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setActive(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo obtener tu ubicación");
    } finally {
      setLoading(false);
    }
  }, [active]);

  const sortJobs = useCallback(
    <T extends Job>(jobs: T[]): T[] => {
      if (!active || !origin) return jobs;
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
      // Ruta lógica: vecino más cercano desde la ubicación actual, encadenando.
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
        route.push(next.j);
        current = next.c;
      }
      return [...route, ...withoutCoords];
    },
    [active, origin],
  );

  const distanceFor = useCallback(
    (j: Job): number | null => {
      if (!origin) return null;
      const lat = j.direccion_lat != null ? Number(j.direccion_lat) : null;
      const lng = j.direccion_lng != null ? Number(j.direccion_lng) : null;
      if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return haversineMeters(origin, { lat, lng });
    },
    [origin],
  );

  return { active, loading, toggle, sortJobs, distanceFor };
}

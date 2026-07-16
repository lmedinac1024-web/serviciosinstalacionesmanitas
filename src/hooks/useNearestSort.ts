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
      const withDist = jobs.map((j) => {
        const lat = j.direccion_lat != null ? Number(j.direccion_lat) : null;
        const lng = j.direccion_lng != null ? Number(j.direccion_lng) : null;
        const dist =
          lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
            ? haversineMeters(origin, { lat, lng })
            : Number.POSITIVE_INFINITY;
        return { j, dist };
      });
      withDist.sort((a, b) => a.dist - b.dist);
      return withDist.map((x) => x.j);
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

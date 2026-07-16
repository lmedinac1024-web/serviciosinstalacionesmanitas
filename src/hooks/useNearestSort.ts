import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getCurrentPosition } from "@/lib/geo";
import { computeTransitRoute, buildHaversineRoute } from "@/lib/routes.functions";
import type { Job } from "@/lib/jobs";

export type RouteMode = "distance" | "transit";

export function useNearestSort<T extends Job>(jobs: T[]) {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<RouteMode>("transit");
  const [fallbackToDistance, setFallbackToDistance] = useState(false);

  const computeTransit = useServerFn(computeTransitRoute);

  const toggle = useCallback(async () => {
    if (active) {
      setActive(false);
      setOrigin(null);
      setMode("transit");
      setFallbackToDistance(false);
      return;
    }
    setLoading(true);
    try {
      const pos = await getCurrentPosition();
      setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setActive(true);
      setMode("transit");
      setFallbackToDistance(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo obtener tu ubicación");
    } finally {
      setLoading(false);
    }
  }, [active]);

  const setModeSafe = useCallback((m: RouteMode) => {
    setMode(m);
    setFallbackToDistance(false);
  }, []);

  const jobPoints = useMemo(
    () =>
      jobs
        .map((j) => {
          const lat = j.direccion_lat != null ? Number(j.direccion_lat) : null;
          const lng = j.direccion_lng != null ? Number(j.direccion_lng) : null;
          if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return null;
          return { id: j.id, lat, lng };
        })
        .filter((p): p is { id: string; lat: number; lng: number } => p != null),
    [jobs],
  );

  const transitQuery = useQuery({
    queryKey: ["transit-route", origin?.lat, origin?.lng, jobPoints.map((j) => j.id).join(",")],
    queryFn: async () => {
      if (!origin) throw new Error("No hay ubicación");
      const r = await computeTransit({ data: { origin, jobs: jobPoints } });
      if (!r.ok) {
        throw new Error(r.reason === "not_connected" ? "Google Maps no está conectado" : r.detail || r.error || "Error de ruta");
      }
      return r;
    },
    enabled: active && mode === "transit" && jobPoints.length > 0,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (mode === "transit" && transitQuery.isError && active) {
      toast.error("No se pudo calcular la ruta en transporte público. Se usa distancia en línea recta.");
      setFallbackToDistance(true);
    }
  }, [mode, transitQuery.isError, active]);

  const haversineRoute = useMemo(
    () => buildHaversineRoute(jobs, origin, active),
    [jobs, origin, active],
  );

  const route = useMemo(() => {
    if (active && mode === "transit" && !fallbackToDistance && transitQuery.data?.ok) {
      const { sorted, legs } = transitQuery.data;
      const sortedJobs: T[] = [];
      const order = new Map<string, number>();
      const legMap = new Map<string, number>();
      const legInfo = new Map<string, { durationSeconds: number; distanceMeters?: number }>();
      sorted.forEach((id, i) => {
        const job = jobs.find((j) => j.id === id);
        if (job) sortedJobs.push(job);
        order.set(id, i + 1);
      });
      legs.forEach((leg) => {
        legMap.set(leg.jobId, leg.durationSeconds);
        legInfo.set(leg.jobId, { durationSeconds: leg.durationSeconds, distanceMeters: leg.distanceMeters });
      });
      // Append any jobs that may not have been returned (should not happen, but safety).
      jobs.forEach((j) => {
        if (!order.has(j.id)) {
          sortedJobs.push(j);
          order.set(j.id, sortedJobs.length);
        }
      });
      return { sorted: sortedJobs, legs: legMap, order, legInfo };
    }
    return { ...haversineRoute, legInfo: new Map<string, { durationSeconds: number; distanceMeters?: number }>() };
  }, [active, mode, fallbackToDistance, transitQuery.data, jobs, haversineRoute]);

  const effectiveMode: RouteMode =
    active && mode === "transit" && (fallbackToDistance || transitQuery.isError || !transitQuery.data?.ok)
      ? "distance"
      : mode;

  return {
    active,
    loading,
    toggle,
    mode,
    setMode: setModeSafe,
    effectiveMode,
    route,
    transitLoading: transitQuery.isLoading,
    transitError: transitQuery.isError,
  };
}

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatRouteLeg(
  legSeconds: number | undefined,
  legMeters: number | undefined,
  mode: RouteMode,
): string {
  if (mode === "transit" && legSeconds != null) {
    const time = formatSeconds(legSeconds);
    if (legMeters != null) {
      const dist = legMeters < 1000 ? `${legMeters} m` : `${(legMeters / 1000).toFixed(1)} km`;
      return `${time} · ${dist}`;
    }
    return time;
  }
  if (legMeters != null) {
    return legMeters < 1000 ? `${legMeters} m` : `${(legMeters / 1000).toFixed(1)} km`;
  }
  return "";
}

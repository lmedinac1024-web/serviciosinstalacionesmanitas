import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { geocodeAddress } from "@/lib/geocode.functions";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import "leaflet/dist/leaflet.css";
import type { Job } from "@/lib/jobs";
import { displayStatus } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { LocateFixed, Loader2 } from "lucide-react";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

const geoCache = new Map<string, { lat: number; lng: number } | null>();

export default function JobsMap({ jobs: inputJobs }: { jobs: Job[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const geocode = useServerFn(geocodeAddress);
  const [found, setFound] = useState<Record<string, { lat: number; lng: number }>>({});
  const [buscando, setBuscando] = useState(false);
  const [mapInstance, setMapInstance] = useState<import("leaflet").Map | null>(null);
  const [position, setPosition] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const [locating, setLocating] = useState(true);
  const framedLocation = useRef(false);

  useEffect(() => {
    setLocating(true);
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("Este dispositivo no permite obtener tu ubicación.");
      setLocating(false);
      return;
    }
    const watch = navigator.geolocation.watchPosition((p) => {
      setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      setLocating(false);
      setLocationError(null);
    }, (error) => {
      setLocationError(error.code === 1
        ? "Permití el acceso a tu ubicación en los ajustes del navegador para ver tu punto."
        : "No se pudo obtener tu ubicación. Comprobá que la ubicación del teléfono esté activada.");
      setLocating(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [locationAttempt]);

  useEffect(() => {
    const missing = inputJobs.filter((j) => (j.direccion_lat == null || j.direccion_lng == null) && !geoCache.has(j.id));
    if (!missing.length) return;
    let alive = true;
    setBuscando(true);
    void (async () => {
      for (const j of missing) {
        try {
          const r = await geocode({ data: { direccion: [j.direccion, j.numero].filter(Boolean).join(" ") || j.direccion_completa || "", codigo_postal: j.codigo_postal, ciudad: j.ciudad } });
          if (r.ok) {
            geoCache.set(j.id, { lat: r.lat, lng: r.lng });
            if (alive) setFound((f) => ({ ...f, [j.id]: { lat: r.lat, lng: r.lng } }));
            void supabase.from("servicios").update({ direccion_lat: r.lat, direccion_lng: r.lng }).eq("id", j.id);
          } else geoCache.set(j.id, null);
        } catch { /* sin conexión: se reintenta luego */ }
      }
      if (alive) setBuscando(false);
    })();
    return () => { alive = false; };
  }, [inputJobs, geocode]);

  const jobs = useMemo(() => inputJobs.map((j) => {
    const c = found[j.id] ?? geoCache.get(j.id);
    return (j.direccion_lat == null || j.direccion_lng == null) && c ? { ...j, direccion_lat: c.lat, direccion_lng: c.lng } : j;
  }), [inputJobs, found]);

  useEffect(() => {
    if (!ref.current) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !ref.current) return;
      map = L.map(ref.current).setView([41.3874, 2.1686], 12);
      const currentMap = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const pts: [number, number][] = [];
      jobs.forEach((j, idx) => {
        if (j.direccion_lat == null || j.direccion_lng == null) return;
        const p: [number, number] = [j.direccion_lat, j.direccion_lng];
        pts.push(p);
        const icon = L.divIcon({
          className: "",
          html: `<div class="jobs-map-pin">${idx + 1}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const dir = [j.direccion_completa || j.direccion, j.piso ? `Piso ${j.piso}` : "", j.puerta ? `Puerta ${j.puerta}` : ""]
          .filter(Boolean).join(", ");
        const html = `
          <div style="min-width:190px;font-size:13px;line-height:1.45">
            <div style="font-weight:700;font-size:14px">🕒 ${esc(j.hora_programada?.slice(0, 5) || "Sin hora")}</div>
            <div>👤 <b>${esc(j.cliente)}</b></div>
            <div>📍 ${esc(dir)}</div>
            ${j.telefono_cliente ? `<div>📞 <a href="tel:${esc(j.telefono_cliente)}">${esc(j.telefono_cliente)}</a></div>` : ""}
            ${j.tipo_servicio ? `<div>🔧 ${esc(j.tipo_servicio)}</div>` : ""}
            <div>📌 ${esc(displayStatus(j))}</div>
            <button data-job="${j.id}" class="jobs-map-open">Abrir servicio</button>
          </div>`;
        L.marker(p, { icon }).addTo(currentMap).bindPopup(html);
      });
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
      map.on("popupopen", (e) => {
        const btn = (e.popup.getElement() as HTMLElement | undefined)?.querySelector<HTMLButtonElement>(".jobs-map-open");
        btn?.addEventListener("click", () => {
          const id = btn.dataset.job;
          if (id) void navigate({ to: "/trabajo/$id", params: { id } });
        });
      });
      setMapInstance(currentMap);
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [jobs, navigate]);

  useEffect(() => {
    if (!mapInstance || !position) return;
    let cancelled = false;
    let marker: import("leaflet").Marker | undefined;
    void import("leaflet").then((L) => {
      if (cancelled) return;
      marker = L.marker([position.lat, position.lng], {
        icon: L.divIcon({ className: "", html: '<div class="jobs-map-location" aria-label="Tu ubicación"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        zIndexOffset: 1000,
      }).addTo(mapInstance).bindPopup(`Tu ubicación · Precisión aproximada: ${Math.round(position.accuracy)} m`);
      if (!framedLocation.current) {
        const points: [number, number][] = [[position.lat, position.lng]];
        jobs.forEach((j) => {
          if (j.direccion_lat != null && j.direccion_lng != null) points.push([j.direccion_lat, j.direccion_lng]);
        });
        mapInstance.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
        framedLocation.current = true;
      }
    });
    return () => { cancelled = true; marker?.remove(); };
  }, [mapInstance, position, jobs]);

  const sinCoords = jobs.filter((j) => j.direccion_lat == null || j.direccion_lng == null).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="jobs-map-location-legend" aria-hidden="true" /> Tu ubicación
        </span>
        <Button variant="outline" size="sm" aria-label="Centrar en mi ubicación" disabled={locating}
          onClick={() => {
            if (position && !locationError && mapInstance) mapInstance.setView([position.lat, position.lng], 15);
            else { framedLocation.current = false; setLocationAttempt((v) => v + 1); }
          }}>
          {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />} Mi ubicación
        </Button>
      </div>
      <div ref={ref} className="h-[65vh] w-full overflow-hidden rounded-lg border" />
      {locationError && <p role="status" className="text-xs text-destructive">{locationError}</p>}
      {buscando && <p className="text-xs text-muted-foreground">Buscando ubicaciones…</p>}
      {!buscando && sinCoords > 0 && (
        <p className="text-xs text-muted-foreground">
          {sinCoords} servicio(s) no se pudieron ubicar (revisá la dirección). Velos en la lista.
        </p>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { geocodeAddress } from "@/lib/geocode.functions";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import "leaflet/dist/leaflet.css";
import type { Job } from "@/lib/jobs";
import { displayStatus } from "@/lib/jobs";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const geoCache = new Map<string, { lat: number; lng: number } | null>();

export default function JobsMap({ jobs: inputJobs }: { jobs: Job[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const geocode = useServerFn(geocodeAddress);
  const [found, setFound] = useState<Record<string, { lat: number; lng: number }>>({});
  const [buscando, setBuscando] = useState(false);

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
        L.marker(p, { icon }).addTo(map!).bindPopup(html);
      });
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
      map.on("popupopen", (e) => {
        const btn = (e.popup.getElement() as HTMLElement | undefined)?.querySelector<HTMLButtonElement>(".jobs-map-open");
        btn?.addEventListener("click", () => {
          void navigate({ to: "/trabajo/$id", params: { id: btn.dataset.job! } });
        });
      });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [jobs, navigate]);

  const sinCoords = jobs.filter((j) => j.direccion_lat == null || j.direccion_lng == null).length;

  return (
    <div className="space-y-2">
      <div ref={ref} className="h-[65vh] w-full overflow-hidden rounded-lg border" />
      {buscando && <p className="text-xs text-muted-foreground">Buscando ubicaciones…</p>}
      {!buscando && sinCoords > 0 && (
        <p className="text-xs text-muted-foreground">
          {sinCoords} servicio(s) no se pudieron ubicar (revisá la dirección). Velos en la lista.
        </p>
      )}
    </div>
  );
}

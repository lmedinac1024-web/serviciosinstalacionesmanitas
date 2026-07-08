import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Image as ImageIcon } from "lucide-react";
import { TIPO_SERVICIO_OPCIONES, type Job, type JobStatus, displayStatus, statusColorClass, formatEUR, jobTotal } from "@/lib/jobs";

export const Route = createFileRoute("/_authenticated/admin/obras/$id")({ component: EditarObra });

type Empleado = { user_id: string; username: string; display_name: string | null };

const STATUS_OPCIONES: { value: JobStatus; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_proceso", label: "En curso" },
  { value: "realizado", label: "Realizado" },
  { value: "cancelado_cliente", label: "Cancelado — cliente" },
  { value: "cancelado_no_estaba", label: "Cancelado — no estaba" },
  { value: "cancelado_direccion", label: "Cancelado — dirección" },
  { value: "cancelado_otro", label: "Cancelado — otro" },
];

function EditarObra() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Job> | null>(null);

  const { data: obra, isLoading } = useQuery({
    queryKey: ["admin", "obra", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("servicios").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Job | null;
    },
  });

  const { data: empleados = [] } = useQuery({
    queryKey: ["admin", "empleados-select"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, username, display_name");
      return (data ?? []) as Empleado[];
    },
  });

  useEffect(() => { if (obra) setForm(obra); }, [obra]);

  const [fotos, setFotos] = useState<{ inicio?: string; final?: string; cancelacion?: string }>({});
  useEffect(() => {
    if (!obra) return;
    (async () => {
      const paths = { inicio: obra.foto_inicio, final: obra.foto_final, cancelacion: obra.foto_cancelacion };
      const out: typeof fotos = {};
      for (const [k, p] of Object.entries(paths)) {
        if (!p) continue;
        const { data } = await supabase.storage.from("job-photos").createSignedUrl(p, 3600);
        if (data?.signedUrl) out[k as keyof typeof out] = data.signedUrl;
      }
      setFotos(out);
    })();
  }, [obra]);

  if (isLoading || !form) {
    return <AdminShell title="Editar obra"><div className="grid place-items-center py-20 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div></AdminShell>;
  }
  if (!obra) return <AdminShell title="Obra no encontrada"><div>La obra no existe.</div></AdminShell>;

  function set<K extends keyof Job>(k: K, v: Job[K] | string | number | null) {
    setForm((f) => (f ? { ...f, [k]: v as never } : f));
  }

  async function guardar() {
    if (!form) return;
    setSaving(true);
    try {
      const importeNum = Number(form.importe) || 0;
      const isCancelled = (form.estado ?? "").toString().startsWith("cancelado");
      const payload = {
        fecha: form.fecha,
        hora_programada: form.hora_programada || null,
        empleado_id: form.empleado_id || null,
        tipo_servicio: form.tipo_servicio || null,
        cliente: (form.cliente ?? "").toString().trim(),
        telefono_cliente: form.telefono_cliente || null,
        direccion: (form.direccion ?? "").toString().trim(),
        piso: form.piso || null, puerta: form.puerta || null,
        codigo_postal: form.codigo_postal || null, ciudad: form.ciudad || null,
        observaciones: form.observaciones || null,
        importe: importeNum,
        // Al cancelar se cobra como servicio realizado: precio_llegada = importe automáticamente.
        precio_llegada: isCancelled ? importeNum : Number(form.precio_llegada) || 0,
        estado: form.estado,
        motivo_cancelacion: form.motivo_cancelacion || null,
      };
      const { error } = await supabase.from("servicios").update(payload).eq("id", id);
      if (error) throw error;
      toast.success("Cambios guardados");
      qc.invalidateQueries({ queryKey: ["admin", "obras"] });
      qc.invalidateQueries({ queryKey: ["admin", "obra", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell
      title={`Obra ${obra.referencia ?? id.slice(0, 8)}`}
      subtitle={obra.cliente}
      actions={
        <>
          <Link to="/admin/obras" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Link>
          <Button onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Programación">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Fecha"><Input type="date" value={form.fecha ?? ""} onChange={(e) => set("fecha", e.target.value)} /></Field>
              <Field label="Hora"><Input type="time" value={form.hora_programada ?? ""} onChange={(e) => set("hora_programada", e.target.value)} /></Field>
              <Field label="Empleado">
                <Select value={form.empleado_id ?? ""} onValueChange={(v) => set("empleado_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                  <SelectContent>
                    {empleados.map((e) => (
                      <SelectItem key={e.user_id} value={e.user_id}>{e.display_name || e.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo de servicio">
                <Select value={form.tipo_servicio ?? ""} onValueChange={(v) => set("tipo_servicio", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {TIPO_SERVICIO_OPCIONES.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Estado">
                <Select value={form.estado ?? "pendiente"} onValueChange={(v) => set("estado", v as JobStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPCIONES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section title="Cliente y dirección">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cliente"><Input value={form.cliente ?? ""} onChange={(e) => set("cliente", e.target.value)} /></Field>
              <Field label="Teléfono"><Input value={form.telefono_cliente ?? ""} onChange={(e) => set("telefono_cliente", e.target.value)} /></Field>
            </div>
            <Field label="Dirección"><Input value={form.direccion ?? ""} onChange={(e) => set("direccion", e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Piso"><Input value={form.piso ?? ""} onChange={(e) => set("piso", e.target.value)} /></Field>
              <Field label="Puerta"><Input value={form.puerta ?? ""} onChange={(e) => set("puerta", e.target.value)} /></Field>
              <Field label="CP"><Input value={form.codigo_postal ?? ""} onChange={(e) => set("codigo_postal", e.target.value)} /></Field>
              <Field label="Ciudad"><Input value={form.ciudad ?? ""} onChange={(e) => set("ciudad", e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Precios y notas">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Importe (€)"><Input type="number" step="0.01" value={String(form.importe ?? 0)} onChange={(e) => set("importe", Number(e.target.value))} /></Field>
              <Field label="Precio llegada (€)"><Input type="number" step="0.01" value={String(form.precio_llegada ?? 0)} onChange={(e) => set("precio_llegada", Number(e.target.value))} /></Field>
            </div>
            <Field label="Observaciones"><Textarea rows={3} value={form.observaciones ?? ""} onChange={(e) => set("observaciones", e.target.value)} /></Field>
            {(form.estado ?? "").toString().startsWith("cancelado") && (
              <Field label="Motivo de cancelación"><Input value={form.motivo_cancelacion ?? ""} onChange={(e) => set("motivo_cancelacion", e.target.value)} /></Field>
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Resumen">
            <div className="space-y-2 text-sm">
              <Row label="Estado"><span className={`inline-flex rounded border px-1.5 py-0.5 text-xs font-medium ${statusColorClass(obra)}`}>{displayStatus(obra)}</span></Row>
              <Row label="Total"><span className="font-bold tabular-nums">{formatEUR(jobTotal(obra))}</span></Row>
              <Row label="Ref"><code className="font-mono text-xs">{obra.referencia ?? "—"}</code></Row>
              <Row label="Creado"><span className="text-xs text-muted-foreground">{new Date(obra.creado_en).toLocaleString("es-ES")}</span></Row>
              {obra.hora_llegada && <Row label="Llegada"><span className="text-xs">{new Date(obra.hora_llegada).toLocaleString("es-ES")}</span></Row>}
              {obra.hora_fin && <Row label="Finalizado"><span className="text-xs">{new Date(obra.hora_fin).toLocaleString("es-ES")}</span></Row>}
              {obra.distancia_llegada_metros != null && (
                <Row label="Distancia llegada"><span className="text-xs">{obra.distancia_llegada_metros} m</span></Row>
              )}
            </div>
          </Section>

          <Section title="Fotos">
            <div className="grid grid-cols-3 gap-2">
              <FotoBox label="Inicio" url={fotos.inicio} />
              <FotoBox label="Final" url={fotos.final} />
              <FotoBox label="Cancelación" url={fotos.cancelacion} />
            </div>
          </Section>
        </div>
      </div>
    </AdminShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{label}</span>{children}</div>;
}
function FotoBox({ label, url }: { label: string; url?: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded border bg-muted">
          <img src={url} alt={label} className="h-full w-full object-cover" />
        </a>
      ) : (
        <div className="grid aspect-square place-items-center rounded border border-dashed bg-muted/30 text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

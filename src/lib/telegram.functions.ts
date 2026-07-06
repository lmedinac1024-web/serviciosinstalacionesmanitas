import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function fmtEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function downloadPhoto(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  url: string,
): Promise<Blob | null> {
  try {
    if (url.startsWith("http")) {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.blob();
    }
    const [bucket, ...rest] = url.split("/");
    const { data } = await supabase.storage.from(bucket).download(rest.join("/"));
    return data ?? null;
  } catch {
    return null;
  }
}

export const sendJobUpdateToTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string; fase: "creado" | "inicio" | "final" | "cancel"; destinoIds?: string[] }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;

    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      return { ok: false, skipped: true, reason: "telegram_not_connected" as const };
    }

    let chatIds: string[] = [];
    if (data.destinoIds && data.destinoIds.length > 0) {
      const { data: dests } = await supabase
        .from("telegram_destinos")
        .select("chat_id")
        .in("id", data.destinoIds)
        .eq("activo", true);
      chatIds = (dests ?? []).map((d) => d.chat_id).filter(Boolean);
    } else {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("telegram_destino_default_id, telegram_chat_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (settings?.telegram_destino_default_id) {
        const { data: d } = await supabase
          .from("telegram_destinos")
          .select("chat_id")
          .eq("id", settings.telegram_destino_default_id)
          .maybeSingle();
        if (d?.chat_id) chatIds = [d.chat_id];
      } else if (settings?.telegram_chat_id) {
        chatIds = [settings.telegram_chat_id];
      }
    }

    if (chatIds.length === 0) {
      return { ok: false, skipped: true, reason: "no_chat_id" as const };
    }

    const { data: job, error } = await supabase.from('servicios').select("*").eq("id", data.jobId).maybeSingle();
    if (error || !job) return { ok: false, skipped: true, reason: "job_not_found" as const };

    const { data: prof } = await supabase
      .from("profiles").select("display_name, username").eq("user_id", job.empleado_id ?? job.user_id).maybeSingle();
    const empleadoName = prof?.display_name || prof?.username || "";

    const importe = Number(job.importe ?? 0);
    const precioLlegada = Number(job.precio_llegada ?? 0);
    const street = [job.direccion, job.numero].filter(Boolean).join(" ").trim();
    const postalCity = [job.codigo_postal, job.ciudad].filter(Boolean).join(" ");
    const address = [street, postalCity].filter(Boolean).join(", ");
    const mapsAddress = [street, job.codigo_postal, job.ciudad].filter(Boolean).join(", ");
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsAddress || address)}`;
    const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    const commonHeader =
      (empleadoName ? `<b>Empleado:</b> ${escapeHtml(empleadoName)}\n` : "") +
      `<b>Cliente:</b> ${escapeHtml(job.cliente ?? "")}\n` +
      (job.tipo_servicio ? `<b>Servicio:</b> ${escapeHtml(job.tipo_servicio)}\n` : "") +
      `<b>Dirección:</b> ${escapeHtml(address)}\n` +
      (job.telefono_cliente ? `<b>Tel:</b> ${escapeHtml(job.telefono_cliente)}\n` : "") +
      `<a href="${mapsUrl}">📍 Ver en Google Maps</a>\n`;

    let caption = "";
    let photoUrl: string | null = null;

    if (data.fase === "creado") {
      caption =
        `🆕 <b>NUEVO SERVICIO</b>\n` + commonHeader +
        (job.hora_programada ? `<b>Hora prog.:</b> ${escapeHtml(job.hora_programada)}\n` : "") +
        (job.observaciones ? `<b>Obs.:</b> ${escapeHtml(job.observaciones)}\n` : "") +
        `<b>Importe:</b> ${fmtEUR(importe)}`;
    } else if (data.fase === "inicio") {
      const dist = job.distancia_llegada_metros != null ? ` (${Math.round(Number(job.distancia_llegada_metros))} m)` : "";
      const val = job.direccion_validada_llegada ? "✅ dentro de rango" : "⚠️ fuera de rango";
      caption =
        `🟦 <b>LLEGADA</b>\n` + commonHeader +
        `<b>Hora:</b> ${hora}\n` +
        `<b>Validación:</b> ${val}${dist}`;
      photoUrl = job.foto_inicio;
    } else if (data.fase === "final") {
      caption =
        `✅ <b>SERVICIO REALIZADO</b>\n` + commonHeader +
        `<b>Hora fin:</b> ${hora}\n` +
        `<b>Importe:</b> ${fmtEUR(importe)}` +
        (precioLlegada > 0 ? ` + ${fmtEUR(precioLlegada)} llegada` : "");
      photoUrl = job.foto_final;
    } else {
      caption =
        `❌ <b>SERVICIO CANCELADO</b>\n` + commonHeader +
        `<b>Hora:</b> ${hora}\n` +
        (job.motivo_cancelacion ? `<b>Motivo:</b> ${escapeHtml(job.motivo_cancelacion)}\n` : "") +
        (precioLlegada > 0 && job.direccion_validada_llegada ? `<b>Cobro llegada:</b> ${fmtEUR(precioLlegada)}` : "");
      photoUrl = job.foto_cancelacion;
    }

    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
    };

    const results: { chat_id: string; ok: boolean; error?: string; message_id?: string }[] = [];
    const blob = photoUrl ? await downloadPhoto(supabase, photoUrl) : null;

    for (const chatId of chatIds) {
      try {
        if (blob) {
          const form = new FormData();
          form.append("chat_id", chatId);
          form.append("caption", caption);
          form.append("parse_mode", "HTML");
          form.append("photo", blob, "photo.jpg");
          const r = await fetch(`${TELEGRAM_GATEWAY}/sendPhoto`, { method: "POST", headers, body: form });
          const j = await r.json();
          if (!r.ok || !j.ok) {
            results.push({ chat_id: chatId, ok: false, error: j.description ?? `HTTP ${r.status}` });
          } else {
            results.push({ chat_id: chatId, ok: true, message_id: String(j.result?.message_id ?? "") });
          }
        } else {
          const r = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true }),
          });
          const j = await r.json();
          if (!r.ok || !j.ok) results.push({ chat_id: chatId, ok: false, error: j.description ?? `HTTP ${r.status}` });
          else results.push({ chat_id: chatId, ok: true, message_id: String(j.result?.message_id ?? "") });
        }
      } catch (e) {
        results.push({ chat_id: chatId, ok: false, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    const anyOk = results.some((r) => r.ok);
    if (anyOk) {
      const firstMsgId = results.find((r) => r.ok)?.message_id ?? "";
      const patch =
        data.fase === "inicio" ? { telegram_inicio_msg_id: firstMsgId }
        : data.fase === "final" ? { telegram_final_msg_id: firstMsgId }
        : data.fase === "cancel" ? { telegram_cancel_msg_id: firstMsgId }
        : null;
      if (patch) {
        await supabase.from('servicios').update(patch).eq("id", job.id);
      }
    }
    return { ok: anyOk, results };
  });

export const sendTelegramTestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { chatId: string; nombre?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Solo admin
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return { ok: false, error: "forbidden" as const };

    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      return { ok: false, skipped: true, reason: "telegram_not_connected" as const };
    }

    const chatId = data.chatId.trim();
    if (!chatId) return { ok: false, error: "chat_id vacío" };

    const text =
      `🧪 <b>Mensaje de prueba</b>\n` +
      (data.nombre ? `<b>Destino:</b> ${escapeHtml(data.nombre)}\n` : "") +
      `Si ves este mensaje, el destino Telegram está bien configurado ✅\n` +
      `<i>${new Date().toLocaleString("es-ES")}</i>`;

    try {
      const r = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        return { ok: false, error: j.description ?? `HTTP ${r.status}` };
      }
      return { ok: true, message_id: String(j.result?.message_id ?? "") };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "unknown" };
    }
  });


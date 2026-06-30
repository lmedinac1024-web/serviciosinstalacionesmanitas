import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TELEGRAM_GATEWAY = "https://connector-gateway.lovable.dev/telegram";

function fmtEUR(n: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function downloadPhoto(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  url: string,
): Promise<Blob | null> {
  // foto path stored as full public-ish URL or as storage path; handle both
  try {
    if (url.startsWith("http")) {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.blob();
    }
    // assume "bucket/path" format
    const [bucket, ...rest] = url.split("/");
    const { data } = await supabase.storage.from(bucket).download(rest.join("/"));
    return data ?? null;
  } catch {
    return null;
  }
}

export const sendJobUpdateToTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string; fase: "inicio" | "final" }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;

    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      return { ok: false, skipped: true, reason: "telegram_not_connected" as const };
    }

    const { data: settings } = await supabase
      .from("user_settings")
      .select("telegram_chat_id")
      .eq("user_id", userId)
      .maybeSingle();

    const chatId = settings?.telegram_chat_id;
    if (!chatId) {
      return { ok: false, skipped: true, reason: "no_chat_id" as const };
    }

    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error || !job) return { ok: false, skipped: true, reason: "job_not_found" as const };

    const importe = Number(job.importe ?? 0);
    const cantidad = Number(job.cantidad ?? 1);
    const total = importe * cantidad;
    const address = [job.direccion, job.codigo_postal, job.ciudad].filter(Boolean).join(", ");

    let caption = "";
    let photoUrl: string | null = null;

    if (data.fase === "inicio") {
      caption =
        `🟦 <b>LLEGADA</b>\n` +
        `<b>Cliente:</b> ${escapeHtml(job.cliente)}\n` +
        `<b>Dirección:</b> ${escapeHtml(address)}\n` +
        (job.telefono ? `<b>Tel:</b> ${escapeHtml(job.telefono)}\n` : "") +
        `<b>Hora:</b> ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}\n` +
        `<b>Importe:</b> ${fmtEUR(importe)}`;
      photoUrl = job.foto_inicio;
    } else {
      caption =
        `✅ <b>TRABAJO REALIZADO</b>\n` +
        `<b>Cliente:</b> ${escapeHtml(job.cliente)}\n` +
        `<b>Dirección:</b> ${escapeHtml(address)}\n` +
        `<b>Hora fin:</b> ${new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}\n` +
        `<b>Importe:</b> ${fmtEUR(importe)}` +
        (cantidad > 1 ? ` × ${cantidad} = <b>${fmtEUR(total)}</b>` : "");
      photoUrl = job.foto_final;
    }

    const headers = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
    };

    try {
      if (photoUrl) {
        const blob = await downloadPhoto(supabase, photoUrl);
        if (blob) {
          const form = new FormData();
          form.append("chat_id", chatId);
          form.append("caption", caption);
          form.append("parse_mode", "HTML");
          form.append("photo", blob, "photo.jpg");
          const r = await fetch(`${TELEGRAM_GATEWAY}/sendPhoto`, {
            method: "POST",
            headers,
            body: form,
          });
          const j = await r.json();
          if (!r.ok || !j.ok) {
            return { ok: false, error: j.description ?? `HTTP ${r.status}` };
          }
          const msgId = String(j.result?.message_id ?? "");
          await supabase
            .from("jobs")
            .update(
              data.fase === "inicio"
                ? { telegram_inicio_msg_id: msgId }
                : { telegram_final_msg_id: msgId },
            )
            .eq("id", job.id);
          return { ok: true, message_id: msgId };
        }
      }
      // fallback: text only
      const r = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: "HTML" }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) return { ok: false, error: j.description ?? `HTTP ${r.status}` };
      return { ok: true, message_id: String(j.result?.message_id ?? "") };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "unknown" };
    }
  });

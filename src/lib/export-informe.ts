import { formatEUR, jobTotal, type Job } from "@/lib/jobs";

export type InformeFila = {
  empleado: string;
  trabajos: number;
  realizados: number;
  cancelados: number;
  total: number;
};

export type InformeData = {
  titulo: string;
  desde: string;
  hasta: string;
  filas: InformeFila[];
  detalle: { fecha: string; empleado: string; cliente: string; estado: string; total: number }[];
  total: number;
};

export function construirInforme(
  jobs: Job[],
  from: string,
  to: string,
  nombreEmpleado: (uid: string | null | undefined) => string,
): InformeData {
  const map = new Map<string, InformeFila>();
  const detalle: InformeData["detalle"] = [];
  let total = 0;

  for (const j of jobs) {
    const uid = (j.empleado_id ?? j.user_id) as string | null;
    const nombre = nombreEmpleado(uid);
    const t = jobTotal(j);
    total += t;
    const fila = map.get(nombre) ?? { empleado: nombre, trabajos: 0, realizados: 0, cancelados: 0, total: 0 };
    fila.trabajos += 1;
    if (j.estado === "realizado") fila.realizados += 1;
    else fila.cancelados += 1;
    fila.total += t;
    map.set(nombre, fila);
    detalle.push({ fecha: j.fecha, empleado: nombre, cliente: j.cliente, estado: j.estado, total: t });
  }

  detalle.sort((a, b) => (a.fecha === b.fecha ? a.empleado.localeCompare(b.empleado) : a.fecha < b.fecha ? -1 : 1));

  return {
    titulo: "Informe de ganancias por empleado",
    desde: from,
    hasta: to,
    filas: [...map.values()].sort((a, b) => b.total - a.total),
    detalle,
    total,
  };
}

function descargar(nombre: string, contenido: string, mime: string) {
  const blob = new Blob(["\uFEFF" + contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;

export function exportarCSV(data: InformeData) {
  const lineas: string[] = [];
  lineas.push(esc(data.titulo));
  lineas.push([esc("Desde"), esc(data.desde), esc("Hasta"), esc(data.hasta)].join(";"));
  lineas.push("");
  lineas.push(["Empleado", "Trabajos", "Realizados", "Cancelados", "Total EUR"].map(esc).join(";"));
  for (const f of data.filas) {
    lineas.push([esc(f.empleado), f.trabajos, f.realizados, f.cancelados, f.total.toFixed(2)].join(";"));
  }
  lineas.push([esc("TOTAL"), "", "", "", data.total.toFixed(2)].join(";"));
  lineas.push("");
  lineas.push(["Fecha", "Empleado", "Cliente", "Estado", "Total EUR"].map(esc).join(";"));
  for (const d of data.detalle) {
    lineas.push([esc(d.fecha), esc(d.empleado), esc(d.cliente), esc(d.estado), d.total.toFixed(2)].join(";"));
  }
  descargar(`informe-ganancias-${data.desde}_${data.hasta}.csv`, lineas.join("\r\n"), "text/csv;charset=utf-8");
}

export function exportarPDF(data: InformeData) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${data.titulo} ${data.desde} a ${data.hasta}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;margin:32px;}
  h1{font-size:20px;margin:0 0 4px}
  .sub{color:#64748b;font-size:12px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:12px}
  th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}
  th{background:#f1f5f9;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  tr.total td{font-weight:700;border-top:2px solid #0f172a}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin:0 0 8px}
  @media print{body{margin:12mm}}
</style></head><body>
<h1>${data.titulo}</h1>
<div class="sub">Periodo: ${data.desde} → ${data.hasta}</div>
<h2>Resumen por empleado</h2>
<table><thead><tr><th>Empleado</th><th class="num">Trabajos</th><th class="num">Realizados</th><th class="num">Cancelados</th><th class="num">Total</th></tr></thead><tbody>
${data.filas
  .map(
    (f) =>
      `<tr><td>${f.empleado}</td><td class="num">${f.trabajos}</td><td class="num">${f.realizados}</td><td class="num">${f.cancelados}</td><td class="num">${formatEUR(f.total)}</td></tr>`,
  )
  .join("")}
<tr class="total"><td>TOTAL</td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num">${formatEUR(data.total)}</td></tr>
</tbody></table>
<h2>Detalle de trabajos</h2>
<table><thead><tr><th>Fecha</th><th>Empleado</th><th>Cliente</th><th>Estado</th><th class="num">Total</th></tr></thead><tbody>
${data.detalle
  .map(
    (d) =>
      `<tr><td>${d.fecha}</td><td>${d.empleado}</td><td>${d.cliente}</td><td>${d.estado}</td><td class="num">${formatEUR(d.total)}</td></tr>`,
  )
  .join("")}
</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

export type ReportDoc = { title: string; style: string; body: string };

const KEY = "servihogar-report";

/** Guarda el informe a mostrar en la página /reporte (sobrevive a la navegación, no a recargar). */
export function setReport(doc: ReportDoc) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    // almacenamiento no disponible: la página mostrará el aviso de informe vacío
  }
}

export function getReport(): ReportDoc | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReportDoc) : null;
  } catch {
    return null;
  }
}

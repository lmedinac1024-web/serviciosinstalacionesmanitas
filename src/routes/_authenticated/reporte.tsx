import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getReport } from "@/lib/report-view";

export const Route = createFileRoute("/_authenticated/reporte")({
  component: Reporte,
  head: () => ({ meta: [
    { title: "ServiHogar · Informe imprimible" },
    { name: "description", content: "Vista imprimible del dashboard mensual o del informe de ganancias de ServiHogar." },
    { property: "og:title", content: "ServiHogar · Informe imprimible" },
    { property: "og:description", content: "Vista imprimible del dashboard mensual o del informe de ganancias de ServiHogar." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

function Reporte() {
  const navigate = useNavigate();
  const report = getReport();

  if (!report) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center text-foreground">
        <p className="text-base">No hay informe para mostrar. Volvé a generarlo desde el Dashboard o desde Ganancias.</p>
        <Button onClick={() => void navigate({ to: "/" })}><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="report-actions sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background p-3">
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir / Guardar PDF
        </Button>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `${report.style} @media print{.report-actions{display:none !important}}` }} />
      <div className="mx-auto max-w-3xl overflow-x-auto p-4" dangerouslySetInnerHTML={{ __html: report.body }} />
    </div>
  );
}

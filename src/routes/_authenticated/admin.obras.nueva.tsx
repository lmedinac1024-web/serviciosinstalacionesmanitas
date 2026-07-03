import { createFileRoute, Navigate } from "@tanstack/react-router";

// Reutiliza el formulario ya existente de /trabajo/nuevo.
export const Route = createFileRoute("/_authenticated/admin/obras/nueva")({
  component: () => <Navigate to="/trabajo/nuevo" />,
});

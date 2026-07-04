import { createStart, createMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Middleware optimizado para capturar errores de servidor en Vercel
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    // Si ya viene con formato de estado específico de TanStack, lo dejamos pasar sin tocarlo
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    
    console.error("[Vercel Server Error]: En función de servidor detectado ->", error);

    // Forzamos una respuesta estructurada que TanStack Start procese como JSON limpio
    const errorMessage = error instanceof Error ? error.message : "Error interno en la operación";
    const errorDetails = String(error);

    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: errorDetails,
        success: false
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json; charset=utf-8",
          "X-Server-Error": "true" // Bandera para debuggear en la consola de red
        },
      }
    );
  }
});

export const startInstance = createStart(() => ({
  // Aplicamos el errorMiddleware y el Auth de Supabase juntos en ambas capas
  // para garantizar la captura de errores tanto en las rutas como en los botones (serverFn)
  functionMiddleware: [errorMiddleware, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));

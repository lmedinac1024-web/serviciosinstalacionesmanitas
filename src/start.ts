import { createStart, createMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    
    console.error("Error en función de servidor detectado:", error);

    // Si el error ocurre durante una mutación de datos interna (serverFn),
    // devolvemos un JSON con el mensaje en lugar de romper la app con HTML.
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Error interno en la operación",
        details: String(error)
      }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      }
    );
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));

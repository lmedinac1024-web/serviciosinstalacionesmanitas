import { createStart, createMiddleware } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const functionErrorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("[Server Function Error]:", error);
    const errorMessage = error instanceof Error ? error.message : "Error interno en la operación";
    return new Response(
      JSON.stringify({ error: errorMessage, details: String(error), success: false }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Server-Error": "true",
        },
      }
    );
  }
});

const requestErrorMiddleware = createMiddleware({ type: "request" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error("[Server Request Error]:", error);
    throw error;
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [functionErrorMiddleware, attachSupabaseAuth],
  requestMiddleware: [requestErrorMiddleware],
}));

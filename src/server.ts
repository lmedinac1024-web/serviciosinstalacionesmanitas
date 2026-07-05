import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(request: Request, response: Response): Promise<Response> {
  if (response.status < 500) return response;
  
  const isServerFn = request.url.includes('/_serverFn') || request.headers.get("x-server-fn") !== null;
  const contentType = response.headers.get("content-type") ?? "";

  // Clonamos la respuesta para poder leer el cuerpo de forma segura sin romper el flujo
  const clonedResponse = response.clone();
  let body = "";
  try {
    body = await clonedResponse.text();
  } catch (e) {
    body = "";
  }

  // Si h3 se tragó el error, o si la respuesta es HTML y es un serverFn (lo cual está mal), lo corregimos
  const isH3Swallowed = body.includes('"unhandled":true') || body.includes('"message":"HTTPError"');
  const isHtmlInServerFn = isServerFn && contentType.includes("text/html");

  if (isH3Swallowed || isHtmlInServerFn) {
    const capturedError = consumeLastCapturedError();
    console.error("[Vercel Proxy] Error crítico normalizado:", capturedError ?? body);

    // Si es un botón o acción (serverFn), respondemos estrictamente con un JSON válido
    if (isServerFn) {
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          success: false,
        }),
        {
          status: 500,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
    }


    // Si era renderizado de página normal (SSR), devolvemos la interfaz HTML de error limpia
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return response;
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const isServerFn = request.url.includes('/_serverFn') || request.headers.get("x-server-fn") !== null;
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(request, response);
    } catch (error) {
      console.error("Error crítico absoluto detectado en fetch:", error);
      
      if (isServerFn) {
        return new Response(
          JSON.stringify({
            error: "Internal server error",
            success: false,
          }),
          {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8" },
          }
        );
      }


      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};

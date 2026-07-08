import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "ServiHogar — Gestión diaria" },
      { name: "description", content: "App para gestionar trabajos diarios, ganancias, fotos y rutas." },
      { name: "theme-color", content: "#1a3a5c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ServiHogar" },
      { property: "og:title", content: "ServiHogar — Gestión diaria" },
      { property: "og:description", content: "App para gestionar trabajos diarios, ganancias, fotos y rutas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "ServiHogar — Gestión diaria" },
      { name: "twitter:description", content: "App para gestionar trabajos diarios, ganancias, fotos y rutas." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/05e15f34-107d-459a-b47e-d219f18af291/id-preview-0a4dc3da--0ed288ed-416c-48b0-bfd3-1470a8e6c7cf.lovable.app-1783020125276.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/05e15f34-107d-459a-b47e-d219f18af291/id-preview-0a4dc3da--0ed288ed-416c-48b0-bfd3-1470a8e6c7cf.lovable.app-1783020125276.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Persistir caché de React Query en localStorage para trabajar sin conexión.
    // Sólo en cliente y sólo una vez.
    let cancelled = false;
    (async () => {
      try {
        const [{ persistQueryClient }, { createSyncStoragePersister }] = await Promise.all([
          import("@tanstack/react-query-persist-client"),
          import("@tanstack/query-sync-storage-persister"),
        ]);
        if (cancelled || typeof window === "undefined") return;
        const persister = createSyncStoragePersister({
          storage: window.localStorage,
          key: "servihogar-rq-cache-v1",
          throttleTime: 1000,
        });
        persistQueryClient({
          queryClient,
          persister,
          maxAge: 1000 * 60 * 60 * 24 * 7,
        });
      } catch {
        /* si no carga el persister, seguimos sin persistencia */
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
      // Si el signout ocurre offline (token caducado sin poder refrescar),
      // conservamos la caché para que el empleado siga viendo trabajos y
      // pueda encolar acciones. Sólo limpiamos en un signout con conexión.
      if (event === "SIGNED_OUT" && isOffline) return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      if (event === "SIGNED_OUT" && typeof window !== "undefined") {
        try { window.localStorage.removeItem("servihogar-rq-cache-v1"); } catch { /* noop */ }
      }
    });
    import("@/lib/register-sw").then((m) => m.registerServiceWorker()).catch(() => {});
    import("@/lib/offline-queue").then((m) => m.installAutoSync()).catch(() => {});
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}

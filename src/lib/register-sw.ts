// Guarded service-worker registration. Never registers in dev/preview/iframe.
export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const host = url.hostname;
  const isPreviewHost =
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev");
  const inIframe = window.self !== window.top;
  const killSwitch = url.searchParams.get("sw") === "off";
  const isDev = !import.meta.env.PROD;

  if (isDev || inIframe || isPreviewHost || killSwitch) {
    // Unregister any stale app SW so the preview stays clean.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => {
        const scriptURL = r.active?.scriptURL || "";
        if (scriptURL.endsWith("/sw.js")) r.unregister();
      });
    });
    return;
  }

  window.addEventListener("load", () => {
    import("virtual:pwa-register")
      .then(({ registerSW }) => registerSW({ immediate: true }))
      .catch(() => {});
  });
}

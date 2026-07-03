import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  Wallet,
  History,
  Settings,
  Plus,
  UserCircle2,
  LogOut,
  Send,
  UserSquare2,
  RefreshCw,
  KeyRound,
  Wrench,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { OfflineBanner } from "@/components/OfflineBanner";
import { processQueue, count as pendingCount, subscribe as subscribeQueue } from "@/lib/offline-queue";
import { toast } from "sonner";

type NavPath =
  | "/"
  | "/pendientes"
  | "/hoy"
  | "/ganancias"
  | "/historial"
  | "/ajustes"
  | "/admin/empleados"
  | "/admin/telegram"
  | "/admin/solicitudes"
  | "/admin/roles";

type NavItem = { to: NavPath; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const NAV_EMPLEADO: NavItem[] = [
  { to: "/", label: "Inicio", icon: LayoutDashboard, exact: true },
  { to: "/pendientes", label: "Pendientes", icon: ListChecks },
  { to: "/hoy", label: "Hoy", icon: CalendarDays },
  { to: "/ganancias", label: "Ganancias", icon: Wallet },
  { to: "/historial", label: "Historial", icon: History },
];

const NAV_ADMIN: NavItem[] = [
  { to: "/", label: "Panel", icon: LayoutDashboard, exact: true },
  { to: "/pendientes", label: "Trabajos", icon: ListChecks },
  { to: "/ganancias", label: "Ganancias", icon: Wallet },
  { to: "/historial", label: "Historial", icon: History },
];

const ADMIN_LINKS: NavItem[] = [
  { to: "/admin/empleados", label: "Usuarios", icon: UserSquare2 },
  { to: "/admin/telegram", label: "Telegram", icon: Send },
  { to: "/admin/solicitudes", label: "Solicitudes", icon: KeyRound },
];


const SUPER_LINKS: NavItem[] = [
  { to: "/admin/roles", label: "Roles", icon: UserCircle2 },
];

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useUserRole();
  const navigate = useNavigate();
  const isAdmin = me?.isAdmin;
  const NAV = isAdmin ? NAV_ADMIN : NAV_EMPLEADO;
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void pendingCount().then(setPending).catch(() => {});
    return subscribeQueue(() => { void pendingCount().then(setPending).catch(() => {}); });
  }, []);

  async function handleSignOut() {
    if (!confirm("¿Cerrar sesión?")) return;
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await processQueue();
      await qc.invalidateQueries();
      const n = await pendingCount();
      setPending(n);
      if (res.ok > 0) toast.success(`Sincronizado: ${res.ok} acción(es)`);
      else if (res.failed > 0) toast.error(`Fallaron ${res.failed} acción(es)`);
      else toast.success("Datos actualizados");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <OfflineBanner />
      {/* Sidebar - desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card md:flex">
        <div className="border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img
              src={logoAsset.url}
              alt="Servicios de Manitas"
              className="h-10 w-auto"
            />
            <div>
              <div className="text-sm font-bold leading-none">ServiHogar</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {isAdmin ? "Panel admin" : "Empleado"}
              </div>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV.map((item) => (
            <NavLink key={item.to} item={item} pathname={pathname} />
          ))}

          {isAdmin && (
            <>
              <div className="mt-5 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Administración
              </div>
              {ADMIN_LINKS.map((item) => (
                <NavLink key={item.to} item={item} pathname={pathname} />
              ))}
            </>
          )}

          {me?.isSuperAdmin && (
            <>
              <div className="mt-5 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Super admin
              </div>
              {SUPER_LINKS.map((item) => (
                <NavLink key={item.to} item={item} pathname={pathname} />
              ))}
            </>
          )}


          <div className="mt-5 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cuenta
          </div>
          <NavLink item={{ to: "/ajustes", label: "Ajustes", icon: Settings }} pathname={pathname} />
        </nav>

        <div className="space-y-2 border-t p-3">
          {isAdmin && (
            <Link
              to="/trabajo/nuevo"
              className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Nuevo servicio
            </Link>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex w-full items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Sincronizando..." : pending > 0 ? `Sincronizar (${pending})` : "Sincronizar"}
          </button>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
          <div className="flex items-center gap-2 truncate px-1 pt-1 text-[11px] text-muted-foreground">
            <UserCircle2 className="h-3.5 w-3.5" />
            <span className="truncate">{me?.displayName || me?.username || "—"}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="md:pl-64">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold md:text-lg">
                {title ?? (me?.displayName || me?.username || "Mi panel")}
              </h1>
              {isAdmin && <div className="text-[10px] uppercase tracking-wider text-primary">{me?.isSuperAdmin ? "Super Admin" : "Admin"}</div>}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-accent disabled:opacity-60 md:hidden"
                title="Sincronizar"
              >
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                {pending > 0 && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {pending}
                  </span>
                )}
              </button>
              <button
                onClick={handleSignOut}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10 md:hidden"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
              {isAdmin && (
                <Link
                  to="/trabajo/nuevo"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground md:hidden"
                >
                  <Plus className="h-4 w-4" /> Nuevo
                </Link>
              )}
            </div>
          </div>
        </header>
        <div className="px-4 pb-24 pt-4 md:px-6 md:pb-8">{children}</div>
      </main>

      {/* Bottom nav - mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card md:hidden">
        <div className={cn("grid", NAV.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80 hover:bg-accent",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

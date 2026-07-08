import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Briefcase, Users, UserSquare2, Send, KeyRound, UserCircle2,
  LogOut, Plus, Menu, X, ArrowLeft, ShieldCheck,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import logoManitas from "@/assets/logo-manitas.png.asset.json";
import { cn } from "@/lib/utils";
import { OfflineBanner } from "@/components/OfflineBanner";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/obras", label: "Obras", icon: Briefcase },
  { to: "/admin/empleados", label: "Empleados", icon: Users },
  { to: "/admin/clientes", label: "Clientes", icon: UserSquare2 },
  { to: "/admin/telegram", label: "Telegram", icon: Send },
  { to: "/admin/solicitudes", label: "Solicitudes", icon: KeyRound },
];

const SUPER: NavItem[] = [
  { to: "/admin/roles", label: "Roles", icon: UserCircle2 },
];

export function AdminShell({
  children, title, subtitle, actions,
}: { children: ReactNode; title: string; subtitle?: string; actions?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: me } = useUserRole();
  const navigate = useNavigate();
  const [openMobile, setOpenMobile] = useState(false);

  async function signOut() {
    if (!confirm("¿Cerrar sesión?")) return;
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const active = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  return (
    <div className="min-h-screen bg-muted/30">
      <OfflineBanner />
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card lg:flex">
        <SidebarBody
          NAV={NAV}
          SUPER={me?.isSuperAdmin ? SUPER : []}
          active={active}
          me={me}
          signOut={signOut}
        />
      </aside>

      {/* Sidebar móvil (drawer) */}
      {openMobile && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpenMobile(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r bg-card" onClick={(e) => e.stopPropagation()}>
            <SidebarBody
              NAV={NAV}
              SUPER={me?.isSuperAdmin ? SUPER : []}
              active={active}
              me={me}
              signOut={signOut}
              onNavigate={() => setOpenMobile(false)}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 lg:px-8">
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background lg:hidden"
              onClick={() => setOpenMobile(true)}
              aria-label="Menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold lg:text-xl">{title}</h1>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
            </div>
          </div>
        </header>
        <main className="px-4 pb-12 pt-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarBody({
  NAV, SUPER, active, me, signOut, onNavigate,
}: {
  NAV: NavItem[];
  SUPER: NavItem[];
  active: (i: NavItem) => boolean;
  me: ReturnType<typeof useUserRole>["data"];
  signOut: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2.5">
          <img src={logoManitas.url} alt="Servicios de Manitas" className="h-11 w-11 shrink-0 rounded-lg object-contain" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-none">Servicios de Manitas</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-primary">Panel admin</div>
          </div>
        </div>
        {onNavigate && (
          <button onClick={onNavigate} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition",
              active(item)
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80 hover:bg-accent hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}

        {SUPER.length > 0 && (
          <>
            <div className="mt-5 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Super admin
            </div>
            {SUPER.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition",
                  active(item)
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/80 hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="space-y-2 border-t p-3">
        <Link
          to="/admin/obras/nueva"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nueva obra
        </Link>
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Vista empleado
        </Link>
        <button
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
        <div className="flex items-center gap-2 truncate px-1 pt-1 text-[11px] text-muted-foreground">
          <UserCircle2 className="h-3.5 w-3.5" />
          <span className="truncate">{me?.displayName || me?.username || "—"}</span>
          {me?.isSuperAdmin && <span className="rounded bg-primary/20 px-1 text-[9px] font-bold text-primary">SUPER</span>}
        </div>
      </div>
    </>
  );
}

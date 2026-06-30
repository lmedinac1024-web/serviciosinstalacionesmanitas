import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ListChecks,
  CalendarDays,
  Wallet,
  History,
  Settings,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Inicio", icon: LayoutDashboard, exact: true },
  { to: "/pendientes", label: "Pendientes", icon: ListChecks },
  { to: "/hoy", label: "Hoy", icon: CalendarDays },
  { to: "/ganancias", label: "Ganancias", icon: Wallet },
  { to: "/historial", label: "Historial", icon: History },
] as const;

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar - desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card md:flex">
        <div className="px-5 py-5">
          <div className="text-lg font-bold tracking-tight">Mis Trabajos</div>
          <div className="text-xs text-muted-foreground">Panel de control</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/80 hover:bg-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <Link
            to="/ajustes"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/ajustes")
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80 hover:bg-accent",
            )}
          >
            <Settings className="h-4 w-4" /> Ajustes
          </Link>
        </nav>
        <div className="p-3">
          <Link
            to="/trabajo/nuevo"
            className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nuevo trabajo
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="md:pl-60">
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 md:px-6">
            <h1 className="text-base font-semibold md:text-lg">{title ?? "Mis Trabajos"}</h1>
            <Link
              to="/trabajo/nuevo"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground md:hidden"
            >
              <Plus className="h-4 w-4" /> Nuevo
            </Link>
          </div>
        </header>
        <div className="px-4 pb-24 pt-4 md:px-6 md:pb-8">{children}</div>
      </main>

      {/* Bottom nav - mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card md:hidden">
        <div className="grid grid-cols-5">
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

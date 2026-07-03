import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { usernameToEmail } from "@/lib/auth-helpers";
import { Briefcase, HelpCircle, UserPlus, Users, Send, ShieldCheck } from "lucide-react";
import logoAsset from "@/assets/logo-manitas.png.asset.json";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetUsername, setResetUsername] = useState("");
  const [resetNota, setResetNota] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    setResetLoading(true);
    try {
      const uname = resetUsername.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
      if (!uname) throw new Error("Usuario inválido");
      const { error } = await supabase.from("password_reset_requests").insert({
        username: uname,
        nota: resetNota.trim() || null,
        estado: "pendiente",
      });
      if (error) throw error;
      toast.success("Solicitud enviada. Espera a que el administrador la apruebe.");
      setResetOpen(false);
      setResetUsername("");
      setResetNota("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar la solicitud");
    } finally {
      setResetLoading(false);
    }
  }


  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const emailAttempt = usernameToEmail(username);
      const { error } = await supabase.auth.signInWithPassword({ email: emailAttempt, password });
      if (error) {
        const { error: e2 } = await supabase.auth.signInWithPassword({ email: username.trim(), password });
        if (e2) throw error;
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Usuario o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  }

  async function submitSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            username: displayName.trim() || email.split("@")[0],
            display_name: displayName.trim() || email.split("@")[0],
          },
        },
      });
      if (error) throw error;
      toast.success("Cuenta creada. Iniciando sesión...");
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInErr) {
        toast.info("Revisa tu email para confirmar la cuenta y vuelve a entrar.");
        setMode("login");
        return;
      }
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl border bg-card p-7 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src={logoAsset.url}
            alt="Servicios de Manitas"
            className="h-24 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ServiHogar</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login" ? "Entra con tu usuario" : "Crea tu cuenta de administrador"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md py-2 font-medium transition ${
              mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`rounded-md py-2 font-medium transition ${
              mode === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"
            }`}
          >
            Primer acceso
          </button>
        </div>

        {mode === "login" ? (
          <form onSubmit={submitLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                autoComplete="username"
                required
                placeholder="user1"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
              {loading ? "Entrando..." : "Entrar"}
            </Button>
            <button
              type="button"
              onClick={() => { setResetUsername(username); setResetOpen(true); }}
              className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>

        ) : (
          <form onSubmit={submitSignup} className="space-y-4">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
              El <strong>primer usuario registrado</strong> se convierte en <strong>administrador</strong> automáticamente. Después, el resto de empleados se crean desde el panel Admin.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                placeholder="tucorreo@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Nombre a mostrar (opcional)</Label>
              <Input
                id="displayName"
                placeholder="Juan"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
              {loading ? "Creando cuenta..." : "Crear cuenta admin"}
            </Button>
          </form>
        )}

        <Dialog open={resetOpen} onOpenChange={setResetOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Recuperar contraseña</DialogTitle>
              <DialogDescription>
                Envía una solicitud al administrador. Cuando la apruebe, te dará la nueva contraseña.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submitReset} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="resetUsername">Usuario</Label>
                <Input
                  id="resetUsername"
                  required
                  placeholder="user1"
                  value={resetUsername}
                  onChange={(e) => setResetUsername(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resetNota">Nota (opcional)</Label>
                <Input
                  id="resetNota"
                  placeholder="La olvidé…"
                  value={resetNota}
                  onChange={(e) => setResetNota(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={resetLoading}>
                  {resetLoading ? "Enviando..." : "Enviar solicitud"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>



        <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" className="w-full gap-2 text-sm">
              <HelpCircle className="h-4 w-4" />
              ¿Primera vez? Ver guía rápida
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Guía de primer acceso</DialogTitle>
              <DialogDescription>
                Sigue estos pasos para dejar la app lista en pocos minutos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <Step
                icon={<UserPlus className="h-4 w-4" />}
                title="1. Regístrate como admin"
                text='En esta pantalla, pulsa "Primer acceso" y crea tu cuenta con tu email. El primer usuario del sistema queda automáticamente como administrador.'
              />
              <Step
                icon={<Users className="h-4 w-4" />}
                title="2. Crea a tus empleados"
                text='Dentro de la app, ve al menú lateral → Admin → Empleados. Ahí generas usuarios tipo "user1", "user2"… con su contraseña. Ellos entrarán con ese usuario en la pantalla "Entrar".'
              />
              <Step
                icon={<Send className="h-4 w-4" />}
                title="3. Configura destinos de Telegram"
                text="Menú lateral → Admin → Destinos Telegram. Añade cada chat o canal (con su Chat ID) y prueba el envío con el botón ✈️ antes de guardarlo."
              />
              <Step
                icon={<ShieldCheck className="h-4 w-4" />}
                title="4. Empleados eligen sus destinos"
                text="Cada empleado, desde Ajustes, marca qué destinos de Telegram puede usar y cuáles son sus favoritos (⭐). Esos favoritos vienen premarcados al pulsar Llegué o Finalizar."
              />
            </div>
            <DialogFooter>
              <Button className="w-full" onClick={() => setGuideOpen(false)}>
                Entendido
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <p className="text-center text-xs text-muted-foreground">
          {mode === "login"
            ? "Las cuentas de empleado las crea el administrador."
            : "Si ya existe un administrador, entra desde la pestaña Entrar."}
        </p>
      </div>
    </div>
  );
}

function Step({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

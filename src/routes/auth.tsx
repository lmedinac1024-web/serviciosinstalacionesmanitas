import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { usernameToEmail } from "@/lib/auth-helpers";
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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-7 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src={logoAsset.url}
            alt="Servicios de Manitas"
            className="h-28 w-auto"
          />
        </div>

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
            {loading ? "Entrando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}

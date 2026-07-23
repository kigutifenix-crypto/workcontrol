import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — FitControl" },
      { name: "description", content: "Acesse a plataforma FitControl para gerenciar tarefas e produção da oficina." },
      { property: "og:title", content: "Entrar — FitControl" },
      { property: "og:description", content: "Acesso ao sistema de gestão de oficina FitControl." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [session, loading]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) return toast.error("Falha ao entrar", { description: error.message });
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { name: String(form.get("name")) },
      },
    });
    setBusy(false);
    if (error) return toast.error("Falha ao cadastrar", { description: error.message });
    toast.success("Cadastro realizado", { description: "Você já pode entrar." });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-gradient-surface overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-ember shadow-ember">
            <Dumbbell className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <div className="font-display text-xl font-bold tracking-tight">FitControl</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Logística & Oficina</div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface-elevated px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Sistema Operacional
          </div>
          <h1 className="font-display text-5xl font-black leading-[1.05] tracking-tight">
            Controle industrial da <span className="text-primary">produção</span>, do chão da oficina.
          </h1>
          <p className="text-lg text-muted-foreground">
            Montagem, pintura, limpeza, manutenção e embalagem — tudo em um só painel, com evidências fotográficas e métricas em tempo real.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-6">
            {[
              { k: "Tarefas", v: "Kanban" },
              { k: "Provas", v: "Fotos" },
              { k: "Métricas", v: "Ao vivo" },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-border/60 bg-surface-elevated/60 p-4">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{s.k}</div>
                <div className="mt-1 font-display font-bold">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-muted-foreground">© FitControl Logística</div>
      </div>

      {/* Auth panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-ember shadow-ember">
              <Dumbbell className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="font-display text-lg font-bold">FitControl</div>
          </div>

          <div>
            <h2 className="font-display text-3xl font-bold">Acessar a plataforma</h2>
            <p className="mt-2 text-sm text-muted-foreground">Entre para gerenciar suas tarefas do dia.</p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-surface-elevated">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" name="email" type="email" required placeholder="voce@fitcontrol.com" className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input id="login-password" name="password" type="password" required placeholder="••••••••" className="h-11" />
                </div>
                <Button type="submit" disabled={busy} className="w-full h-11 bg-gradient-ember shadow-ember font-semibold">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar no sistema"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Nome completo</Label>
                  <Input id="signup-name" name="name" required placeholder="João Silva" className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" name="email" type="email" required placeholder="voce@fitcontrol.com" className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input id="signup-password" name="password" type="password" required minLength={6} placeholder="Mínimo 6 caracteres" className="h-11" />
                </div>
                <Button type="submit" disabled={busy} className="w-full h-11 bg-gradient-ember shadow-ember font-semibold">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ListChecks,
  Columns3,
  Wrench,
  LogOut,
  Dumbbell,
  Menu,
  X,
  ShieldCheck,
  Users,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, desc: "Visão geral" },
  { to: "/my-tasks", label: "Minhas Tarefas", icon: ListChecks, desc: "Do dia" },
  { to: "/tasks", label: "Quadro Kanban", icon: Columns3, desc: "Fluxo visual" },
  { to: "/all-tasks", label: "Todas as Tarefas", icon: ClipboardList, desc: "Listagem geral" },
  { to: "/machines", label: "Máquinas", icon: Wrench, desc: "Equipamentos" },
] as const;

export function AppShell({ children, title, subtitle, actions }: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { profile, user, isSupervisor, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  const initials = (profile?.name ?? user?.email ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 bg-gradient-surface border-r border-border/60 flex flex-col transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between p-6">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-ember shadow-ember">
              <Dumbbell className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-display text-lg font-bold leading-none">FitControl</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Oficina</div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Profile card */}
        <div className="mx-4 rounded-2xl border border-border/60 bg-surface-elevated p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-ember font-display font-bold text-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{profile?.name ?? "Carregando..."}</div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              isSupervisor ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground"
            )}>
              {isSupervisor && <ShieldCheck className="h-3 w-3" />}
              {isSupervisor ? "Supervisor" : profile?.badge ?? "Operacional"}
            </span>
          </div>
        </div>

        <nav className="mt-6 flex-1 space-y-1 px-3">
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--color-primary)]"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className={cn(
                  "grid h-9 w-9 place-items-center rounded-lg transition-colors",
                  active ? "bg-gradient-ember text-primary-foreground shadow-ember" : "bg-accent/60 group-hover:bg-accent"
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{item.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.desc}</span>
                </span>
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              to="/users"
              onClick={() => setOpen(false)}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                pathname === "/users" || pathname.startsWith("/users/")
                  ? "bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--color-primary)]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className={cn(
                "grid h-9 w-9 place-items-center rounded-lg transition-colors",
                pathname === "/users" ? "bg-gradient-ember text-primary-foreground shadow-ember" : "bg-accent/60 group-hover:bg-accent"
              )}>
                <Users className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">Usuários</span>
                <span className="block text-[11px] text-muted-foreground">Gestão de acessos</span>
              </span>
            </Link>
          )}
        </nav>

        <div className="p-4">
          <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
            Sair do sistema
          </Button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center gap-4 px-4 sm:px-8 py-4">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden grid h-9 w-9 place-items-center rounded-lg border border-border"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-2xl font-bold">{title}</h1>
              {subtitle && <p className="truncate text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
          </div>
        </header>

        <main className="p-4 sm:p-8">{children}</main>
      </div>
    </div>
  );
}

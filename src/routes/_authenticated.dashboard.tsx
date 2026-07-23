import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { STATUS, TASK_TYPES, typeIcon } from "@/lib/task-utils";
import { TaskDetailModal, type TaskDetail } from "@/components/task-detail-modal";
import { Activity, CheckCircle2, Clock, ListChecks, Package, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FitControl" },
      { name: "description", content: "Métricas em tempo real da produção da oficina." },
      { property: "og:title", content: "Dashboard — FitControl" },
      { property: "og:description", content: "Painel operacional com métricas e desempenho da produção." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { profile } = useAuth();
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: machines = [] } = useQuery({
    queryKey: ["machines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("machines").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const byStatus = (s: string) => tasks.filter((t) => t.status === s).length;
  const total = tasks.length;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const doneToday = tasks.filter(
    (t) => t.status === "done" && t.completed_at && new Date(t.completed_at).toDateString() === new Date().toDateString(),
  ).length;

  const byType = TASK_TYPES.map((t) => ({
    type: t,
    total: tasks.filter((x) => x.type === t).length,
    done: tasks.filter((x) => x.type === t && x.status === "done").length,
  }));

  const recent = tasks.slice(0, 6);
  const firstName = profile?.name?.split(" ")[0] ?? "";

  return (
    <AppShell
      title={`Olá, ${firstName || "colaborador"} 👋`}
      subtitle="Visão geral da produção e serviços da oficina hoje."
    >
      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ListChecks}
          label="Tarefas totais"
          value={total}
          hint="cadastradas no sistema"
          tone="primary"
        />
        <MetricCard
          icon={Clock}
          label="Em andamento"
          value={byStatus("progress")}
          hint={`${pct(byStatus("progress"))}% do total`}
          tone="info"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Concluídas hoje"
          value={doneToday}
          hint={`${byStatus("done")} totais`}
          tone="success"
        />
        <MetricCard
          icon={Package}
          label="Máquinas ativas"
          value={machines.length}
          hint="equipamentos"
          tone="warning"
        />
      </div>

      {/* Two-column: production breakdown + recent tasks */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-border/60 bg-card shadow-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-lg font-bold flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Produção por Categoria
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Volume de tarefas e conclusão por operação</p>
            </div>
          </div>
          <div className="space-y-5">
            {byType.map((row) => {
              const p = row.total ? Math.round((row.done / row.total) * 100) : 0;
              return (
                <div key={row.type}>
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-semibold flex items-center gap-2">
                      <span className="text-lg">{typeIcon(row.type)}</span>
                      {row.type}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {row.done}/{row.total} <span className="text-primary font-semibold">{p}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-accent/60">
                    <div
                      className="h-full bg-gradient-ember transition-all"
                      style={{ width: `${row.total ? Math.max(4, (row.total / Math.max(...byType.map((b) => b.total), 1)) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {byType.every((r) => r.total === 0) && (
              <div className="text-center text-sm text-muted-foreground py-8">
                Nenhuma tarefa cadastrada ainda.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card shadow-card p-6">
          <h3 className="font-display text-lg font-bold flex items-center gap-2 mb-6">
            <Activity className="h-5 w-5 text-primary" />
            Status do Fluxo
          </h3>
          <div className="space-y-3">
            {STATUS.map((s) => {
              const n = byStatus(s.id);
              return (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface-elevated p-3">
                  <span className={cn("inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase border", s.tone)}>
                    {s.label}
                  </span>
                  <span className="ml-auto font-display text-2xl font-bold tabular-nums">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent */}
      <div className="mt-6 rounded-2xl border border-border/60 bg-card shadow-card p-6">
        <h3 className="font-display text-lg font-bold mb-4">Últimas atividades</h3>
        {recent.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">
            Nenhuma tarefa registrada. Comece criando uma no <span className="text-primary font-semibold">Quadro Kanban</span>.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {recent.map((t) => {
              const st = STATUS.find((s) => s.id === t.status);
              return (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelectedTask(t as TaskDetail);
                    setDetailOpen(true);
                  }}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3 cursor-pointer hover:bg-accent/40 rounded-xl px-2 transition-colors"
                >
                  <span className="text-2xl">{typeIcon(t.type)}</span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-foreground">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.type} · {new Date(t.created_at).toLocaleString("pt-BR")}</div>
                  </div>
                  <span className={cn("shrink-0 inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase border", st?.tone)}>
                    {st?.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Detalhes da Tarefa */}
      <TaskDetailModal
        task={selectedTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </AppShell>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint: string;
  tone: "primary" | "info" | "success" | "warning";
}) {
  const map = {
    primary: "bg-gradient-ember text-primary-foreground shadow-ember",
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
  } as const;
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-4xl font-bold tabular-nums">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        </div>
        <span className={cn("grid h-11 w-11 place-items-center rounded-xl", map[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

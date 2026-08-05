import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { STATUS, TASK_TYPES, typeIcon, priorityTone, calculateTaskTimings as calculateGlobalTaskTimings } from "@/lib/task-utils";
import {
  GitCompare,
  TrendingUp,
  Users,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Calendar,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Coffee,
  PlayCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

export const Route = createFileRoute("/_authenticated/comparison")({
  head: () => ({
    meta: [
      { title: "Comparador de Desempenho — FitControl" },
      { name: "description", content: "Compare a produtividade entre colaboradores ou analise a evolução temporal por meses e semanas." },
    ],
  }),
  component: ComparisonPage,
});

type ComparisonTab = "temporal" | "colaboradores";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const YEARS = [2024, 2025, 2026, 2027];

const WEEKS_PT = [
  { id: 1, label: "Semana 1 (Dias 1 a 7)" },
  { id: 2, label: "Semana 2 (Dias 8 a 14)" },
  { id: 3, label: "Semana 3 (Dias 15 a 21)" },
  { id: 4, label: "Semana 4 (Dias 22 a 28)" },
  { id: 5, label: "Semana 5 (Dias 29 em diante)" },
];

function ComparisonPage() {
  const { isSupervisor } = useAuth();

  // Tab State
  const [activeTab, setActiveTab] = useState<ComparisonTab>("temporal");

  // Fetch data
  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["comparison-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["comparison-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,name,badge")).data ?? [],
  });

  // State: Temporal Comparison
  const [temporalType, setTemporalType] = useState<"month" | "week">("month");
  const [tempEmployeeId, setTempEmployeeId] = useState<string>("all");
  
  // Period 1
  const [t1Month, setT1Month] = useState<number>(new Date().getMonth() === 0 ? 11 : new Date().getMonth() - 1);
  const [t1Year, setT1Year] = useState<number>(new Date().getFullYear());
  const [t1Week, setT1Week] = useState<number>(1);
  
  // Period 2
  const [t2Month, setT2Month] = useState<number>(new Date().getMonth());
  const [t2Year, setT2Year] = useState<number>(new Date().getFullYear());
  const [t2Week, setT2Week] = useState<number>(2);

  // State: Collaborators Comparison
  const [colabIdA, setColabIdA] = useState<string>("");
  const [colabIdB, setColabIdB] = useState<string>("");
  const [colabDaysRange, setColabDaysRange] = useState<string>("30"); // 7, 30, 90

  // Helpers for calculations
  const calculateTaskTimings = (task: any) => {
    return calculateGlobalTaskTimings(task, Date.now());
  };

  const formatHrsMin = (ms: number) => {
    if (ms <= 0) return "0m";
    const minutes = Math.floor(ms / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  // ------------------ TEMPORAL COMPARISON LOGIC ------------------
  const filterTasksForPeriod = (tasks: any[], type: "month" | "week", year: number, month: number, week: number) => {
    return tasks.filter((t) => {
      const date = new Date(t.created_at);
      if (date.getFullYear() !== year || date.getMonth() !== month) return false;
      if (type === "week") {
        const day = date.getDate();
        if (week === 1) return day >= 1 && day <= 7;
        if (week === 2) return day >= 8 && day <= 14;
        if (week === 3) return day >= 15 && day <= 21;
        if (week === 4) return day >= 22 && day <= 28;
        if (week === 5) return day >= 29;
      }
      return true;
    });
  };

  const temporalStats = useMemo(() => {
    if (isLoadingTasks || allTasks.length === 0) return null;

    // Filter by employee if specific is selected
    let baseTasks = allTasks;
    if (tempEmployeeId !== "all") {
      baseTasks = allTasks.filter((t) => t.assignee_id === tempEmployeeId);
    }

    const tasksP1 = filterTasksForPeriod(baseTasks, temporalType, t1Year, t1Month, t1Week);
    const tasksP2 = filterTasksForPeriod(baseTasks, temporalType, t2Year, t2Month, t2Week);

    const calcMetrics = (tasks: any[]) => {
      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === "done").length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      
      let activeMs = 0;
      let pausedMs = 0;
      let pauseCount = 0;

      tasks.forEach((t) => {
        const timings = calculateTaskTimings(t);
        activeMs += timings.activeMs;
        pausedMs += timings.pausedMs;
        pauseCount += Array.isArray(t.intervals) ? t.intervals.length : 0;
      });

      const avgActiveMs = completed > 0 ? Math.round(activeMs / completed) : 0;

      return {
        total,
        completed,
        rate,
        activeMs,
        pausedMs,
        pauseCount,
        avgActiveMs,
        activeHrs: Math.round((activeMs / 3600000) * 10) / 10,
        pausedHrs: Math.round((pausedMs / 3600000) * 10) / 10,
        avgActiveMin: Math.round(avgActiveMs / 60000)
      };
    };

    const m1 = calcMetrics(tasksP1);
    const m2 = calcMetrics(tasksP2);

    // Delta helpers
    const getDelta = (v1: number, v2: number) => v2 - v1;
    const getDeltaPct = (v1: number, v2: number) => {
      if (v1 === 0) return v2 > 0 ? 100 : 0;
      return Math.round(((v2 - v1) / v1) * 100);
    };

    // Category Distribution (Grouped Bar Chart data)
    const categoryDistribution: any[] = [];
    TASK_TYPES.forEach((cat) => {
      const countP1 = tasksP1.filter((t) => t.type === cat).length;
      const countP2 = tasksP2.filter((t) => t.type === cat).length;
      if (countP1 > 0 || countP2 > 0) {
        categoryDistribution.push({
          name: cat,
          "Período 1": countP1,
          "Período 2": countP2,
        });
      }
    });

    const labelP1 = temporalType === "month" ? `${MONTHS_PT[t1Month]}/${String(t1Year).slice(-2)}` : `Sem. ${t1Week} de ${MONTHS_PT[t1Month].slice(0, 3)}`;
    const labelP2 = temporalType === "month" ? `${MONTHS_PT[t2Month]}/${String(t2Year).slice(-2)}` : `Sem. ${t2Week} de ${MONTHS_PT[t2Month].slice(0, 3)}`;

    return {
      p1: m1,
      p2: m2,
      labels: { p1: labelP1, p2: labelP2 },
      deltas: {
        total: getDelta(m1.total, m2.total),
        totalPct: getDeltaPct(m1.total, m2.total),
        completed: getDelta(m1.completed, m2.completed),
        completedPct: getDeltaPct(m1.completed, m2.completed),
        rate: getDelta(m1.rate, m2.rate),
        activeHrs: Math.round(getDelta(m1.activeHrs, m2.activeHrs) * 10) / 10,
        activeHrsPct: getDeltaPct(m1.activeHrs, m2.activeHrs),
        pauses: getDelta(m1.pauseCount, m2.pauseCount),
        avgActiveMin: getDelta(m1.avgActiveMin, m2.avgActiveMin)
      },
      categoryDistribution
    };
  }, [allTasks, isLoadingTasks, temporalType, tempEmployeeId, t1Month, t1Year, t1Week, t2Month, t2Year, t2Week]);

  // ------------------ COLLABORATORS COMPARISON LOGIC ------------------
  const colabStats = useMemo(() => {
    if (isLoadingTasks || allTasks.length === 0 || !colabIdA || !colabIdB) return null;

    const daysLimit = Number(colabDaysRange);
    const startTimestamp = Date.now() - daysLimit * 24 * 60 * 60 * 1000;

    const colabTasksA = allTasks.filter((t) => t.assignee_id === colabIdA && new Date(t.created_at).getTime() >= startTimestamp);
    const colabTasksB = allTasks.filter((t) => t.assignee_id === colabIdB && new Date(t.created_at).getTime() >= startTimestamp);

    const calcColabMetrics = (tasks: any[], name: string) => {
      const total = tasks.length;
      const completed = tasks.filter((t) => t.status === "done").length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

      let activeMs = 0;
      let pausedMs = 0;
      let pauseCount = 0;

      tasks.forEach((t) => {
        const timings = calculateTaskTimings(t);
        activeMs += timings.activeMs;
        pausedMs += timings.pausedMs;
        pauseCount += Array.isArray(t.intervals) ? t.intervals.length : 0;
      });

      const avgActiveMs = completed > 0 ? Math.round(activeMs / completed) : 0;

      return {
        name,
        total,
        completed,
        rate,
        activeHrs: Math.round((activeMs / 3600000) * 10) / 10,
        pausedHrs: Math.round((pausedMs / 3600000) * 10) / 10,
        pauseCount,
        avgActiveMin: Math.round(avgActiveMs / 60000),
        avgActiveHrs: Math.round((avgActiveMs / 3600000) * 10) / 10
      };
    };

    const nameA = profiles.find((p) => p.id === colabIdA)?.name || "Colaborador A";
    const nameB = profiles.find((p) => p.id === colabIdB)?.name || "Colaborador B";

    const metricsA = calcColabMetrics(colabTasksA, nameA);
    const metricsB = calcColabMetrics(colabTasksB, nameB);

    // Grouped Chart Data
    const chartData = [
      {
        name: "Total Criadas",
        [nameA]: metricsA.total,
        [nameB]: metricsB.total,
      },
      {
        name: "Concluídas",
        [nameA]: metricsA.completed,
        [nameB]: metricsB.completed,
      },
      {
        name: "Horas Ativas",
        [nameA]: metricsA.activeHrs,
        [nameB]: metricsB.activeHrs,
      },
      {
        name: "Qtd. Pausas",
        [nameA]: metricsA.pauseCount,
        [nameB]: metricsB.pauseCount,
      }
    ];

    return {
      a: metricsA,
      b: metricsB,
      chartData
    };
  }, [allTasks, isLoadingTasks, colabIdA, colabIdB, colabDaysRange, profiles]);

  // Delta UI formatting helper
  const renderDelta = (value: number, isPercent = false, invertColors = false) => {
    if (value === 0) {
      return (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
          <Minus className="h-3 w-3" /> 0{isPercent && "%"}
        </span>
      );
    }
    const isPositive = value > 0;
    
    // For average execution speed, smaller is better, so we invert colors
    const isGood = invertColors ? !isPositive : isPositive;

    return (
      <span className={cn(
        "inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded",
        isGood 
          ? "bg-success/15 text-success border border-success/20" 
          : "bg-destructive/15 text-destructive border border-destructive/20"
      )}>
        {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {isPositive ? "+" : ""}{value}{isPercent && "%"}
      </span>
    );
  };

  if (!isSupervisor) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-muted-foreground p-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-lg font-bold text-foreground mb-1">Acesso Restrito</h2>
        <p className="text-sm mb-4 text-center">Você não tem permissão para visualizar comparativos de desempenho.</p>
        <Button asChild>
          <Link to="/">Voltar ao Início</Link>
        </Button>
      </div>
    );
  }

  return (
    <AppShell
      title="Comparativo de Desempenho"
      subtitle="Analise tendências operacionais, evoluções por período ou compare colaboradores lado a lado."
    >
      {/* Navigation tabs */}
      <div className="flex border-b border-border/50 pb-px mb-6 print:hidden">
        <button
          onClick={() => setActiveTab("temporal")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all",
            activeTab === "temporal"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Calendar className="h-4 w-4" /> Comparar Períodos
        </button>
        <button
          onClick={() => setActiveTab("colaboradores")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all",
            activeTab === "colaboradores"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <GitCompare className="h-4 w-4" /> Comparar Colaboradores
        </button>
      </div>

      {/* -------------------- TAB 1: TEMPORAL COMPARISON -------------------- */}
      {activeTab === "temporal" && (
        <div className="space-y-6">
          {/* Query Parameters Box */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-6 print:hidden">
            <div className="flex items-center gap-2 pb-3 border-b border-border/40">
              <Calendar className="h-5 w-5 text-primary" />
              <h2 className="font-display font-bold text-lg">Parâmetros de Comparação Temporal</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* Compare Type */}
              <div className="space-y-2">
                <Label>Nível do Intervalo</Label>
                <Select value={temporalType} onValueChange={(val) => setTemporalType(val as "month" | "week")}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Mensal (Mês vs Mês)</SelectItem>
                    <SelectItem value="week">Semanal (Semana vs Semana)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Specific Collaborator filter */}
              <div className="space-y-2">
                <Label>Colaborador analisado</Label>
                <Select value={tempEmployeeId} onValueChange={setTempEmployeeId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Colaboradores (Geral)</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 pt-2 border-t border-border/40">
              {/* Period 1 selection */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Período 1 (Referência)</h4>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Mês</Label>
                    <Select value={String(t1Month)} onValueChange={(val) => setT1Month(Number(val))}>
                      <SelectTrigger className="bg-background h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS_PT.map((m, idx) => (
                          <SelectItem key={m} value={String(idx)} className="text-xs">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Ano</Label>
                    <Select value={String(t1Year)} onValueChange={(val) => setT1Year(Number(val))}>
                      <SelectTrigger className="bg-background h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEARS.map((y) => (
                          <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {temporalType === "week" && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px]">Semana</Label>
                      <Select value={String(t1Week)} onValueChange={(val) => setT1Week(Number(val))}>
                        <SelectTrigger className="bg-background h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKS_PT.map((w) => (
                            <SelectItem key={w.id} value={String(w.id)} className="text-xs">{w.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              {/* Period 2 selection */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-info">Período 2 (Comparação)</h4>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Mês</Label>
                    <Select value={String(t2Month)} onValueChange={(val) => setT2Month(Number(val))}>
                      <SelectTrigger className="bg-background h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS_PT.map((m, idx) => (
                          <SelectItem key={m} value={String(idx)} className="text-xs">{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Ano</Label>
                    <Select value={String(t2Year)} onValueChange={(val) => setT2Year(Number(val))}>
                      <SelectTrigger className="bg-background h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {YEARS.map((y) => (
                          <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {temporalType === "week" && (
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[10px]">Semana</Label>
                      <Select value={String(t2Week)} onValueChange={(val) => setT2Week(Number(val))}>
                        <SelectTrigger className="bg-background h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEKS_PT.map((w) => (
                            <SelectItem key={w.id} value={String(w.id)} className="text-xs">{w.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Temporal Comparison Dashboard Render */}
          {temporalStats ? (
            <div className="space-y-6">
              {/* Header Title displaying what's being compared */}
              <div className="bg-surface-elevated/20 border border-border/40 rounded-2xl p-4 flex flex-wrap justify-between items-center print:border-none print:p-0">
                <div className="text-sm font-semibold text-foreground">
                  Análise: <span className="text-primary font-bold">{temporalStats.labels.p1}</span> vs <span className="text-info font-bold">{temporalStats.labels.p2}</span>
                  {tempEmployeeId !== "all" && (
                    <span className="text-muted-foreground ml-1.5 border-l border-border/50 pl-2">
                      Colaborador: {profiles.find(p => p.id === tempEmployeeId)?.name}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground print:hidden">
                  FitControl · Métricas de evolução
                </div>
              </div>

              {/* Comparison Metric Cards with Deltas */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                {/* 1. Total Tasks */}
                <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Volume de Tarefas</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-black tabular-nums text-foreground">
                      {temporalStats.p2.total}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      (era {temporalStats.p1.total})
                    </span>
                  </div>
                  <div className="pt-1 flex items-center justify-between border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground">Variação</span>
                    {renderDelta(temporalStats.deltas.total, false)}
                  </div>
                </div>

                {/* 2. Tasks Completed */}
                <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Concluídas</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-black tabular-nums text-success">
                      {temporalStats.p2.completed}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      (era {temporalStats.p1.completed})
                    </span>
                  </div>
                  <div className="pt-1 flex items-center justify-between border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground">Variação</span>
                    {renderDelta(temporalStats.deltas.completed, false)}
                  </div>
                </div>

                {/* 3. Resolution Rate */}
                <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground font-semibold text-info">Taxa de Resolução</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-black tabular-nums text-info">
                      {temporalStats.p2.rate}%
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      (era {temporalStats.p1.rate}%)
                    </span>
                  </div>
                  <div className="pt-1 flex items-center justify-between border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground">Variação</span>
                    {renderDelta(temporalStats.deltas.rate, true)}
                  </div>
                </div>

                {/* 4. Active Working Hours */}
                <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tempo Ativo Total</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-black tabular-nums text-foreground">
                      {temporalStats.p2.activeHrs}h
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      (era {temporalStats.p1.activeHrs}h)
                    </span>
                  </div>
                  <div className="pt-1 flex items-center justify-between border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground">Variação</span>
                    {renderDelta(temporalStats.deltas.activeHrs, false)}
                  </div>
                </div>

                {/* 5. Speed (avg minutes per task) */}
                <div className="rounded-xl border border-border/40 bg-card p-4 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tempo Médio/Tarefa</span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xl font-black tabular-nums text-foreground">
                      {temporalStats.p2.avgActiveMin}m
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      (era {temporalStats.p1.avgActiveMin}m)
                    </span>
                  </div>
                  <div className="pt-1 flex items-center justify-between border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground">Velocidade</span>
                    {/* Invert: smaller time is better, so negative delta is good! */}
                    {renderDelta(temporalStats.deltas.avgActiveMin, false, true)}
                  </div>
                </div>
              </div>

              {/* Grouped Bar Chart by Category (Month vs Month) */}
              <div className="rounded-2xl border border-border/60 bg-card p-6 print:break-inside-avoid">
                <h4 className="font-display font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Distribuição de Atividades por Categoria de Operação
                </h4>
                {temporalStats.categoryDistribution.length > 0 ? (
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={temporalStats.categoryDistribution} margin={{ top: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#888" fontSize={11} />
                        <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                        <Legend />
                        <Bar name={temporalStats.labels.p1} dataKey="Período 1" fill="#f97316" radius={[4, 4, 0, 0]} />
                        <Bar name={temporalStats.labels.p2} dataKey="Período 2" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-center py-20 text-muted-foreground text-xs">
                    Nenhuma tarefa registrada nos períodos selecionados para comparação.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              Carregando dados estatísticos...
            </div>
          )}
        </div>
      )}

      {/* -------------------- TAB 2: COLLABORATORS COMPARISON -------------------- */}
      {activeTab === "colaboradores" && (
        <div className="space-y-6">
          {/* Query Parameters Box */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-6 print:hidden">
            <div className="flex items-center gap-2 pb-3 border-b border-border/40">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="font-display font-bold text-lg">Parâmetros de Comparação de Equipe</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* Employee A select */}
              <div className="space-y-2">
                <Label>Colaborador A</Label>
                <Select value={colabIdA} onValueChange={setColabIdA}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecione Colaborador A" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={p.id === colabIdB}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Employee B select */}
              <div className="space-y-2">
                <Label>Colaborador B</Label>
                <Select value={colabIdB} onValueChange={setColabIdB}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecione Colaborador B" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id} disabled={p.id === colabIdA}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Days range select */}
              <div className="space-y-2">
                <Label>Período de Análise</Label>
                <Select value={colabDaysRange} onValueChange={setColabDaysRange}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Collaborator Dashboard comparisons render */}
          {colabStats ? (
            <div className="space-y-6">
              {/* Side by side profile cards */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Employee A Detail Card */}
                <div className="rounded-2xl border-l-4 border-l-primary border border-border/60 bg-card p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-ember font-display font-bold text-primary-foreground text-sm shadow-ember shrink-0">
                      {colabStats.a.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-lg text-foreground leading-tight">{colabStats.a.name}</h3>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Crachá: {profiles.find(p => p.id === colabIdA)?.badge || "-"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/40">
                    <div className="bg-muted/10 p-3 rounded-lg border border-border/30 text-center">
                      <span className="text-[10px] block text-muted-foreground uppercase font-semibold">Taxa de Conclusão</span>
                      <span className="text-xl font-black text-primary tabular-nums mt-1 block">{colabStats.a.rate}%</span>
                    </div>
                    <div className="bg-muted/10 p-3 rounded-lg border border-border/30 text-center">
                      <span className="text-[10px] block text-muted-foreground uppercase font-semibold">Tempo Ativo Total</span>
                      <span className="text-xl font-black text-foreground tabular-nums mt-1 block">{colabStats.a.activeHrs}h</span>
                    </div>
                    <div className="bg-muted/10 p-3 rounded-lg border border-border/30 text-center">
                      <span className="text-[10px] block text-muted-foreground uppercase font-semibold">Tempo Médio/Tarefa</span>
                      <span className="text-xl font-black text-foreground tabular-nums mt-1 block">{colabStats.a.avgActiveMin}m</span>
                    </div>
                    <div className="bg-muted/10 p-3 rounded-lg border border-border/30 text-center">
                      <span className="text-[10px] block text-muted-foreground uppercase font-semibold">Pausas Totais</span>
                      <span className="text-xl font-black text-purple-400 tabular-nums mt-1 block">{colabStats.a.pauseCount}</span>
                    </div>
                  </div>
                </div>

                {/* Employee B Detail Card */}
                <div className="rounded-2xl border-l-4 border-l-info border border-border/60 bg-card p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-info/20 text-info font-display font-bold text-sm shrink-0 border border-info/30">
                      {colabStats.b.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-lg text-foreground leading-tight">{colabStats.b.name}</h3>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                        Crachá: {profiles.find(p => p.id === colabIdB)?.badge || "-"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/40">
                    <div className="bg-muted/10 p-3 rounded-lg border border-border/30 text-center">
                      <span className="text-[10px] block text-muted-foreground uppercase font-semibold">Taxa de Conclusão</span>
                      <span className="text-xl font-black text-info tabular-nums mt-1 block">{colabStats.b.rate}%</span>
                    </div>
                    <div className="bg-muted/10 p-3 rounded-lg border border-border/30 text-center">
                      <span className="text-[10px] block text-muted-foreground uppercase font-semibold">Tempo Ativo Total</span>
                      <span className="text-xl font-black text-foreground tabular-nums mt-1 block">{colabStats.b.activeHrs}h</span>
                    </div>
                    <div className="bg-muted/10 p-3 rounded-lg border border-border/30 text-center">
                      <span className="text-[10px] block text-muted-foreground uppercase font-semibold">Tempo Médio/Tarefa</span>
                      <span className="text-xl font-black text-foreground tabular-nums mt-1 block">{colabStats.b.avgActiveMin}m</span>
                    </div>
                    <div className="bg-muted/10 p-3 rounded-lg border border-border/30 text-center">
                      <span className="text-[10px] block text-muted-foreground uppercase font-semibold">Pausas Totais</span>
                      <span className="text-xl font-black text-purple-400 tabular-nums mt-1 block">{colabStats.b.pauseCount}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-side metrics chart */}
              <div className="rounded-2xl border border-border/60 bg-card p-6 print:break-inside-avoid">
                <h4 className="font-display font-bold text-sm mb-4 flex items-center gap-2 text-foreground">
                  <GitCompare className="h-4 w-4 text-primary" />
                  Métricas de Produtividade Comparadas (Últimos {colabDaysRange} dias)
                </h4>
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={colabStats.chartData} margin={{ top: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="name" stroke="#888" fontSize={11} />
                      <YAxis stroke="#888" fontSize={10} />
                      <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                      <Legend />
                      <Bar name={colabStats.a.name} dataKey={colabStats.a.name} fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar name={colabStats.b.name} dataKey={colabStats.b.name} fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-16 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
              <h3 className="font-semibold text-foreground text-lg">Nenhum comparador active</h3>
              <p className="text-sm mt-1 max-w-md mx-auto">
                Selecione dois colaboradores diferentes e o período de análise acima para comparar a produtividade lado a lado.
              </p>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

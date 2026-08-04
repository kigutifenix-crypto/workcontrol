import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { STATUS, TASK_TYPES, typeIcon, priorityTone, parsePhotoUrls, calculateTaskTimings as calculateGlobalTaskTimings } from "@/lib/task-utils";
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  Users,
  Wrench,
  ClipboardList,
  Clock,
  ArrowRight,
  TrendingUp,
  Briefcase,
  AlertTriangle,
  RefreshCw,
  Search,
  PieChart as PieIcon,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Relatórios Gerenciais — FitControl" },
      { name: "description", content: "Geração de relatórios operacionais de funcionários, tarefas, máquinas e desempenho." },
    ],
  }),
  component: ReportsPage,
});

type ReportType = "desempenho" | "tarefas" | "maquinas" | "geral";

function ReportsPage() {
  const { isSupervisor } = useAuth();

  // Filters State
  const [reportType, setReportType] = useState<ReportType>("desempenho");
  const [datePreset, setDatePreset] = useState<string>("7d");
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("all");
  const [selectedMachine, setSelectedMachine] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Output generated state
  const [generatedReport, setGeneratedReport] = useState<{
    type: ReportType;
    generatedAt: string;
    startDate: string;
    endDate: string;
    data: any[];
    summary: any;
  } | null>(null);

  const [generating, setGenerating] = useState(false);

  // Fetch all tasks, profiles, and machines once
  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["reports-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["reports-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,name,badge")).data ?? [],
  });

  const { data: machines = [] } = useQuery({
    queryKey: ["reports-machines"],
    queryFn: async () => (await supabase.from("machines").select("id,code,name")).data ?? [],
  });

  const profilesMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const machinesMap = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);

  // Handle Preset Changes
  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "today") {
      setStartDate(now.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (preset === "7d") {
      const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (preset === "30d") {
      const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(past.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    } else if (preset === "month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().split("T")[0]);
      setEndDate(now.toISOString().split("T")[0]);
    }
  };

  // Duration parser helper
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

  // Generate Action
  const handleGenerateReport = () => {
    setGenerating(true);

    setTimeout(() => {
      try {
        const startTimestamp = new Date(startDate + "T00:00:00").getTime();
        const endTimestamp = new Date(endDate + "T23:59:59").getTime();

        // 1. Filter tasks inside date range
        let filtered = allTasks.filter((t) => {
          const taskTime = new Date(t.created_at).getTime();
          return taskTime >= startTimestamp && taskTime <= endTimestamp;
        });

        // 2. Filter by assignee
        if (selectedAssignee !== "all") {
          filtered = filtered.filter((t) => t.assignee_id === selectedAssignee);
        }

        // 3. Filter by machine
        if (selectedMachine !== "all") {
          filtered = filtered.filter((t) => t.machine_id === selectedMachine);
        }

        // 4. Filter by category
        if (selectedCategory !== "all") {
          filtered = filtered.filter((t) => t.type === selectedCategory);
        }

        // Generate according to report type
        if (reportType === "desempenho") {
          // Group by Assignee
          const employeeMap: Record<string, any> = {};
          
          filtered.forEach((t) => {
            const assigneeId = t.assignee_id || "unassigned";
            if (!employeeMap[assigneeId]) {
              const prof = profilesMap.get(assigneeId);
              employeeMap[assigneeId] = {
                id: assigneeId,
                name: prof?.name || (assigneeId === "unassigned" ? "Sem Responsável" : "Desconhecido"),
                badge: prof?.badge || "-",
                total: 0,
                completed: 0,
                progress: 0,
                paused: 0,
                review: 0,
                pending: 0,
                activeMs: 0,
                pausedMs: 0,
                pauseCount: 0,
              };
            }

            const record = employeeMap[assigneeId];
            record.total += 1;
            if (t.status === "done") record.completed += 1;
            else if (t.status === "progress") record.progress += 1;
            else if (t.status === "paused") record.paused += 1;
            else if (t.status === "review") record.review += 1;
            else if (t.status === "pending") record.pending += 1;

            const timings = calculateTaskTimings(t);
            record.activeMs += timings.activeMs;
            record.pausedMs += timings.pausedMs;
            
            const taskIntervals = Array.isArray(t.intervals) ? t.intervals : [];
            record.pauseCount += taskIntervals.length;
          });

          const reportData = Object.values(employeeMap).map((emp: any) => {
            const pct = emp.total > 0 ? Math.round((emp.completed / emp.total) * 100) : 0;
            return {
              ...emp,
              completionRate: pct,
              activeHrsText: formatHrsMin(emp.activeMs),
              pausedHrsText: formatHrsMin(emp.pausedMs),
            };
          }).sort((a, b) => b.completed - a.completed);

          // Summary KPI metrics
          const totalCompleted = filtered.filter((t) => t.status === "done").length;
          const totalActiveTime = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
          const topEmployee = reportData.length > 0 && reportData[0].id !== "unassigned" ? reportData[0].name : "Nenhum";

          setGeneratedReport({
            type: "desempenho",
            generatedAt: new Date().toLocaleString("pt-BR"),
            startDate,
            endDate,
            data: reportData,
            summary: {
              totalTasks: filtered.length,
              totalCompleted,
              totalActiveTimeText: formatHrsMin(totalActiveTime),
              topEmployee,
            },
          });
        } 
        else if (reportType === "tarefas") {
          const reportData = filtered.map((t) => {
            const timings = calculateTaskTimings(t);
            const prof = t.assignee_id ? profilesMap.get(t.assignee_id) : null;
            const mach = t.machine_id ? machinesMap.get(t.machine_id) : null;
            const taskIntervals = Array.isArray(t.intervals) ? t.intervals : [];

            return {
              id: t.id,
              title: t.title,
              type: t.type,
              status: t.status,
              priority: t.priority,
              assignee: prof?.name || "Não atribuído",
              machine: mach?.code || "-",
              created_at: new Date(t.created_at).toLocaleString("pt-BR"),
              started_at: t.started_at ? new Date(t.started_at).toLocaleString("pt-BR") : "-",
              completed_at: t.completed_at ? new Date(t.completed_at).toLocaleString("pt-BR") : "-",
              activeMs: timings.activeMs,
              activeHrsText: formatHrsMin(timings.activeMs),
              pausedHrsText: formatHrsMin(timings.pausedMs),
              pauseCount: taskIntervals.length,
            };
          });

          const totalCompleted = filtered.filter((t) => t.status === "done").length;
          const totalReview = filtered.filter((t) => t.status === "review").length;
          const totalProgress = filtered.filter((t) => t.status === "progress").length;

          setGeneratedReport({
            type: "tarefas",
            generatedAt: new Date().toLocaleString("pt-BR"),
            startDate,
            endDate,
            data: reportData,
            summary: {
              totalTasks: filtered.length,
              totalCompleted,
              totalReview,
              totalProgress,
            },
          });
        } 
        else if (reportType === "maquinas") {
          const machineMap: Record<string, any> = {};

          filtered.forEach((t) => {
            const machineId = t.machine_id || "none";
            if (!machineMap[machineId]) {
              const mach = machinesMap.get(machineId);
              machineMap[machineId] = {
                id: machineId,
                code: mach?.code || (machineId === "none" ? "Sem Máquina" : "Desconhecido"),
                name: mach?.name || "-",
                total: 0,
                completed: 0,
                activeMs: 0,
                uniqueAssignees: new Set<string>(),
              };
            }

            const record = machineMap[machineId];
            record.total += 1;
            if (t.status === "done") record.completed += 1;
            if (t.assignee_id) record.uniqueAssignees.add(t.assignee_id);

            const timings = calculateTaskTimings(t);
            record.activeMs += timings.activeMs;
          });

          const reportData = Object.values(machineMap).map((m: any) => ({
            ...m,
            assigneesCount: m.uniqueAssignees.size,
            activeHrsText: formatHrsMin(m.activeMs),
          })).sort((a, b) => b.total - a.total);

          const totalActiveTime = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
          const topMachine = reportData.length > 0 && reportData[0].id !== "none" ? reportData[0].code : "Nenhum";

          setGeneratedReport({
            type: "maquinas",
            generatedAt: new Date().toLocaleString("pt-BR"),
            startDate,
            endDate,
            data: reportData,
            summary: {
              totalMachines: reportData.length,
              totalTasks: filtered.length,
              totalActiveTimeText: formatHrsMin(totalActiveTime),
              topMachine,
            },
          });
        } 
        else if (reportType === "geral") {
          // Workshop summary aggregations
          const statusCount: Record<string, number> = { pending: 0, progress: 0, paused: 0, review: 0, done: 0 };
          const categoryCount: Record<string, number> = {};
          const priorityCount: Record<string, number> = {};

          filtered.forEach((t) => {
            statusCount[t.status] = (statusCount[t.status] || 0) + 1;
            categoryCount[t.type] = (categoryCount[t.type] || 0) + 1;
            priorityCount[t.priority] = (priorityCount[t.priority] || 0) + 1;
          });

          const statusChart = STATUS.map((s) => ({
            name: s.label,
            value: statusCount[s.id] || 0,
            color: s.tone.includes("info") ? "#0ea5e9" : s.tone.includes("warning") ? "#f59e0b" : s.tone.includes("success") ? "#10b981" : s.tone.includes("purple") ? "#a855f7" : "#64748b",
          })).filter((s) => s.value > 0);

          const categoryChart = Object.entries(categoryCount).map(([name, value]) => ({
            name,
            value,
          })).sort((a, b) => b.value - a.value);

          const priorityChart = ["Urgente", "Alta", "Normal", "Baixa"].map((p) => ({
            name: p,
            value: priorityCount[p] || 0,
            color: p === "Urgente" ? "#ef4444" : p === "Alta" ? "#f97316" : p === "Normal" ? "#3b82f6" : "#64748b",
          })).filter((p) => p.value > 0);

          const totalCompleted = statusCount.done || 0;
          const completionRate = filtered.length > 0 ? Math.round((totalCompleted / filtered.length) * 100) : 0;

          setGeneratedReport({
            type: "geral",
            generatedAt: new Date().toLocaleString("pt-BR"),
            startDate,
            endDate,
            data: filtered,
            summary: {
              statusChart,
              categoryChart,
              priorityChart,
              totalTasks: filtered.length,
              totalCompleted,
              completionRate,
            },
          });
        }

        toast.success("Relatório gerado com sucesso!");
      } catch (err: any) {
        console.error(err);
        toast.error("Erro ao processar relatório", { description: err.message });
      } finally {
        setGenerating(false);
      }
    }, 400);
  };

  // Export to CSV Function
  const handleExportCSV = () => {
    if (!generatedReport) return;
    const { type, data } = generatedReport;
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = `relatorio-${type}-${generatedReport.startDate}-a-${generatedReport.endDate}.csv`;

    if (type === "desempenho") {
      headers = ["Funcionário", "Crachá", "Total de Tarefas", "Concluídas", "Em Andamento", "Pausadas", "Em Revisão", "Pendentes", "Taxa de Conclusão", "Tempo Ativo", "Qtd. Pausas", "Tempo Pausado"];
      rows = data.map((d) => [
        d.name,
        d.badge,
        d.total,
        d.completed,
        d.progress,
        d.paused,
        d.review,
        d.pending,
        `${d.completionRate}%`,
        d.activeHrsText,
        d.pauseCount,
        d.pausedHrsText,
      ]);
    } else if (type === "tarefas") {
      headers = ["Título", "Categoria", "Status", "Prioridade", "Responsável", "Máquina", "Criada em", "Iniciada em", "Concluída em", "Tempo Ativo Trabalhado", "Qtd. Pausas", "Tempo Pausado"];
      rows = data.map((d) => [
        d.title,
        d.type,
        d.status,
        d.priority,
        d.assignee,
        d.machine,
        d.created_at,
        d.started_at,
        d.completed_at,
        d.activeHrsText,
        d.pauseCount,
        d.pausedHrsText,
      ]);
    } else if (type === "maquinas") {
      headers = ["Máquina (Código)", "Nome do Equipamento", "Total de Tarefas", "Concluídas", "Funcionários Únicos", "Tempo Ativo Registrado"];
      rows = data.map((d) => [
        d.code,
        d.name,
        d.total,
        d.completed,
        d.assigneesCount,
        d.activeHrsText,
      ]);
    } else if (type === "geral") {
      headers = ["Título da Tarefa", "Categoria", "Status", "Prioridade", "Criada em", "Iniciada em", "Concluída em"];
      rows = data.map((d) => [
        d.title,
        d.type,
        d.status,
        d.priority,
        new Date(d.created_at).toLocaleString("pt-BR"),
        d.started_at ? new Date(d.started_at).toLocaleString("pt-BR") : "-",
        d.completed_at ? new Date(d.completed_at).toLocaleString("pt-BR") : "-",
      ]);
    }

    // Convert to CSV string with Excel compatibility BOM
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(";"), ...rows.map((row) => row.map((val) => `"${val}"`).join(";"))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV exportado com sucesso!");
  };

  // Print Handler
  const handlePrint = () => {
    window.print();
  };

  if (!isSupervisor) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-muted-foreground p-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-lg font-bold text-foreground mb-1">Acesso Restrito</h2>
        <p className="text-sm mb-4 text-center">Você não tem permissão para visualizar relatórios.</p>
        <Button asChild>
          <Link to="/">Voltar ao Início</Link>
        </Button>
      </div>
    );
  }

  return (
    <AppShell
      title="Relatórios Gerenciais"
      subtitle="Analise métricas da oficina, produtividade de funcionários e controle de máquinas."
    >
      {/* FILTERS CONTAINER: Hidden when printing */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-6 print:hidden">
        <div className="flex items-center gap-2 pb-3 border-b border-border/40">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-lg">Parâmetros de Consulta</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Report Type */}
          <div className="space-y-2">
            <Label>Tipo de Relatório</Label>
            <Select value={reportType} onValueChange={(val) => setReportType(val as ReportType)}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desempenho">Desempenho de Funcionários</SelectItem>
                <SelectItem value="tarefas">Histórico de Tarefas</SelectItem>
                <SelectItem value="maquinas">Utilização de Máquinas</SelectItem>
                <SelectItem value="geral">Resumo Geral da Oficina</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date presets */}
          <div className="space-y-2">
            <Label>Período</Label>
            <Select value={datePreset} onValueChange={handlePresetChange}>
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="custom">Personalizado...</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label>De (Início)</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset("custom");
              }}
              className="bg-background"
            />
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label>Até (Fim)</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset("custom");
              }}
              className="bg-background"
            />
          </div>
        </div>

        {/* Conditional Advanced Filters */}
        <div className="grid gap-4 md:grid-cols-3 pt-2">
          {/* Assignee Filter */}
          <div className="space-y-2">
            <Label>Funcionário Responsável</Label>
            <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Funcionários</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Machine Filter */}
          <div className="space-y-2">
            <Label>Equipamento / Máquina</Label>
            <Select value={selectedMachine} onValueChange={setSelectedMachine}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Máquinas</SelectItem>
                {machines.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Filter */}
          <div className="space-y-2">
            <Label>Categoria da Tarefa</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                {TASK_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {typeIcon(t)} {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            onClick={handleGenerateReport}
            disabled={generating || isLoadingTasks}
            className="bg-gradient-ember shadow-ember font-semibold gap-1.5"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Gerar Relatório
              </>
            )}
          </Button>
        </div>
      </div>

      {/* GENERATED REPORT RENDER */}
      {generatedReport ? (
        <div className="mt-8 space-y-6 print:mt-0">
          {/* Action buttons on generated report */}
          <div className="flex justify-between items-center bg-surface-elevated/40 border border-border/50 rounded-2xl p-4 shadow-card print:hidden">
            <div className="text-xs text-muted-foreground">
              Relatório gerado em: <span className="font-semibold text-foreground">{generatedReport.generatedAt}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 h-9 text-xs">
                <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
              </Button>
              <Button size="sm" onClick={handleExportCSV} className="bg-success text-success-foreground hover:bg-success/90 gap-1.5 h-9 text-xs">
                <Download className="h-3.5 w-3.5" /> Exportar Excel/CSV
              </Button>
            </div>
          </div>

          {/* Print-only Header */}
          <div className="hidden print:block border-b-2 border-primary/50 pb-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="font-display font-black text-2xl tracking-tight text-primary">FitControl — Oficina</h1>
                <p className="text-xs text-muted-foreground">Relatório Gerencial de Produção</p>
              </div>
              <div className="text-right text-xs">
                <div>Data: {generatedReport.generatedAt}</div>
                <div>Período: {new Date(generatedReport.startDate + "T00:00:00").toLocaleDateString("pt-BR")} a {new Date(generatedReport.endDate + "T23:59:59").toLocaleDateString("pt-BR")}</div>
              </div>
            </div>
          </div>

          {/* 1. REPORT: EMPLOYEE PERFORMANCE */}
          {generatedReport.type === "desempenho" && (
            <div className="space-y-6">
              {/* Performance Cards Summary */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tarefas Registradas</div>
                  <div className="text-2xl font-black text-foreground">{generatedReport.summary.totalTasks}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tarefas Concluídas</div>
                  <div className="text-2xl font-black text-success">{generatedReport.summary.totalCompleted}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Horas Ativas Totais</div>
                  <div className="text-2xl font-black text-info">{generatedReport.summary.totalActiveTimeText}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Destaque de Entregas</div>
                  <div className="text-lg font-bold text-primary truncate leading-8">{generatedReport.summary.topEmployee}</div>
                </div>
              </div>

              {/* Chart section */}
              {generatedReport.data.length > 0 && (
                <div className="rounded-2xl border border-border/50 bg-card p-6 print:break-inside-avoid">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Tarefas Concluídas por Funcionário</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={generatedReport.data.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#888" fontSize={11} />
                        <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                        <Legend />
                        <Bar name="Concluídas" dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar name="Outras" dataKey="total" fill="#4b5563" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Performance Table */}
              <div className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden">
                <div className="p-4 bg-surface-elevated/40 border-b border-border/40">
                  <h3 className="font-semibold text-sm">Quadro de Produtividade dos Colaboradores</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-surface-elevated text-[10px] font-bold uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-3">Funcionário</th>
                        <th className="p-3">Crachá</th>
                        <th className="p-3 text-center">Total</th>
                        <th className="p-3 text-center">Concluídas</th>
                        <th className="p-3 text-center">Em Andamento</th>
                        <th className="p-3 text-center">Pausadas</th>
                        <th className="p-3 text-center">Taxa Conclusão</th>
                        <th className="p-3 text-right">Tempo Ativo</th>
                        <th className="p-3 text-center">Qtd. Pausas</th>
                        <th className="p-3 text-right">Tempo Pausado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-xs">
                      {generatedReport.data.map((d: any) => (
                        <tr key={d.id} className="hover:bg-accent/20">
                          <td className="p-3 font-semibold text-foreground">{d.name}</td>
                          <td className="p-3 text-muted-foreground">{d.badge}</td>
                          <td className="p-3 text-center tabular-nums">{d.total}</td>
                          <td className="p-3 text-center tabular-nums text-success font-semibold">{d.completed}</td>
                          <td className="p-3 text-center tabular-nums text-info">{d.progress}</td>
                          <td className="p-3 text-center tabular-nums text-purple-400">{d.paused}</td>
                          <td className="p-3 text-center font-bold text-foreground">{d.completionRate}%</td>
                          <td className="p-3 text-right tabular-nums text-foreground">{d.activeHrsText}</td>
                          <td className="p-3 text-center tabular-nums text-purple-400 font-semibold">{d.pauseCount}</td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">{d.pausedHrsText}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. REPORT: TASKS DETAIL */}
          {generatedReport.type === "tarefas" && (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total Filtrado</div>
                  <div className="text-2xl font-black text-foreground">{generatedReport.summary.totalTasks}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Concluídas no Período</div>
                  <div className="text-2xl font-black text-success">{generatedReport.summary.totalCompleted}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Aguardando Revisão</div>
                  <div className="text-2xl font-black text-warning">{generatedReport.summary.totalReview}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Em Execução</div>
                  <div className="text-2xl font-black text-info">{generatedReport.summary.totalProgress}</div>
                </div>
              </div>

              {/* Detail Table */}
              <div className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden">
                <div className="p-4 bg-surface-elevated/40 border-b border-border/40">
                  <h3 className="font-semibold text-sm">Lista de Atividades do Período</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-surface-elevated text-[10px] font-bold uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-3">Tarefa</th>
                        <th className="p-3">Categoria</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Prioridade</th>
                        <th className="p-3">Responsável</th>
                        <th className="p-3">Máquina</th>
                        <th className="p-3">Criação</th>
                        <th className="p-3 text-right">Ativo</th>
                        <th className="p-3 text-center">Qtd. Pausas</th>
                        <th className="p-3 text-right">Tempo Pausado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-xs">
                      {generatedReport.data.map((d: any) => {
                        const st = STATUS.find((s) => s.id === d.status);
                        return (
                          <tr key={d.id} className="hover:bg-accent/20">
                            <td className="p-3 font-semibold text-foreground max-w-xs truncate">{d.title}</td>
                            <td className="p-3 text-muted-foreground">{d.type}</td>
                            <td className="p-3">
                              <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border", st?.tone)}>
                                {st?.label || d.status}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border", priorityTone(d.priority))}>
                                {d.priority}
                              </span>
                            </td>
                            <td className="p-3 text-foreground font-medium">{d.assignee}</td>
                            <td className="p-3 text-muted-foreground">{d.machine}</td>
                            <td className="p-3 text-muted-foreground whitespace-nowrap">{d.created_at.split(" ")[0]}</td>
                            <td className="p-3 text-right tabular-nums text-foreground">{d.activeHrsText}</td>
                            <td className="p-3 text-center tabular-nums text-purple-400 font-semibold">{d.pauseCount}</td>
                            <td className="p-3 text-right tabular-nums text-muted-foreground">{d.pausedHrsText}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. REPORT: MACHINE UTILIZATION */}
          {generatedReport.type === "maquinas" && (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Máquinas Acionadas</div>
                  <div className="text-2xl font-black text-foreground">{generatedReport.summary.totalMachines}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Serviços Totais em Máquinas</div>
                  <div className="text-2xl font-black text-primary">{generatedReport.summary.totalTasks}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo Total de Montagem/Manutenção</div>
                  <div className="text-2xl font-black text-info">{generatedReport.summary.totalActiveTimeText}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Máquina Mais Acionada</div>
                  <div className="text-lg font-bold text-foreground truncate leading-8">{generatedReport.summary.topMachine}</div>
                </div>
              </div>

              {/* Machine list table */}
              <div className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden">
                <div className="p-4 bg-surface-elevated/40 border-b border-border/40">
                  <h3 className="font-semibold text-sm">Tempo e Volume de Trabalho em Equipamentos</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-surface-elevated text-[10px] font-bold uppercase text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-3">Código</th>
                        <th className="p-3">Nome da Máquina</th>
                        <th className="p-3 text-center">Total de Serviços</th>
                        <th className="p-3 text-center">Serviços Concluídos</th>
                        <th className="p-3 text-center">Funcionários Únicos</th>
                        <th className="p-3 text-right">Tempo Total de Trabalho</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 text-xs">
                      {generatedReport.data.map((d: any) => (
                        <tr key={d.id} className="hover:bg-accent/20">
                          <td className="p-3 font-semibold text-primary">{d.code}</td>
                          <td className="p-3 text-foreground">{d.name}</td>
                          <td className="p-3 text-center tabular-nums">{d.total}</td>
                          <td className="p-3 text-center tabular-nums text-success">{d.completed}</td>
                          <td className="p-3 text-center tabular-nums">{d.assigneesCount}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-foreground">{d.activeHrsText}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 4. REPORT: WORKSHOP SUMMARY */}
          {generatedReport.type === "geral" && (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Volume Total no Período</div>
                  <div className="text-2xl font-black text-foreground">{generatedReport.summary.totalTasks} tarefas</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Entregas Concluídas</div>
                  <div className="text-2xl font-black text-success">{generatedReport.summary.totalCompleted} concluídas</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Taxa de Resolução</div>
                  <div className="text-2xl font-black text-info">{generatedReport.summary.completionRate}%</div>
                </div>
              </div>

              {/* Charts grid */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Category volume chart */}
                <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4 text-primary" /> Volume de Serviços por Categoria
                  </h3>
                  {generatedReport.summary.categoryChart.length > 0 ? (
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={generatedReport.summary.categoryChart}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="name" stroke="#888" fontSize={10} />
                          <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          <Bar dataKey="value" name="Volume" fill="#f97316" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-16 text-muted-foreground text-xs">Sem dados no período.</div>
                  )}
                </div>

                {/* Priority distribution chart */}
                <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                    <PieIcon className="h-4 w-4 text-info" /> Distribuição de Prioridades
                  </h3>
                  {generatedReport.summary.priorityChart.length > 0 ? (
                    <div className="h-60 w-full flex items-center justify-center gap-4">
                      <div className="h-full w-40">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={generatedReport.summary.priorityChart}
                              innerRadius={35}
                              outerRadius={55}
                              paddingAngle={3}
                              dataKey="value"
                            >
                              {generatedReport.summary.priorityChart.map((entry: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5 text-[11px] flex-1">
                        {generatedReport.summary.priorityChart.map((p: any) => (
                          <div key={p.name} className="flex items-center justify-between font-medium border-b border-border/30 pb-1">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                              {p.name}
                            </span>
                            <span className="text-foreground font-bold">{p.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 text-muted-foreground text-xs">Sem dados no período.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* INITIAL STATE REPORT MESSAGE */
        <div className="mt-8 rounded-2xl border border-dashed border-border/60 bg-card/40 p-16 text-center text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="font-semibold text-foreground text-lg">Nenhum relatório gerado</h3>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Configure os filtros no painel de parâmetros e clique no botão <strong>Gerar Relatório</strong> para processar as informações.
          </p>
        </div>
      )}
    </AppShell>
  );
}

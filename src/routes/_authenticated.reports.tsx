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
                urgentCompleted: 0,
              };
            }

            const record = employeeMap[assigneeId];
            record.total += 1;
            if (t.status === "done") {
              record.completed += 1;
              if (t.priority === "Urgente" || t.priority === "Alta") {
                record.urgentCompleted += 1;
              }
            }
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
            const avgActiveMs = emp.completed > 0 ? Math.round(emp.activeMs / emp.completed) : 0;
            return {
              ...emp,
              completionRate: pct,
              activeHrsText: formatHrsMin(emp.activeMs),
              pausedHrsText: formatHrsMin(emp.pausedMs),
              avgActiveHrsText: formatHrsMin(avgActiveMs),
              activeHoursNum: Math.round((emp.activeMs / 3600000) * 10) / 10,
              pausedHoursNum: Math.round((emp.pausedMs / 3600000) * 10) / 10,
            };
          }).sort((a, b) => b.completed - a.completed);

          // Summary KPI metrics
          const totalCompleted = filtered.filter((t) => t.status === "done").length;
          const totalActiveTime = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
          const totalPauses = reportData.reduce((acc, emp) => acc + emp.pauseCount, 0);
          const avgActiveTimePerTask = totalCompleted > 0 ? Math.round(totalActiveTime / totalCompleted) : 0;
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
              totalPauses,
              avgActiveTimePerTaskText: formatHrsMin(avgActiveTimePerTask),
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
          const totalPaused = filtered.filter((t) => t.status === "paused").length;
          const totalPending = filtered.filter((t) => t.status === "pending").length;

          const completedTasks = filtered.filter((t) => t.status === "done");
          const totalCompletedActiveMs = completedTasks.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
          const totalCompletedPausedMs = completedTasks.reduce((acc, t) => acc + calculateTaskTimings(t).pausedMs, 0);
          
          const avgCompletedActiveText = completedTasks.length > 0 ? formatHrsMin(totalCompletedActiveMs / completedTasks.length) : "0m";
          const avgCompletedPausedText = completedTasks.length > 0 ? formatHrsMin(totalCompletedPausedMs / completedTasks.length) : "0m";

          // Timeline: Tasks created per day
          const timelineMap: Record<string, number> = {};
          filtered.forEach((t) => {
            const dateStr = new Date(t.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
            timelineMap[dateStr] = (timelineMap[dateStr] || 0) + 1;
          });
          const tasksTimelineData = Object.entries(timelineMap).map(([date, count]) => ({
            date,
            "Tarefas Criadas": count,
          })).sort((a, b) => {
            const [da, ma] = a.date.split("/").map(Number);
            const [db, mb] = b.date.split("/").map(Number);
            return ma !== mb ? ma - mb : da - db;
          });

          // Tasks by priority chart data
          const priorityCount: Record<string, number> = {};
          filtered.forEach((t) => {
            priorityCount[t.priority] = (priorityCount[t.priority] || 0) + 1;
          });
          const priorityChartData = ["Urgente", "Alta", "Normal", "Baixa"].map((p) => ({
            name: p,
            value: priorityCount[p] || 0,
            color: p === "Urgente" ? "#ef4444" : p === "Alta" ? "#f97316" : p === "Normal" ? "#3b82f6" : "#64748b",
          })).filter((p) => p.value > 0);

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
              totalPaused,
              totalPending,
              avgCompletedActiveText,
              avgCompletedPausedText,
              tasksTimelineData,
              priorityChartData,
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
            activeHrsNum: Math.round((m.activeMs / 3600000) * 10) / 10,
          })).sort((a, b) => b.total - a.total);

          const totalActiveTime = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
          const topMachine = reportData.length > 0 && reportData[0].id !== "none" ? reportData[0].code : "Nenhum";
          const avgActiveTimePerService = filtered.length > 0 ? Math.round(totalActiveTime / filtered.length) : 0;

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
              avgActiveTimePerServiceText: formatHrsMin(avgActiveTimePerService),
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

          const totalActiveTime = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
          const totalPausedTime = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).pausedMs, 0);
          const totalPausesCount = filtered.reduce((acc, t) => acc + (Array.isArray(t.intervals) ? t.intervals.length : 0), 0);
          const avgPausesPerTask = filtered.length > 0 ? Math.round((totalPausesCount / filtered.length) * 10) / 10 : 0;

          // Daily completed timeline
          const completedTimelineMap: Record<string, number> = {};
          filtered.forEach((t) => {
            if (t.status === "done" && t.completed_at) {
              const dateStr = new Date(t.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
              completedTimelineMap[dateStr] = (completedTimelineMap[dateStr] || 0) + 1;
            }
          });
          const dailyCompletedTimeline = Object.entries(completedTimelineMap).map(([date, count]) => ({
            date,
            "Tarefas Concluídas": count,
          })).sort((a, b) => {
            const [da, ma] = a.date.split("/").map(Number);
            const [db, mb] = b.date.split("/").map(Number);
            return ma !== mb ? ma - mb : da - db;
          });

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
              totalActiveTimeText: formatHrsMin(totalActiveTime),
              totalPausedTimeText: formatHrsMin(totalPausedTime),
              avgPausesPerTask,
              dailyCompletedTimeline,
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
      {/* Inject print-only stylesheet dynamically to prevent truncation and scaling issues */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide sidebar, headers, query selectors and action buttons */
          header, 
          aside, 
          .print\\:hidden, 
          [role="dialog"], 
          button, 
          .toast {
            display: none !important;
          }
          
          /* Full A4 width and overflow corrections */
          body, html, #root, main, .lg\\:pl-72 {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: white !important;
            color: black !important;
          }

          main {
            padding: 1cm !important;
          }

          /* Force tables to extend to full screen width and disable overflow scrollbars */
          .overflow-x-auto, 
          .overflow-y-auto, 
          .overflow-hidden,
          .shadow-card,
          .rounded-2xl {
            overflow: visible !important;
            max-height: none !important;
            width: 100% !important;
            box-shadow: none !important;
          }

          /* Allow tables to break across pages naturally */
          table {
            width: 100% !important;
            page-break-inside: auto !important;
            border-collapse: collapse !important;
          }

          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }

          thead {
            display: table-header-group !important; /* Print table headers on every page */
          }

          /* Adjust table cell fonts to fit horizontally on A4 portrait */
          table, th, td {
            font-size: 8px !important;
            padding: 4px 6px !important;
          }

          /* Allow long titles to wrap instead of truncating */
          .max-w-xs.truncate {
            max-width: none !important;
            white-space: normal !important;
            overflow: visible !important;
          }

          /* Grid structures inside report cards */
          .grid {
            display: grid !important;
            gap: 12px !important;
          }

          .grid-cols-4 {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }

          .grid-cols-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          /* Prevent charts and KPI blocks from breaking halfway */
          .print\\:break-inside-avoid, 
          .recharts-responsive-container,
          .grid > div {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Recharts SVG print dimensions */
          .recharts-responsive-container {
            width: 100% !important;
            height: 220px !important;
            min-height: 220px !important;
            display: block !important;
          }

          /* Lighten card styles */
          .bg-card, .bg-card\\/60, .bg-surface-elevated, .bg-surface-elevated\\/40, .bg-accent\\/20, .bg-muted\\/30 {
            background-color: transparent !important;
            border: 1px solid #cbd5e1 !important;
            box-shadow: none !important;
          }
          
          text, span, p, h1, h2, h3, h4, th, td {
            color: #0f172a !important;
          }

          @page {
            size: A4 portrait;
            margin: 1cm;
          }
        }
      `}} />
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
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tarefas Totais</div>
                  <div className="text-xl font-black text-foreground">{generatedReport.summary.totalTasks}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Concluídas</div>
                  <div className="text-xl font-black text-success">{generatedReport.summary.totalCompleted}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo Ativo Total</div>
                  <div className="text-xl font-black text-info">{generatedReport.summary.totalActiveTimeText}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pausas Totais</div>
                  <div className="text-xl font-black text-purple-400">{generatedReport.summary.totalPauses}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Média / Tarefa</div>
                  <div className="text-xl font-black text-foreground">{generatedReport.summary.avgActiveTimePerTaskText}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Melhor Entregador</div>
                  <div className="text-sm font-black text-primary truncate leading-6">{generatedReport.summary.topEmployee}</div>
                </div>
              </div>

              {/* Chart section */}
              {generatedReport.data.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Volume de Tarefas por Funcionário</h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={generatedReport.data.slice(0, 10)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="name" stroke="#888" fontSize={9} />
                          <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          <Legend />
                          <Bar name="Concluídas" dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar name="Total Criadas" dataKey="total" fill="#4b5563" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Tempo Trabalhado vs Pausado (Horas)</h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={generatedReport.data.slice(0, 10)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="name" stroke="#888" fontSize={9} />
                          <YAxis stroke="#888" fontSize={10} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          <Legend />
                          <Bar name="Tempo Ativo (h)" dataKey="activeHoursNum" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                          <Bar name="Tempo Pausado (h)" dataKey="pausedHoursNum" fill="#a855f7" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
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
                        <th className="p-3 text-center text-red-400">Urgentes Feitas</th>
                        <th className="p-3 text-center">Em Andamento</th>
                        <th className="p-3 text-center">Pausadas</th>
                        <th className="p-3 text-center">Taxa Conclusão</th>
                        <th className="p-3 text-right">Tempo Ativo</th>
                        <th className="p-3 text-right">Média / Tarefa</th>
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
                          <td className="p-3 text-center tabular-nums text-red-400 font-semibold">{d.urgentCompleted}</td>
                          <td className="p-3 text-center tabular-nums text-info">{d.progress}</td>
                          <td className="p-3 text-center tabular-nums text-purple-400">{d.paused}</td>
                          <td className="p-3 text-center font-bold text-foreground">{d.completionRate}%</td>
                          <td className="p-3 text-right tabular-nums text-foreground">{d.activeHrsText}</td>
                          <td className="p-3 text-right tabular-nums text-foreground font-semibold">{d.avgActiveHrsText}</td>
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
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total Filtrado</div>
                  <div className="text-xl font-black text-foreground">{generatedReport.summary.totalTasks}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Concluídas</div>
                  <div className="text-xl font-black text-success">{generatedReport.summary.totalCompleted}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Em Execução</div>
                  <div className="text-xl font-black text-info">{generatedReport.summary.totalProgress}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pausadas</div>
                  <div className="text-xl font-black text-warning">{generatedReport.summary.totalPaused}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pendentes</div>
                  <div className="text-xl font-black text-muted-foreground">{generatedReport.summary.totalPending}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo Médio / Tarefa</div>
                  <div className="text-sm font-black text-foreground mt-1 truncate leading-6">{generatedReport.summary.avgCompletedActiveText}</div>
                </div>
              </div>

              {/* Charts section */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Abertura de Tarefas no Período</h3>
                  <div className="h-60 w-full">
                    {generatedReport.summary.tasksTimelineData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={generatedReport.summary.tasksTimelineData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="date" stroke="#888" fontSize={9} />
                          <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          <Legend />
                          <Line type="monotone" dataKey="Tarefas Criadas" stroke="#f97316" strokeWidth={2} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16 text-muted-foreground text-xs">Sem dados suficientes.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Divisão por Nível de Urgência</h3>
                  <div className="h-60 w-full">
                    {generatedReport.summary.priorityChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={generatedReport.summary.priorityChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="name" stroke="#888" fontSize={9} />
                          <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          <Bar dataKey="value" name="Volume" radius={[4, 4, 0, 0]}>
                            {generatedReport.summary.priorityChartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-16 text-muted-foreground text-xs">Sem dados suficientes.</div>
                    )}
                  </div>
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
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Máquinas Acionadas</div>
                  <div className="text-xl font-black text-foreground">{generatedReport.summary.totalMachines}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Serviços Totais</div>
                  <div className="text-xl font-black text-primary">{generatedReport.summary.totalTasks}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo de Trabalho</div>
                  <div className="text-xl font-black text-info">{generatedReport.summary.totalActiveTimeText}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Média / Serviço</div>
                  <div className="text-xl font-black text-foreground">{generatedReport.summary.avgActiveTimePerServiceText}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Máquina Destaque</div>
                  <div className="text-sm font-black text-foreground truncate leading-6 text-primary">{generatedReport.summary.topMachine}</div>
                </div>
              </div>

              {/* Charts Section */}
              {generatedReport.data.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Tempo Ativo por Equipamento (Horas)</h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={generatedReport.data.slice(0, 10)} layout="vertical" margin={{ left: 15, right: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis type="number" stroke="#888" fontSize={9} />
                          <YAxis dataKey="code" type="category" stroke="#888" fontSize={10} width={60} />
                          <Tooltip formatter={(val) => [`${val} horas`, "Uso Ativo"]} contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          <Bar name="Horas Trabalhadas" dataKey="activeHrsNum" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Volume de Serviços por Equipamento</h3>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={generatedReport.data.slice(0, 10)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="code" stroke="#888" fontSize={9} />
                          <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          <Legend />
                          <Bar name="Concluídos" dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar name="Total" dataKey="total" fill="#4b5563" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

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
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Volume Total</div>
                  <div className="text-xl font-black text-foreground">{generatedReport.summary.totalTasks} tarefas</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Concluídas</div>
                  <div className="text-xl font-black text-success">{generatedReport.summary.totalCompleted}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Resolução</div>
                  <div className="text-xl font-black text-info">{generatedReport.summary.completionRate}%</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo Ativo</div>
                  <div className="text-xl font-black text-foreground">{generatedReport.summary.totalActiveTimeText}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo Pausado</div>
                  <div className="text-xl font-black text-purple-400">{generatedReport.summary.totalPausedTimeText}</div>
                </div>
                <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pausas / Tarefa</div>
                  <div className="text-xl font-black text-foreground">{generatedReport.summary.avgPausesPerTask}</div>
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
                          <XAxis dataKey="name" stroke="#888" fontSize={9} />
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

                {/* Timeline Chart */}
                {generatedReport.summary.dailyCompletedTimeline.length > 0 && (
                  <div className="col-span-full rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-success" /> Evolução de Conclusão de Tarefas (Diária)
                    </h3>
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={generatedReport.summary.dailyCompletedTimeline}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="date" stroke="#888" fontSize={9} />
                          <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                          <Legend />
                          <Line type="monotone" dataKey="Tarefas Concluídas" stroke="#10b981" strokeWidth={2} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
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

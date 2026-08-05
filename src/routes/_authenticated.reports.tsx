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
  LabelList,
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

interface GeneratedReportData {
  generatedAt: string;
  startDate: string;
  endDate: string;
  desempenho: {
    data: any[];
    summary: any;
  };
  tarefas: {
    data: any[];
    summary: any;
  };
  maquinas: {
    data: any[];
    summary: any;
  };
  geral: {
    summary: any;
  };
}

function ReportsPage() {
  const { isSupervisor } = useAuth();

  // Filters State
  const [datePreset, setDatePreset] = useState<string>("7d");
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [selectedAssignee, setSelectedAssignee] = useState<string>("all");
  const [selectedMachine, setSelectedMachine] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Output generated state
  const [generatedReport, setGeneratedReport] = useState<GeneratedReportData | null>(null);

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

        // --- 1. EMPLOYEE PERFORMANCE ---
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

        const desempenhoData = Object.values(employeeMap).map((emp: any) => {
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

        const totalCompletedDesempenho = filtered.filter((t) => t.status === "done").length;
        const totalActiveTimeDesempenho = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
        const totalPausesDesempenho = desempenhoData.reduce((acc, emp) => acc + emp.pauseCount, 0);
        const avgActiveTimePerTaskDesempenho = totalCompletedDesempenho > 0 ? Math.round(totalActiveTimeDesempenho / totalCompletedDesempenho) : 0;
        const topEmployee = desempenhoData.length > 0 && desempenhoData[0].id !== "unassigned" ? desempenhoData[0].name : "Nenhum";

        const desempenhoSummary = {
          totalTasks: filtered.length,
          totalCompleted: totalCompletedDesempenho,
          totalActiveTimeText: formatHrsMin(totalActiveTimeDesempenho),
          totalPauses: totalPausesDesempenho,
          avgActiveTimePerTaskText: formatHrsMin(avgActiveTimePerTaskDesempenho),
          topEmployee,
        };

        // --- 2. TASKS DETAIL ---
        const tarefasData = filtered.map((t) => {
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
            created_at: new Date(t.created_at).toISOString(),
            started_at: t.started_at ? new Date(t.started_at).toISOString() : null,
            completed_at: t.completed_at ? new Date(t.completed_at).toISOString() : null,
            activeMs: timings.activeMs,
            activeHrsText: formatHrsMin(timings.activeMs),
            pausedHrsText: formatHrsMin(timings.pausedMs),
            pauseCount: taskIntervals.length,
            intervals: taskIntervals,
          };
        });

        const totalCompletedTarefas = filtered.filter((t) => t.status === "done").length;
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

        const tarefasSummary = {
          totalTasks: filtered.length,
          totalCompleted: totalCompletedTarefas,
          totalReview,
          totalProgress,
          totalPaused,
          totalPending,
          avgCompletedActiveText,
          avgCompletedPausedText,
          tasksTimelineData,
          priorityChartData,
        };

        // --- 3. MACHINE UTILIZATION ---
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

        const maquinasData = Object.values(machineMap).map((m: any) => ({
          ...m,
          assigneesCount: m.uniqueAssignees.size,
          activeHrsText: formatHrsMin(m.activeMs),
          activeHrsNum: Math.round((m.activeMs / 3600000) * 10) / 10,
        })).sort((a, b) => b.total - a.total);

        const totalActiveTimeMaquinas = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
        const topMachine = maquinasData.length > 0 && maquinasData[0].id !== "none" ? maquinasData[0].code : "Nenhum";
        const avgActiveTimePerService = filtered.length > 0 ? Math.round(totalActiveTimeMaquinas / filtered.length) : 0;

        const maquinasSummary = {
          totalMachines: maquinasData.length,
          totalTasks: filtered.length,
          totalActiveTimeText: formatHrsMin(totalActiveTimeMaquinas),
          topMachine,
          avgActiveTimePerServiceText: formatHrsMin(avgActiveTimePerService),
        };

        // --- 4. GENERAL WORKSHOP SUMMARY ---
        const statusCountGeral: Record<string, number> = { pending: 0, progress: 0, paused: 0, review: 0, done: 0 };
        const categoryCountGeral: Record<string, number> = {};
        const priorityCountGeral: Record<string, number> = {};

        filtered.forEach((t) => {
          statusCountGeral[t.status] = (statusCountGeral[t.status] || 0) + 1;
          categoryCountGeral[t.type] = (categoryCountGeral[t.type] || 0) + 1;
          priorityCountGeral[t.priority] = (priorityCountGeral[t.priority] || 0) + 1;
        });

        const statusChart = STATUS.map((s) => ({
          name: s.label,
          value: statusCountGeral[s.id] || 0,
          color: s.tone.includes("info") ? "#0ea5e9" : s.tone.includes("warning") ? "#f59e0b" : s.tone.includes("success") ? "#10b981" : s.tone.includes("purple") ? "#a855f7" : "#64748b",
        })).filter((s) => s.value > 0);

        const categoryChart = Object.entries(categoryCountGeral).map(([name, value]) => ({
          name,
          value,
        })).sort((a, b) => b.value - a.value);

        const priorityChart = ["Urgente", "Alta", "Normal", "Baixa"].map((p) => ({
          name: p,
          value: priorityCountGeral[p] || 0,
          color: p === "Urgente" ? "#ef4444" : p === "Alta" ? "#f97316" : p === "Normal" ? "#3b82f6" : "#64748b",
        })).filter((p) => p.value > 0);

        const totalCompletedGeral = statusCountGeral.done || 0;
        const completionRate = filtered.length > 0 ? Math.round((totalCompletedGeral / filtered.length) * 100) : 0;

        const totalActiveTimeGeral = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).activeMs, 0);
        const totalPausedTimeGeral = filtered.reduce((acc, t) => acc + calculateTaskTimings(t).pausedMs, 0);
        const totalPausesCountGeral = filtered.reduce((acc, t) => acc + (Array.isArray(t.intervals) ? t.intervals.length : 0), 0);
        const avgPausesPerTaskGeral = filtered.length > 0 ? Math.round((totalPausesCountGeral / filtered.length) * 10) / 10 : 0;

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

        const geralSummary = {
          statusChart,
          categoryChart,
          priorityChart,
          totalTasks: filtered.length,
          totalCompleted: totalCompletedGeral,
          completionRate,
          totalActiveTimeText: formatHrsMin(totalActiveTimeGeral),
          totalPausedTimeText: formatHrsMin(totalPausedTimeGeral),
          avgPausesPerTask: avgPausesPerTaskGeral,
          dailyCompletedTimeline,
        };

        // Save unbundled results
        setGeneratedReport({
          generatedAt: new Date().toLocaleString("pt-BR"),
          startDate,
          endDate,
          desempenho: { data: desempenhoData, summary: desempenhoSummary },
          tarefas: { data: tarefasData, summary: tarefasSummary },
          maquinas: { data: maquinasData, summary: maquinasSummary },
          geral: { summary: geralSummary },
        });

        toast.success("Relatórios gerados com sucesso!");
      } catch (err: any) {
        console.error(err);
        toast.error("Erro ao processar relatórios", { description: err.message });
      } finally {
        setGenerating(false);
      }
    }, 400);
  };

  // Export to CSV Function
  const handleExportCSV = (type: "desempenho" | "tarefas" | "maquinas" | "geral") => {
    if (!generatedReport) return;
    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = `relatorio-${type}-${generatedReport.startDate}-a-${generatedReport.endDate}.csv`;

    if (type === "desempenho") {
      const data = generatedReport.desempenho.data;
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
      const data = generatedReport.tarefas.data;
      headers = [
        "Título",
        "Categoria",
        "Status",
        "Prioridade",
        "Responsável",
        "Máquina",
        "Criada em",
        "Iniciada em",
        "Concluída em",
        "Tempo Ativo",
        "Qtd. Pausas",
        "Tempo Pausado"
      ];
      rows = data.map((d) => [
        d.title,
        d.type,
        d.status,
        d.priority,
        d.assignee,
        d.machine,
        d.created_at ? new Date(d.created_at).toLocaleString("pt-BR") : "-",
        d.started_at ? new Date(d.started_at).toLocaleString("pt-BR") : "-",
        d.completed_at ? new Date(d.completed_at).toLocaleString("pt-BR") : "-",
        d.activeHrsText,
        d.pauseCount,
        d.pausedHrsText,
      ]);
    } else if (type === "maquinas") {
      const data = generatedReport.maquinas.data;
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
      const data = generatedReport.tarefas.data;
      headers = ["Título da Tarefa", "Categoria", "Status", "Prioridade", "Responsável", "Máquina", "Criada em", "Iniciada em", "Concluída em"];
      rows = data.map((d) => [
        d.title,
        d.type,
        d.status,
        d.priority,
        d.assignee,
        d.machine,
        d.created_at ? new Date(d.created_at).toLocaleString("pt-BR") : "-",
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
          /* Hide sidebar, headers, query selectors, action buttons and toaster popups */
          header, 
          aside, 
          .print\\:hidden, 
          [role="dialog"], 
          button, 
          .toast,
          [data-sonner-toaster] {
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
            padding: 0.4cm !important;
          }

          /* Compress vertical spacing of Tailwind classes */
          .space-y-12 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.75rem !important;
          }
          .space-y-6 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 0.4rem !important;
          }
          .mt-8 {
            margin-top: 0.5rem !important;
          }

          /* Compress card paddings */
          .p-6, .p-5, .p-4 {
            padding: 0.4rem !important;
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

          /* Keep task table bodies together */
          tbody {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
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
            padding: 3px 4px !important;
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
            gap: 8px !important;
          }

          .grid-cols-4, .lg\\:grid-cols-4, .lg\\:grid-cols-6 {
            grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          }

          .grid-cols-2, .md\\:grid-cols-2 {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }

          /* Prevent charts and KPI blocks from breaking halfway */
          .print\\:break-inside-avoid, 
          .recharts-responsive-container,
          .grid > div {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          /* Recharts SVG print dimensions and container heights */
          .recharts-responsive-container {
            width: 100% !important;
            height: 170px !important;
            min-height: 170px !important;
            display: block !important;
          }
          .h-64, .h-60 {
            height: 170px !important;
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

          /* Prevent headers from staying alone at the bottom of pages */
          h1, h2, h3, h4, .border-b {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }

          @page {
            size: A4 portrait;
            margin: 0.8cm;
          }
        }
      `}} />
      {/* FILTERS CONTAINER: Hidden when printing */}
      <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-6 print:hidden">
        <div className="flex items-center gap-2 pb-3 border-b border-border/40">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="font-display font-bold text-lg">Parâmetros de Consulta</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
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
                Gerar Relatórios
              </>
            )}
          </Button>
        </div>
      </div>

      {/* GENERATED REPORT RENDER */}
      {generatedReport ? (
        <div className="mt-8 space-y-12 print:mt-0">
          {/* Action buttons on generated report */}
          <div className="flex justify-between items-center bg-surface-elevated/40 border border-border/50 rounded-2xl p-4 shadow-card print:hidden">
            <div className="text-xs text-muted-foreground">
              Relatórios gerados em: <span className="font-semibold text-foreground">{generatedReport.generatedAt}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 h-9 text-xs">
                <Printer className="h-3.5 w-3.5" /> Imprimir Painel / PDF
              </Button>
            </div>
          </div>

          {/* Print-only Header */}
          <div className="hidden print:block border-b-2 border-primary/50 pb-4 mb-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="font-display font-black text-2xl tracking-tight text-primary">FitControl — Oficina</h1>
                <p className="text-xs text-muted-foreground">Painel Unificado de Relatórios Gerenciais</p>
              </div>
              <div className="text-right text-xs">
                <div>Data de Emissão: {generatedReport.generatedAt}</div>
                <div>Período: {new Date(generatedReport.startDate + "T00:00:00").toLocaleDateString("pt-BR")} a {new Date(generatedReport.endDate + "T23:59:59").toLocaleDateString("pt-BR")}</div>
              </div>
            </div>
          </div>

          {/* 1. REPORT: WORKSHOP GENERAL SUMMARY */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground">1. Resumo Geral da Oficina</h3>
                  <p className="text-xs text-muted-foreground font-sans">Métricas gerais consolidadas no período selecionado.</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExportCSV("geral")} 
                className="gap-1.5 h-8 text-xs border-success/40 text-success hover:bg-success/10 print:hidden"
              >
                <Download className="h-3 w-3" /> Exportar Dados Gerais
              </Button>
            </div>

            {/* General Summary KPIs */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Volume Total</div>
                <div className="text-xl font-black text-foreground">{generatedReport.geral.summary.totalTasks} tarefas</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Concluídas</div>
                <div className="text-xl font-black text-success">{generatedReport.geral.summary.totalCompleted}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Resolução</div>
                <div className="text-xl font-black text-info">{generatedReport.geral.summary.completionRate}%</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo Ativo</div>
                <div className="text-xl font-black text-foreground">{generatedReport.geral.summary.totalActiveTimeText}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo Pausado</div>
                <div className="text-xl font-black text-purple-400">{generatedReport.geral.summary.totalPausedTimeText}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pausas / Tarefa</div>
                <div className="text-xl font-black text-foreground">{generatedReport.geral.summary.avgPausesPerTask}</div>
              </div>
            </div>

            {/* Charts grid */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Category volume chart */}
              <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4 text-primary" /> Volume de Serviços por Categoria
                </h3>
                {generatedReport.geral.summary.categoryChart.length > 0 ? (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={generatedReport.geral.summary.categoryChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#888" fontSize={9} />
                        <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                        <Bar dataKey="value" name="Volume" fill="#f97316" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="value" position="top" style={{ fill: '#a1a1aa', fontSize: 10, fontWeight: 'bold' }} />
                        </Bar>
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
                {generatedReport.geral.summary.priorityChart.length > 0 ? (
                  <div className="h-60 w-full flex items-center justify-center gap-4">
                    <div className="h-full w-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={generatedReport.geral.summary.priorityChart}
                            innerRadius={35}
                            outerRadius={55}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {generatedReport.geral.summary.priorityChart.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1.5 text-[11px] flex-1">
                      {generatedReport.geral.summary.priorityChart.map((p: any) => (
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

          {/* 2. REPORT: TASKS DETAIL (HIGHLIGHTED) */}
          <div className="rounded-2xl border border-border/60 bg-card/90 p-6 shadow-ember/10 shadow-lg space-y-6 relative overflow-hidden print:border print:shadow-none print:p-0 print:break-before-page">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-bl-lg print:hidden">
              Destaque Operacional
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary animate-pulse" />
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground">2. Histórico & Atividades Detalhadas</h3>
                  <p className="text-xs text-muted-foreground font-sans">Listagem completa das tarefas realizadas no período com início, conclusão e histórico de pausas.</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExportCSV("tarefas")} 
                className="gap-1.5 h-8 text-xs border-success/40 text-success hover:bg-success/10 print:hidden"
              >
                <Download className="h-3 w-3" /> Exportar Atividades (CSV)
              </Button>
            </div>

            {/* Summary KPIs inside Tasks section */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Total Filtrado</div>
                <div className="text-xl font-black text-foreground">{generatedReport.tarefas.summary.totalTasks}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Concluídas</div>
                <div className="text-xl font-black text-success">{generatedReport.tarefas.summary.totalCompleted}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Em Execução</div>
                <div className="text-xl font-black text-info">{generatedReport.tarefas.summary.totalProgress}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pausadas</div>
                <div className="text-xl font-black text-warning">{generatedReport.tarefas.summary.totalPaused}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pendentes</div>
                <div className="text-xl font-black text-muted-foreground">{generatedReport.tarefas.summary.totalPending}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Média Ativa / Tarefa</div>
                <div className="text-sm font-black text-foreground mt-1 truncate leading-6">{generatedReport.tarefas.summary.avgCompletedActiveText}</div>
              </div>
            </div>

            {/* DESTAQUE PRINCIPAL: Detail Table on top */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden print:border-0 print:bg-transparent print:rounded-none print:shadow-none print:overflow-visible">
              <div className="p-4 bg-surface-elevated/40 border-b border-border/40 flex items-center justify-between">
                <h3 className="font-semibold text-sm text-foreground">Lista de Atividades no Período</h3>
                <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded uppercase">Principal</span>
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
                      <th className="p-3">Início</th>
                      <th className="p-3">Conclusão</th>
                      <th className="p-3 text-right">Ativo</th>
                      <th className="p-3 text-right">Pausado</th>
                      <th className="p-3 text-center">Pausas</th>
                    </tr>
                  </thead>
                    {generatedReport.tarefas.data.map((d: any) => {
                      const st = STATUS.find((s) => s.id === d.status);
                      
                      const formatTaskDate = (isoStr: string | null | undefined) => {
                        if (!isoStr) return "-";
                        const date = new Date(isoStr);
                        return (
                          <div className="flex flex-col text-[10px] leading-tight font-medium print:text-[8px]">
                            <span className="text-foreground">{date.toLocaleDateString("pt-BR")}</span>
                            <span className="text-muted-foreground">{date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        );
                      };

                      return (
                        <tbody key={d.id} className="divide-y divide-border/40 text-xs print:break-inside-avoid border-b border-border/40">
                          <tr className="hover:bg-accent/20">
                            <td className="p-3 font-semibold text-foreground max-w-xs truncate print:max-w-none print:whitespace-normal print:overflow-visible">{d.title}</td>
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
                            <td className="p-3 text-muted-foreground">{formatTaskDate(d.started_at)}</td>
                            <td className="p-3 text-muted-foreground">{formatTaskDate(d.completed_at)}</td>
                            <td className="p-3 text-right tabular-nums text-foreground">{d.activeHrsText}</td>
                            <td className="p-3 text-right tabular-nums text-muted-foreground">{d.pausedHrsText}</td>
                            <td className="p-3 text-center tabular-nums font-semibold">
                              <span className={cn("inline-block px-1.5 py-0.5 rounded text-[10px]", d.pauseCount > 0 ? "bg-purple-500/15 text-purple-400 font-bold border border-purple-500/20" : "text-muted-foreground")}>
                                {d.pauseCount}
                              </span>
                            </td>
                          </tr>
                          {/* Printable/inline detail of pauses under the task row */}
                          {d.intervals && d.intervals.length > 0 && (
                            <tr key={`${d.id}-pauses`} className="bg-purple-500/[0.02] border-b border-border/40">
                              <td colSpan={11} className="p-3 pl-8 text-xs text-muted-foreground border-t-0">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                                    <Clock className="h-3 w-3" />
                                    <span>Intervalos e Pausas de Atividade ({d.pauseCount})</span>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {d.intervals.map((interval: any, index: number) => {
                                      const pStart = new Date(interval.paused_at);
                                      const pEnd = interval.resumed_at ? new Date(interval.resumed_at) : null;
                                      const durationMs = pEnd ? pEnd.getTime() - pStart.getTime() : Date.now() - pStart.getTime();
                                      const minutes = Math.floor(durationMs / (1000 * 60));
                                      const durationText = minutes > 0 ? `${minutes}m` : "poucos segundos";

                                      return (
                                        <div 
                                          key={index} 
                                          className="inline-flex flex-col bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded text-[10px] text-purple-300 font-medium"
                                        >
                                          <span className="text-purple-200 font-semibold">
                                            #{index + 1}: {interval.reason || "Intervalo geral"}
                                          </span>
                                          <span className="text-[9px] text-purple-300/80">
                                            {pStart.toLocaleDateString("pt-BR")} às {pStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                            {pEnd ? (
                                              ` a ${pEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} (${durationText})`
                                            ) : (
                                              " (Em aberto)"
                                            )}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      );
                    })}
                </table>
              </div>
            </div>


          </div>

          {/* 3. REPORT: EMPLOYEE PERFORMANCE */}
          <div className="space-y-6 print:break-before-page">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground">3. Desempenho & Produtividade de Funcionários</h3>
                  <p className="text-xs text-muted-foreground font-sans">Análise detalhada de entregas, horas ativas e tempos médios por colaborador.</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExportCSV("desempenho")} 
                className="gap-1.5 h-8 text-xs border-success/40 text-success hover:bg-success/10 print:hidden"
              >
                <Download className="h-3 w-3" /> Exportar Desempenho (CSV)
              </Button>
            </div>

            {/* Performance Cards Summary */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tarefas Totais</div>
                <div className="text-xl font-black text-foreground">{generatedReport.desempenho.summary.totalTasks}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Concluídas</div>
                <div className="text-xl font-black text-success">{generatedReport.desempenho.summary.totalCompleted}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo Ativo Total</div>
                <div className="text-xl font-black text-info">{generatedReport.desempenho.summary.totalActiveTimeText}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pausas Totais</div>
                <div className="text-xl font-black text-purple-400">{generatedReport.desempenho.summary.totalPauses}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Média / Tarefa</div>
                <div className="text-xl font-black text-foreground">{generatedReport.desempenho.summary.avgActiveTimePerTaskText}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Melhor Entregador</div>
                <div className="text-sm font-black text-primary truncate leading-6">{generatedReport.desempenho.summary.topEmployee}</div>
              </div>
            </div>

            {/* Chart section */}
            {generatedReport.desempenho.data.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Volume de Tarefas por Funcionário</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={generatedReport.desempenho.data.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#888" fontSize={9} />
                        <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                        <Legend />
                        <Bar name="Concluídas" dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="completed" position="top" style={{ fill: '#a1a1aa', fontSize: 9, fontWeight: 'bold' }} />
                        </Bar>
                        <Bar name="Total Criadas" dataKey="total" fill="#4b5563" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="total" position="top" style={{ fill: '#a1a1aa', fontSize: 9, fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Tempo Trabalhado vs Pausado (Horas)</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={generatedReport.desempenho.data.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#888" fontSize={9} />
                        <YAxis stroke="#888" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                        <Legend />
                        <Bar name="Tempo Ativo (h)" dataKey="activeHoursNum" fill="#0ea5e9" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="activeHoursNum" position="top" style={{ fill: '#a1a1aa', fontSize: 9, fontWeight: 'bold' }} />
                        </Bar>
                        <Bar name="Tempo Pausado (h)" dataKey="pausedHoursNum" fill="#a855f7" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="pausedHoursNum" position="top" style={{ fill: '#a1a1aa', fontSize: 9, fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Performance Table */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden print:border-0 print:bg-transparent print:rounded-none print:shadow-none print:overflow-visible">
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
                    {generatedReport.desempenho.data.map((d: any) => (
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

          {/* 4. REPORT: MACHINE UTILIZATION */}
          <div className="space-y-6 print:break-before-page">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
              <div className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-display font-bold text-lg text-foreground">4. Utilização de Máquinas & Equipamentos</h3>
                  <p className="text-xs text-muted-foreground font-sans">Controle de uso e distribuição de tarefas entre os equipamentos cadastrados.</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExportCSV("maquinas")} 
                className="gap-1.5 h-8 text-xs border-success/40 text-success hover:bg-success/10 print:hidden"
              >
                <Download className="h-3 w-3" /> Exportar Máquinas (CSV)
              </Button>
            </div>

            {/* Summary KPIs */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Máquinas Acionadas</div>
                <div className="text-xl font-black text-foreground">{generatedReport.maquinas.summary.totalMachines}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Serviços Totais</div>
                <div className="text-xl font-black text-primary">{generatedReport.maquinas.summary.totalTasks}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Tempo de Trabalho</div>
                <div className="text-xl font-black text-info">{generatedReport.maquinas.summary.totalActiveTimeText}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Média / Serviço</div>
                <div className="text-xl font-black text-foreground">{generatedReport.maquinas.summary.avgActiveTimePerServiceText}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Máquina Destaque</div>
                <div className="text-sm font-black text-foreground truncate leading-6 text-primary">{generatedReport.maquinas.summary.topMachine}</div>
              </div>
            </div>

            {/* Charts Section */}
            {generatedReport.maquinas.data.length > 0 && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Tempo Ativo por Equipamento (Horas)</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={generatedReport.maquinas.data.slice(0, 10)} layout="vertical" margin={{ left: 15, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis type="number" stroke="#888" fontSize={9} />
                        <YAxis dataKey="code" type="category" stroke="#888" fontSize={10} width={60} />
                        <Tooltip formatter={(val) => [`${val} horas`, "Uso Ativo"]} contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                        <Bar name="Horas Trabalhadas" dataKey="activeHrsNum" fill="#0ea5e9" radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="activeHrsNum" position="right" style={{ fill: '#a1a1aa', fontSize: 9, fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-card p-5 print:break-inside-avoid">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">Volume de Serviços por Equipamento</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={generatedReport.maquinas.data.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="code" stroke="#888" fontSize={9} />
                        <YAxis stroke="#888" fontSize={10} allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }} />
                        <Legend />
                        <Bar name="Concluídos" dataKey="completed" fill="#10b981" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="completed" position="top" style={{ fill: '#a1a1aa', fontSize: 9, fontWeight: 'bold' }} />
                        </Bar>
                        <Bar name="Total" dataKey="total" fill="#4b5563" radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="total" position="top" style={{ fill: '#a1a1aa', fontSize: 9, fontWeight: 'bold' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Machine list table */}
            <div className="rounded-2xl border border-border/60 bg-card shadow-card overflow-hidden print:border-0 print:bg-transparent print:rounded-none print:shadow-none print:overflow-visible">
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
                    {generatedReport.maquinas.data.map((d: any) => (
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
        </div>
      ) : (
        /* INITIAL STATE REPORT MESSAGE */
        <div className="mt-8 rounded-2xl border border-dashed border-border/60 bg-card/40 p-16 text-center text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3 animate-pulse" />
          <h3 className="font-semibold text-foreground text-lg">Nenhum relatório gerado</h3>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Configure os filtros no painel de parâmetros e clique no botão <strong>Gerar Relatórios</strong> para processar as informações de forma unificada.
          </p>
        </div>
      )}
    </AppShell>
  );
}

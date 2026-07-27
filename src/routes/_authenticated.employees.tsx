import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Briefcase,
  Search,
  Loader2,
  Calendar as CalendarIcon,
  ChevronLeft,
  AlertCircle,
  FileText,
  TrendingUp,
  BarChart2,
  Clock3,
  CalendarDays,
  Hammer,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { TaskDetailModal, type TaskDetail } from "@/components/task-detail-modal";
import { typeIcon, priorityTone, STATUS } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/employees")({
  head: () => ({
    meta: [
      { title: "Funcionários & Produtividade — FitControl" },
      { name: "description", content: "Acompanhe as tarefas, produtividade e calendário de atividades da equipe." },
    ],
  }),
  component: EmployeesPage,
});

type EmployeeProfile = {
  id: string;
  name: string;
  avatar_url: string | null;
  badge: string;
  created_at: string;
  role: "admin" | "supervisor" | "worker";
};

type PresetRange = "all" | "today" | "week" | "month" | "day";

function EmployeesPage() {
  const { isSupervisor } = useAuth();
  
  // State variables
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  
  // Time range filters
  const [timeRange, setTimeRange] = useState<PresetRange>("all");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Task viewing states
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  // Redirect if not supervisor
  if (!isSupervisor) {
    return (
      <AppShell title="Acesso Negado">
        <div className="grid place-items-center py-24 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="font-display text-xl font-bold">Acesso restrito</h3>
          <p className="text-muted-foreground mt-1">Apenas supervisores e administradores podem ver a produtividade da equipe.</p>
        </div>
      </AppShell>
    );
  }

  // Query: Profiles & Roles
  const { data: employees = [], isLoading: isLoadingEmployees } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: rolesData, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("*").order("name", { ascending: true }),
        supabase.from("user_roles").select("*"),
      ]);

      if (pErr) throw pErr;
      if (rErr) throw rErr;

      const rolesMap = new Map<string, "admin" | "supervisor" | "worker">();
      rolesData?.forEach((r) => {
        rolesMap.set(r.user_id, r.role as "admin" | "supervisor" | "worker");
      });

      return (profiles ?? []).map((p) => ({
        ...p,
        role: rolesMap.get(p.id) ?? "worker",
      })) as EmployeeProfile[];
    },
  });

  // Query: All Tasks (for metric processing)
  const { data: allTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["tasks", "productivity"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,type,status,priority,description,assignee_id,machine_id,photo_url,notes,created_at,completed_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Query: Machines (for mapping names in graphs)
  const { data: machines = [] } = useQuery({
    queryKey: ["machines-lookup-employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("machines").select("id,name,code");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Client-side grouping of tasks by assignee
  const tasksByAssignee = useMemo(() => {
    const map = new Map<string, any[]>();
    allTasks.forEach((t) => {
      if (t.assignee_id) {
        if (!map.has(t.assignee_id)) {
          map.set(t.assignee_id, []);
        }
        map.get(t.assignee_id)!.push(t);
      }
    });
    return map;
  }, [allTasks]);

  // Check if there are tasks on a specific day (used for calendar marks)
  const hasTaskOnDay = (date: Date) => {
    if (!selectedEmployee) return false;
    const userTasks = tasksByAssignee.get(selectedEmployee.id) ?? [];
    return userTasks.some((t) => {
      const d = new Date(t.completed_at || t.created_at);
      return d.toDateString() === date.toDateString();
    });
  };

  // Date range filter checker
  const isTaskInPeriod = (task: any) => {
    const taskDate = new Date(task.completed_at || task.created_at);
    const today = new Date();
    
    if (timeRange === "today") {
      return taskDate.toDateString() === today.toDateString();
    }
    
    if (timeRange === "week") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(today.getDate() - 7);
      return taskDate >= oneWeekAgo && taskDate <= today;
    }
    
    if (timeRange === "month") {
      const oneMonthAgo = new Date();
      oneMonthAgo.setDate(today.getDate() - 30);
      return taskDate >= oneMonthAgo && taskDate <= today;
    }
    
    if (timeRange === "day") {
      return taskDate.toDateString() === selectedDate.toDateString();
    }
    
    return true; // "all"
  };

  // Filtered employees list based on search/role inputs
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      const matchesSearch =
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.badge.toLowerCase().includes(search.toLowerCase());
      
      const matchesRole = roleFilter === "all" || e.role === roleFilter;
      
      return matchesSearch && matchesRole;
    });
  }, [employees, search, roleFilter]);

  // Get aggregated stats for each employee (overall list summary)
  const getSummaryStats = (userId: string) => {
    const list = tasksByAssignee.get(userId) ?? [];
    const completed = list.filter((t) => t.status === "done").length;
    const progress = list.filter((t) => t.status === "progress").length;
    return { total: list.length, completed, progress };
  };

  // Process selected employee dashboard statistics dynamically
  const employeeStats = useMemo(() => {
    if (!selectedEmployee) return null;
    const allUserTasks = tasksByAssignee.get(selectedEmployee.id) ?? [];
    
    // Filter by active timeRange / calendar selection
    const periodTasks = allUserTasks.filter(isTaskInPeriod);
    
    const total = periodTasks.length;
    const completed = periodTasks.filter((t) => t.status === "done").length;
    const inProgress = periodTasks.filter((t) => t.status === "progress").length;
    const pending = periodTasks.filter((t) => t.status === "pending").length;
    const review = periodTasks.filter((t) => t.status === "review").length;
    
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Chart 1: Operation type count
    const typesMap: Record<string, number> = {};
    periodTasks.forEach((t) => {
      typesMap[t.type] = (typesMap[t.type] || 0) + 1;
    });
    const typeChartData = Object.entries(typesMap).map(([name, count]) => ({
      name,
      count,
    }));

    // Chart 2: Status distribution
    const statusData = [
      { name: "Concluído", value: completed, color: "#10b981" },
      { name: "Em Andamento", value: inProgress, color: "#0ea5e9" },
      { name: "Revisão", value: review, color: "#f59e0b" },
      { name: "Pendente", value: pending, color: "#64748b" },
    ].filter((s) => s.value > 0);

    // Chart 3: Priority distribution
    const priorityMap: Record<string, number> = {};
    periodTasks.forEach((t) => {
      priorityMap[t.priority] = (priorityMap[t.priority] || 0) + 1;
    });
    const priorityData = ["Urgente", "Alta", "Normal", "Baixa"].map((p) => ({
      name: p,
      value: priorityMap[p] || 0,
    })).filter((p) => p.value > 0);

    // Chart 4: Average time per task type (completed tasks)
    const completedTasksList = periodTasks.filter(
      (t) => t.status === "done" && t.completed_at && t.created_at
    );
    const avgTimeMap: Record<string, { sum: number; count: number }> = {};
    completedTasksList.forEach((t) => {
      const start = new Date(t.created_at).getTime();
      const end = new Date(t.completed_at!).getTime();
      const durationMinutes = (end - start) / (1000 * 60);
      if (durationMinutes >= 0) {
        if (!avgTimeMap[t.type]) {
          avgTimeMap[t.type] = { sum: 0, count: 0 };
        }
        avgTimeMap[t.type].sum += durationMinutes;
        avgTimeMap[t.type].count += 1;
      }
    });
    const avgTimeChartData = Object.entries(avgTimeMap).map(([name, data]) => ({
      name,
      minutes: Math.round(data.sum / data.count),
    }));

    return {
      periodTasks,
      total,
      completed,
      inProgress,
      pending,
      review,
      rate,
      typeChartData,
      statusData,
      priorityData,
      avgTimeChartData,
    };
  }, [selectedEmployee, tasksByAssignee, timeRange, selectedDate, machines]);

  // Productivity timeline evolution (Area Chart over the last 15 days)
  const productivityEvolutionData = useMemo(() => {
    if (!selectedEmployee) return [];
    const allUserTasks = tasksByAssignee.get(selectedEmployee.id) ?? [];
    
    const days = [];
    const today = new Date();
    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      days.push(d);
    }
    
    return days.map((day) => {
      const dateStr = day.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const completedCount = allUserTasks.filter((t) => {
        if (t.status !== "done" || !t.completed_at) return false;
        const compDate = new Date(t.completed_at);
        return compDate.toDateString() === day.toDateString();
      }).length;
      
      return {
        date: dateStr,
        Concluídas: completedCount,
      };
    });
  }, [selectedEmployee, tasksByAssignee]);

  const loading = isLoadingEmployees || isLoadingTasks;

  return (
    <AppShell
      title="Funcionários & Produtividade"
      subtitle="Painel de controle, calendário de atividades e desempenho da equipe"
    >
      {loading ? (
        <div className="grid place-items-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !selectedEmployee ? (
        // LIST VIEW
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={roleFilter === "all" ? "default" : "outline"}
                onClick={() => setRoleFilter("all")}
                size="sm"
              >
                Todos
              </Button>
              <Button
                variant={roleFilter === "worker" ? "default" : "outline"}
                onClick={() => setRoleFilter("worker")}
                size="sm"
              >
                Operacionais
              </Button>
              <Button
                variant={roleFilter === "supervisor" ? "default" : "outline"}
                onClick={() => setRoleFilter("supervisor")}
                size="sm"
              >
                Supervisores
              </Button>
              <Button
                variant={roleFilter === "admin" ? "default" : "outline"}
                onClick={() => setRoleFilter("admin")}
                size="sm"
              >
                Admins
              </Button>
            </div>
            
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar funcionário ou crachá..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Grid list of employees */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEmployees.map((e) => {
              const stats = getSummaryStats(e.id);
              const initials = e.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              
              return (
                <div
                  key={e.id}
                  onClick={() => {
                    setSelectedEmployee(e);
                    setTimeRange("all");
                  }}
                  className="group rounded-2xl border border-border/60 bg-card p-5 hover:border-primary/40 cursor-pointer hover:shadow-md transition-all duration-300 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-ember font-display font-bold text-primary-foreground text-sm shadow-ember shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-display text-base font-bold text-foreground leading-snug truncate group-hover:text-primary transition-colors">
                          {e.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn(
                            "inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0",
                            e.role === "admin" && "bg-primary/10 text-primary border-primary/20",
                            e.role === "supervisor" && "bg-info/10 text-info border-info/20",
                            e.role === "worker" && "bg-muted text-muted-foreground border-border"
                          )}>
                            {e.role === "admin" && "Admin"}
                            {e.role === "supervisor" && "Supervisor"}
                            {e.role === "worker" && e.badge}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-5 text-center bg-muted/30 border border-border/40 rounded-xl p-3">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Total</span>
                        <span className="text-base font-bold tabular-nums text-foreground">{stats.total}</span>
                      </div>
                      <div className="border-x border-border/50">
                        <span className="text-[10px] text-muted-foreground uppercase block font-semibold text-info">Ativo</span>
                        <span className="text-base font-bold tabular-nums text-info">{stats.progress}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase block font-semibold text-success">Feito</span>
                        <span className="text-base font-bold tabular-nums text-success">{stats.completed}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-primary font-semibold border-t border-border/40 pt-3 opacity-80 group-hover:opacity-100 transition-opacity">
                    <span>Ver desempenho completo</span>
                    <span>→</span>
                  </div>
                </div>
              );
            })}

            {filteredEmployees.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-border/60 p-16 text-center">
                <Briefcase className="h-12 w-12 text-primary mx-auto mb-3" />
                <h3 className="font-display text-xl font-bold">Nenhum funcionário encontrado</h3>
                <p className="text-muted-foreground mt-1">Busque com outro termo ou ajuste os filtros.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        // EMPLOYEE DETAIL / DASHBOARD VIEW
        <div className="space-y-6">
          {/* Back Header */}
          <div className="flex items-center justify-between border-b border-border/50 pb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedEmployee(null);
              }}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar para a lista
            </Button>
            
            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border",
                selectedEmployee.role === "admin" && "bg-primary/10 text-primary border-primary/20",
                selectedEmployee.role === "supervisor" && "bg-info/10 text-info border-info/20",
                selectedEmployee.role === "worker" && "bg-muted text-muted-foreground border-border"
              )}>
                {selectedEmployee.role === "admin" && "Administrador"}
                {selectedEmployee.role === "supervisor" && "Supervisor"}
                {selectedEmployee.role === "worker" && selectedEmployee.badge}
              </span>
            </div>
          </div>

          {/* Profile Header Card */}
          <div className="rounded-2xl border border-border/60 bg-card p-6">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-ember font-display font-bold text-primary-foreground text-xl shadow-ember shrink-0">
                {selectedEmployee.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-display text-2xl font-bold text-foreground leading-tight">{selectedEmployee.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Cadastrado em: {new Date(selectedEmployee.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>
          </div>

          {/* Time Range Selector Panel */}
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider block">
                  Período dos Gráficos & Atividades
                </span>
                <span className="text-sm font-semibold text-foreground mt-1 block">
                  {timeRange === "all" && "Todo o Período (Geral)"}
                  {timeRange === "today" && "Hoje"}
                  {timeRange === "week" && "Esta Semana (Últimos 7 dias)"}
                  {timeRange === "month" && "Este Mês (Últimos 30 dias)"}
                  {timeRange === "day" && `Dia Selecionado no Calendário: ${selectedDate.toLocaleDateString("pt-BR")}`}
                </span>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={timeRange === "all" ? "default" : "outline"}
                  onClick={() => setTimeRange("all")}
                  size="sm"
                  className="text-xs"
                >
                  Tempo Todo
                </Button>
                <Button
                  variant={timeRange === "today" ? "default" : "outline"}
                  onClick={() => setTimeRange("today")}
                  size="sm"
                  className="text-xs"
                >
                  Hoje
                </Button>
                <Button
                  variant={timeRange === "week" ? "default" : "outline"}
                  onClick={() => setTimeRange("week")}
                  size="sm"
                  className="text-xs"
                >
                  Semana
                </Button>
                <Button
                  variant={timeRange === "month" ? "default" : "outline"}
                  onClick={() => setTimeRange("month")}
                  size="sm"
                  className="text-xs"
                >
                  Mês
                </Button>
              </div>
            </div>
          </div>

          {/* Productivity KPI Dashboard */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block">
                Total de Tarefas
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-display font-bold">{employeeStats?.total}</span>
                <span className="text-xs text-muted-foreground">no período selecionado</span>
              </div>
            </div>
            
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block text-success">
                Tarefas Concluídas
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-display font-bold text-success">{employeeStats?.completed}</span>
                <span className="text-xs text-muted-foreground">entregues no prazo</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block text-info">
                Tarefas Ativas
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-display font-bold text-info">
                  {(employeeStats?.inProgress ?? 0) + (employeeStats?.review ?? 0)}
                </span>
                <span className="text-xs text-muted-foreground">em andamento / revisão</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider block text-primary">
                Taxa de Conclusão
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl font-display font-bold text-primary">{employeeStats?.rate}%</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden max-w-20 self-center">
                  <div
                    className="h-full bg-gradient-ember"
                    style={{ width: `${employeeStats?.rate}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Chart Analytics Grid */}
          {employeeStats && employeeStats.total > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Chart 1: Daily Productivity Evolution (Area Chart) */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <h4 className="font-display font-bold text-sm mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Evolução de Produtividade (Últimos 15 dias)
                </h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={productivityEvolutionData}>
                      <XAxis dataKey="date" fontSize={10} stroke="#64748b" />
                      <YAxis allowDecimals={false} fontSize={10} stroke="#64748b" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "12px",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Concluídas"
                        stroke="#f97316"
                        fillOpacity={1}
                        fill="url(#colorConcluidas)"
                      />
                      <defs>
                        <linearGradient id="colorConcluidas" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Status Breakdown (Donut Pie Chart) */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <h4 className="font-display font-bold text-sm mb-4 flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-primary" />
                  Distribuição por Status
                </h4>
                <div className="h-64 flex flex-col sm:flex-row items-center justify-around gap-4">
                  <div className="h-48 w-48 relative flex items-center justify-center shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={employeeStats.statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {employeeStats.statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute text-center flex flex-col items-center">
                      <span className="text-xl font-bold font-display">{employeeStats.total}</span>
                      <span className="text-[9px] text-muted-foreground uppercase font-semibold">Tarefas</span>
                    </div>
                  </div>

                  <div className="space-y-2.5 w-full max-w-[180px]">
                    {employeeStats.statusData.map((s) => {
                      const percentage = Math.round((s.value / employeeStats.total) * 100);
                      return (
                        <div key={s.name} className="flex items-center gap-2 text-xs">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                          <span className="text-muted-foreground truncate flex-1">{s.name}</span>
                          <span className="font-bold text-foreground tabular-nums">{s.value} ({percentage}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Chart 3: Operation Types (Vertical Bar Chart) */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <h4 className="font-display font-bold text-sm mb-4 flex items-center gap-2">
                  <Hammer className="h-4 w-4 text-primary" />
                  Volume por Tipo de Operação
                </h4>
                <div className="h-64">
                  {employeeStats.typeChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={employeeStats.typeChartData}>
                        <XAxis dataKey="name" fontSize={10} stroke="#64748b" />
                        <YAxis allowDecimals={false} fontSize={10} stroke="#64748b" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "12px",
                          }}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {employeeStats.typeChartData.map((_entry, idx) => (
                            <Cell key={`cell-${idx}`} fill="url(#emberBarGradient)" />
                          ))}
                        </Bar>
                        <defs>
                          <linearGradient id="emberBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f97316" />
                            <stop offset="100%" stopColor="#ea580c" />
                          </linearGradient>
                        </defs>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                      Sem dados de operações neste período.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 4: Average Time per Task Type */}
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <h4 className="font-display font-bold text-sm mb-4 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Tempo Médio de Conclusão por Operação
                </h4>
                <div className="h-64">
                  {employeeStats.avgTimeChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={employeeStats.avgTimeChartData}
                        layout="vertical"
                        margin={{ left: 15, right: 10 }}
                      >
                        <XAxis type="number" fontSize={10} stroke="#64748b" />
                        <YAxis dataKey="name" type="category" width={100} fontSize={10} stroke="#64748b" />
                        <Tooltip
                          formatter={(value) => [`${value} minutos`, "Tempo Médio"]}
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            borderColor: "hsl(var(--border))",
                            borderRadius: "12px",
                          }}
                        />
                        <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                          {employeeStats.avgTimeChartData.map((_entry, idx) => (
                            <Cell key={`cell-${idx}`} fill="#0ea5e9" />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground text-center">
                      Nenhuma tarefa concluída no período para calcular o tempo médio.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 5: Demand by Priorities */}
              <div className="md:col-span-2 rounded-2xl border border-border/60 bg-card p-5">
                <h4 className="font-display font-bold text-sm mb-4 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-primary" />
                  Divisão por Nível de Urgência / Prioridade
                </h4>
                <div className="grid gap-3 sm:grid-cols-4">
                  {["Urgente", "Alta", "Normal", "Baixa"].map((priority) => {
                    const found = employeeStats.priorityData.find((p) => p.name === priority);
                    const value = found?.value ?? 0;
                    const pct = employeeStats.total > 0 ? Math.round((value / employeeStats.total) * 100) : 0;
                    
                    return (
                      <div
                        key={priority}
                        className="bg-muted/40 border border-border/50 rounded-xl p-3 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className={cn(
                            "inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border",
                            priorityTone(priority)
                          )}>
                            {priority}
                          </span>
                          <span className="text-[10px] font-semibold text-muted-foreground">{pct}%</span>
                        </div>
                        <div className="mt-3">
                          <span className="text-xl font-bold tabular-nums block">{value}</span>
                          <span className="text-[9px] text-muted-foreground font-semibold uppercase">Demandas</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/50 py-16 text-center">
              <BarChart2 className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-medium">Sem dados analíticos para exibir no período selecionado.</p>
            </div>
          )}

          {/* Interactive Calendar & Daily Activities Split Panel */}
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            {/* Calendar Widget */}
            <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card h-fit flex flex-col items-center">
              <h4 className="font-display font-bold text-sm mb-4 self-start flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                Navegar por Calendário
              </h4>
              
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(date);
                    setTimeRange("day"); // Switch scope to this single day!
                  }
                }}
                captionLayout="dropdown"
                className="p-1 max-w-full"
                modifiers={{
                  hasTasks: (date) => hasTaskOnDay(date),
                }}
                modifiersClassNames={{
                  hasTasks: "border border-primary/40 bg-primary/10 font-bold text-primary hover:bg-primary/20",
                }}
              />
              <div className="mt-3 text-[11px] text-muted-foreground text-center">
                <span className="inline-block h-2 w-2 rounded-full bg-primary/30 border border-primary/60 mr-1.5 align-middle" />
                Dias com borda contêm atividades
              </div>
            </div>

            {/* Daily/Period Activities List */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 flex flex-col">
              <h4 className="font-display font-bold text-sm mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {timeRange === "day" ? (
                    `Tarefas em ${selectedDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}`
                  ) : (
                    "Lista de Atividades no Período"
                  )}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  {employeeStats?.periodTasks.length} {employeeStats?.periodTasks.length === 1 ? "tarefa" : "tarefas"}
                </span>
              </h4>

              {employeeStats && employeeStats.periodTasks.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border/50 rounded-xl my-auto">
                  <CalendarIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-medium">Nenhuma atividade registrada neste período.</p>
                  <p className="text-xs text-muted-foreground/80 mt-0.5">Selecione outro período ou dia no calendário.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/40 overflow-y-auto max-h-96 pr-1">
                  {employeeStats?.periodTasks.map((t) => {
                    const st = STATUS.find((s) => s.id === t.status);
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTask(t as TaskDetail);
                          setTaskDetailOpen(true);
                        }}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3.5 cursor-pointer hover:bg-accent/40 rounded-xl px-2 transition-colors"
                      >
                        <span className="text-2xl">{typeIcon(t.type)}</span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground text-sm leading-snug">{t.title}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {t.type} · Criada às {new Date(t.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            {t.completed_at && ` · Concluída às ${new Date(t.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border", priorityTone(t.priority))}>
                            {t.priority}
                          </span>
                          <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border", st?.tone)}>
                            {st?.label || t.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task Details Modal integration */}
      <TaskDetailModal
        task={selectedTask}
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
      />
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Eye,
  MoreVertical,
  Pencil,
  Trash2,
  Camera,
  CheckCircle2,
  User,
  Wrench,
  Loader2,
  Play,
  ClipboardList,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  STATUS,
  TASK_TYPES,
  PRIORITIES,
  typeIcon,
  priorityTone,
  parsePhotoUrls,
  type Status,
} from "@/lib/task-utils";
import { TaskDetailModal, type TaskDetail } from "@/components/task-detail-modal";
import { MachineFormFields, resolveOrCreateMachine } from "@/components/machine-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/all-tasks")({
  head: () => ({
    meta: [
      { title: "Todas as Tarefas — FitControl" },
      { name: "description", content: "Listagem completa, filtros e pesquisa global de tarefas da oficina." },
    ],
  }),
  component: AllTasksPage,
});

function AllTasksPage() {
  const { user, isSupervisor } = useAuth();
  const qc = useQueryClient();

  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMachineId, setCreateMachineId] = useState<string | null>(null);
  const [createMachineName, setCreateMachineName] = useState("");
  const [createMachineCode, setCreateMachineCode] = useState("");

  // Filters & View State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  // Fetch Tasks
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskDetail[];
    },
  });

  // Fetch Profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,name,badge")).data ?? [],
  });

  // Fetch Machines
  const { data: machines = [] } = useQuery({
    queryKey: ["machines"],
    queryFn: async () => (await supabase.from("machines").select("id,code,name")).data ?? [],
  });

  // Maps for fast lookups
  const profilesMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const machinesMap = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);

  // Status Change Mutation
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "done") patch.completed_at = new Date().toISOString();
      const { error } = await supabase.from("tasks").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      toast.success("Status atualizado");
    },
    onError: (e: Error) => toast.error("Erro ao alterar status", { description: e.message }),
  });

  // Delete Task Mutation
  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      toast.success("Tarefa removida");
    },
    onError: (e: Error) => toast.error("Erro ao excluir", { description: e.message }),
  });

  // Create Task Mutation
  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from("tasks").insert({
        ...payload,
        created_by: user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["machines"] });
      setCreateOpen(false);
      setCreateMachineId(null);
      setCreateMachineName("");
      setCreateMachineCode("");
      toast.success("Nova tarefa criada com sucesso!");
    },
    onError: (e: Error) => toast.error("Erro ao criar tarefa", { description: e.message }),
  });

  const onCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    const resolvedMachineId = await resolveOrCreateMachine(
      createMachineId,
      createMachineCode,
      createMachineName
    );

    create.mutate({
      title: f.get("title"),
      type: f.get("type"),
      priority: f.get("priority"),
      description: f.get("description") || null,
      assignee_id: f.get("assignee_id") === "none" ? null : f.get("assignee_id"),
      machine_id: resolvedMachineId,
      status: "pending",
    });
  };

  // Filter Tasks
  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim();
    return tasks.filter((t) => {
      const assignee = t.assignee_id ? profilesMap.get(t.assignee_id) : null;
      const machine = t.machine_id ? machinesMap.get(t.machine_id) : null;

      const matchesSearch =
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (machine && (machine.code.toLowerCase().includes(q) || machine.name.toLowerCase().includes(q))) ||
        (assignee && assignee.name.toLowerCase().includes(q));

      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const matchesType = typeFilter === "all" || t.type === typeFilter;
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesType && matchesPriority;
    });
  }, [tasks, search, statusFilter, typeFilter, priorityFilter, profilesMap, machinesMap]);

  // Counts
  const countPending = tasks.filter((t) => t.status === "pending").length;
  const countProgress = tasks.filter((t) => t.status === "progress").length;
  const countReview = tasks.filter((t) => t.status === "review").length;
  const countDone = tasks.filter((t) => t.status === "done").length;

  return (
    <AppShell
      title="Todas as Tarefas"
      subtitle="Listagem completa, filtros e busca detalhada de todas as tarefas da oficina"
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-ember shadow-ember font-semibold gap-1.5">
              <Plus className="h-4 w-4" /> Nova tarefa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Nova Tarefa
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={onCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Título da Tarefa</Label>
                <Input name="title" required placeholder="Ex: Montagem Esteira Elétrica FX-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select name="type" defaultValue="Montagem">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {typeIcon(t)} {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridade</Label>
                  <Select name="priority" defaultValue="Normal">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Select name="assignee_id" defaultValue="none">
                    <SelectTrigger>
                      <SelectValue placeholder="Ninguém" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem responsável</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.badge})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

              {/* Campos de Nome e Código da Máquina (Selecionar ou Digitar) */}
              <div className="rounded-xl border border-border/60 p-3 bg-surface-elevated">
                <MachineFormFields
                  machines={machines}
                  machineId={createMachineId}
                  machineName={createMachineName}
                  machineCode={createMachineCode}
                  onChange={(val) => {
                    setCreateMachineId(val.machineId);
                    setCreateMachineName(val.machineName);
                    setCreateMachineCode(val.machineCode);
                  }}
                />
              </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea name="description" rows={3} placeholder="Detalhes da tarefa..." />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending} className="bg-gradient-ember shadow-ember">
                  {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Tarefa"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Metric Badges Summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <div className="text-[10px] uppercase font-bold text-muted-foreground">Total de Tarefas</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums">{tasks.length}</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <div className="text-[10px] uppercase font-bold text-muted-foreground">Pendentes</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-muted-foreground">{countPending}</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <div className="text-[10px] uppercase font-bold text-info">Em Andamento</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-info">{countProgress}</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <div className="text-[10px] uppercase font-bold text-warning">Revisão</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-warning">{countReview}</div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card">
          <div className="text-[10px] uppercase font-bold text-success">Concluídas</div>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-success">{countDone}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 mb-6 bg-surface-elevated p-3 rounded-2xl border border-border/50">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, máquina, responsável..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-10 text-xs bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="pending">Pendente ({countPending})</SelectItem>
              <SelectItem value="progress">Em Andamento ({countProgress})</SelectItem>
              <SelectItem value="review">Revisão ({countReview})</SelectItem>
              <SelectItem value="done">Concluído ({countDone})</SelectItem>
            </SelectContent>
          </Select>

          {/* Categoria Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 h-10 text-xs bg-background">
              <SelectValue placeholder="Categoria" />
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

          {/* Prioridade Filter */}
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-32 h-10 text-xs bg-background">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Prioridades</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-border p-1 bg-background shrink-0">
            <button
              onClick={() => setViewMode("table")}
              className={cn(
                "p-1.5 rounded-md text-xs transition",
                viewMode === "table" ? "bg-accent text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
              title="Visualização em Tabela"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-md text-xs transition",
                viewMode === "grid" ? "bg-accent text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
              title="Visualização em Cards"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content Rendering */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <span>Carregando tarefas...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-card p-12 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <h3 className="font-semibold text-foreground text-lg">Nenhuma tarefa encontrada</h3>
          <p className="text-sm mt-1">Tente alterar os termos da busca ou os filtros aplicados.</p>
        </div>
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-elevated border-b border-border/60 text-xs uppercase text-muted-foreground font-bold tracking-wider">
              <tr>
                <th className="p-4">Tarefa & Categoria</th>
                <th className="p-4">Status</th>
                <th className="p-4">Prioridade</th>
                <th className="p-4">Responsável</th>
                <th className="p-4">Máquina</th>
                <th className="p-4">Evidências</th>
                <th className="p-4">Criação</th>
                <th className="p-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filteredTasks.map((t) => {
                const assignee = t.assignee_id ? profilesMap.get(t.assignee_id) : null;
                const machine = t.machine_id ? machinesMap.get(t.machine_id) : null;
                const st = STATUS.find((s) => s.id === t.status);
                const photos = parsePhotoUrls(t.photo_url);

                return (
                  <tr
                    key={t.id}
                    onClick={() => {
                      setSelectedTask(t);
                      setDetailOpen(true);
                    }}
                    className="hover:bg-accent/40 cursor-pointer transition-colors"
                  >
                    <td className="p-4 font-semibold">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl p-1.5 rounded-lg bg-surface-elevated border border-border/50 shrink-0">
                          {typeIcon(t.type)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-display font-bold text-foreground">{t.title}</div>
                          <span className="text-xs text-muted-foreground font-normal">{t.type}</span>
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border", st?.tone)}>
                        {st?.label}
                      </span>
                    </td>

                    <td className="p-4">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border", priorityTone(t.priority))}>
                        {t.priority}
                      </span>
                    </td>

                    <td className="p-4 text-xs font-medium">
                      {assignee ? (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-primary" />
                          <span className="text-foreground">{assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Sem responsável</span>
                      )}
                    </td>

                    <td className="p-4 text-xs font-medium">
                      {machine ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-elevated text-primary border border-primary/30">
                          {machine.code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">-</span>
                      )}
                    </td>

                    <td className="p-4 text-xs">
                      {photos.length > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-warning">
                          <Camera className="h-3.5 w-3.5" /> {photos.length} foto(s)
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">Sem fotos</span>
                      )}
                    </td>

                    <td className="p-4 text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("pt-BR")}
                    </td>

                    <td className="p-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(t);
                              setDetailOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2 text-primary" /> Ver Detalhes
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          {STATUS.map((s) => (
                            <DropdownMenuItem
                              key={s.id}
                              disabled={t.status === s.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateStatus.mutate({ id: t.id, status: s.id });
                              }}
                              className="text-xs"
                            >
                              <span className={cn("h-2 w-2 rounded-full mr-2", s.tone.split(" ")[0])} />
                              Mover para {s.label}
                            </DropdownMenuItem>
                          ))}

                          {isSupervisor && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Tem certeza que deseja excluir esta tarefa?")) {
                                    deleteTask.mutate(t.id);
                                  }
                                }}
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Excluir Tarefa
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* GRID VIEW */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map((t) => {
            const assignee = t.assignee_id ? profilesMap.get(t.assignee_id) : null;
            const machine = t.machine_id ? machinesMap.get(t.machine_id) : null;
            const st = STATUS.find((s) => s.id === t.status);
            const photos = parsePhotoUrls(t.photo_url);

            return (
              <div
                key={t.id}
                onClick={() => {
                  setSelectedTask(t);
                  setDetailOpen(true);
                }}
                className="group rounded-2xl border border-border/60 bg-card p-5 shadow-card hover:border-primary/40 transition-all cursor-pointer hover:scale-[1.01] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border", priorityTone(t.priority))}>
                      {t.priority}
                    </span>
                    <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border", st?.tone)}>
                      {st?.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{typeIcon(t.type)}</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.type}</span>
                  </div>

                  <h3 className="font-display font-bold text-lg text-foreground leading-snug">{t.title}</h3>
                  {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}

                  {photos.length > 0 && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-warning font-semibold">
                      <Camera className="h-3.5 w-3.5" /> {photos.length} foto(s) de evidência
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-1 truncate max-w-[60%]">
                    <User className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate text-foreground font-medium">
                      {assignee ? assignee.name : "Sem responsável"}
                    </span>
                  </div>

                  {machine && (
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-elevated text-primary border border-primary/30">
                      {machine.code}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Button on Mobile */}
      <div className="fixed bottom-6 right-6 lg:hidden z-30">
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-14 w-14 rounded-full bg-gradient-ember shadow-ember p-0 grid place-items-center text-primary-foreground shadow-2xl hover:scale-105 transition-transform"
          aria-label="Criar nova tarefa"
        >
          <Plus className="h-7 w-7" />
        </Button>
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

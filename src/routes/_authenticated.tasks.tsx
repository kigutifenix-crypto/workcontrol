import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ArrowLeft, ArrowRight, MoreVertical, Loader2, Eye, Pencil, Trash2, User } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { STATUS, TASK_TYPES, PRIORITIES, typeIcon, priorityTone, type Status } from "@/lib/task-utils";
import { TaskDetailModal, type TaskDetail } from "@/components/task-detail-modal";
import { MachineFormFields, resolveOrCreateMachine } from "@/components/machine-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Quadro Kanban — FitControl" },
      { name: "description", content: "Gerencie todas as tarefas da oficina em um quadro Kanban visual." },
      { property: "og:title", content: "Quadro Kanban — FitControl" },
      { property: "og:description", content: "Acompanhe o fluxo de tarefas de produção em tempo real." },
    ],
  }),
  component: TasksKanban,
});

type Task = {
  id: string;
  title: string;
  type: string;
  status: Status;
  priority: string;
  description: string | null;
  assignee_id: string | null;
  machine_id: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

function TasksKanban() {
  const qc = useQueryClient();
  const { user, isSupervisor } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createMachineId, setCreateMachineId] = useState<string | null>(null);
  const [createMachineName, setCreateMachineName] = useState("");
  const [createMachineCode, setCreateMachineCode] = useState("");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TaskDetail[];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,name").order("name")).data ?? [],
  });

  const { data: machines = [] } = useQuery({
    queryKey: ["machines"],
    queryFn: async () => (await supabase.from("machines").select("id,code,name").order("code")).data ?? [],
  });

  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "done") patch.completed_at = new Date().toISOString();
      const { error } = await supabase.from("tasks").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

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
      qc.invalidateQueries({ queryKey: ["machines"] });
      setOpen(false);
      setCreateMachineId(null);
      setCreateMachineName("");
      setCreateMachineCode("");
    },
  });

  const onCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    // Resolve or automatically create machine
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
      assignee_id: f.get("assignee_id") || null,
      machine_id: resolvedMachineId,
      status: "pending",
    });
  };

  return (
    <AppShell
      title="Quadro Kanban"
      subtitle="Fluxo visual de todas as tarefas da oficina"
      actions={
        isSupervisor && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-ember shadow-ember font-semibold">
                <Plus className="h-4 w-4" /> Nova tarefa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Nova tarefa</DialogTitle>
              </DialogHeader>
              <form onSubmit={onCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input name="title" required placeholder="Ex: Montagem Esteira Elétrica FX-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select name="type" defaultValue="Montagem">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{typeIcon(t)} {t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Select name="priority" defaultValue="Normal">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Responsável</Label>
                  <Select name="assignee_id">
                    <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
                  <Button type="submit" disabled={create.isPending} className="bg-gradient-ember shadow-ember">
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar tarefa"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )
      }
    >
      {isLoading ? (
        <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className="rounded-2xl border border-border/60 bg-card/50 p-4 min-h-[60vh]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase border", col.tone)}>
                      {col.label}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">{colTasks.length}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {colTasks.map((t) => {
                    const idx = STATUS.findIndex((s) => s.id === col.id);
                    const canMove = isSupervisor || t.assignee_id === user?.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTask(t);
                          setDetailOpen(true);
                        }}
                        className="group rounded-xl border border-border/60 bg-surface-elevated p-4 hover:border-primary/40 transition-all cursor-pointer shadow-card hover:shadow-lg hover:scale-[1.01]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border", priorityTone(t.priority))}>
                            {t.priority}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition"
                                aria-label="Menu de ações"
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
                                    move.mutate({ id: t.id, status: s.id });
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
                                        del.mutate(t.id);
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
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xl">{typeIcon(t.type)}</span>
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.type}</span>
                        </div>
                        <h4 className="mt-2 font-semibold leading-tight">{t.title}</h4>
                        {t.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>}

                        {/* Nome do Responsável pela Tarefa */}
                        {(() => {
                          const assignee = profiles.find((p) => p.id === t.assignee_id);
                          return (
                            <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <User className="h-3.5 w-3.5 shrink-0 text-primary" />
                                <span className={cn("truncate font-medium", assignee ? "text-foreground font-semibold" : "text-muted-foreground italic")}>
                                  {assignee ? assignee.name : "Sem responsável"}
                                </span>
                              </div>
                            </div>
                          );
                        })()}

                        {canMove && (
                          <div className="mt-4 flex items-center justify-between gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                move.mutate({ id: t.id, status: STATUS[idx - 1].id });
                              }}
                              className="h-8 px-2 text-xs"
                            >
                              <ArrowLeft className="h-3 w-3" /> Voltar
                            </Button>
                            <Button
                              size="sm"
                              disabled={idx === STATUS.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                move.mutate({ id: t.id, status: STATUS[idx + 1].id });
                              }}
                              className="h-8 px-3 text-xs bg-gradient-ember"
                            >
                              Avançar <ArrowRight className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/50 p-6 text-center text-xs text-muted-foreground">
                      Vazio
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Detalhes e Ações da Tarefa */}
      <TaskDetailModal
        task={selectedTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </AppShell>
  );
}

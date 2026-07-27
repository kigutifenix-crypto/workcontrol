import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Wrench, Loader2, Trash2, MoreVertical, Eye, Pencil, Calendar, ClipboardList } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { TaskDetailModal, type TaskDetail } from "@/components/task-detail-modal";
import { typeIcon, priorityTone, STATUS } from "@/lib/task-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/machines")({
  head: () => ({
    meta: [
      { title: "Máquinas — FitControl" },
      { name: "description", content: "Catálogo de equipamentos de academia em processamento." },
      { property: "og:title", content: "Máquinas — FitControl" },
      { property: "og:description", content: "Cadastro e status dos equipamentos na oficina." },
    ],
  }),
  component: Machines,
});

const CATEGORIES = ["Cardio", "Musculação", "Funcional", "Acessórios", "Outros"];
const MACHINE_STATUS = ["Em Montagem", "Em Pintura", "Em Manutenção", "Pronta", "Enviada"];

function statusTone(s: string) {
  switch (s) {
    case "Pronta": return "bg-success/15 text-success border-success/30";
    case "Enviada": return "bg-info/15 text-info border-info/30";
    case "Em Manutenção": return "bg-warning/15 text-warning border-warning/30";
    default: return "bg-primary/15 text-primary border-primary/30";
  }
}

function Machines() {
  const { isSupervisor } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<any | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  const { data: machines = [], isLoading } = useQuery({
    queryKey: ["machines"],
    queryFn: async () => (await supabase.from("machines").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const { data: machineTasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ["machine-tasks", selectedMachine?.id],
    queryFn: async () => {
      if (!selectedMachine?.id) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("machine_id", selectedMachine.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedMachine?.id && detailsOpen,
  });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from("machines").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["machines"] });
      setOpen(false);
      toast.success("Máquina cadastrada");
    },
    onError: (e: Error) => toast.error("Erro", { description: e.message }),
  });

  const update = useMutation({
    mutationFn: async (payload: { id: string; code: string; name: string; category: string; origin: string | null; status: string }) => {
      const { error } = await supabase
        .from("machines")
        .update({
          code: payload.code,
          name: payload.name,
          category: payload.category,
          origin: payload.origin,
          status: payload.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["machines"] });
      setDetailsOpen(false);
      setSelectedMachine(null);
      toast.success("Máquina atualizada");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar", { description: e.message }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("machines")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["machines"] });
      toast.success("Status atualizado");
    },
    onError: (e: Error) => toast.error("Erro ao atualizar status", { description: e.message }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("machines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["machines"] }); toast.success("Removida"); },
  });

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    create.mutate({
      code: f.get("code"),
      name: f.get("name"),
      category: f.get("category"),
      origin: f.get("origin") || null,
      status: f.get("status"),
    });
  };

  return (
    <AppShell
      title="Máquinas & Equipamentos"
      subtitle="Cadastro e acompanhamento de equipamentos na oficina"
      actions={
        isSupervisor && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-ember shadow-ember font-semibold">
                <Plus className="h-4 w-4" /> Nova máquina
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="font-display text-xl">Cadastrar máquina</DialogTitle></DialogHeader>
              <form onSubmit={onCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input name="code" required placeholder="FX-500" />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select name="category" defaultValue="Cardio">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input name="name" required placeholder="Esteira Elétrica Profissional" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Input name="origin" placeholder="Fornecedor / lote" />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select name="status" defaultValue="Em Montagem">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{MACHINE_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending} className="bg-gradient-ember shadow-ember">
                    {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar"}
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
      ) : machines.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-16 text-center">
          <Wrench className="h-12 w-12 text-primary mx-auto mb-3" />
          <h3 className="font-display text-xl font-bold">Nenhuma máquina cadastrada</h3>
          <p className="text-muted-foreground mt-1">Cadastre um equipamento para começar a organizar a produção.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {machines.map((m) => (
            <div
              key={m.id}
              onClick={() => {
                setSelectedMachine(m);
                setIsEditing(false);
                setDetailsOpen(true);
              }}
              className="group rounded-2xl border border-border/60 bg-card shadow-card p-5 hover:border-primary/40 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition duration-300 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{m.category}</div>
                  <div className="mt-1 font-display text-xl font-bold leading-tight truncate">{m.name}</div>
                  <div className="mt-1 text-sm font-mono text-primary">{m.code}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => { setSelectedMachine(m); setIsEditing(false); setDetailsOpen(true); }}>
                        <Eye className="h-4 w-4 mr-2" /> Visualizar
                      </DropdownMenuItem>
                      {isSupervisor && (
                        <>
                          <DropdownMenuItem onClick={() => { setSelectedMachine(m); setIsEditing(true); setDetailsOpen(true); }}>
                            <Pencil className="h-4 w-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                            Status
                          </DropdownMenuLabel>
                          {MACHINE_STATUS.map((status) => (
                            <DropdownMenuItem
                              key={status}
                              onClick={() => updateStatus.mutate({ id: m.id, status })}
                              className={cn("text-xs", m.status === status && "font-semibold text-primary")}
                            >
                              {status}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm(`Deseja realmente remover a máquina "${m.name}"?`)) {
                                del.mutate(m.id);
                              }
                            }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Wrench className="h-4 w-4" />
                  </span>
                </div>
              </div>
              {m.origin && <div className="mt-3 text-xs text-muted-foreground">Origem: {m.origin}</div>}
              <div className="mt-4 flex items-center justify-between">
                <span className={cn("inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase border", statusTone(m.status))}>
                  {m.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog de Detalhes / Edição */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        {selectedMachine && (
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                {isEditing ? "Editar Máquina" : "Detalhes da Máquina"}
              </DialogTitle>
            </DialogHeader>

            {isEditing ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  update.mutate({
                    id: selectedMachine.id,
                    code: f.get("code") as string,
                    name: f.get("name") as string,
                    category: f.get("category") as string,
                    origin: (f.get("origin") as string) || null,
                    status: f.get("status") as string,
                  });
                }}
                className="space-y-4 mt-2"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input name="code" defaultValue={selectedMachine.code} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select name="category" defaultValue={selectedMachine.category || "Cardio"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input name="name" defaultValue={selectedMachine.name} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Input name="origin" defaultValue={selectedMachine.origin || ""} placeholder="Fornecedor / lote" />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select name="status" defaultValue={selectedMachine.status}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MACHINE_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={update.isPending} className="bg-gradient-ember shadow-ember">
                    {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-6 mt-2">
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-muted/40 p-4 border border-border/50">
                  <div>
                    <span className="text-xs text-muted-foreground block">Código</span>
                    <span className="font-mono text-sm font-bold text-primary">{selectedMachine.code}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Categoria</span>
                    <span className="text-sm font-semibold">{selectedMachine.category || "Sem categoria"}</span>
                  </div>
                  <div className="col-span-2 border-t border-border/40 pt-2">
                    <span className="text-xs text-muted-foreground block">Nome do Equipamento</span>
                    <span className="text-base font-bold">{selectedMachine.name}</span>
                  </div>
                  {selectedMachine.origin && (
                    <div className="col-span-2 border-t border-border/40 pt-2">
                      <span className="text-xs text-muted-foreground block">Origem / Fornecedor / Lote</span>
                      <span className="text-sm">{selectedMachine.origin}</span>
                    </div>
                  )}
                  <div className="col-span-2 border-t border-border/40 pt-2 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground block mb-1">Status Atual</span>
                      <span className={cn("inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase border", statusTone(selectedMachine.status))}>
                        {selectedMachine.status}
                      </span>
                    </div>
                    {isSupervisor && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar Informações
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-primary" />
                    Tarefas Vinculadas ({machineTasks.length})
                  </h4>
                  
                  {isLoadingTasks ? (
                    <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : machineTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground bg-muted/20 border border-dashed rounded-lg p-4 text-center">
                      Nenhuma tarefa vinculada a este equipamento.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {machineTasks.map((t) => {
                        const st = STATUS.find((s) => s.id === t.status);
                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              setSelectedTask(t as TaskDetail);
                              setTaskDetailOpen(true);
                            }}
                            className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-card hover:bg-accent/40 cursor-pointer transition"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="text-lg shrink-0">{typeIcon(t.type)}</span>
                              <div className="truncate">
                                <div className="text-xs font-semibold truncate text-foreground">{t.title}</div>
                                <div className="text-[10px] text-muted-foreground">{t.type}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border", priorityTone(t.priority))}>
                                {t.priority}
                              </span>
                              <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border", st?.tone)}>
                                {st?.label}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>

      {/* Modal de Detalhes da Tarefa */}
      <TaskDetailModal
        task={selectedTask}
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
      />
    </AppShell>
  );
}


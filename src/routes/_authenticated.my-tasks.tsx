import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { STATUS, TASK_TYPES, PRIORITIES, typeIcon, priorityTone, parsePhotoUrls, formatPhotoUrls } from "@/lib/task-utils";
import { TaskDetailModal, type TaskDetail } from "@/components/task-detail-modal";
import { MachineSelector } from "@/components/machine-selector";
import { Camera, CheckCircle2, Loader2, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-tasks")({
  head: () => ({
    meta: [
      { title: "Minhas Tarefas — FitControl" },
      { name: "description", content: "Suas tarefas do dia com registro de evidência fotográfica." },
      { property: "og:title", content: "Minhas Tarefas — FitControl" },
      { property: "og:description", content: "Foco no que é seu: tarefas atribuídas e evidências." },
    ],
  }),
  component: MyTasks,
});

function MyTasks() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMachineId, setCreateMachineId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: machines = [] } = useQuery({
    queryKey: ["machines"],
    queryFn: async () => (await supabase.from("machines").select("id,code,name")).data ?? [],
  });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { error } = await supabase.from("tasks").insert({
        ...payload,
        created_by: user?.id,
        assignee_id: payload.assignee_id || user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setCreateOpen(false);
      setCreateMachineId(null);
      toast.success("Nova tarefa criada!");
    },
    onError: (e: Error) => toast.error("Erro ao criar tarefa", { description: e.message }),
  });

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    create.mutate({
      title: f.get("title"),
      type: f.get("type"),
      priority: f.get("priority"),
      description: f.get("description") || null,
      assignee_id: user?.id,
      machine_id: createMachineId,
      status: "pending",
    });
  };

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["my-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("assignee_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "done") patch.completed_at = new Date().toISOString();
      const { error } = await supabase.from("tasks").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-tasks"] }),
  });

  const upload = async (taskObj: TaskDetail, files: FileList | File[]) => {
    if (!user || files.length === 0) return;
    setUploading(taskObj.id);

    const uploadedUrls: string[] = [];
    const fileArray = Array.from(files);

    try {
      for (const file of fileArray) {
        const path = `${user.id}/${taskObj.id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error } = await supabase.storage.from("evidence").upload(path, file);
        if (error) {
          toast.error(`Falha no upload de ${file.name}`, { description: error.message });
          continue;
        }
        const { data: signed } = await supabase.storage.from("evidence").createSignedUrl(path, 60 * 60 * 24 * 30);
        uploadedUrls.push(signed?.signedUrl ?? path);
      }

      if (uploadedUrls.length > 0) {
        const existing = parsePhotoUrls(taskObj.photo_url);
        const updated = [...existing, ...uploadedUrls];
        const formatted = formatPhotoUrls(updated);

        await supabase
          .from("tasks")
          .update({ photo_url: formatted, status: taskObj.status === "pending" ? "review" : taskObj.status })
          .eq("id", taskObj.id);

        qc.invalidateQueries({ queryKey: ["my-tasks"] });
        toast.success(
          uploadedUrls.length === 1 ? "Evidência enviada" : `${uploadedUrls.length} evidências enviadas`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro no envio";
      toast.error("Erro no upload", { description: msg });
    } finally {
      setUploading(null);
    }
  };

  const pending = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <AppShell
      title="Minhas Tarefas"
      subtitle="Tarefas atribuídas a você — foque, execute, comprove."
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
                <Input name="title" required placeholder="Ex: Ajuste de cabos ou limpeza" />
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
              <div className="space-y-2">
                <Label>Máquina / Equipamento</Label>
                <MachineSelector
                  machines={machines}
                  value={createMachineId}
                  onChange={setCreateMachineId}
                  placeholder="Busque por código ou nome..."
                />
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
      {isLoading ? (
        <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-16 text-center">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
          <h3 className="font-display text-xl font-bold">Sem tarefas para você agora</h3>
          <p className="text-muted-foreground mt-1">Assim que um supervisor atribuir, aparecerá aqui.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-bold">Ativas <span className="text-muted-foreground">({pending.length})</span></h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {pending.map((t) => {
                const st = STATUS.find((s) => s.id === t.status);
                const canComplete = t.status !== "done";
                const photos = parsePhotoUrls(t.photo_url);

                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTask(t as TaskDetail);
                      setDetailOpen(true);
                    }}
                    className="rounded-2xl border border-border/60 bg-card shadow-card p-5 cursor-pointer hover:border-primary/40 hover:scale-[1.01] transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-3xl">{typeIcon(t.type)}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border", priorityTone(t.priority))}>
                              {t.priority}
                            </span>
                            <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border", st?.tone)}>
                              {st?.label}
                            </span>
                          </div>
                          <h3 className="mt-2 font-display text-lg font-bold leading-tight">{t.title}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.type} · {new Date(t.created_at).toLocaleDateString("pt-BR")}</p>
                        </div>
                      </div>
                    </div>
                    {t.description && <p className="text-sm text-muted-foreground mt-3">{t.description}</p>}

                    {photos.length > 0 && (
                      <div className="mt-4 grid grid-cols-3 gap-2 overflow-hidden rounded-lg">
                        {photos.slice(0, 3).map((url, i) => (
                          <div key={i} className="relative aspect-video overflow-hidden rounded-md border border-border/50 bg-black/40">
                            <img src={url} alt={`Evidência ${i + 1}`} className="w-full h-full object-cover" />
                            {i === 2 && photos.length > 3 && (
                              <div className="absolute inset-0 bg-black/70 flex items-center justify-center font-bold text-white text-xs">
                                +{photos.length - 3}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {t.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatus.mutate({ id: t.id, status: "progress" });
                          }}
                          className="bg-info/20 text-info hover:bg-info/30"
                        >
                          <Play className="h-3.5 w-3.5" /> Iniciar
                        </Button>
                      )}
                      <input
                        ref={(el) => { fileRefs.current[t.id] = el; }}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => e.target.files && upload(t as TaskDetail, e.target.files)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileRefs.current[t.id]?.click();
                        }}
                        disabled={uploading === t.id}
                      >
                        {uploading === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                        {photos.length > 0 ? `Fotos (${photos.length})` : "Enviar foto"}
                      </Button>
                      {canComplete && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatus.mutate({ id: t.id, status: "done" });
                          }}
                          className="bg-gradient-ember shadow-ember"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

            {done.length > 0 && (
              <section>
                <h2 className="font-display text-lg font-bold mb-4">Concluídas <span className="text-muted-foreground">({done.length})</span></h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {done.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => {
                        setSelectedTask(t as TaskDetail);
                        setDetailOpen(true);
                      }}
                      className="rounded-xl border border-border/60 bg-card/50 p-4 opacity-80 cursor-pointer hover:opacity-100 hover:border-primary/40 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{typeIcon(t.type)}</span>
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border bg-success/15 text-success border-success/30">
                          Concluído
                        </span>
                      </div>
                      <div className="mt-2 font-semibold text-sm">{t.title}</div>
                      {t.completed_at && (
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {new Date(t.completed_at).toLocaleString("pt-BR")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Botão Flutuante no Celular (FAB) */}
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

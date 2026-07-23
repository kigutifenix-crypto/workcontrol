import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  User,
  Wrench,
  Camera,
  MoreVertical,
  Pencil,
  Trash2,
  Play,
  Loader2,
  FileText,
  MessageSquare,
  X,
  ImageIcon,
  Plus,
  ZoomIn,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { MachineSelector } from "@/components/machine-selector";
import {
  STATUS,
  TASK_TYPES,
  PRIORITIES,
  typeIcon,
  priorityTone,
  parsePhotoUrls,
  formatPhotoUrls,
  type Status,
} from "@/lib/task-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type TaskDetail = {
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
  created_by?: string | null;
};

type TaskDetailModalProps = {
  task: TaskDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated?: () => void;
};

export function TaskDetailModal({ task, open, onOpenChange, onTaskUpdated }: TaskDetailModalProps) {
  const { user, isSupervisor, isAdmin } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [newNotes, setNewNotes] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Edit form states
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("Montagem");
  const [editPriority, setEditPriority] = useState("Normal");
  const [editAssignee, setEditAssignee] = useState<string | null>(null);
  const [editMachine, setEditMachine] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditType(task.type);
      setEditPriority(task.priority);
      setEditAssignee(task.assignee_id);
      setEditMachine(task.machine_id);
      setEditDescription(task.description || "");
      setNewNotes(task.notes || "");
      setIsEditing(false);
      setEditingNotes(false);
    }
  }, [task]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,name,avatar_url,badge")).data ?? [],
  });

  const { data: machines = [] } = useQuery({
    queryKey: ["machines"],
    queryFn: async () => (await supabase.from("machines").select("id,code,name,status")).data ?? [],
  });

  const assigneeProfile = profiles.find((p) => p.id === task?.assignee_id);
  const machineObj = machines.find((m) => m.id === task?.machine_id);
  const currentStatusObj = STATUS.find((s) => s.id === task?.status);
  const canManage = isSupervisor || isAdmin || task?.assignee_id === user?.id || task?.created_by === user?.id;

  const existingPhotos = parsePhotoUrls(task?.photo_url);

  // Update Status Mutation
  const updateStatus = useMutation({
    mutationFn: async (newStatus: Status) => {
      if (!task) return;
      const patch: Record<string, unknown> = { status: newStatus };
      if (newStatus === "done") {
        patch.completed_at = new Date().toISOString();
      } else if (task.status === "done") {
        patch.completed_at = null;
      }

      const { error } = await supabase.from("tasks").update(patch as never).eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      if (onTaskUpdated) onTaskUpdated();
      toast.success("Status da tarefa atualizado");
    },
    onError: (e: Error) => toast.error("Erro ao alterar status", { description: e.message }),
  });

  // Full Task Edit Mutation
  const updateTask = useMutation({
    mutationFn: async () => {
      if (!task) return;
      const { error } = await supabase
        .from("tasks")
        .update({
          title: editTitle,
          type: editType,
          priority: editPriority,
          assignee_id: editAssignee === "none" ? null : editAssignee,
          machine_id: editMachine === "none" ? null : editMachine,
          description: editDescription || null,
        } as never)
        .eq("id", task.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      setIsEditing(false);
      if (onTaskUpdated) onTaskUpdated();
      toast.success("Tarefa atualizada com sucesso");
    },
    onError: (e: Error) => toast.error("Erro ao salvar tarefa", { description: e.message }),
  });

  // Save Notes Mutation
  const saveNotes = useMutation({
    mutationFn: async () => {
      if (!task) return;
      const { error } = await supabase
        .from("tasks")
        .update({ notes: newNotes } as never)
        .eq("id", task.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      setEditingNotes(false);
      toast.success("Observações salvas");
    },
    onError: (e: Error) => toast.error("Erro ao salvar observações", { description: e.message }),
  });

  // Delete Task Mutation
  const deleteTask = useMutation({
    mutationFn: async () => {
      if (!task) return;
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      onOpenChange(false);
      toast.success("Tarefa removida");
    },
    onError: (e: Error) => toast.error("Erro ao excluir", { description: e.message }),
  });

  // Upload Multiple Photos
  const handleUploadPhotos = async (files: FileList | File[]) => {
    if (!task || !user || files.length === 0) return;
    setUploading(true);

    const uploadedUrls: string[] = [];
    const fileArray = Array.from(files);

    try {
      for (const file of fileArray) {
        const path = `${user.id}/${task.id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error: uploadErr } = await supabase.storage.from("evidence").upload(path, file);

        if (uploadErr) {
          toast.error(`Erro ao subir ${file.name}`, { description: uploadErr.message });
          continue;
        }

        const { data: signed } = await supabase.storage.from("evidence").createSignedUrl(path, 60 * 60 * 24 * 30);
        const finalUrl = signed?.signedUrl ?? path;
        uploadedUrls.push(finalUrl);
      }

      if (uploadedUrls.length > 0) {
        const currentList = parsePhotoUrls(task.photo_url);
        const updatedList = [...currentList, ...uploadedUrls];
        const formatted = formatPhotoUrls(updatedList);

        const { error: patchErr } = await supabase
          .from("tasks")
          .update({ photo_url: formatted, status: task.status === "pending" ? "review" : task.status } as never)
          .eq("id", task.id);

        if (patchErr) throw patchErr;

        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["my-tasks"] });
        if (onTaskUpdated) onTaskUpdated();

        toast.success(
          uploadedUrls.length === 1
            ? "1 foto de evidência enviada!"
            : `${uploadedUrls.length} fotos de evidência enviadas!`
        );
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
      toast.error("Erro no envio", { description: errorMsg });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Delete Individual Photo
  const handleDeletePhoto = async (photoUrlToDelete: string) => {
    if (!task) return;
    const currentList = parsePhotoUrls(task.photo_url);
    const updatedList = currentList.filter((url) => url !== photoUrlToDelete);
    const formatted = formatPhotoUrls(updatedList);

    const { error } = await supabase
      .from("tasks")
      .update({ photo_url: formatted } as never)
      .eq("id", task.id);

    if (error) {
      toast.error("Erro ao remover foto", { description: error.message });
    } else {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      if (onTaskUpdated) onTaskUpdated();
      toast.success("Foto removida da tarefa");
    }
  };

  if (!task) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUploadPhotos(e.target.files)}
          />

          {/* Modal Header */}
          <DialogHeader className="border-b border-border/50 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-3xl p-2.5 rounded-xl bg-surface-elevated border border-border/50 shrink-0">
                  {typeIcon(task.type)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border",
                        priorityTone(task.priority)
                      )}
                    >
                      {task.priority}
                    </span>

                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border",
                        currentStatusObj?.tone
                      )}
                    >
                      {currentStatusObj?.label || task.status}
                    </span>

                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      {task.type}
                    </span>
                  </div>
                  <DialogTitle className="font-display text-xl font-bold leading-snug text-foreground">
                    {task.title}
                  </DialogTitle>
                </div>
              </div>

              {/* Action Menu */}
              <div className="flex items-center gap-2 shrink-0">
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Ações da Tarefa
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />

                      <DropdownMenuItem onClick={() => setIsEditing(!isEditing)}>
                        <Pencil className="h-4 w-4 mr-2 text-primary" />
                        {isEditing ? "Cancelar Edição" : "Editar Tarefa"}
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                        <Camera className="h-4 w-4 mr-2 text-info" />
                        Anexar Fotos (Múltiplas)
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Mover Status
                      </DropdownMenuLabel>

                      {STATUS.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          disabled={task.status === s.id}
                          onClick={() => updateStatus.mutate(s.id)}
                          className="text-xs"
                        >
                          <span className={cn("h-2 w-2 rounded-full mr-2", s.tone.split(" ")[0])} />
                          {s.label}
                        </DropdownMenuItem>
                      ))}

                      {isSupervisor && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm("Tem certeza que deseja excluir esta tarefa?")) {
                                deleteTask.mutate();
                              }
                            }}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir Tarefa
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Editing View */}
          {isEditing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateTask.mutate();
              }}
              className="space-y-4 py-2"
            >
              <div className="space-y-2">
                <Label className="font-semibold">Título da Tarefa</Label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="font-semibold">Categoria</Label>
                  <Select value={editType} onValueChange={setEditType}>
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
                  <Label className="font-semibold">Prioridade</Label>
                  <Select value={editPriority} onValueChange={setEditPriority}>
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
                  <Label className="font-semibold">Responsável</Label>
                  <Select value={editAssignee || "none"} onValueChange={setEditAssignee}>
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

                <div className="space-y-2">
                  <Label className="font-semibold">Máquina / Equipamento</Label>
                  <MachineSelector
                    machines={machines}
                    value={editMachine}
                    onChange={setEditMachine}
                    placeholder="Busque por código ou nome..."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Descrição</Label>
                <Textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Detalhes completos da tarefa..."
                />
              </div>

              <DialogFooter className="pt-4 border-t border-border/50">
                <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateTask.isPending} className="bg-gradient-ember shadow-ember">
                  {updateTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            /* Normal View Details */
            <div className="space-y-6 py-2">
              {/* Meta Attributes Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border/50 bg-surface-elevated p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 mb-1">
                    <User className="h-3 w-3" /> Responsável
                  </div>
                  <div className="font-semibold text-sm truncate text-foreground">
                    {assigneeProfile?.name || "Não atribuído"}
                  </div>
                  {assigneeProfile?.badge && (
                    <span className="text-[10px] text-muted-foreground block truncate">
                      {assigneeProfile.badge}
                    </span>
                  )}
                </div>

                <div className="rounded-xl border border-border/50 bg-surface-elevated p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 mb-1">
                    <Wrench className="h-3 w-3" /> Equipamento
                  </div>
                  <div className="font-semibold text-sm truncate text-foreground">
                    {machineObj ? machineObj.code : "Nenhum"}
                  </div>
                  {machineObj && (
                    <span className="text-[10px] text-muted-foreground block truncate">
                      {machineObj.name}
                    </span>
                  )}
                </div>

                <div className="rounded-xl border border-border/50 bg-surface-elevated p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 mb-1">
                    <Calendar className="h-3 w-3" /> Data de Criação
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    {new Date(task.created_at).toLocaleDateString("pt-BR")}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    {new Date(task.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <div className="rounded-xl border border-border/50 bg-surface-elevated p-3">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 mb-1">
                    <Clock className="h-3 w-3" /> Conclusão
                  </div>
                  <div className="font-semibold text-sm text-foreground">
                    {task.completed_at ? new Date(task.completed_at).toLocaleDateString("pt-BR") : "Pendente"}
                  </div>
                  {task.completed_at && (
                    <span className="text-[10px] text-success block">
                      Concluído às {new Date(task.completed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
              </div>

              {/* Descrição */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2">
                  <FileText className="h-3.5 w-3.5 text-primary" /> Descrição da Tarefa
                </h4>
                <div className="rounded-xl border border-border/50 bg-surface-elevated p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {task.description || <span className="text-muted-foreground italic">Nenhuma descrição informada.</span>}
                </div>
              </div>

              {/* Observações Operacionais */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-info" /> Observações Operacionais
                  </h4>
                  {!editingNotes && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingNotes(true)}
                      className="h-7 text-xs text-primary"
                    >
                      <Pencil className="h-3 w-3" /> {task.notes ? "Editar notas" : "Adicionar nota"}
                    </Button>
                  )}
                </div>

                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={3}
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="Adicione anotações sobre peças, ajustes, andamento..."
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingNotes(false)}>
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveNotes.mutate()}
                        disabled={saveNotes.isPending}
                        className="bg-gradient-ember shadow-ember"
                      >
                        {saveNotes.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar Nota"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/50 bg-surface-elevated p-4 text-sm text-foreground whitespace-pre-wrap">
                    {task.notes || <span className="text-muted-foreground italic">Sem observações operacionais registradas.</span>}
                  </div>
                )}
              </div>

              {/* Galeria de Evidências Fotográficas (Múltiplas Fotos) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Camera className="h-3.5 w-3.5 text-warning" /> Evidências Fotográficas ({existingPhotos.length})
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="h-7 text-xs gap-1.5"
                  >
                    {uploading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    {existingPhotos.length > 0 ? "Adicionar mais fotos" : "Enviar fotos"}
                  </Button>
                </div>

                {existingPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {existingPhotos.map((url, idx) => (
                      <div
                        key={idx}
                        className="group relative aspect-video overflow-hidden rounded-xl border border-border/60 bg-black/40 shadow-card"
                      >
                        <img
                          src={url}
                          alt={`Evidência ${idx + 1}`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                          <button
                            type="button"
                            onClick={() => setPreviewImage(url)}
                            className="p-1.5 rounded-lg bg-background/80 text-foreground hover:bg-background transition shadow"
                            title="Ampliar foto"
                          >
                            <ZoomIn className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Deseja remover esta foto de evidência?")) {
                                handleDeletePhoto(url);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-destructive/80 text-destructive-foreground hover:bg-destructive transition shadow"
                            title="Remover foto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl border border-dashed border-border/60 bg-surface-elevated/50 p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <span className="text-sm font-semibold text-foreground block">
                      Nenhuma foto enviada
                    </span>
                    <span className="text-xs text-muted-foreground mt-0.5 block">
                      Você pode selecionar e enviar múltiplas fotos ao mesmo tempo
                    </span>
                  </div>
                )}
              </div>

              {/* Barra de Ações Rápidas no Rodapé */}
              <div className="pt-4 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Mover para:</span>
                  {task.status !== "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateStatus.mutate("pending")}
                      disabled={updateStatus.isPending}
                      className="text-xs h-8"
                    >
                      Pendente
                    </Button>
                  )}

                  {task.status !== "progress" && (
                    <Button
                      size="sm"
                      onClick={() => updateStatus.mutate("progress")}
                      disabled={updateStatus.isPending}
                      className="text-xs h-8 bg-info/20 text-info hover:bg-info/30"
                    >
                      <Play className="h-3 w-3" /> Em Andamento
                    </Button>
                  )}

                  {task.status !== "review" && (
                    <Button
                      size="sm"
                      onClick={() => updateStatus.mutate("review")}
                      disabled={updateStatus.isPending}
                      className="text-xs h-8 bg-warning/20 text-warning hover:bg-warning/30"
                    >
                      Revisão
                    </Button>
                  )}

                  {task.status !== "done" && (
                    <Button
                      size="sm"
                      onClick={() => updateStatus.mutate("done")}
                      disabled={updateStatus.isPending}
                      className="text-xs h-8 bg-gradient-ember shadow-ember"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Concluir
                    </Button>
                  )}
                </div>

                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Lightbox para foto em tamanho grande */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
          <DialogContent className="max-w-4xl p-2 bg-black/95 border-border/40">
            <div className="relative flex items-center justify-center min-h-[50vh]">
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition z-10"
              >
                <X className="h-5 w-5" />
              </button>
              <img
                src={previewImage}
                alt="Visualização ampliada"
                className="max-h-[85vh] w-auto object-contain rounded-lg shadow-2xl"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

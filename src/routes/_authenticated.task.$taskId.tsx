import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useMemo, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  STATUS,
  TASK_TYPES,
  typeIcon,
  priorityTone,
  parsePhotoUrls,
  formatPhotoUrls,
  type Status,
  type TaskInterval,
} from "@/lib/task-utils";
import {
  Play,
  Pause,
  CheckCircle2,
  Clock,
  Calendar,
  User,
  Wrench,
  Camera,
  FileText,
  MessageSquare,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  RotateCcw,
  Check,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  History,
  Activity,
  Trash2,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera, CameraResultType } from "@capacitor/camera";

export const Route = createFileRoute("/_authenticated/task/$taskId")({
  head: () => ({
    meta: [
      { title: "Painel da Tarefa — FitControl" },
      { name: "description", content: "Acompanhe métricas, fotos, intervalos e informações em tempo real." },
    ],
  }),
  component: TaskDashboardPage,
});

const PAUSE_REASONS = [
  "Almoço / Refeição",
  "Fim do Expediente",
  "Aguardando Peças / Material",
  "Aguardando Supervisor",
  "Outro Compromisso",
  "Manutenção de Equipamento",
] as const;

function TaskDashboardPage() {
  const { taskId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isSupervisor, isAdmin } = useAuth();

  const [notesEditing, setNotesEditing] = useState(false);
  const [newNotes, setNewNotes] = useState("");
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState<string>("Almoço / Refeição");
  const [customPauseReason, setCustomPauseReason] = useState("");
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Real-time ticking clock for active/paused time counters
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Task
  const { data: task, isLoading: isLoadingTask } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();
      if (error) throw error;
      
      // Parse intervals JSON safely
      const parsedIntervals = Array.isArray(data.intervals)
        ? (data.intervals as unknown as TaskInterval[])
        : [];

      return {
        ...data,
        intervals: parsedIntervals,
      };
    },
  });

  // Fetch Profiles (for mapping names)
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lookup"],
    queryFn: async () => (await supabase.from("profiles").select("id,name,badge")).data ?? [],
  });

  // Fetch Machines
  const { data: machines = [] } = useQuery({
    queryKey: ["machines-lookup"],
    queryFn: async () => (await supabase.from("machines").select("id,code,name")).data ?? [],
  });

  const assigneeProfile = useMemo(() => profiles.find((p) => p.id === task?.assignee_id), [profiles, task]);
  const machineObj = useMemo(() => machines.find((m) => m.id === task?.machine_id), [machines, task]);
  const currentStatusObj = useMemo(() => STATUS.find((s) => s.id === task?.status), [task]);
  const isPending = task?.status === "pending";
  const isProgress = task?.status === "progress";
  const isPaused = task?.status === "paused";
  const isReview = task?.status === "review";
  const isDone = task?.status === "done";

  const canManage = isSupervisor || isAdmin || task?.assignee_id === user?.id || task?.created_by === user?.id;

  // Initialize newNotes when task loads
  useEffect(() => {
    if (task) {
      setNewNotes(task.notes || "");
    }
  }, [task]);

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { status: Status; started_at?: string | null; completed_at?: string | null; intervals?: TaskInterval[] }) => {
      const { error } = await supabase
        .from("tasks")
        .update(payload as never)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      toast.success("Status atualizado com sucesso!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao atualizar status", { description: err.message });
    },
  });

  const saveNotesMutation = useMutation({
    mutationFn: async (notesText: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ notes: notesText } as never)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      setNotesEditing(false);
      toast.success("Observações salvas");
    },
    onError: (err: Error) => {
      toast.error("Erro ao salvar observações", { description: err.message });
    },
  });

  // Action Handlers
  const handleStartTask = () => {
    updateStatusMutation.mutate({
      status: "progress",
      started_at: task?.started_at || new Date().toISOString(),
      completed_at: null,
      intervals: [],
    });
  };

  const handleOpenPauseDialog = () => {
    setPauseReason("Almoço / Refeição");
    setCustomPauseReason("");
    setPauseDialogOpen(true);
  };

  const handleConfirmPause = () => {
    if (!task) return;
    const finalReason = pauseReason === "Outro" ? customPauseReason || "Outro compromisso" : pauseReason;
    const newIntervals = [...(task.intervals || [])];
    newIntervals.push({
      paused_at: new Date().toISOString(),
      resumed_at: null,
      reason: finalReason,
    });

    updateStatusMutation.mutate({
      status: "paused",
      intervals: newIntervals,
    });
    setPauseDialogOpen(false);
  };

  const handleResumeTask = () => {
    if (!task) return;
    const newIntervals = [...(task.intervals || [])];
    if (newIntervals.length > 0) {
      const lastIdx = newIntervals.length - 1;
      if (!newIntervals[lastIdx].resumed_at) {
        newIntervals[lastIdx] = {
          ...newIntervals[lastIdx],
          resumed_at: new Date().toISOString(),
        };
      }
    }

    updateStatusMutation.mutate({
      status: "progress",
      intervals: newIntervals,
    });
  };

  const handleSendToReview = () => {
    // If paused, close interval first
    let newIntervals = [...(task?.intervals || [])];
    if (isPaused && newIntervals.length > 0) {
      const lastIdx = newIntervals.length - 1;
      if (!newIntervals[lastIdx].resumed_at) {
        newIntervals[lastIdx] = {
          ...newIntervals[lastIdx],
          resumed_at: new Date().toISOString(),
        };
      }
    }

    updateStatusMutation.mutate({
      status: "review",
      intervals: newIntervals,
    });
  };

  const handleCompleteTask = () => {
    // If paused, close interval first
    let newIntervals = [...(task?.intervals || [])];
    if (isPaused && newIntervals.length > 0) {
      const lastIdx = newIntervals.length - 1;
      if (!newIntervals[lastIdx].resumed_at) {
        newIntervals[lastIdx] = {
          ...newIntervals[lastIdx],
          resumed_at: new Date().toISOString(),
        };
      }
    }

    updateStatusMutation.mutate({
      status: "done",
      completed_at: new Date().toISOString(),
      intervals: newIntervals,
    });
  };

  const handleReopenTask = () => {
    updateStatusMutation.mutate({
      status: "progress",
      completed_at: null,
    });
  };

  const handleRejectTask = () => {
    updateStatusMutation.mutate({
      status: "progress",
    });
  };

  const handleResetTask = () => {
    if (confirm("Deseja redefinir a tarefa para Pendente? Isso limpará a data de início, conclusão e os intervalos.")) {
      updateStatusMutation.mutate({
        status: "pending",
        started_at: null,
        completed_at: null,
        intervals: [],
      });
    }
  };

  // Photo uploads
  const uploadPhotos = async (files: FileList | File[]) => {
    if (!task || !user || files.length === 0) return;
    setUploading(true);

    const uploadedUrls: string[] = [];
    const fileArray = Array.from(files);

    try {
      for (const file of fileArray) {
        const path = `${user.id}/${task.id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const { error } = await supabase.storage.from("evidence").upload(path, file);
        if (error) {
          toast.error(`Falha no upload de ${file.name}`, { description: error.message });
          continue;
        }
        const { data: signed } = await supabase.storage.from("evidence").createSignedUrl(path, 60 * 60 * 24 * 30);
        uploadedUrls.push(signed?.signedUrl ?? path);
      }

      if (uploadedUrls.length > 0) {
        const existing = parsePhotoUrls(task.photo_url);
        const updated = [...existing, ...uploadedUrls];
        const formatted = formatPhotoUrls(updated);

        await supabase
          .from("tasks")
          .update({ photo_url: formatted } as never)
          .eq("id", task.id);

        qc.invalidateQueries({ queryKey: ["task", taskId] });
        toast.success(
          uploadedUrls.length === 1 ? "Evidência enviada" : `${uploadedUrls.length} evidências enviadas`
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro no envio";
      toast.error("Erro no upload", { description: msg });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const takePhoto = async (): Promise<File | null> => {
    try {
      const photo = await CapCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
      });
      if (!photo.webPath) return null;
      const response = await fetch(photo.webPath);
      const blob = await response.blob();
      return new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    } catch (err) {
      console.error("Erro ao tirar foto:", err);
      return null;
    }
  };

  const pickPhotos = async (): Promise<File[]> => {
    try {
      const { photos } = await CapCamera.pickImages({
        quality: 90,
      });
      const files: File[] = [];
      for (const photo of photos) {
        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          files.push(new File([blob], `gallery-${Date.now()}-${files.length}.jpg`, { type: "image/jpeg" }));
        }
      }
      return files;
    } catch (err) {
      console.error("Erro ao escolher fotos da galeria:", err);
      return [];
    }
  };

  const handleTakePhoto = async () => {
    if (Capacitor.isNativePlatform()) {
      const file = await takePhoto();
      if (file) uploadPhotos([file]);
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.setAttribute("capture", "environment");
        fileInputRef.current.click();
      }
    }
  };

  const handlePickPhotos = async () => {
    if (Capacitor.isNativePlatform()) {
      const files = await pickPhotos();
      if (files.length > 0) uploadPhotos(files);
    } else {
      if (fileInputRef.current) {
        fileInputRef.current.removeAttribute("capture");
        fileInputRef.current.click();
      }
    }
  };

  const handleDeletePhoto = async (photoUrlToDelete: string) => {
    if (!task) return;
    if (!confirm("Remover esta evidência fotográfica?")) return;
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
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      toast.success("Foto removida com sucesso");
    }
  };

  // Calculations for Metrics and Graphs
  const stats = useMemo(() => {
    if (!task || !task.started_at) {
      return { activeMs: 0, pausedMs: 0, activePct: 0, pausedPct: 0, totalMs: 0 };
    }

    const endPoint = task.completed_at ? new Date(task.completed_at).getTime() : now;
    const totalMs = endPoint - new Date(task.started_at).getTime();

    let pausedMs = 0;
    if (Array.isArray(task.intervals)) {
      task.intervals.forEach((interval) => {
        const start = new Date(interval.paused_at).getTime();
        const end = interval.resumed_at
          ? new Date(interval.resumed_at).getTime()
          : (task.status === "paused" ? now : start);
        const duration = end - start;
        if (duration > 0) pausedMs += duration;
      });
    }

    const activeMs = Math.max(0, totalMs - pausedMs);

    const activePct = totalMs > 0 ? Math.round((activeMs / totalMs) * 100) : 0;
    const pausedPct = totalMs > 0 ? Math.round((pausedMs / totalMs) * 100) : 0;

    return { activeMs, pausedMs, activePct, pausedPct, totalMs };
  }, [task, now]);

  // Chart data
  const chartData = useMemo(() => {
    if (stats.totalMs === 0) return [];
    return [
      { name: "Tempo Ativo", value: stats.activeMs, color: "#0ea5e9" }, // Info Blue
      { name: "Pausas / Intervalos", value: stats.pausedMs, color: "#a855f7" }, // Purple
    ].filter((item) => item.value > 0);
  }, [stats]);

  // Format Milliseconds to Readable string (e.g. 2h 15m or 42m 10s)
  const formatDurationText = (ms: number) => {
    if (ms <= 0) return "0min";
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hrs = Math.floor(min / 60);

    if (hrs > 0) {
      return `${hrs}h ${min % 60}min`;
    }
    if (min > 0) {
      return `${min}min ${sec % 60}s`;
    }
    return `${sec}s`;
  };

  const getIntervalDurationText = (interval: TaskInterval) => {
    const start = new Date(interval.paused_at).getTime();
    const end = interval.resumed_at ? new Date(interval.resumed_at).getTime() : now;
    return formatDurationText(end - start);
  };

  if (isLoadingTask) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
        <span>Carregando painel da tarefa...</span>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-muted-foreground p-4">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-lg font-bold text-foreground mb-1">Tarefa não encontrada</h2>
        <p className="text-sm mb-4 text-center">A tarefa solicitada não existe ou foi removida.</p>
        <Button onClick={() => navigate({ to: "/tasks" })}>Voltar ao Quadro</Button>
      </div>
    );
  }

  const photoList = parsePhotoUrls(task.photo_url);

  return (
    <AppShell
      title={`Painel da Tarefa — ${task.title}`}
      subtitle={`Gerenciamento completo e métricas operacionais.`}
      actions={
        <Button
          variant="outline"
          onClick={() => {
            // Smart navigation back to tasks lists
            window.history.back();
          }}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && uploadPhotos(e.target.files)}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: Controls, metadata and charts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Controls & Status Box */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status Atual</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className={cn("inline-flex px-3 py-1 rounded-md text-xs font-bold uppercase border", currentStatusObj?.tone)}>
                    {typeIcon(task.type)} {currentStatusObj?.label || task.status}
                  </span>
                  <span className={cn("inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase border", priorityTone(task.priority))}>
                    Prioridade {task.priority}
                  </span>
                </div>
              </div>

              {/* Reset/Restart for admin/supervisor */}
              {isSupervisor && !isPending && (
                <Button variant="ghost" size="sm" onClick={handleResetTask} className="text-destructive hover:bg-destructive/10">
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Redefinir para Pendente
                </Button>
              )}
            </div>

            {/* Smart Action Buttons according to current status */}
            <div className="flex flex-wrap gap-3">
              {isPending && (
                <Button onClick={handleStartTask} className="bg-info text-info-foreground hover:bg-info/90 font-semibold shadow-lg shadow-info/20 w-full sm:w-auto">
                  <Play className="h-4 w-4 mr-2" /> Iniciar Trabalho
                </Button>
              )}

              {isProgress && (
                <>
                  <Button onClick={handleOpenPauseDialog} className="bg-purple-600 text-white hover:bg-purple-700 font-semibold shadow-lg shadow-purple-600/20">
                    <Pause className="h-4 w-4 mr-2" /> Fazer Intervalo (Pausar)
                  </Button>
                  <Button onClick={handleSendToReview} className="bg-warning text-warning-foreground hover:bg-warning/90 font-semibold shadow-lg shadow-warning/20">
                    <Clock className="h-4 w-4 mr-2" /> Enviar para Revisão
                  </Button>
                  <Button onClick={handleCompleteTask} className="bg-gradient-ember text-white shadow-ember font-semibold">
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Concluir Tarefa
                  </Button>
                </>
              )}

              {isPaused && (
                <>
                  <Button onClick={handleResumeTask} className="bg-info text-info-foreground hover:bg-info/90 font-semibold shadow-lg shadow-info/20">
                    <Play className="h-4 w-4 mr-2" /> Retomar Trabalho
                  </Button>
                  <Button onClick={handleSendToReview} className="bg-warning text-warning-foreground hover:bg-warning/90 font-semibold">
                    Enviar para Revisão
                  </Button>
                  <Button onClick={handleCompleteTask} className="bg-gradient-ember text-white shadow-ember">
                    Concluir Tarefa
                  </Button>
                </>
              )}

              {isReview && (
                <>
                  {isSupervisor ? (
                    <>
                      <Button onClick={handleCompleteTask} className="bg-success text-success-foreground hover:bg-success/90 font-semibold shadow-lg shadow-success/20">
                        <Check className="h-4 w-4 mr-2" /> Aprovar e Concluir
                      </Button>
                      <Button onClick={handleRejectTask} className="bg-destructive text-white hover:bg-destructive/90 font-semibold">
                        <RotateCcw className="h-4 w-4 mr-2" /> Recusar (Voltar a Em Andamento)
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-warning bg-warning/10 border border-warning/20 p-3 rounded-xl w-full">
                      <AlertCircle className="h-5 w-5 shrink-0" />
                      <span className="text-xs">A tarefa está em revisão. Aguardando aprovação do supervisor.</span>
                    </div>
                  )}
                </>
              )}

              {isDone && (
                <>
                  <div className="flex items-center justify-between w-full flex-wrap gap-3">
                    <div className="flex items-center gap-2 text-success bg-success/10 border border-success/20 p-3 rounded-xl">
                      <Check className="h-5 w-5" />
                      <span className="text-xs font-semibold">Tarefa concluída e aprovada!</span>
                    </div>
                    {isSupervisor && (
                      <Button onClick={handleReopenTask} variant="outline" size="sm">
                        Reabrir Tarefa
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Card 2: Analytics & Metrics Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Metric counters */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card flex flex-col justify-between space-y-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4 text-info" /> Tempos de Operação
              </h3>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border/30 pb-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-info" /> Tempo Ativo Trabalhado
                  </div>
                  <div className="font-semibold text-sm tabular-nums text-foreground">
                    {task.started_at ? formatDurationText(stats.activeMs) : "0s"}
                  </div>
                </div>

                <div className="flex items-center justify-between border-b border-border/30 pb-2">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500" /> Tempo Total Pausado
                  </div>
                  <div className="font-semibold text-sm tabular-nums text-foreground">
                    {task.started_at ? formatDurationText(stats.pausedMs) : "0s"}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    Tempo Decorrido Total
                  </div>
                  <div className="font-bold text-sm tabular-nums text-primary">
                    {task.started_at ? formatDurationText(stats.totalMs) : "0s"}
                  </div>
                </div>
              </div>

              {task.started_at ? (
                <div className="text-[10px] text-muted-foreground italic bg-surface/50 border border-border/40 p-2 rounded-lg">
                  * Tempo calculado em tempo real com base no início e intervalos ocorridos.
                </div>
              ) : (
                <div className="text-[10px] text-yellow-500 italic bg-yellow-500/5 border border-yellow-500/10 p-2 rounded-lg">
                  Aguardando início do trabalho para computar o tempo de produção.
                </div>
              )}
            </div>

            {/* Recharts Pie Chart */}
            <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card flex flex-col justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-purple-400" /> Divisão de Produtividade
              </h3>

              {stats.totalMs > 0 ? (
                <div className="flex items-center justify-center gap-4 h-36">
                  <div className="h-full w-32 relative flex items-center justify-center shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          innerRadius={36}
                          outerRadius={50}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatDurationText(value)}
                          contentStyle={{ backgroundColor: "#1e1e2e", borderColor: "#333", color: "#fff" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-xs text-muted-foreground font-bold uppercase tracking-tighter">Ativo</span>
                      <span className="text-sm font-black text-foreground">{stats.activePct}%</span>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs flex-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="h-2 w-2 rounded-full bg-info shrink-0" />
                      <span>{stats.activePct}% Ativo</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                      <span>{stats.pausedPct}% Pausas</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground/60">
                  <HelpCircle className="h-8 w-8 mb-2" />
                  <span className="text-xs">Sem dados suficientes para gerar o gráfico.</span>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Interval History / Pauses Timeline */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-4">
              <History className="h-4 w-4 text-purple-400" /> Linha do Tempo de Intervalos e Pausas
            </h3>

            {Array.isArray(task.intervals) && task.intervals.length > 0 ? (
              <div className="relative border-l border-border/60 ml-2.5 pl-5 space-y-4 py-2">
                {task.intervals.map((interval, i) => (
                  <div key={i} className="relative">
                    {/* Circle icon */}
                    <span className="absolute -left-[26px] top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-purple-500 ring-4 ring-card" />
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div className="text-xs font-semibold text-foreground">
                        Pausa #{i + 1}: <span className="text-purple-400 font-bold">{interval.reason || "Intervalo geral"}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium bg-surface px-2 py-0.5 rounded border border-border/40">
                        {getIntervalDurationText(interval)}
                      </div>
                    </div>

                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Pausado em {new Date(interval.paused_at).toLocaleString("pt-BR")}
                      {interval.resumed_at ? (
                        ` · Retomado em ${new Date(interval.resumed_at).toLocaleString("pt-BR")}`
                      ) : (
                        <span className="text-purple-400 font-semibold animate-pulse"> (Ativo no momento)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground/60 text-xs">
                Nenhum intervalo ou pausa registrada nesta tarefa até o momento.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Metadata details, description, notes & photos */}
        <div className="space-y-6">
          {/* Card 4: Metadata details */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ficha Técnica</h3>

            <div className="space-y-3.5">
              {/* Assignee */}
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Responsável</div>
                  <div className="text-sm font-semibold text-foreground mt-1">
                    {assigneeProfile?.name || "Não atribuído"}
                  </div>
                  {assigneeProfile?.badge && (
                    <span className="text-[10px] text-muted-foreground">{assigneeProfile.badge}</span>
                  )}
                </div>
              </div>

              {/* Equipment */}
              <div className="flex items-start gap-3">
                <Wrench className="h-5 w-5 text-info shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Equipamento</div>
                  <div className="text-sm font-semibold text-foreground mt-1">
                    {machineObj ? `${machineObj.code} — ${machineObj.name}` : "Nenhum cadastrado"}
                  </div>
                </div>
              </div>

              {/* Creation Date */}
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Data de Criação</div>
                  <div className="text-sm font-semibold text-foreground mt-1">
                    {new Date(task.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
              </div>

              {/* Start Date */}
              {task.started_at && (
                <div className="flex items-start gap-3">
                  <Play className="h-5 w-5 text-info shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Iniciada em</div>
                    <div className="text-sm font-semibold text-foreground mt-1">
                      {new Date(task.started_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>
              )}

              {/* Completion Date */}
              {task.completed_at && (
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground leading-none">Concluída em</div>
                    <div className="text-sm font-semibold text-foreground mt-1">
                      {new Date(task.completed_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 5: Description */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" /> Descrição da Tarefa
            </h3>
            <div className="text-sm text-foreground bg-surface-elevated/40 border border-border/40 p-4 rounded-xl whitespace-pre-wrap leading-relaxed">
              {task.description || <span className="text-muted-foreground italic">Nenhuma descrição fornecida.</span>}
            </div>
          </div>

          {/* Card 6: Operational Notes */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-info" /> Observações Operacionais
              </h3>
              {!notesEditing && canManage && (
                <Button size="sm" variant="ghost" onClick={() => setNotesEditing(true)} className="text-xs h-7">
                  Editar
                </Button>
              )}
            </div>

            {notesEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Insira notas operacionais, ajustes, problemas enfrentados ou peças gastas..."
                  rows={4}
                  className="text-xs bg-background"
                />
                <div className="flex items-center gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setNewNotes(task.notes || "");
                    setNotesEditing(false);
                  }}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveNotesMutation.mutate(newNotes)}
                    disabled={saveNotesMutation.isPending}
                    className="bg-info text-info-foreground"
                  >
                    {saveNotesMutation.isPending ? "Salvando..." : "Salvar Notas"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-xs text-foreground bg-surface-elevated/40 border border-border/40 p-4 rounded-xl whitespace-pre-wrap leading-relaxed min-h-[5rem]">
                {task.notes || <span className="text-muted-foreground italic text-[11px]">Nenhuma observação operacional registrada.</span>}
              </div>
            )}
          </div>

          {/* Card 7: Evidence Photos */}
          <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Camera className="h-4 w-4 text-warning" /> Evidências Fotográficas
              </h3>

              {canManage && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={handleTakePhoto} className="text-xs p-2 h-7" disabled={uploading}>
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={handlePickPhotos} className="text-xs p-2 h-7" disabled={uploading}>
                    <ImageIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 justify-center border border-dashed border-border/50 rounded-xl">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-warning" />
                <span>Enviando fotos de evidência...</span>
              </div>
            )}

            {photoList.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {photoList.map((url, index) => (
                  <div key={index} className="relative group rounded-xl overflow-hidden border border-border/40 aspect-video bg-surface">
                    <img src={url} alt={`Evidência ${index + 1}`} className="w-full h-full object-cover" />
                    {canManage && (
                      <button
                        onClick={() => handleDeletePhoto(url)}
                        className="absolute top-1 right-1 p-1 rounded-md bg-black/60 hover:bg-black/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remover Foto"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-border/40 rounded-xl text-muted-foreground/60 text-xs">
                Nenhuma foto registrada nesta tarefa.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interval Reason Dialog */}
      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Registrar Intervalo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2">
            <div className="space-y-2">
              <Label>Motivo do Intervalo / Pausa</Label>
              <Select value={pauseReason} onValueChange={setPauseReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {PAUSE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                  <SelectItem value="Outro">Outro Motivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {pauseReason === "Outro" && (
              <div className="space-y-2">
                <Label>Escreva o motivo</Label>
                <Textarea
                  value={customPauseReason}
                  onChange={(e) => setCustomPauseReason(e.target.value)}
                  placeholder="Descreva brevemente o motivo da pausa..."
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setPauseDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmPause} className="bg-purple-600 hover:bg-purple-700 text-white">
              Confirmar Pausa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export const TASK_TYPES = ["Montagem", "Pintura", "Limpeza", "Manutenção", "Embalagem", "Cadastro"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const STATUS = [
  { id: "pending", label: "Pendente", tone: "bg-muted text-muted-foreground border-border" },
  { id: "progress", label: "Em Andamento", tone: "bg-info/15 text-info border-info/30" },
  { id: "paused", label: "Pausado", tone: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { id: "review", label: "Revisão", tone: "bg-warning/15 text-warning border-warning/30" },
  { id: "done", label: "Concluído", tone: "bg-success/15 text-success border-success/30" },
] as const;
export type Status = (typeof STATUS)[number]["id"];

export type TaskInterval = {
  paused_at: string;
  resumed_at: string | null;
  reason?: string;
};

export const PRIORITIES = ["Baixa", "Normal", "Alta", "Urgente"] as const;
export type Priority = (typeof PRIORITIES)[number];

export function priorityTone(p: string) {
  switch (p) {
    case "Urgente": return "bg-destructive/15 text-destructive border-destructive/30";
    case "Alta": return "bg-primary/15 text-primary border-primary/30";
    case "Baixa": return "bg-muted text-muted-foreground border-border";
    default: return "bg-info/10 text-info border-info/20";
  }
}

export function typeIcon(t: string): string {
  switch (t) {
    case "Montagem": return "🔧";
    case "Pintura": return "🎨";
    case "Limpeza": return "🧽";
    case "Manutenção": return "🛠️";
    case "Embalagem": return "📦";
    case "Cadastro": return "📝";
    default: return "⚙️";
  }
}

export function parsePhotoUrls(photo_url: string | null | undefined): string[] {
  if (!photo_url) return [];
  if (photo_url.startsWith("[")) {
    try {
      const parsed = JSON.parse(photo_url);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      // Fallback below
    }
  }
  return photo_url.split(",").map((s) => s.trim()).filter(Boolean);
}

export function formatPhotoUrls(urls: string[]): string | null {
  const clean = urls.filter(Boolean);
  if (clean.length === 0) return null;
  return JSON.stringify(clean);
}

/**
 * Calculates the overlap in milliseconds between a date range [start, end]
 * and the daily work hours (08:00 - 18:00) in the user's local timezone.
 */
export function getWorkHoursOverlap(start: Date, end: Date): number {
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (startMs >= endMs) return 0;

  let totalOverlap = 0;
  let current = new Date(start);
  current.setHours(0, 0, 0, 0); // Start of day

  const endDay = new Date(end);
  endDay.setHours(23, 59, 59, 999); // End of day

  while (current <= endDay) {
    const workStart = new Date(current);
    workStart.setHours(8, 0, 0, 0);

    const workEnd = new Date(current);
    workEnd.setHours(18, 0, 0, 0);

    const overlapStart = Math.max(startMs, workStart.getTime());
    const overlapEnd = Math.min(endMs, workEnd.getTime());

    if (overlapStart < overlapEnd) {
      totalOverlap += (overlapEnd - overlapStart);
    }

    current.setDate(current.getDate() + 1);
  }

  return totalOverlap;
}

/**
 * Calculates work-hour timing metrics for a task.
 * Filters out all hours outside of the 08:00 - 18:00 daily shift.
 */
export function calculateTaskTimings(
  task: {
    started_at?: string | null;
    completed_at?: string | null;
    status: string;
    intervals?: TaskInterval[] | null;
  },
  nowMs: number = Date.now()
) {
  if (!task.started_at) {
    return { activeMs: 0, pausedMs: 0, totalMs: 0, activePct: 0, pausedPct: 0 };
  }

  const start = new Date(task.started_at);
  const end = task.completed_at ? new Date(task.completed_at) : new Date(nowMs);

  const totalMs = getWorkHoursOverlap(start, end);

  let pausedMs = 0;
  if (Array.isArray(task.intervals)) {
    task.intervals.forEach((interval) => {
      const pStart = new Date(interval.paused_at);
      const pEnd = interval.resumed_at
        ? new Date(interval.resumed_at)
        : (task.status === "paused" ? new Date(nowMs) : pStart);

      const duration = getWorkHoursOverlap(pStart, pEnd);
      if (duration > 0) pausedMs += duration;
    });
  }

  const activeMs = Math.max(0, totalMs - pausedMs);
  const sumMs = activeMs + pausedMs;
  const activePct = sumMs > 0 ? Math.round((activeMs / sumMs) * 100) : 0;
  const pausedPct = sumMs > 0 ? Math.round((pausedMs / sumMs) * 100) : 0;

  return { activeMs, pausedMs, totalMs: sumMs, activePct, pausedPct };
}

/**
 * Checks if a task currently in status 'progress' needs to be auto-paused (past 18:00).
 * If yes, returns an object suggesting the pause event retroactively set to 18:00.
 */
export function checkNeedsAutoPause(
  task: {
    started_at?: string | null;
    created_at: string;
    status: string;
    intervals?: TaskInterval[] | null;
  },
  nowMs: number = Date.now()
): { needsPause: boolean; pausedAtIso?: string; newIntervals?: TaskInterval[] } {
  if (task.status !== "progress") {
    return { needsPause: false };
  }

  let lastActivityTime = new Date(task.started_at || task.created_at);
  if (Array.isArray(task.intervals) && task.intervals.length > 0) {
    const lastInterval = task.intervals[task.intervals.length - 1];
    if (lastInterval.resumed_at) {
      lastActivityTime = new Date(lastInterval.resumed_at);
    }
  }

  const limitTime = new Date(lastActivityTime);
  limitTime.setHours(18, 0, 0, 0);

  if (lastActivityTime.getTime() >= limitTime.getTime()) {
    const now = new Date(nowMs);
    const lastActivityDay = new Date(lastActivityTime);
    lastActivityDay.setHours(0, 0, 0, 0);
    const todayDay = new Date(now);
    todayDay.setHours(0, 0, 0, 0);

    if (todayDay.getTime() > lastActivityDay.getTime()) {
      limitTime.setDate(limitTime.getDate() + 1);
    } else {
      return { needsPause: false };
    }
  }

  if (nowMs > limitTime.getTime()) {
    const pausedAtIso = limitTime.toISOString();
    const newIntervals = [...(task.intervals || [])];
    newIntervals.push({
      paused_at: pausedAtIso,
      resumed_at: null,
      reason: "Fim do Expediente",
    });
    return {
      needsPause: true,
      pausedAtIso,
      newIntervals,
    };
  }

  return { needsPause: false };
}

export const TASK_TYPES = ["Montagem", "Pintura", "Limpeza", "Manutenção", "Embalagem"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const STATUS = [
  { id: "pending", label: "Pendente", tone: "bg-muted text-muted-foreground border-border" },
  { id: "progress", label: "Em Andamento", tone: "bg-info/15 text-info border-info/30" },
  { id: "review", label: "Revisão", tone: "bg-warning/15 text-warning border-warning/30" },
  { id: "done", label: "Concluído", tone: "bg-success/15 text-success border-success/30" },
] as const;
export type Status = (typeof STATUS)[number]["id"];

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

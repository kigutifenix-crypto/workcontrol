import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Wrench, Loader2, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  const { data: machines = [], isLoading } = useQuery({
    queryKey: ["machines"],
    queryFn: async () => (await supabase.from("machines").select("*").order("created_at", { ascending: false })).data ?? [],
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
            <div key={m.id} className="group rounded-2xl border border-border/60 bg-card shadow-card p-5 hover:border-primary/40 transition">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">{m.category}</div>
                  <div className="mt-1 font-display text-xl font-bold leading-tight">{m.name}</div>
                  <div className="mt-1 text-sm font-mono text-primary">{m.code}</div>
                </div>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Wrench className="h-5 w-5" />
                </span>
              </div>
              {m.origin && <div className="mt-3 text-xs text-muted-foreground">Origem: {m.origin}</div>}
              <div className="mt-4 flex items-center justify-between">
                <span className={cn("inline-flex px-2 py-1 rounded-md text-[10px] font-bold uppercase border", statusTone(m.status))}>
                  {m.status}
                </span>
                {isSupervisor && (
                  <button
                    onClick={() => del.mutate(m.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

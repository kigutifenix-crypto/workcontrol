import { useState, useMemo, useEffect } from "react";
import { Check, ChevronsUpDown, Search, Wrench, X, Plus, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export type MachineOption = {
  id: string;
  code: string;
  name: string;
  status?: string;
};

type MachineFormFieldsProps = {
  machines: MachineOption[];
  machineId: string | null;
  machineName: string;
  machineCode: string;
  onChange: (val: { machineId: string | null; machineName: string; machineCode: string }) => void;
};

export function MachineFormFields({
  machines,
  machineId,
  machineName,
  machineCode,
  onChange,
}: MachineFormFieldsProps) {
  const [mode, setMode] = useState<"select" | "custom">(machineId ? "select" : "select");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedMachine = useMemo(
    () => machines.find((m) => m.id === machineId),
    [machines, machineId]
  );

  const filteredMachines = useMemo(() => {
    if (!search.trim()) return machines;
    const q = search.toLowerCase().trim();
    return machines.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
    );
  }, [machines, search]);

  const handleSelectMachine = (m: MachineOption | null) => {
    if (!m) {
      onChange({ machineId: null, machineName: "", machineCode: "" });
    } else {
      onChange({ machineId: m.id, machineName: m.name, machineCode: m.code });
    }
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      {/* Nome da Máquina */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="font-semibold text-sm">Nome da Máquina</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const newMode = mode === "select" ? "custom" : "select";
              setMode(newMode);
              if (newMode === "custom") {
                onChange({ machineId: null, machineName: machineName || (selectedMachine?.name ?? ""), machineCode: machineCode || (selectedMachine?.code ?? "") });
              }
            }}
            className="h-7 text-xs px-2 text-primary hover:text-primary/80"
          >
            {mode === "select" ? (
              <span className="flex items-center gap-1">
                <Plus className="h-3 w-3" /> Digitar novo nome
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <List className="h-3 w-3" /> Selecionar da lista
              </span>
            )}
          </Button>
        </div>

        {mode === "select" ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between font-normal text-left h-10 px-3 bg-background border-input"
              >
                {selectedMachine ? (
                  <span className="flex items-center gap-2 truncate text-foreground font-medium">
                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/15 text-primary border border-primary/30 shrink-0">
                      {selectedMachine.code}
                    </span>
                    <span className="truncate">{selectedMachine.name}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm truncate flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {machineName || "Selecione ou busque por código/nome..."}
                  </span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
              <div className="flex items-center border-b border-border/50 pb-2 px-1 mb-2">
                <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  placeholder="Digite o código ou nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 border-none focus-visible:ring-0 shadow-none text-sm p-0"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1">
                <div
                  onClick={() => handleSelectMachine(null)}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors",
                    !machineId ? "bg-primary/10 text-primary font-bold" : "hover:bg-accent text-muted-foreground"
                  )}
                >
                  <span>Nenhuma máquina</span>
                  {!machineId && <Check className="h-3.5 w-3.5" />}
                </div>

                {filteredMachines.map((m) => {
                  const isSelected = m.id === machineId;
                  return (
                    <div
                      key={m.id}
                      onClick={() => handleSelectMachine(m)}
                      className={cn(
                        "flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-colors",
                        isSelected ? "bg-primary/15 text-primary font-semibold" : "hover:bg-accent text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-surface-elevated text-primary border border-primary/30 shrink-0">
                          {m.code}
                        </span>
                        <span className="truncate font-medium">{m.name}</span>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    </div>
                  );
                })}

                {filteredMachines.length === 0 && (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    Nenhum resultado para &quot;{search}&quot;.
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        setMode("custom");
                        onChange({ machineId: null, machineName: search, machineCode: "" });
                        setOpen(false);
                      }}
                      className="h-auto p-0 text-xs block mx-auto mt-1 text-primary"
                    >
                      Criar com o nome &quot;{search}&quot;
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <Input
            value={machineName}
            onChange={(e) =>
              onChange({ machineId: null, machineName: e.target.value, machineCode })
            }
            placeholder="Ex: Esteira Elétrica LX-500"
            className="h-10"
          />
        )}
      </div>

      {/* Campo do Código da Máquina */}
      <div className="space-y-2">
        <Label className="font-semibold text-sm">Código da Máquina</Label>
        <Input
          value={machineCode}
          onChange={(e) =>
            onChange({
              machineId: mode === "select" && selectedMachine?.code === e.target.value ? machineId : null,
              machineName,
              machineCode: e.target.value.toUpperCase(),
            })
          }
          placeholder="Ex: EST-500 ou MAQ-01"
          className="h-10 uppercase font-mono text-sm"
        />
      </div>
    </div>
  );
}

// Backward compatibility MachineSelector component
export function MachineSelector({
  machines,
  value,
  onChange,
  placeholder = "Selecione ou busque por código/nome...",
}: {
  machines: MachineOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  name?: string;
}) {
  return (
    <MachineFormFields
      machines={machines}
      machineId={value ?? null}
      machineName=""
      machineCode=""
      onChange={(val) => onChange(val.machineId)}
    />
  );
}

/**
 * Helper to resolve existing machine or insert a new custom machine into Supabase
 */
export async function resolveOrCreateMachine(
  machineId: string | null,
  machineCode: string,
  machineName: string
): Promise<string | null> {
  if (machineId) return machineId;
  const code = machineCode.trim().toUpperCase();
  const name = machineName.trim();
  if (!code && !name) return null;

  const finalCode = code || `MAQ-${Math.floor(Math.random() * 1000)}`;
  const finalName = name || finalCode;

  // Check existing machine by code or name
  const { data: existing } = await supabase
    .from("machines")
    .select("id")
    .or(`code.eq.${finalCode},name.eq.${finalName}`)
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Create new machine automatically
  const { data: inserted, error } = await supabase
    .from("machines")
    .insert({ code: finalCode, name: finalName, status: "operational" })
    .select("id")
    .single();

  if (error) {
    console.error("Erro ao cadastrar nova máquina:", error);
    return null;
  }
  return inserted.id;
}

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type MachineOption = {
  id: string;
  code: string;
  name: string;
  status?: string;
};

type MachineSelectorProps = {
  machines: MachineOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  name?: string;
};

export function MachineSelector({
  machines,
  value,
  onChange,
  placeholder = "Selecione ou busque por código/nome...",
  name = "machine_id",
}: MachineSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedMachine = useMemo(
    () => machines.find((m) => m.id === value),
    [machines, value]
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

  return (
    <div className="relative">
      {/* Input oculto para formulários HTML nativos com FormData */}
      <input type="hidden" name={name} value={value || ""} />

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
                {placeholder}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <div className="flex items-center border-b border-border/50 pb-2 px-1 mb-2">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Digite o código ou nome da máquina..."
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
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={cn(
                "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors",
                !value ? "bg-primary/10 text-primary font-bold" : "hover:bg-accent text-muted-foreground"
              )}
            >
              <span>Nenhuma máquina</span>
              {!value && <Check className="h-3.5 w-3.5" />}
            </div>

            {filteredMachines.map((m) => {
              const isSelected = m.id === value;
              return (
                <div
                  key={m.id}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
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
              <div className="py-6 text-center text-xs text-muted-foreground">
                Nenhuma máquina encontrada para &quot;{search}&quot;.
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

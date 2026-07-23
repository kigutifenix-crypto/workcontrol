import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users,
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  User,
  KeyRound,
  Mail,
  BadgeAlert,
  Loader2,
  Shield,
  Briefcase,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({
    meta: [
      { title: "Gestão de Usuários — FitControl" },
      { name: "description", content: "Gerenciamento de usuários, permissões e papéis da oficina." },
    ],
  }),
  component: UsersPage,
});

type UserProfileWithRole = {
  id: string;
  name: string;
  avatar_url: string | null;
  badge: string;
  created_at: string;
  role: "admin" | "supervisor" | "worker";
  role_id?: string;
};

const ROLES = [
  { value: "admin", label: "Administrador", desc: "Acesso total ao sistema e gestão de usuários", tone: "bg-primary/20 text-primary border-primary/40" },
  { value: "supervisor", label: "Supervisor", desc: "Gerencia tarefas, máquinas e equipe de oficina", tone: "bg-info/20 text-info border-info/40" },
  { value: "worker", label: "Operacional (Worker)", desc: "Executa e atualiza tarefas atribuídas", tone: "bg-accent text-muted-foreground border-border" },
];

function UsersPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserProfileWithRole | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Form states for creating a user
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newBadge, setNewBadge] = useState("Operacional");
  const [newRole, setNewRole] = useState<"admin" | "supervisor" | "worker">("worker");

  // Fetch users with their profiles and roles
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users-list"],
    queryFn: async () => {
      const [{ data: profiles, error: pErr }, { data: rolesData, error: rErr }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("*"),
      ]);

      if (pErr) throw pErr;
      if (rErr) throw rErr;

      const rolesMap = new Map<string, { role: "admin" | "supervisor" | "worker"; id: string }>();
      (rolesData || []).forEach((r) => {
        rolesMap.set(r.user_id, { role: r.role as "admin" | "supervisor" | "worker", id: r.id });
      });

      return (profiles || []).map((p) => {
        const rInfo = rolesMap.get(p.id);
        return {
          ...p,
          role: rInfo?.role || "worker",
          role_id: rInfo?.id,
        } as UserProfileWithRole;
      });
    },
    enabled: isAdmin,
  });

  // Create User Mutation
  const createUser = useMutation({
    mutationFn: async () => {
      if (!newEmail || !newPassword || !newName) {
        throw new Error("Preencha todos os campos obrigatórios (Nome, E-mail e Senha)");
      }

      // 1. Register with Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: newEmail,
        password: newPassword,
        options: {
          data: {
            name: newName,
            badge: newBadge,
          },
        },
      });

      if (authErr) throw authErr;
      const createdUserId = authData.user?.id;

      if (!createdUserId) {
        throw new Error("Não foi possível criar o usuário no serviço de autenticação.");
      }

      // 2. Ensure profile exists/updated
      await supabase.from("profiles").upsert({
        id: createdUserId,
        name: newName,
        badge: newBadge,
      });

      // 3. Upsert user role
      await supabase.from("user_roles").upsert(
        {
          user_id: createdUserId,
          role: newRole,
        },
        { onConflict: "user_id,role" }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users-list"] });
      setCreateOpen(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewBadge("Operacional");
      setNewRole("worker");
      toast.success("Usuário criado com sucesso!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao criar usuário", { description: err.message });
    },
  });

  // Update User Profile & Role Mutation
  const updateUser = useMutation({
    mutationFn: async (updated: { id: string; name: string; badge: string; role: "admin" | "supervisor" | "worker" }) => {
      // 1. Update Profile
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ name: updated.name, badge: updated.badge })
        .eq("id", updated.id);
      if (pErr) throw pErr;

      // 2. Delete existing role entries for user and insert new role
      await supabase.from("user_roles").delete().eq("user_id", updated.id);

      const { error: rErr } = await supabase.from("user_roles").insert({
        user_id: updated.id,
        role: updated.role,
      });
      if (rErr) throw rErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users-list"] });
      setEditUser(null);
      toast.success("Perfil e privilégios atualizados com sucesso!");
    },
    onError: (err: Error) => {
      toast.error("Erro ao atualizar", { description: err.message });
    },
  });

  // Delete Profile & Role Mutation
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("profiles").delete().eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users-list"] });
      toast.success("Usuário removido da base");
    },
    onError: (err: Error) => {
      toast.error("Erro ao remover", { description: err.message });
    },
  });

  // Filter users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.badge.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const countAdmin = users.filter((u) => u.role === "admin").length;
  const countSupervisor = users.filter((u) => u.role === "supervisor").length;
  const countWorker = users.filter((u) => u.role === "worker").length;

  if (!isAdmin) {
    return (
      <AppShell title="Acesso Restrito">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-destructive/15 text-destructive mb-4 shadow-lg">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h2 className="font-display text-2xl font-bold">Acesso Exclusivo para Administradores</h2>
          <p className="text-muted-foreground max-w-md mt-2 mb-6">
            Você não possui privilégios de administrador para acessar o gerenciamento de usuários do sistema.
          </p>
          <Button onClick={() => navigate({ to: "/dashboard" })} className="bg-gradient-ember shadow-ember">
            Voltar para o Dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Gestão de Usuários & Equipe"
      subtitle="Cadastre novos colaboradores, altere papéis de acesso e gerencie os perfis da oficina."
      actions={
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-ember shadow-ember font-semibold gap-2">
              <UserPlus className="h-4 w-4" /> Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" /> Cadastrar Novo Usuário
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUser.mutate();
              }}
              className="space-y-4 py-2"
            >
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 font-semibold">
                  <User className="h-4 w-4 text-muted-foreground" /> Nome Completo
                </Label>
                <Input
                  placeholder="Ex: João da Silva"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 font-semibold">
                    <Mail className="h-4 w-4 text-muted-foreground" /> E-mail
                  </Label>
                  <Input
                    type="email"
                    placeholder="usuario@empresa.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 font-semibold">
                    <KeyRound className="h-4 w-4 text-muted-foreground" /> Senha Inicial
                  </Label>
                  <Input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 font-semibold">
                    <Shield className="h-4 w-4 text-muted-foreground" /> Papel de Acesso (Role)
                  </Label>
                  <Select value={newRole} onValueChange={(v: "admin" | "supervisor" | "worker") => setNewRole(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o papel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="worker">Operacional (Worker)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 font-semibold">
                    <Briefcase className="h-4 w-4 text-muted-foreground" /> Função / Badge
                  </Label>
                  <Input
                    placeholder="Ex: Montador, Pintor, Gestor"
                    value={newBadge}
                    onChange={(e) => setNewBadge(e.target.value)}
                    required
                  />
                </div>
              </div>

              <DialogFooter className="pt-4 border-t border-border/50">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createUser.isPending} className="bg-gradient-ember shadow-ember">
                  {createUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Usuário"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Total de Usuários</div>
          <div className="mt-2 font-display text-3xl font-bold tabular-nums">{users.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">cadastrados no sistema</div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-widest text-primary font-bold flex items-center gap-1">
            <Shield className="h-3.5 w-3.5" /> Administradores
          </div>
          <div className="mt-2 font-display text-3xl font-bold tabular-nums text-primary">{countAdmin}</div>
          <div className="mt-1 text-xs text-muted-foreground">controle total</div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-widest text-info font-bold flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Supervisores
          </div>
          <div className="mt-2 font-display text-3xl font-bold tabular-nums text-info">{countSupervisor}</div>
          <div className="mt-1 text-xs text-muted-foreground">gestores de tarefas</div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Operacionais</div>
          <div className="mt-2 font-display text-3xl font-bold tabular-nums">{countWorker}</div>
          <div className="mt-1 text-xs text-muted-foreground">executores de tarefas</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou função..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-muted-foreground">Filtrar por Papel:</span>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Todos os Papéis" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({users.length})</SelectItem>
              <SelectItem value="admin">Administradores ({countAdmin})</SelectItem>
              <SelectItem value="supervisor">Supervisores ({countSupervisor})</SelectItem>
              <SelectItem value="worker">Operacionais ({countWorker})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* User Cards Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <span>Carregando usuários da oficina...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-12 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" />
          <h3 className="font-semibold text-foreground text-lg">Nenhum usuário encontrado</h3>
          <p className="text-sm mt-1">Tente ajustar a sua busca ou filtro.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((u) => {
            const roleObj = ROLES.find((r) => r.value === u.role);
            const initials = u.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={u.id}
                className="rounded-2xl border border-border/60 bg-card p-5 shadow-card hover:border-primary/40 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-ember text-primary-foreground font-display font-bold text-lg shadow-ember">
                        {initials}
                      </div>
                      <div>
                        <h4 className="font-display font-bold text-base text-foreground leading-snug">{u.name}</h4>
                        <span className="text-xs text-muted-foreground font-medium block mt-0.5">{u.badge}</span>
                      </div>
                    </div>

                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase border",
                        roleObj?.tone
                      )}
                    >
                      {u.role === "admin" && <Shield className="h-3 w-3" />}
                      {u.role === "supervisor" && <ShieldCheck className="h-3 w-3" />}
                      {roleObj?.label || u.role}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/40 text-xs text-muted-foreground flex items-center justify-between">
                    <span>Cadastrado em:</span>
                    <span className="font-semibold text-foreground">
                      {new Date(u.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-border/40 flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs font-semibold"
                    onClick={() => setEditUser(u)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 text-xs"
                    onClick={() => {
                      if (confirm(`Tem certeza que deseja remover o usuário ${u.name}?`)) {
                        deleteUser.mutate(u.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Edição de Usuário */}
      {editUser && (
        <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <Pencil className="h-5 w-5 text-primary" /> Editar Usuário & Permissões
              </DialogTitle>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateUser.mutate({
                  id: editUser.id,
                  name: editUser.name,
                  badge: editUser.badge,
                  role: editUser.role,
                });
              }}
              className="space-y-4 py-2"
            >
              <div className="space-y-2">
                <Label className="font-semibold">Nome Completo</Label>
                <Input
                  value={editUser.name}
                  onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Função / Badge</Label>
                <Input
                  value={editUser.badge}
                  onChange={(e) => setEditUser({ ...editUser, badge: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Papel de Acesso (Role)</Label>
                <Select
                  value={editUser.role}
                  onValueChange={(v: "admin" | "supervisor" | "worker") =>
                    setEditUser({ ...editUser, role: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador (Admin)</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="worker">Operacional (Worker)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="pt-4 border-t border-border/50">
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateUser.isPending} className="bg-gradient-ember shadow-ember">
                  {updateUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}

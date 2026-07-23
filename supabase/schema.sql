-- ====================================================================
-- SCHEMA COMPLETO E OTIMIZADO DO BANCO DE DADOS FITCONTROL (SUPABASE)
-- Projeto Supabase: qaigkeawaqcoafaquyni
-- Execute este script no SQL Editor do seu painel Supabase
-- ====================================================================

-- 1. TIPOS E ENUMS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'worker');
    END IF;
END $$;

-- 2. TABELA DE PERFIS DE USUÁRIO (profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  badge TEXT NOT NULL DEFAULT 'Operacional',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABELA DE PAPÉIS / ROLES (user_roles)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- 4. TABELA DE MÁQUINAS (machines)
CREATE TABLE IF NOT EXISTS public.machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  origin TEXT,
  status TEXT NOT NULL DEFAULT 'Em Montagem',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABELA DE TAREFAS DA OFICINA (tasks)
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'Normal',
  description TEXT,
  photo_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. PERMISSÕES DE TABELAS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.machines TO service_role;
GRANT ALL ON public.tasks TO service_role;

-- 7. FUNÇÕES AUXILIARES DE SEGURANÇA E ATUALIZAÇÃO
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_supervisor(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_supervisor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_supervisor(UUID) TO authenticated;

-- 8. AUTOMAÇÃO DE CRIAÇÃO DE PERFIL AO REGISTRAR NOVO USUÁRIO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  assigned_role app_role := 'worker';
  user_badge text := 'Operacional';
BEGIN
  -- Define o e-mail de admin automático
  IF LOWER(NEW.email) = 'kigutifenix@gmail.com' THEN
    assigned_role := 'admin';
    user_badge := 'Gestor / Admin';
  ELSE
    user_badge := COALESCE(NEW.raw_user_meta_data->>'badge', 'Operacional');
  END IF;

  INSERT INTO public.profiles (id, name, avatar_url, badge)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    user_badge
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    avatar_url = EXCLUDED.avatar_url,
    badge = CASE WHEN LOWER(NEW.email) = 'kigutifenix@gmail.com' THEN 'Gestor / Admin' ELSE profiles.badge END;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, assigned_role)
  ON CONFLICT (user_id, role) DO UPDATE SET role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Trigger para auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Triggers de atualização automática de updated_at
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_machines_updated ON public.machines;
CREATE TRIGGER trg_machines_updated BEFORE UPDATE ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated ON public.tasks;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Políticas para Profiles
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Políticas para User Roles
DROP POLICY IF EXISTS "User roles viewable by authenticated" ON public.user_roles;
CREATE POLICY "User roles viewable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- Políticas para Machines
DROP POLICY IF EXISTS "Machines viewable by authenticated" ON public.machines;
CREATE POLICY "Machines viewable by authenticated" ON public.machines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Supervisors manage machines" ON public.machines;
CREATE POLICY "Supervisors manage machines" ON public.machines FOR ALL TO authenticated
  USING (public.is_supervisor(auth.uid())) WITH CHECK (public.is_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert machines" ON public.machines;
CREATE POLICY "Authenticated insert machines" ON public.machines FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update machines" ON public.machines;
CREATE POLICY "Authenticated update machines" ON public.machines FOR UPDATE TO authenticated USING (true);

-- Políticas para Tasks
DROP POLICY IF EXISTS "Tasks viewable by authenticated" ON public.tasks;
CREATE POLICY "Tasks viewable by authenticated" ON public.tasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Supervisors manage tasks" ON public.tasks;
CREATE POLICY "Supervisors manage tasks" ON public.tasks FOR ALL TO authenticated
  USING (public.is_supervisor(auth.uid())) WITH CHECK (public.is_supervisor(auth.uid()));

DROP POLICY IF EXISTS "Authenticated insert tasks" ON public.tasks;
CREATE POLICY "Authenticated insert tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Assignees update own tasks" ON public.tasks;
CREATE POLICY "Assignees update own tasks" ON public.tasks FOR UPDATE TO authenticated
  USING (auth.uid() = assignee_id OR auth.uid() = created_by) WITH CHECK (true);

-- 10. BUCKET DE STORAGE PARA EVIDÊNCIAS DE TAREFAS / FOTOS
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas do Storage para o Bucket 'evidence'
DROP POLICY IF EXISTS "Evidence viewable by authenticated" ON storage.objects;
CREATE POLICY "Evidence viewable by authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Evidence viewable by public" ON storage.objects;
CREATE POLICY "Evidence viewable by public" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Evidence upload by authenticated" ON storage.objects;
CREATE POLICY "Evidence upload by authenticated" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Evidence update own" ON storage.objects;
CREATE POLICY "Evidence update own" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'evidence');

DROP POLICY IF EXISTS "Evidence delete own" ON storage.objects;
CREATE POLICY "Evidence delete own" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'evidence');

-- 11. ÍNDICES DE DESEMPENHO E OTIMIZAÇÃO
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
CREATE INDEX IF NOT EXISTS idx_machines_code ON public.machines(code);
CREATE INDEX IF NOT EXISTS idx_machines_status ON public.machines(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_machine ON public.tasks(machine_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at DESC);

-- 12. ATRIBUIÇÃO AUTOMÁTICA DE ADMIN PARA O E-MAIL SOLICITADO
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE LOWER(email) = 'kigutifenix@gmail.com'
ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin'::app_role;

UPDATE public.profiles
SET badge = 'Gestor / Admin'
WHERE id IN (
  SELECT id FROM auth.users WHERE LOWER(email) = 'kigutifenix@gmail.com'
);


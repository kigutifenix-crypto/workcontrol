-- Migration: Restrict workers to only see their assigned or created tasks, while supervisors/admins can see all tasks.
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tasks viewable by authenticated" ON public.tasks;
DROP POLICY IF EXISTS "Tasks viewable policy" ON public.tasks;

CREATE POLICY "Tasks viewable policy" ON public.tasks FOR SELECT TO authenticated
  USING (
    public.is_supervisor(auth.uid()) OR
    assignee_id = auth.uid() OR
    created_by = auth.uid()
  );

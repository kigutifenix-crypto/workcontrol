
CREATE POLICY "Evidence viewable by authenticated" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evidence');
CREATE POLICY "Evidence upload by authenticated" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Evidence update own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Evidence delete own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'evidence' AND auth.uid()::text = (storage.foldername(name))[1]);

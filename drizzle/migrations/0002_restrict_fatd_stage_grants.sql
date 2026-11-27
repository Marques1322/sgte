REVOKE ALL ON TABLE public.fatd_stage_deadlines FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.fatd_stage_deadlines TO authenticated;
GRANT ALL ON TABLE public.fatd_stage_deadlines TO service_role;
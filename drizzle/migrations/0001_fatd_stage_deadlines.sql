CREATE TABLE public.fatd_stage_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  document_id uuid NOT NULL REFERENCES public.documents(id),
  stage text NOT NULL CHECK (stage IN ('defesa', 'revisao_cmt_companhia', 'julgamento')),
  due_date date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluido')),
  completed_date date,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fatd_stage_deadlines_document_stage_key UNIQUE (document_id, stage),
  CONSTRAINT fatd_stage_deadlines_completion_check CHECK (
    (status = 'pendente' AND completed_date IS NULL)
    OR (status = 'concluido' AND completed_date IS NOT NULL)
  )
);
GRANT SELECT, INSERT, UPDATE ON public.fatd_stage_deadlines TO authenticated;
GRANT ALL ON public.fatd_stage_deadlines TO service_role;
ALTER TABLE public.fatd_stage_deadlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY fatd_stages_read ON public.fatd_stage_deadlines FOR SELECT TO authenticated
  USING (unit_id = public.my_unit());
CREATE POLICY fatd_stages_insert ON public.fatd_stage_deadlines FOR INSERT TO authenticated
  WITH CHECK (unit_id = public.my_unit() AND created_by = auth.uid()
    AND public.has_unit_role(ARRAY['administrador','chefe','operador']::public.app_role[]));
CREATE POLICY fatd_stages_update ON public.fatd_stage_deadlines FOR UPDATE TO authenticated
  USING (unit_id = public.my_unit()
    AND public.has_unit_role(ARRAY['administrador','chefe','operador']::public.app_role[]))
  WITH CHECK (unit_id = public.my_unit()
    AND public.has_unit_role(ARRAY['administrador','chefe','operador']::public.app_role[]));
CREATE INDEX fatd_stage_deadlines_unit_due ON public.fatd_stage_deadlines(unit_id, due_date);
COMMENT ON TABLE public.fatd_stage_deadlines IS 'Etapas de FATD do cadastro central. Datas informadas manualmente, inclusive históricas; sem cálculo ou presunção de prazos legais.';
COMMENT ON COLUMN public.fatd_stage_deadlines.due_date IS 'Data limite manual e opcional; nenhuma data é calculada.';
COMMENT ON COLUMN public.fatd_stage_deadlines.completed_date IS 'Data de conclusão manual, obrigatória apenas quando concluída; permite histórico sem comparação com a data atual ou recebimento.';
CREATE FUNCTION public.validate_fatd_stage_deadline() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE parent_type text; parent_unit uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
    OR NEW.document_id IS DISTINCT FROM OLD.document_id OR NEW.stage IS DISTINCT FROM OLD.stage
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Não é permitido transferir a etapa, unidade ou autor';
  END IF;
  SELECT type_code, unit_id INTO parent_type, parent_unit
    FROM public.documents WHERE id = NEW.document_id FOR SHARE;
  IF NOT FOUND OR parent_type IS DISTINCT FROM 'fatd' OR parent_unit IS DISTINCT FROM NEW.unit_id THEN
    RAISE EXCEPTION 'A etapa deve pertencer a uma FATD da mesma unidade';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_fatd_stage_deadline() FROM PUBLIC;
CREATE TRIGGER validate_fatd_stage_deadline BEFORE INSERT OR UPDATE ON public.fatd_stage_deadlines
  FOR EACH ROW EXECUTE FUNCTION public.validate_fatd_stage_deadline();
CREATE FUNCTION public.guard_fatd_document_stages() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.type_code IS DISTINCT FROM OLD.type_code OR NEW.unit_id IS DISTINCT FROM OLD.unit_id)
    AND EXISTS (SELECT 1 FROM public.fatd_stage_deadlines WHERE document_id = OLD.id)
  THEN
    RAISE EXCEPTION 'Documento com etapas de FATD não pode mudar de tipo ou unidade';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_fatd_document_stages() FROM PUBLIC;
CREATE TRIGGER guard_fatd_document_stages BEFORE UPDATE OF type_code, unit_id ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_fatd_document_stages();
CREATE FUNCTION public.record_fatd_stage_deadline() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs(unit_id, actor_id, document_id, action, old_data, new_data)
    VALUES (NEW.unit_id, auth.uid(), NEW.document_id, TG_OP,
      CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END, to_jsonb(NEW));
  INSERT INTO public.document_movements(unit_id, document_id, actor_id, action)
    VALUES (NEW.unit_id, NEW.document_id, auth.uid(),
      CASE WHEN TG_OP = 'INSERT' THEN 'Etapa FATD cadastrada: ' ELSE 'Etapa FATD atualizada: ' END || NEW.stage);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_fatd_stage_deadline() FROM PUBLIC;
CREATE TRIGGER record_fatd_stage_deadline AFTER INSERT OR UPDATE ON public.fatd_stage_deadlines
  FOR EACH ROW EXECUTE FUNCTION public.record_fatd_stage_deadline();
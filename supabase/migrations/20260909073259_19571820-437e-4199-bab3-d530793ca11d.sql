GRANT SELECT, INSERT, UPDATE ON public.servicios TO authenticated;
CREATE POLICY "empleado crea sus servicios" ON public.servicios
FOR INSERT TO authenticated
WITH CHECK (empleado_id = auth.uid() AND user_id = auth.uid() AND eliminado_logico = false);
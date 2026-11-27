ALTER TABLE cne.enlaces_estacion
  DROP CONSTRAINT enlaces_estacion_funcion_check,
  ADD CONSTRAINT enlaces_estacion_funcion_check
    CHECK (funcion IN ('puerta', 'documentacion', 'finanzas', 'mando', 'mesas', 'validacion_documental'));

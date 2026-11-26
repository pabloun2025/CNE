-- Permisos de cne_app. Se vuelven a dar en cada arranque (idempotente) para cubrir tablas de migraciones nuevas.
-- Sin cne_app (alternativa Render, un solo rol) no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cne_app') THEN
    GRANT USAGE ON SCHEMA cne TO cne_app;
    GRANT SELECT ON ALL TABLES IN SCHEMA cne TO cne_app;
    GRANT INSERT ON cne.escaneos_finanzas, cne.whatsapp_respuestas TO cne_app;
    REVOKE ALL ON cne.respaldo_limpieza FROM cne_app;
    -- Sin DELETE general: la limpieza de pruebas la hace cne_owner. juntas_madrid, pagos_confirmados y migraciones no se borran desde la app.
    GRANT INSERT, UPDATE ON cne.envios_sms, cne.entregas_whatsapp, cne.usuarios, cne.sesiones, cne.intentos_acceso, cne.sesiones_estacion,
      cne.operadores_madrid, cne.enlaces_estacion, cne.mjrv, cne.envios_credencial, cne.auditoria,
      cne.configuracion, cne.parametros_pago,
      cne.lecturas_puerta, cne.excepciones_disponibilidad, cne.decisiones_movimiento, cne.documentos_mjrv,
      cne.actas_pago, cne.pagos_confirmados, cne.asignaciones_cargo, cne.fichas_abiertas_finanzas,
      cne.credenciales_revocadas, cne.pendientes_impresion, cne.firmas_recibo TO cne_app;
    -- Borrar una ficha sin pago confirmado, y las filas que solo existen por ella. El pago confirmado no se borra.
    GRANT DELETE ON cne.mjrv, cne.envios_credencial, cne.excepciones_disponibilidad, cne.decisiones_movimiento,
      cne.documentos_mjrv, cne.actas_pago, cne.asignaciones_cargo, cne.lecturas_puerta,
      cne.fichas_abiertas_finanzas, cne.credenciales_revocadas, cne.pendientes_impresion, cne.firmas_recibo TO cne_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA cne TO cne_app;
    GRANT UPDATE (ultimo_ordinal) ON cne.secuencia_recibos TO cne_app;
    GRANT INSERT (mjrv_id, validada_en), UPDATE (validada_en) ON cne.cedulas_validadas TO cne_app;
  END IF;
END $$;

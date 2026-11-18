-- Permisos de cne_app. Se vuelven a dar en cada arranque (idempotente) para cubrir tablas de migraciones nuevas.
-- Sin cne_app (alternativa Render, un solo rol) no hace nada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cne_app') THEN
    GRANT USAGE ON SCHEMA cne TO cne_app;
    GRANT SELECT ON ALL TABLES IN SCHEMA cne TO cne_app;
    REVOKE ALL ON cne.respaldo_limpieza FROM cne_app;
    -- Sin DELETE: la limpieza de pruebas la hace cne_owner. juntas_madrid y migraciones solo se leen.
    GRANT INSERT, UPDATE ON cne.usuarios, cne.sesiones, cne.intentos_acceso, cne.sesiones_estacion,
      cne.operadores_madrid, cne.enlaces_estacion, cne.mjrv, cne.envios_credencial, cne.auditoria,
      cne.configuracion, cne.parametros_pago, cne.codigos_recuperacion,
      cne.lecturas_puerta, cne.excepciones_disponibilidad, cne.decisiones_movimiento, cne.documentos_mjrv,
      cne.actas_pago, cne.pagos_confirmados, cne.asignaciones_cargo, cne.fichas_abiertas_finanzas TO cne_app;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA cne TO cne_app;
  END IF;
END $$;

-- Un ensayo y un envío real pueden coexistir, cada uno sin duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS envios_credencial_uno_por_modo
  ON cne.envios_credencial (mjrv_id, canal, simulado)
  WHERE estado IN ('en_cola', 'enviada_al_servicio', 'entregada');
DROP INDEX IF EXISTS cne.envios_credencial_uno_vivo;

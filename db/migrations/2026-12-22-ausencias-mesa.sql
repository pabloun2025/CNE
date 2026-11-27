CREATE TABLE cne.ausencias_mesa (
  junta_id bigint NOT NULL REFERENCES cne.juntas_madrid(id),
  cargo text NOT NULL CHECK (cargo IN ('presidente', 'secretario', 'vocal')),
  mjrv_id bigint NOT NULL REFERENCES cne.mjrv(id) ON DELETE CASCADE,
  es_prueba boolean NOT NULL DEFAULT cne.en_prueba(),
  activa boolean NOT NULL,
  PRIMARY KEY (junta_id, cargo, mjrv_id, es_prueba)
);

ALTER TABLE cne.ausencias_mesa ENABLE ROW LEVEL SECURITY;
ALTER TABLE cne.ausencias_mesa FORCE ROW LEVEL SECURITY;
CREATE POLICY modo_ausencias_mesa ON cne.ausencias_mesa
  USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba());

CREATE VIEW cne.v_titular_mesa WITH (security_invoker = true) AS
SELECT DISTINCT ON (m.junta_origen_id, m.rol)
       m.id, m.junta_origen_id AS junta_id, m.rol AS cargo,
       m.apellidos || ', ' || m.nombres AS nombre, coalesce(a.activa, false) AS ausente
  FROM cne.mjrv m
  LEFT JOIN cne.ausencias_mesa a ON a.junta_id = m.junta_origen_id AND a.cargo = m.rol
    AND a.mjrv_id = m.id AND a.es_prueba = cne.en_prueba()
 WHERE m.activo AND (cne.en_prueba() OR NOT m.es_prueba)
   AND m.rol IN ('presidente', 'secretario', 'vocal')
 ORDER BY m.junta_origen_id, m.rol, m.fila_origen, m.id;

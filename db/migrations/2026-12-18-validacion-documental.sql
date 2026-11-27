-- Un tipo propio impide que una versión anterior trate al validador como cónsul.
ALTER TABLE cne.usuarios
  DROP CONSTRAINT usuarios_tipo_check,
  DROP CONSTRAINT usuarios_rol_valido,
  ADD CONSTRAINT usuarios_tipo_check CHECK (tipo IN ('madrid_admin', 'madrid_documentacion', 'superadmin')),
  ADD CONSTRAINT usuarios_rol_valido CHECK (
    (tipo = 'madrid_documentacion' AND rol = 'validador')
    OR (tipo <> 'madrid_documentacion' AND rol IN ('consul', 'coordinador', 'financiero'))
  );

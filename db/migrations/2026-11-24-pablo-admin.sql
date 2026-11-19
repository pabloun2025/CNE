-- La superadmin pabloun@gmail.com pasa a ser el usuario «admin» de Madrid.
-- Sin contraseña guardada: el primer ingreso la pide. Una contraseña vacía no entra.
-- No borra otras cuentas ni el resto de la base. Si «admin» ya existe, no toca nada.
WITH objetivo AS (
  SELECT id FROM cne.usuarios
   WHERE correo = 'pabloun@gmail.com' AND tipo = 'superadmin'
     AND NOT EXISTS (SELECT 1 FROM cne.usuarios WHERE correo = 'admin')
),
cierre AS (
  UPDATE cne.sesiones SET revocada_en = now()
   WHERE revocada_en IS NULL AND usuario_id IN (SELECT id FROM objetivo)
  RETURNING 1
)
UPDATE cne.usuarios
   SET tipo = 'madrid_admin',
       rol = 'consul',
       correo = 'admin',
       nombre = 'Administración',
       password_hash = NULL,
       password_pendiente = true,
       debe_cambiar = false,
       fallos = 0,
       bloqueado_hasta = NULL
 WHERE id IN (SELECT id FROM objetivo);

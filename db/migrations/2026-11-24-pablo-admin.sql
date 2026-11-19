-- Pablo entra como administración de Madrid, no como superadmin.
-- Sin contraseña: el primer ingreso la pide. No borra otras cuentas ni el resto de la base.
WITH cierre AS (
  UPDATE cne.sesiones SET revocada_en = now()
   WHERE revocada_en IS NULL
     AND usuario_id IN (SELECT id FROM cne.usuarios WHERE correo = 'pabloun@gmail.com' AND tipo = 'superadmin')
  RETURNING 1
)
UPDATE cne.usuarios
   SET tipo = 'madrid_admin',
       rol = 'consul',
       nombre = 'Administración',
       password_hash = NULL,
       password_pendiente = true,
       debe_cambiar = false,
       fallos = 0,
       bloqueado_hasta = NULL
 WHERE correo = 'pabloun@gmail.com' AND tipo = 'superadmin';

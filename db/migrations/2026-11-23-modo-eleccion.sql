-- Pablo, 19-11-2026: la instalación no arranca en modo prueba.
-- Pasa a elección la fila que sigue en el valor inicial. No borra datos.
UPDATE cne.configuracion SET modo = 'eleccion', actualizado_en = now() WHERE id = 1 AND modo = 'prueba';

-- «No viable» deja a la persona fuera de las propuestas hasta que el centro de mando la vuelva a habilitar (Q-R3, opción A).
-- Cambio aditivo: la versión anterior del código ignora la columna.
ALTER TABLE cne.decisiones_movimiento ADD COLUMN IF NOT EXISTS rehabilitada_en timestamptz;

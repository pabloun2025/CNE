-- 95 juntas de Madrid (especificación, «Numeración de las fichas»): H1–21 amarillo, H22–41 azul,
-- M1–8 rojo, M9–29 celeste, M30–39 verde, M40–54 rosado. Idempotente.
-- orden_cercania sigue «Orden de los bloques»: celeste 1, rojo 2, azul 3, amarillo 4, verde 5, rosado 6 (P-11 abierta).
INSERT INTO cne.juntas_madrid (serie, sexo, numero, zona_color, orden_cercania)
SELECT 'H', 'hombres', n,
       CASE WHEN n <= 21 THEN 'amarillo' ELSE 'azul' END,
       CASE WHEN n <= 21 THEN 4 ELSE 3 END
FROM generate_series(1, 41) AS n
UNION ALL
SELECT 'M', 'mujeres', n,
       CASE WHEN n <= 8 THEN 'rojo' WHEN n <= 29 THEN 'celeste' WHEN n <= 39 THEN 'verde' ELSE 'rosado' END,
       CASE WHEN n <= 8 THEN 2 WHEN n <= 29 THEN 1 WHEN n <= 39 THEN 5 ELSE 6 END
FROM generate_series(1, 54) AS n
ON CONFLICT (serie, numero) DO NOTHING;

-- Solo el identificador aleatorio firmado y los intentos confirmados de apertura.
CREATE TABLE cne.aperturas_justificante (
  documento text PRIMARY KEY CHECK (documento ~ '^[A-Za-z0-9_-]{16}$'),
  solicitudes uuid[] NOT NULL,
  vencimientos timestamptz[] NOT NULL,
  CHECK (cardinality(solicitudes) BETWEEN 1 AND 3 AND cardinality(solicitudes) = cardinality(vencimientos))
);

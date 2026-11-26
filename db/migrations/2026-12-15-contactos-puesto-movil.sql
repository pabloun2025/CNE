CREATE TABLE cne.puesto_movil_contactos (
  huella_cedula bytea PRIMARY KEY CHECK (octet_length(huella_cedula) = 32),
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 12),
  cifrado bytea NOT NULL CHECK (octet_length(cifrado) > 16)
);

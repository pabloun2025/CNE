-- La fórmula entre el monto en dólares y el tipo de cambio sigue abierta.
-- Las actas nuevas no calculan euros: la columna puede quedar vacía. No se borra lo ya escrito.

ALTER TABLE cne.actas_pago ALTER COLUMN importe_eur DROP NOT NULL;
ALTER TABLE cne.pagos_confirmados ALTER COLUMN importe_eur DROP NOT NULL;

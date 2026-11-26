import * as XLSX from "xlsx";
import { afterAll, beforeAll, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { informeEnviosExcel } from "@/server/informe-envios";
import { registrarEntregaWhatsApp } from "@/server/envios/whatsapp-entrega";
import { registrarEventoBrevo } from "@/server/envios/brevo-webhook";
import { consultarDueno, reiniciarBase } from "./helpers/db";

beforeAll(async () => {
  await reiniciarBase({ correo: "super@prueba.cne", password: "clave-de-prueba-1", modo: "eleccion" });
  await consultarDueno(`
    INSERT INTO cne.mjrv (cedula,apellidos,nombres,rol,cargo_original,junta_origen_id,correo,telefono_e164)
      SELECT f.cedula, 'PRUEBA', f.nombre, 'vocal', 'VOCAL', j.id, f.correo, f.telefono
      FROM (VALUES ('0000000001','ENTREGADO','uno@ejemplo.invalid','+34600000001'),
                   ('0000000002','REBOTADO','dos@ejemplo.invalid','+34600000002')) f(cedula,nombre,correo,telefono)
      JOIN cne.juntas_madrid j ON j.serie='H' AND j.numero=1`);
  await consultarDueno(`
    INSERT INTO cne.envios_credencial (mjrv_id,canal,destino,estado,simulado,intentos,id_externo,linea_whatsapp,error)
      SELECT id,'correo',correo,'enviada_al_servicio',false,1,'mail-'||cedula,1,NULL FROM cne.mjrv
      UNION ALL
      SELECT id,'whatsapp',telefono_e164,
             CASE WHEN cedula='0000000001' THEN 'enviada_al_servicio' ELSE 'fallo' END,false,1,
             NULL,2,CASE WHEN cedula='0000000002' THEN 'El número no tiene WhatsApp.' ELSE NULL END FROM cne.mjrv`);
});

afterAll(closePools);

it("separa los eventos de Brevo, los fallos de WhatsApp y los aceptados sin entrega confirmada", async () => {
  const ts = Math.floor(Date.now() / 1000);
  expect(await registrarEventoBrevo({ event: "delivered", email: "uno@ejemplo.invalid", "message-id": "<mail-0000000001>", ts })).toBe(true);
  expect(await registrarEventoBrevo({ event: "hard_bounce", email: "dos@ejemplo.invalid", "message-id": "<mail-0000000002>", ts })).toBe(true);
  const libro = XLSX.read(await informeEnviosExcel(), { type: "buffer" });
  const filas = (hoja: string) => XLSX.utils.sheet_to_json(libro.Sheets[hoja]);
  expect(filas("Entregados")).toEqual([expect.objectContaining({ Cédula: "0000000001", Canal: "Correo", Destino: "uno@ejemplo.invalid", Estado: "Entregado" })]);
  expect(filas("Rechazos y fallos")).toEqual([
    expect.objectContaining({ Cédula: "0000000002", Canal: "Correo", Estado: "Rebote permanente" }),
    expect.objectContaining({ Cédula: "0000000002", Canal: "WhatsApp", Línea: 2, Destino: "+34600000002", Motivo: "El número no tiene WhatsApp." }),
  ]);
  expect(filas("Sin confirmar")).toEqual([expect.objectContaining({ Cédula: "0000000001", Canal: "WhatsApp", Estado: "Aceptado por el proveedor" })]);
});


it("reconcilia un acuse temprano con el ID del intento y conserva la entrega confirmada", async () => {
  await consultarDueno(`UPDATE cne.envios_credencial SET estado='en_cola'
    WHERE canal='whatsapp' AND destino='+34600000001'`);
  const acuse = { data: { keyId: "ACK_FICTICIO", fromMe: true, remoteJid: "34600000001@s.whatsapp.net", status: "DELIVERY_ACK" } };
  expect(await registrarEntregaWhatsApp(1, acuse)).toBe(false);
  expect(await registrarEntregaWhatsApp(2, { data: { ...acuse.data, status: "SERVER_ACK" } })).toBe(false);
  expect(await registrarEntregaWhatsApp(2, acuse)).toBe(true);
  await consultarDueno(`UPDATE cne.envios_credencial SET estado='enviada_al_servicio', id_externo='ACK_FICTICIO'
    WHERE canal='whatsapp' AND destino='+34600000001'`);
  expect(await registrarEntregaWhatsApp(2, { data: { ...acuse.data, status: "ERROR" } })).toBe(false);

  const libro = XLSX.read(await informeEnviosExcel(), { type: "buffer" });
  expect(XLSX.utils.sheet_to_json(libro.Sheets.Entregados)).toContainEqual(expect.objectContaining({
    Cédula: "0000000001", Canal: "WhatsApp", Estado: "Entregado", Línea: 2,
  }));
});

it("muestra el primer ingreso válido en Puerta en el informe", async () => {
  await consultarDueno(`
    INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta', 'Puerta de prueba', '\\x01');
    INSERT INTO cne.lecturas_puerta (mjrv_id, codigo_leido, enlace_id, resultado, creado_en)
      SELECT m.id, m.cedula, e.id, f.resultado, f.fecha::timestamptz
      FROM cne.mjrv m CROSS JOIN cne.enlaces_estacion e
      CROSS JOIN (VALUES ('duplicado', '2026-11-29T07:20:00Z'), ('valido', '2026-11-29T07:30:00Z')) f(resultado, fecha)
      WHERE m.cedula = '0000000001' AND e.etiqueta = 'Puerta de prueba'`);

  const libro = XLSX.read(await informeEnviosExcel(), { type: "buffer" });
  expect(XLSX.utils.sheet_to_json(libro.Sheets.Entregados)).toContainEqual(expect.objectContaining({
    Cédula: "0000000001", Canal: "Correo", "Ingreso por Puerta (Madrid)": "29/11/26, 8:30:00",
  }));
});

it("conserva la primera apertura SMS aunque el último intento siga sin entrega confirmada", async () => {
  await consultarDueno(`
    INSERT INTO cne.envios_sms (mjrv_id, destino, remitente, estado, token_hash, creado_en, actualizado_en, clic_en, abierto_en)
      SELECT m.id, f.destino, '+34600000009', f.estado, repeat(f.hash, 32), f.envio::timestamptz,
             f.envio::timestamptz, f.clic::timestamptz, f.abierto::timestamptz
      FROM cne.mjrv m
      CROSS JOIN (VALUES
        ('+34600000001', 'entregado', 'aa', '2026-11-26T10:00:00Z', '2026-11-26T10:05:00Z', '2026-11-26T10:10:00Z'),
        ('+34600000003', 'aceptado', 'bb', '2026-11-26T10:30:00Z', NULL, NULL)
      ) f(destino, estado, hash, envio, clic, abierto)
      WHERE m.cedula = '0000000001'`);

  const libro = XLSX.read(await informeEnviosExcel(), { type: "buffer" });
  const filas = (hoja: string) => XLSX.utils.sheet_to_json<Record<string, string>>(libro.Sheets[hoja]).filter((fila) => fila.Canal === "SMS");
  expect(filas("Entregados")).toEqual([]);
  expect(filas("Sin confirmar")).toEqual([expect.objectContaining({
    Cédula: "0000000001", Canal: "SMS", Destino: "+34600000003", Estado: "Aceptado por el proveedor",
    "Fecha (Madrid)": "26/11/26, 11:30:00", "Clic SMS informado (Madrid)": "26/11/26, 11:05:00",
    "Apertura de credencial SMS (Madrid)": "26/11/26, 11:10:00",
  })]);
});

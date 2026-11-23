import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/evolution/route";
import { closePools } from "@/server/db";
import { leerBandejaWhatsApp } from "@/server/bandeja-whatsapp";
import { CABECERA_WEBHOOK_WHATSAPP, credencialWebhookWhatsApp } from "@/server/envios/whatsapp-webhook";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const NUMERO = "+34000001234";
const JID = "34000001234@s.whatsapp.net";
const TEXTO = "Recibido, gracias.";
const instancia = ["", "cne-madrid", "cne-madrid-2"];
const recibido = Math.floor(Date.now() / 1000);

function evento(id: string, linea: 1 | 2 = 1, key: object = {}, message: object = { conversation: TEXTO }) {
  return {
    event: "messages.upsert", instance: instancia[linea], apikey: "proveedor-ficticio",
    data: {
      key: { id, remoteJid: JID, fromMe: false, ...key }, messageTimestamp: recibido, message,
      pushName: "Nombre externo ficticio", contextInfo: { quotedMessage: { conversation: "Cita privada" } },
    },
  };
}

function peticion(cuerpo: unknown, token: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== null) headers.set(CABECERA_WEBHOOK_WHATSAPP, token);
  return new Request("http://localhost/api/webhooks/evolution", { method: "POST", headers, body: JSON.stringify(cuerpo) });
}

async function ficha(cedula: string, numero: string, esPrueba = false) {
  const [m] = await consultarDueno<{ id: number }>(
    `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, telefono_e164, es_prueba)
     SELECT $1, 'PERSONA DE PRUEBA', 'NOMBRE', 'Vocal', 'vocal', id, $2, $3 FROM cne.juntas_madrid WHERE serie = 'H' AND numero = 1
     RETURNING id`, [cedula, numero, esPrueba],
  );
  return m.id;
}

describe("bandeja de WhatsApp con eventos Evolution 2.3.7", () => {
  let mjrv: number;
  beforeAll(async () => { await reiniciarBase(); });
  beforeEach(async () => {
    await consultarDueno("DELETE FROM cne.envios_credencial");
    await consultarDueno("DELETE FROM cne.mjrv");
    mjrv = await ficha("0000000751", NUMERO);
    await ficha("0000000752", "+34000005678", true);
  });
  afterAll(closePools);

  it("comprueba la credencial antes de leer el cuerpo y la vincula a una sola instancia", async () => {
    const sinCredencial = peticion(evento("sin-credencial"), null);
    expect((await POST(sinCredencial)).status).toBe(401);
    expect(sinCredencial.bodyUsed).toBe(false);
    expect((await POST(peticion(evento("cruzada", 2), credencialWebhookWhatsApp(1)))).status).toBe(403);
    expect((await POST(peticion({ ...evento("externa"), instance: "otra-instancia" }, credencialWebhookWhatsApp(1)))).status).toBe(403);
    expect(await leerBandejaWhatsApp(1, 1)).toEqual({ mensajes: [], hayMas: false });
  });

  it("limita el tamaño del cuerpo del webhook antes de procesar el mensaje", async () => {
    const cuerpo = { ...evento("sobre-limite"), relleno: "x".repeat(64 * 1024) };
    const respuesta = await POST(peticion(cuerpo, credencialWebhookWhatsApp(1)));
    expect(respuesta.status).toBe(400);
    expect(await leerBandejaWhatsApp(1, 1)).toEqual({ mensajes: [], hayMas: false });
  });

  it("atribuye una respuesta de LID con teléfono alternativo conocido, cifra su texto y deduplica por línea", async () => {
    const salida = new Date((recibido - 30) * 1000);
    await consultarDueno(
      `INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, estado, simulado, enviado_en, linea_whatsapp)
       VALUES ($1, 'whatsapp', $2, 'enviada_al_servicio', false, $3, 1)`, [mjrv, NUMERO, salida],
    );
    const cuerpo = evento("mensaje-id", 1, { remoteJid: "12345678901234@lid", remoteJidAlt: JID });
    const token = credencialWebhookWhatsApp(1);
    const respuestas = await Promise.all([POST(peticion(cuerpo, token)), POST(peticion(cuerpo, token))]);
    expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
    expect((await POST(peticion(evento("mensaje-id", 2), credencialWebhookWhatsApp(2)))).status).toBe(200);

    expect(await leerBandejaWhatsApp(1, 1)).toMatchObject({ mensajes: [
      { mjrvId: mjrv, texto: TEXTO, ultimoEnvioEn: salida },
    ] });
    expect(await leerBandejaWhatsApp(2, 1)).toMatchObject({ mensajes: [
      { mjrvId: mjrv, texto: TEXTO, ultimoEnvioEn: null },
    ] });
    const filas = await consultarDueno<{ texto_cifrado: Buffer; texto_nonce: Buffer }>(
      "SELECT texto_cifrado, texto_nonce FROM cne.whatsapp_respuestas",
    );
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.texto_nonce.length === 12 && !f.texto_cifrado.includes(TEXTO))).toBe(true);
    expect((await consultarDueno("SELECT estado, simulado FROM cne.envios_credencial"))).toEqual([
      { estado: "enviada_al_servicio", simulado: false },
    ]);
  });

  it("descarta texto de números ajenos, de fichas de prueba y de grupos, salidas y adjuntos", async () => {
    const token = credencialWebhookWhatsApp(1);
    const descartados = [
      evento("ajeno", 1, { remoteJid: "34000009876@s.whatsapp.net" }),
      evento("grupo", 1, { remoteJid: "1234@g.us", remoteJidAlt: JID }),
      evento("lid-no-resuelto", 1, { remoteJid: "12345678901234@lid" }),
      evento("saliente", 1, { fromMe: true }),
      evento("prueba", 1, { remoteJid: "34000005678@s.whatsapp.net" }),
      evento("adjunto", 1, {}, { documentMessage: { caption: "Dato de prueba", url: "https://adjunto.test" } }),
      evento("grande", 1, {}, { conversation: "á".repeat(3000) }),
      { ...evento("otro-evento"), event: "send.message" },
    ];
    for (const cuerpo of descartados) expect((await POST(peticion(cuerpo, token))).status).toBe(200);
    expect((await leerBandejaWhatsApp(1, 1)).mensajes).toEqual([]);
  });

  it("descarta la atribución cuando dos fichas activas comparten un teléfono y purga con la ficha", async () => {
    const token = credencialWebhookWhatsApp(1);
    const respuesta = evento("duplicado", 1, {}, { extendedTextMessage: { text: TEXTO } });
    expect((await POST(peticion(respuesta, token))).status).toBe(200);
    const segunda = await ficha("0000000753", NUMERO);
    expect((await POST(peticion(evento("telefono-ambiguo"), token))).status).toBe(200);
    expect((await leerBandejaWhatsApp(1, 1)).mensajes).toHaveLength(1);

    await consultarDueno("DELETE FROM cne.envios_credencial WHERE mjrv_id = $1", [mjrv]);
    await consultarDueno("DELETE FROM cne.mjrv WHERE id IN ($1, $2)", [mjrv, segunda]);
    expect(await consultarDueno("SELECT linea FROM cne.whatsapp_respuestas")).toEqual([]);
  });
});

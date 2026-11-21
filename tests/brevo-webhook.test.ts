import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/brevo/route";
import { closePools } from "@/server/db";
import { estadoEntregasCredenciales } from "@/server/envios-estado";
import { claveWebhookBrevo, registrarEventoBrevo } from "@/server/envios/brevo-webhook";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const email = "mjrv@ejemplo.invalid";
const instante = 1795262400;
let envio: number;

async function evento(body: object, token = claveWebhookBrevo()) {
  return POST(new Request("http://localhost/api/webhooks/brevo", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}
const leer = () => consultarDueno("SELECT brevo_estado, id_externo FROM cne.envios_credencial WHERE id = $1", [envio]);
const payload = (event: string, ts_event = instante, correo = email) => ({ event, ts_event, email: correo, "message-id": "prueba@brevo.invalid" });

describe("seguimiento de Brevo", () => {
  beforeAll(async () => {
    await reiniciarBase();
    const [{ id: ficha }] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, correo, rotulo_credencial)
       SELECT '0000000821','APELLIDO PRUEBA', 'PRUEBA', 'Vocal', 'vocal', id, $1, 'H1' FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id`, [email],
    );
    [{ id: envio }] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, estado, simulado, intentos, id_externo)
       VALUES ($1, 'correo', $2, 'enviada_al_servicio', false, 1, '<prueba@brevo.invalid>') RETURNING id`, [ficha, email],
    );
  });
  afterAll(closePools);

  it("exige el token y nunca aplica eventos de otro destinatario", async () => {
    expect((await evento(payload("delivered"), "incorrecta")).status).toBe(401);
    expect((await evento(payload("delivered", instante, "otro@ejemplo.invalid"))).status).toBe(200);
    expect(await leer()).toEqual([{ brevo_estado: null, id_externo: "<prueba@brevo.invalid>" }]);
  });

  it("registra un diferido, entrega y duplicados en cualquier orden", async () => {
    expect((await evento(payload("deferred"))).status).toBe(200);
    expect(await leer()).toMatchObject([{ brevo_estado: "diferido" }]);
    expect((await evento(payload("delivered", instante + 10))).status).toBe(200);
    await evento(payload("deferred", instante + 1));
    await evento(payload("delivered", instante + 10));
    expect(await leer()).toMatchObject([{ brevo_estado: "entregado" }]);
    expect(await estadoEntregasCredenciales()).toMatchObject([{ correo: { estado: "entregado" }, whatsapp: { estado: "sin_contacto" } }]);
  });

  it("correlaciona por etiqueta si el webhook se adelanta a la respuesta del proveedor", async () => {
    await consultarDueno("UPDATE cne.envios_credencial SET estado = 'en_cola', id_externo = NULL, brevo_estado = NULL, brevo_evento_en = NULL WHERE id = $1", [envio]);
    expect((await evento({ ...payload("hard_bounce"), tags: ["cne-madrid", `cne-madrid-envio-${envio}`] })).status).toBe(200);
    expect(await leer()).toMatchObject([{ brevo_estado: "rebote_permanente", id_externo: "prueba@brevo.invalid" }]);
  });
  it("reconcilia un correo anterior con la etiqueta singular del informe", async () => {
    await consultarDueno("UPDATE cne.envios_credencial SET id_externo = NULL, brevo_estado = NULL, brevo_evento_en = NULL WHERE id = $1", [envio]);
    expect(await registrarEventoBrevo({
      event: "delivered", date: new Date(instante * 1000).toISOString(), email,
      messageId: "<historial@brevo.invalid>", tag: `cne-madrid-envio-${envio}`,
    }, true)).toBe(true);
    expect(await leer()).toMatchObject([{ brevo_estado: "entregado", id_externo: "historial@brevo.invalid" }]);
  });

});

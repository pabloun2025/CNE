import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { correoCredencial, textoCredencial } from "@/domain/mensaje-credencial";
import { enviarCredencial, enviarLote, enviosDe } from "@/server/envios";
import { elegirProveedor, type MensajeCredencial, type ProveedorEnvio } from "@/server/envios/proveedor";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const admin: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", rol: "consul", debeCambiar: false };
const ids: Record<string, number> = {};

async function ficha(cedula: string, extra: { correo?: string; tel?: string; rotulo?: string | null }) {
  const [r] = await consultarDueno<{ id: number }>(
    "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, correo, telefono_e164, rotulo_credencial) SELECT $1,'APELLIDO PRUEBA','NOMBRE PRUEBA','VOCAL','vocal',id,$2,$3,$4 FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id",
    [cedula, extra.correo ?? null, extra.tel ?? null, extra.rotulo === undefined ? "H01" : extra.rotulo],
  );
  ids[cedula] = r.id;
}

describe("envío simulado de credenciales", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','Admin','x')");
    await ficha("0000000001", { correo: "prueba1@ejemplo.invalid", tel: "+34600000001" });
    await ficha("0000000002", { correo: "prueba2@ejemplo.invalid" });
    await ficha("0000000003", { tel: "+34600000003", rotulo: null });
    await ficha("0000000004", {});
  });
  afterAll(closePools);

  it("el proveedor inmediato es siempre simulado: las variables *_REAL_SEND ya no cuentan (el interruptor está en la base)", () => {
    process.env.WHATSAPP_REAL_SEND = "true";
    expect(elegirProveedor("whatsapp").canal).toBe("whatsapp");
    expect(elegirProveedor("whatsapp").enviar).toBeTypeOf("function");
    delete process.env.WHATSAPP_REAL_SEND;
  });

  it("registra el envío simulado con estado «enviada al servicio» y no lo repite", async () => {
    const r = await enviarCredencial(admin, ids["0000000001"], "whatsapp");
    expect(r).toEqual({ ok: true, simulado: true });
    const [e] = await enviosDe(ids["0000000001"]);
    expect(e).toMatchObject({ canal: "whatsapp", estado: "enviada_al_servicio", simulado: true, destino: "+34600000001" });
    expect(await enviarCredencial(admin, ids["0000000001"], "whatsapp")).toMatchObject({ ok: false, mensaje: expect.stringMatching(/Ya hay/) });
    expect((await enviosDe(ids["0000000001"]))).toHaveLength(1);
    // Dos peticiones simultáneas: una sola fila.
    const [a, b] = await Promise.all([enviarCredencial(admin, ids["0000000001"], "correo"), enviarCredencial(admin, ids["0000000001"], "correo")]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it("solo con teléfono/correo válido y con rótulo", async () => {
    expect(await enviarCredencial(admin, ids["0000000002"], "whatsapp")).toMatchObject({ ok: false, mensaje: expect.stringMatching(/teléfono/) });
    expect(await enviarCredencial(admin, ids["0000000004"], "correo")).toMatchObject({ ok: false, mensaje: expect.stringMatching(/correo/) });
    expect(await enviarCredencial(admin, ids["0000000003"], "whatsapp")).toMatchObject({ ok: false, mensaje: expect.stringMatching(/rótulo/) });
    expect(await consultarDueno("SELECT 1 FROM cne.envios_credencial WHERE mjrv_id IN ($1,$2,$3)", [ids["0000000002"], ids["0000000003"], ids["0000000004"]])).toHaveLength(0);
  });

  it("un fallo del proveedor queda registrado, no afirma entrega y se puede reintentar", async () => {
    const roto: ProveedorEnvio = { canal: "correo", enviar: async () => { throw new Error("proveedor caído"); } };
    expect(await enviarCredencial(admin, ids["0000000002"], "correo", roto)).toMatchObject({ ok: false });
    expect((await enviosDe(ids["0000000002"]))[0]).toMatchObject({ estado: "fallo", error: "proveedor caído" });
    expect(await enviarCredencial(admin, ids["0000000002"], "correo")).toMatchObject({ ok: true });
  });

  it("el proveedor recibe el PDF de la credencial", async () => {
    let recibido: MensajeCredencial | null = null;
    const espia: ProveedorEnvio = { canal: "whatsapp", enviar: async (m) => { recibido = m; return { idExterno: "X", simulado: true }; } };
    await ficha("0000000005", { tel: "+34600000005" });
    await enviarCredencial(admin, ids["0000000005"], "whatsapp", espia);
    const m = recibido as MensajeCredencial | null;
    expect(m?.pdf.length).toBeGreaterThan(1000);
    expect(Buffer.from(m!.pdf.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("el lote solo toca a quienes faltan y la superadmin no envía", async () => {
    const r = await enviarLote(admin, "whatsapp");
    expect(r).toMatchObject({ enviadas: 0, omitidas: 1 }); // 0000000003 sin rótulo; el resto ya tenía envío
    await expect(enviarCredencial({ ...admin, tipo: "superadmin" }, ids["0000000001"], "correo")).rejects.toThrow();
  });

  it("cuenta las fichas de la selección sin contacto o ya enviadas como omitidas", async () => {
    await ficha("0000000007", { tel: "+34600000007" });
    const seleccion = { alcance: "ids" as const, ids: [ids["0000000001"], ids["0000000004"], ids["0000000007"]] };
    expect(await enviarLote(admin, "whatsapp", undefined, seleccion)).toMatchObject({ enviadas: 1, omitidas: 2 });
    expect(await enviarLote(admin, "whatsapp", undefined, seleccion)).toMatchObject({ enviadas: 0, omitidas: 3 });
  });

  it("reenvía solo la selección explícita y conserva el historial", async () => {
    const id = ids["0000000001"];
    const seleccion = { alcance: "ids" as const, ids: [id, ids["0000000004"]] };
    expect(await enviarLote(admin, "whatsapp", undefined, seleccion, true)).toMatchObject({ enviadas: 1, omitidas: 1 });
    const historial = (await enviosDe(id)).filter((e) => e.canal === "whatsapp");
    expect(historial).toHaveLength(2);
    expect(historial.every((e) => e.estado === "enviada_al_servicio")).toBe(true);
    expect(await enviarLote(admin, "whatsapp", undefined, seleccion)).toMatchObject({ enviadas: 0, omitidas: 2 });
  });
});

describe("D08 · texto del mensaje de la credencial", () => {
  const d = { nombres: "NOMBRE PRUEBA", rotulo: "H01" };
  it("lleva el rótulo, «comprobante de pago» y el enlace https://<HOST_MADRID>/d", () => {
    const t = textoCredencial({ ...d, host: "madrid.ejemplo.invalid" });
    expect(t).toContain("Buen día, NOMBRE PRUEBA.");
    expect(t).toContain("(H01)");
    expect(t).toContain("comprobante de pago");
    expect(t).toContain("anverso y reverso");
    expect(t.endsWith("https://madrid.ejemplo.invalid/d")).toBe(true);
  });
  it("tolera https:// y barras en el host; sin host no inventa ningún enlace", () => {
    expect(textoCredencial({ ...d, host: "https://madrid.ejemplo.invalid/" })).toContain("https://madrid.ejemplo.invalid/d");
    expect(textoCredencial({ ...d, host: "" })).not.toContain("http");
    expect(textoCredencial({ ...d })).not.toContain("comprobante");
  });
  it("el correo usa los datos escapados en HTML y omite el formulario si falta el host", () => {
    const correo = correoCredencial({ nombres: "ANA < PRUEBA", rotulo: "H01 & H02" });
    expect(correo.html).toContain("ANA &lt; PRUEBA");
    expect(correo.html).toContain("H01 &amp; H02");
    expect(correo.html).toContain("muestre el código QR en la puerta");
    expect(correo.html).not.toContain("href=");
    expect(correo.texto).not.toContain("formulario de Madrid");
  });
  it("el envío simulado usa el HOST_MADRID del servidor en HTML y texto", async () => {
    const antes = process.env.HOST_MADRID;
    process.env.HOST_MADRID = "madrid.ejemplo.invalid";
    try {
      let texto = "";
      let html: string | undefined;
      const espia: ProveedorEnvio = { canal: "correo", enviar: async (m) => { texto = m.texto; html = m.html; return { idExterno: "X", simulado: true }; } };
      await ficha("0000000006", { correo: "prueba6@ejemplo.invalid" });
      await enviarCredencial(admin, ids["0000000006"], "correo", espia);
      expect(texto).toContain("https://madrid.ejemplo.invalid/d");
      expect(html).toContain('href="https://madrid.ejemplo.invalid/d"');
    } finally {
      if (antes === undefined) delete process.env.HOST_MADRID; else process.env.HOST_MADRID = antes;
    }
  });
});

import { Client } from "pg";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { cambiarInterruptor, estadoCola, guardarRemitente, reanudarEnvios, type Clientes } from "@/server/envios-config";
import { enviarCredencial, enviarLote } from "@/server/envios";
import { procesarCola, recuperarInterrumpidas } from "@/server/envios/cola";
import type { ClienteCorreo, Correo } from "@/server/envios/brevo";
import type { ClienteEvolution, Documento } from "@/server/envios/evolution";
import type { ResultadoProveedor } from "@/server/envios/http";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const admin: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", rol: "consul", debeCambiar: false };
const superadmin: Sesion = { ...admin, tipo: "superadmin" };

// Mañana a las 12:00 UTC: siempre dentro del horario de Madrid (13:00 o 14:00) y posterior al «ahora» real.
const base = new Date(); base.setUTCDate(base.getUTCDate() + 1); base.setUTCHours(12, 0, 0, 0);
const en = (s: number) => new Date(base.getTime() + s * 1000);
const sinAzar = () => 0; // pausa mínima: 20 s en WhatsApp, 2 s en correo

type Falsos = { clientes: Clientes; wa: Documento[]; mail: Correo[]; abierta: { v: boolean }; fallar: { v: boolean } };
function falsos(): Falsos {
  const wa: Documento[] = [], mail: Correo[] = [];
  const abierta = { v: true }, fallar = { v: false };
  const resp = (id: string): ResultadoProveedor => (fallar.v ? { ok: false, permanente: false, error: "fallo de prueba" } : { ok: true, idExterno: id });
  const whatsapp: ClienteEvolution = {
    simulado: false, crearInstancia: async () => undefined, conectar: async () => ({ estado: "open", qr: null }),
    resumen: async () => ({ estado: abierta.v ? "open" : "close", numero: "+34000000000", existe: true }), cerrarSesion: async () => undefined,
    enviarDocumento: async (d) => { wa.push(d); return resp(`WA${wa.length}`); },
  };
  const correo: ClienteCorreo = { simulado: false, verificarRemitente: async () => true, enviar: async (c) => { mail.push(c); return resp(`MAIL${mail.length}`); } };
  return { clientes: { whatsapp, correo }, wa, mail, abierta, fallar };
}

let n = 0;
async function ficha(extra: { prueba?: boolean; tel?: string; correo?: string; junta?: number } = {}): Promise<number> {
  n++;
  const cedula = String(9000000000 + n);
  const [r] = await consultarDueno<{ id: number }>(
    "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, correo, telefono_e164, rotulo_credencial, es_prueba) SELECT $1,'APELLIDO PRUEBA','NOMBRE PRUEBA','VOCAL','vocal',id,$2,$3,'H' || lpad(numero::text, 2, '0'),$4 FROM cne.juntas_madrid WHERE serie='H' AND numero=$5 RETURNING id",
    [cedula, extra.correo ?? `prueba${n}@ejemplo.invalid`, extra.tel ?? `+346000${String(n).padStart(5, "0")}`, !!extra.prueba, extra.junta ?? 1]);
  return r.id;
}
const filas = (canal = "whatsapp") => consultarDueno<{ mjrv_id: number; estado: string; simulado: boolean; intentos: number; error: string | null }>("SELECT mjrv_id, estado, simulado, intentos, error FROM cne.envios_credencial WHERE canal = $1 ORDER BY id", [canal]);

async function limpiar() {
  await consultarDueno("DELETE FROM cne.envios_credencial");
  await consultarDueno("DELETE FROM cne.mjrv");
  await consultarDueno("DELETE FROM cne.auditoria WHERE accion = 'envios_reanudados'");
  await consultarDueno("UPDATE cne.configuracion SET whatsapp_real = false, correo_real = false, whatsapp_proximo_en = NULL, correo_proximo_en = NULL, whatsapp_pausa_motivo = NULL, correo_pausa_motivo = NULL, correo_remitente = 'remitente@ejemplo.invalid', correo_remitente_nombre = 'Remitente Prueba'");
}
const encender = (canal: string) => consultarDueno(`UPDATE cne.configuracion SET ${canal}_real = true`);

describe("cola de envío real", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','Admin','x')");
  });
  beforeEach(limpiar);
  afterAll(closePools);

  it("con el interruptor apagado todo sigue simulado y la cola no hace nada", async () => {
    const id = await ficha();
    expect(await enviarCredencial(admin, id, "whatsapp")).toEqual({ ok: true, simulado: true });
    const f = falsos();
    expect(await procesarCola({ ahora: base, clientes: f.clientes })).toMatchObject({ whatsapp: { accion: "omitido", motivo: "interruptor apagado" } });
    expect(f.wa).toHaveLength(0);
    expect((await filas())[0]).toMatchObject({ estado: "enviada_al_servicio", simulado: true });
  });

  it("una simulación previa no bloquea el envío real, pero el envío real sí se protege de duplicados", async () => {
    const id = await ficha();
    expect(await enviarCredencial(admin, id, "whatsapp")).toMatchObject({ ok: true, simulado: true });
    await encender("whatsapp");
    expect(await enviarLote(admin, "whatsapp")).toMatchObject({ enCola: 1 });
    expect(await enviarCredencial(admin, id, "whatsapp")).toMatchObject({ ok: false });
    expect((await filas()).map(({ estado, simulado }) => ({ estado, simulado }))).toEqual([
      { estado: "enviada_al_servicio", simulado: true },
      { estado: "en_cola", simulado: false },
    ]);
  });

  it("un lote manual solo encola las fichas seleccionadas, incluso con identificadores repetidos", async () => {
    await encender("whatsapp");
    await ficha();
    const elegida = await ficha();
    expect(await enviarLote(admin, "whatsapp", undefined, { alcance: "ids", ids: [elegida, elegida] })).toMatchObject({ enCola: 1 });
    expect((await filas()).map((fila) => fila.mjrv_id)).toEqual([elegida]);
  });

  it("la junta filtra una ficha y la zona incluye solo sus juntas", async () => {
    await encender("whatsapp");
    await encender("correo");
    const h1 = await ficha(), h2 = await ficha({ junta: 2 });
    await ficha({ junta: 22 });
    await enviarLote(admin, "whatsapp", undefined, { alcance: "junta", valor: "H2" });
    await enviarLote(admin, "correo", undefined, { alcance: "zona", valor: "amarillo" });
    expect((await filas("whatsapp")).map((fila) => fila.mjrv_id)).toEqual([h2]);
    expect((await filas("correo")).map((fila) => fila.mjrv_id)).toEqual([h1, h2]);
  });

  it("conserva el envío en cola si falta la configuración real del proveedor", async () => {
    await encender("correo");
    const id = await ficha();
    await enviarCredencial(admin, id, "correo");
    const { clientes } = falsos();
    const simulado = { ...clientes.correo, simulado: true };
    expect((await procesarCola({ ahora: base, clientes: { ...clientes, correo: simulado }, canales: ["correo"] })).correo.accion).toBe("pausado");
    expect(await filas("correo")).toMatchObject([{ mjrv_id: id, estado: "en_cola", simulado: false, intentos: 0 }]);
  });

  it("no transmite una credencial al número anterior si cambió después de encolarla", async () => {
    await encender("whatsapp");
    const id = await ficha();
    await enviarCredencial(admin, id, "whatsapp");
    await consultarDueno("UPDATE cne.mjrv SET telefono_e164 = '+34699999999' WHERE id = $1", [id]);
    const f = falsos();
    expect((await procesarCola({ ahora: base, clientes: f.clientes, canales: ["whatsapp"] })).whatsapp.accion).toBe("fallo");
    expect(f.wa).toHaveLength(0);
  });

  it("encendido, el lote solo encola fichas reales (las de demostración salen simuladas) y la cola envía una cada 20–45 s", async () => {
    await encender("whatsapp");
    const a = await ficha(), b = await ficha(), c = await ficha();
    const demo = await ficha({ prueba: true });
    const r = await enviarLote(admin, "whatsapp");
    expect(r).toMatchObject({ enCola: 3, enviadas: 1 });
    expect((await filas()).map((x) => [x.mjrv_id, x.estado, x.simulado])).toEqual([[a, "en_cola", false], [b, "en_cola", false], [c, "en_cola", false], [demo, "enviada_al_servicio", true]]);

    const f = falsos();
    expect(await procesarCola({ ahora: base, azar: sinAzar, clientes: f.clientes, canales: ["whatsapp"] })).toMatchObject({ whatsapp: { accion: "enviado" } });
    expect(f.wa).toHaveLength(1);
    expect(f.wa[0].numero).toMatch(/^\+346000/);
    expect(Buffer.from(f.wa[0].pdfBase64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    // Dentro de la pausa no sale nada.
    expect(await procesarCola({ ahora: en(10), azar: sinAzar, clientes: f.clientes, canales: ["whatsapp"] })).toMatchObject({ whatsapp: { accion: "omitido", motivo: expect.stringContaining("pausa") } });
    expect(f.wa).toHaveLength(1);
    // Pasada la pausa (20 s con azar 0) sale la segunda; con azar 0.999 la pausa llega a ~45 s.
    expect(await procesarCola({ ahora: en(20), azar: () => 0.999, clientes: f.clientes, canales: ["whatsapp"] })).toMatchObject({ whatsapp: { accion: "enviado" } });
    expect(await procesarCola({ ahora: en(20 + 44), azar: sinAzar, clientes: f.clientes, canales: ["whatsapp"] })).toMatchObject({ whatsapp: { accion: "omitido" } });
    expect(await procesarCola({ ahora: en(20 + 46), azar: sinAzar, clientes: f.clientes, canales: ["whatsapp"] })).toMatchObject({ whatsapp: { accion: "enviado" } });
    expect(await procesarCola({ ahora: en(200), azar: sinAzar, clientes: f.clientes, canales: ["whatsapp"] })).toMatchObject({ whatsapp: { accion: "omitido", motivo: "cola vacía" } });
    expect(f.wa).toHaveLength(3);
    expect((await filas()).filter((x) => x.estado === "enviada_al_servicio" && !x.simulado)).toHaveLength(3);
  });

  it("nunca envía fichas de prueba, aunque haya una fila en cola con simulado = false", async () => {
    await encender("whatsapp");
    const demo = await ficha({ prueba: true });
    await consultarDueno("INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, estado, simulado) VALUES ($1,'whatsapp','+34600000000','en_cola',false)", [demo]);
    const f = falsos();
    expect((await procesarCola({ ahora: base, clientes: f.clientes })).whatsapp.accion).toBe("omitido");
    expect(f.wa).toHaveLength(0);
  });

  it("un envío real autorizado adjunta una credencial sin marca PRUEBA aunque Madrid siga en modo prueba", async () => {
    await encender("whatsapp");
    await enviarCredencial(admin, await ficha(), "whatsapp");
    const f = falsos();
    await procesarCola({ ahora: base, clientes: f.clientes, canales: ["whatsapp"] });
    const pdf = await PDFDocument.load(Buffer.from(f.wa[0].pdfBase64, "base64"));
    const contenido = pdf.getPage(0).node.Contents();
    expect(contenido).toBeInstanceOf(PDFArray);
    const texto = inflateSync((contenido as PDFArray).lookup(0, PDFRawStream).getContents()).toString("ascii");
    expect(texto).not.toContain("<505255454241>");
  });

  it("envía también durante la noche", async () => {
    await encender("whatsapp");
    await enviarCredencial(admin, await ficha(), "whatsapp");
    const f = falsos();
    const noche = new Date(base); noche.setUTCHours(2);
    expect(await procesarCola({ ahora: noche, clientes: f.clientes })).toMatchObject({ whatsapp: { accion: "enviado" } });
    expect(f.wa).toHaveLength(1);
  });

  it("continúa después del antiguo tope diario", async () => {
    await encender("whatsapp");
    await consultarDueno("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial) SELECT '80000' || lpad(g::text, 5, '0'), 'APELLIDO PRUEBA', 'N', 'VOCAL', 'vocal', (SELECT id FROM cne.juntas_madrid LIMIT 1), 'H01' FROM generate_series(1, 150) g");
    await consultarDueno("INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, estado, simulado, enviado_en) SELECT id, 'whatsapp', '+34600000000', 'enviada_al_servicio', false, $1 FROM cne.mjrv WHERE cedula LIKE '80000%'", [en(-3600)]);
    await enviarCredencial(admin, await ficha(), "whatsapp");
    const f = falsos();
    expect(await procesarCola({ ahora: base, clientes: f.clientes })).toMatchObject({ whatsapp: { accion: "enviado" } });
    expect((await estadoCola(base)).whatsapp).toMatchObject({ enviadosHoy: 151, enCola: 0 });
  });

  it("pausa tras 5 fallos seguidos y solo la superadmin reanuda", async () => {
    await encender("whatsapp");
    for (let i = 0; i < 8; i++) await enviarCredencial(admin, await ficha(), "whatsapp");
    const f = falsos();
    f.fallar.v = true;
    let t = 0;
    for (let i = 0; i < 4; i++) expect((await procesarCola({ ahora: en(t += 60), azar: sinAzar, clientes: f.clientes })).whatsapp.accion).toBe("fallo");
    expect((await procesarCola({ ahora: en(t += 60), azar: sinAzar, clientes: f.clientes })).whatsapp.accion).toBe("fallo"); // el quinto
    expect(await procesarCola({ ahora: en(t += 60), clientes: f.clientes })).toMatchObject({ whatsapp: { accion: "pausado", motivo: expect.stringContaining("5 fallos") } });
    expect(f.wa).toHaveLength(5);
    await expect(reanudarEnvios(admin, "whatsapp")).rejects.toThrow("superadministración");
    await reanudarEnvios(superadmin, "whatsapp");
    f.fallar.v = false;
    expect(await procesarCola({ ahora: en(t += 60), azar: sinAzar, clientes: f.clientes })).toMatchObject({ whatsapp: { accion: "enviado" } });
    // Un fallo aislado tras reanudar no vuelve a pausar (el contador empezó de cero).
    f.fallar.v = true;
    expect((await procesarCola({ ahora: en(t += 60), azar: sinAzar, clientes: f.clientes })).whatsapp.accion).toBe("fallo");
    expect((await procesarCola({ ahora: en(t += 60), azar: sinAzar, clientes: f.clientes })).whatsapp.accion).toBe("fallo");
    expect((await estadoCola(base)).whatsapp.pausa).toBeNull();
  });

  it("línea de WhatsApp sin vincular: pausa con motivo y no envía", async () => {
    await encender("whatsapp");
    await enviarCredencial(admin, await ficha(), "whatsapp");
    const f = falsos();
    f.abierta.v = false;
    expect(await procesarCola({ ahora: base, clientes: f.clientes })).toMatchObject({ whatsapp: { accion: "pausado", motivo: "La línea de WhatsApp no está vinculada." } });
    expect(f.wa).toHaveLength(0);
    expect((await filas())[0]).toMatchObject({ estado: "en_cola", intentos: 0 });
  });

  it("tras un reinicio, una fila interrumpida pasa a fallo y no se reenvía", async () => {
    await encender("whatsapp");
    const id = await ficha();
    await consultarDueno("INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, estado, simulado, intentos) VALUES ($1,'whatsapp','+34600000000','en_cola',false,1)", [id]);
    const f = falsos();
    // Ni siquiera antes de recuperarla la cola la reclama (intentos = 1).
    expect((await procesarCola({ ahora: base, clientes: f.clientes })).whatsapp.accion).toBe("omitido");
    expect(await recuperarInterrumpidas()).toBe(1);
    expect((await filas())[0]).toMatchObject({ estado: "fallo", error: expect.stringContaining("Interrumpido") });
    expect((await procesarCola({ ahora: en(60), clientes: f.clientes })).whatsapp.accion).toBe("omitido");
    expect(f.wa).toHaveLength(0);
  });

  it("el candado evita que dos procesos envíen a la vez", async () => {
    await encender("whatsapp");
    await enviarCredencial(admin, await ficha(), "whatsapp");
    const otro = new Client({ connectionString: process.env.DATABASE_TEST_URL });
    await otro.connect();
    try {
      await otro.query("SELECT pg_advisory_lock(4343)");
      const f = falsos();
      expect(await procesarCola({ ahora: base, clientes: f.clientes })).toMatchObject({ whatsapp: { accion: "candado" }, correo: { accion: "candado" } });
      expect(f.wa).toHaveLength(0);
    } finally {
      await otro.query("SELECT pg_advisory_unlock(4343)");
      await otro.end();
    }
    const f2 = falsos();
    expect((await procesarCola({ ahora: base, clientes: f2.clientes })).whatsapp.accion).toBe("enviado");
  });

  it("correo: diseño institucional, instrucción del QR móvil y PDF adjunto y sin espera entre turnos", async () => {
    await encender("correo");
    const a = await ficha();
    const nombreArchivo = `H1-${9000000000 + n}.pdf`;
    const b = await ficha();
    await enviarCredencial(admin, a, "correo"); await enviarCredencial(admin, b, "correo");
    const f = falsos();
    expect((await procesarCola({ ahora: base, azar: sinAzar, clientes: f.clientes })).correo.accion).toBe("enviado");
    expect(f.mail[0]).toMatchObject({
      asunto: "Su credencial de MJRV",
      remitente: { nombre: "Remitente Prueba", direccion: "remitente@ejemplo.invalid" },
      adjunto: { nombre: nombreArchivo },
      texto: expect.stringContaining("muestre el código QR en la puerta"),
      html: expect.stringContaining("Consulado General del Ecuador en Madrid"),
    });
    expect(Buffer.from(f.mail[0].adjunto.base64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
    expect((await procesarCola({ ahora: base, azar: sinAzar, clientes: f.clientes })).correo.accion).toBe("enviado");
    expect(f.mail).toHaveLength(2);
  });

  it("el reenvío real conserva el mensaje anterior y admite un solo intento en cola por canal", async () => {
    await encender("whatsapp");
    const id = await ficha();
    const seleccion = { alcance: "ids" as const, ids: [id] };
    const { clientes } = falsos();
    expect(await enviarLote(admin, "whatsapp", undefined, seleccion)).toMatchObject({ enCola: 1 });
    expect((await procesarCola({ ahora: base, azar: sinAzar, clientes })).whatsapp.accion).toBe("enviado");
    const resultados = await Promise.all([
      enviarLote(admin, "whatsapp", undefined, seleccion, true),
      enviarLote(admin, "whatsapp", undefined, seleccion, true),
    ]);
    expect(resultados.map((r) => r.enCola).sort()).toEqual([0, 1]);
    expect((await filas()).map((fila) => fila.estado)).toEqual(["enviada_al_servicio", "en_cola"]);
    expect((await procesarCola({ ahora: en(20), azar: sinAzar, clientes })).whatsapp.accion).toBe("enviado");
    // La imagen anterior todavía depende del índice para detectar un envío existente.
    expect(await consultarDueno(
      "INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, estado, simulado) VALUES ($1,'whatsapp','+34600000000','en_cola',false) ON CONFLICT DO NOTHING RETURNING id", [id],
    )).toEqual([]);
  });
});

describe("interruptores", () => {
  const guardado = process.env.HOST_MADRID;
  beforeAll(async () => { await reiniciarBase(); });
  beforeEach(async () => { await limpiar(); process.env.HOST_MADRID = "madrid.ejemplo.invalid"; });
  afterAll(async () => { if (guardado === undefined) delete process.env.HOST_MADRID; else process.env.HOST_MADRID = guardado; await closePools(); });

  const simulados = (): Clientes => {
    const { clientes } = falsos();
    return { whatsapp: { ...clientes.whatsapp, simulado: true }, correo: { ...clientes.correo, simulado: true } };
  };
  const estado = async () => (await consultarDueno<{ whatsapp_real: boolean; correo_real: boolean }>("SELECT whatsapp_real, correo_real FROM cne.configuracion"))[0];

  it("nacen apagados y solo la superadmin los toca", async () => {
    expect(await estado()).toEqual({ whatsapp_real: false, correo_real: false });
    await expect(cambiarInterruptor(admin, "whatsapp", true, "ENVIO REAL", falsos().clientes)).rejects.toThrow("superadministración");
  });

  it("encender exige la frase y deja auditoría; con todo en orden se enciende y se apaga", async () => {
    const c = falsos().clientes;
    expect(await cambiarInterruptor(superadmin, "whatsapp", true, "si", c)).toMatchObject({ ok: false, mensaje: expect.stringContaining("ENVIO REAL") });
    expect(await cambiarInterruptor(superadmin, "whatsapp", true, "envío real", c)).toEqual({ ok: true });
    expect((await estado()).whatsapp_real).toBe(true);
    expect(await cambiarInterruptor(superadmin, "whatsapp", false, "", c)).toEqual({ ok: true });
    expect((await estado()).whatsapp_real).toBe(false);
    const acc = await consultarDueno<{ accion: string }>("SELECT accion FROM cne.auditoria WHERE accion LIKE 'envio_real_%' ORDER BY id");
    expect(acc.map((a) => a.accion)).toEqual(["envio_real_encendido", "envio_real_apagado"]);
  });

  it("no se enciende sin clave, sin línea vinculada, sin remitente ni sin HOST_MADRID", async () => {
    const msg = async (canal: "whatsapp" | "correo", c: Clientes) => { const r = await cambiarInterruptor(superadmin, canal, true, "ENVIO REAL", c); return r.ok ? "" : r.mensaje; };
    expect(await msg("whatsapp", simulados())).toContain("clave de Evolution");
    expect(await msg("correo", simulados())).toContain("clave de Brevo");
    const sinLinea = falsos(); sinLinea.abierta.v = false;
    expect(await msg("whatsapp", sinLinea.clientes)).toContain("no está vinculada");
    delete process.env.HOST_MADRID;
    expect(await msg("whatsapp", falsos().clientes)).toContain("HOST_MADRID");
    process.env.HOST_MADRID = "madrid.ejemplo.invalid";
    // Correo: sin nombre de remitente no se enciende (Q-D2), aunque exista la dirección.
    await consultarDueno("UPDATE cne.configuracion SET correo_remitente = 'remitente@ejemplo.invalid', correo_remitente_nombre = NULL");
    expect(await msg("correo", falsos().clientes)).toContain("nombre del remitente");
    expect(await guardarRemitente(superadmin, "remitente@ejemplo.invalid", "Remitente Prueba")).toEqual({ ok: true });
    expect(await msg("correo", falsos().clientes)).toBe("");
    expect((await estado()).whatsapp_real).toBe(false);
  });

  it("guardar remitente valida dirección y nombre", async () => {
    expect((await guardarRemitente(superadmin, "no-es-correo", "Nombre")).ok).toBe(false);
    expect((await guardarRemitente(superadmin, "a@b.invalid", "")).ok).toBe(false);
  });
});

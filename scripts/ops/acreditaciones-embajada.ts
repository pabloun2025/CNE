import { createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import type { PoolClient } from "pg";
import { validarMovil } from "../../src/domain/ingreso";
import { masterKey } from "../../src/server/crypto";
import { closePools, getAppPool } from "../../src/server/db";
import { loadEnv } from "../../src/server/env";
import { listarEnlaces } from "../../src/server/estaciones";
import { BrevoHttp } from "../../src/server/envios/brevo";
import { pedirJson, type FetchLike, type Raw } from "../../src/server/envios/http";

const TOTAL = 11;
const MAX_ENTRADA = 32 * 1024;
const MAX_PDF = 4 * 1024 * 1024;
const ORIGEN = "https://madrid.consulado.app";
const CANDADO = 470127;
const BREVO_REMITENTE = { direccion: "avisos@consulado.app", nombre: "Consulado General del Ecuador en Madrid" };
const BREVO_RESPUESTAS = "cecumadrid@cancilleria.gob.ec";
const SMS_REMITENTE = "+34913430250";
const SMS_PUBLI = "https://api.gateway360.com/api/3.0";
const sinRedireccion: FetchLike = (url, init) => fetch(url, { ...init, redirect: "error" });

const texto = (maximo: number) => z.string().trim().min(1).max(maximo).refine((valor) => !/[\p{Cc}\p{Cf}]/u.test(valor));
const entrada = z.strictObject({
  nombre: texto(150), cargo: texto(100), email: z.string().trim().max(254).pipe(z.email()),
  movil: z.string().trim().min(7).max(32), token: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
});
type Ficha = z.infer<typeof entrada> & { tokenHash: string; contactosHash: string; url: string };
type Canal = "correo" | "sms";
type Estado = "en_curso" | "incierto" | "aceptado" | "rechazado";
type Resultado = Exclude<Estado, "en_curso">;
type Fila = { token_hash: string; nombre: string; cargo: string; contactos_hash: string; revocada_en: Date | null };

class Fallo extends Error {}

export function prepararLote(contenido: string): Ficha[] {
  let valor: unknown;
  try { valor = JSON.parse(contenido); }
  catch { throw new Fallo("loteInvalido"); }
  const validado = z.array(entrada).length(TOTAL).safeParse(valor);
  if (!validado.success) throw new Fallo("loteInvalido");

  const fichas = validado.data.map((ficha) => {
    const movil = validarMovil(ficha.movil);
    if (!movil.ok || !movil.telefono || !/^\+[1-9]\d{7,14}$/.test(movil.telefono)) throw new Fallo("loteInvalido");
    const email = ficha.email.toLowerCase();
    const tokenHash = createHash("sha256").update(ficha.token).digest("hex");
    const contactosHash = createHmac("sha256", masterKey())
      .update(JSON.stringify(["cne/embajada/contactos/v1", tokenHash, email, movil.telefono])).digest("hex");
    return { ...ficha, nombre: ficha.nombre.normalize("NFC"), cargo: ficha.cargo.normalize("NFC"), email,
      movil: movil.telefono, tokenHash, contactosHash, url: `${ORIGEN}/v/${ficha.token}` };
  });
  for (const campo of ["tokenHash", "email", "movil"] as const) {
    if (new Set(fichas.map((ficha) => ficha[campo])).size !== TOTAL) throw new Fallo("duplicados");
  }
  return fichas;
}

async function leerLote(): Promise<Ficha[]> {
  const partes: Buffer[] = [];
  let bytes = 0;
  for await (const parte of process.stdin) {
    const bloque = Buffer.from(parte);
    bytes += bloque.length;
    if (bytes > MAX_ENTRADA) throw new Fallo("loteInvalido");
    partes.push(bloque);
  }
  return prepararLote(Buffer.concat(partes).toString("utf8"));
}

const coincide = (fila: Fila | undefined, ficha: Ficha) => !!fila && fila.revocada_en === null
  && fila.nombre === ficha.nombre && fila.cargo === ficha.cargo && fila.contactos_hash === ficha.contactosHash;

async function leerRegistradas(client: PoolClient, fichas: Ficha[]) {
  const { rows } = await client.query<Fila>(
    "SELECT token_hash, nombre, cargo, contactos_hash, revocada_en FROM cne.acreditaciones_embajada",
  );
  if (!rows.length) return 0;
  const porHash = new Map(rows.map((fila) => [fila.token_hash, fila]));
  if (rows.length !== TOTAL || fichas.some((ficha) => !coincide(porHash.get(ficha.tokenHash), ficha))) {
    throw new Fallo("loteNoCoincide");
  }
  return rows.length;
}

async function activar(client: PoolClient, fichas: Ficha[]) {
  await client.query("BEGIN");
  try {
    const existentes = await leerRegistradas(client, fichas);
    if (!existentes) {
      for (const ficha of fichas) {
        await client.query(
          "INSERT INTO cne.acreditaciones_embajada (token_hash, nombre, cargo, contactos_hash) VALUES ($1,$2,$3,$4)",
          [ficha.tokenHash, ficha.nombre, ficha.cargo, ficha.contactosHash],
        );
      }
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ registradas: TOTAL, nuevas: TOTAL - existentes }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function descargarPdf(ficha: Ficha): Promise<Buffer> {
  const r = await fetch(ficha.url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (r.status !== 200 || !/^application\/pdf(?:;|$)/i.test(r.headers.get("content-type") ?? "")
    || !/^inline(?:;|$)/i.test(r.headers.get("content-disposition") ?? "") || !r.body) {
    await r.body?.cancel();
    throw new Fallo("pdfInvalido");
  }
  const lector = r.body.getReader();
  const partes: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_PDF) throw new Fallo("pdfInvalido");
      partes.push(value);
    }
  } catch (error) {
    await lector.cancel().catch(() => undefined);
    throw error;
  } finally {
    lector.releaseLock();
  }
  const pdf = Buffer.concat(partes);
  if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-" || (await PDFDocument.load(pdf, { throwOnInvalidObject: true })).getPageCount() !== 1) {
    throw new Fallo("pdfInvalido");
  }
  return pdf;
}

async function comprobarPdfs(fichas: Ficha[]) {
  const respuestas = await Promise.allSettled(fichas.map(descargarPdf));
  const validos = respuestas.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
  console.log(JSON.stringify({ pdfValidos: validos.length, pdfFallidos: TOTAL - validos.length }));
  if (validos.length !== TOTAL) throw new Fallo("validacionPdfFallida");
  return validos;
}

async function comprobarPuerta(fichas: Ficha[]) {
  const token = (await listarEnlaces()).find((enlace) => enlace.activo && enlace.funcion === "puerta" && enlace.token)?.token;
  if (!token) throw new Fallo("puertaSinEnlace");
  const resultados = await Promise.allSettled(fichas.map(async (ficha) => {
    // Un pase de Embajada se puede verificar varias veces sin crear una lectura de MJRV.
    for (let intento = 0; intento < 2; intento++) {
      const r = await fetch(`${ORIGEN}/api/e/puerta`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ codigo: ficha.url, origen: "codigo" }),
      });
      if (!r.ok) {
        await r.body?.cancel();
        return false;
      }
      const { lectura } = await r.json() as { lectura?: { resultado?: string; nombre?: string; cargo?: string } };
      if (lectura?.resultado !== "autorizado_embajada" || lectura.nombre !== ficha.nombre || lectura.cargo !== ficha.cargo) return false;
    }
    return true;
  }));
  const autorizadas = resultados.filter((r) => r.status === "fulfilled" && r.value).length;
  console.log(JSON.stringify({ puertaValidas: autorizadas, puertaFallidas: TOTAL - autorizadas }));
  if (autorizadas !== TOTAL) throw new Fallo("validacionPuertaFallida");
}

const smsTexto = (ficha: Ficha) => `Acreditacion Embajada del Ecuador. Presente el QR de su acreditacion: ${ficha.url}`;

function estadoSms(raw: Raw): Resultado {
  if (raw.kind === "network") return raw.sent === "no" ? "rechazado" : "incierto";
  if (raw.status >= 400 && raw.status < 500 && raw.status !== 408 && raw.status !== 409) return "rechazado";
  if (raw.status < 200 || raw.status >= 300) return "incierto";
  const datos = raw.json as { status?: unknown; result?: unknown } | null;
  const fila = Array.isArray(datos?.result) && datos.result.length === 1 ? datos.result[0] : null;
  if (datos?.status === "ok" && fila?.status === "ok" && typeof fila.sms_id === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(fila.sms_id)) {
    return "aceptado";
  }
  if ((datos?.status === "error" || fila?.status === "error") && fila?.status !== "ok" && !fila?.sms_id) return "rechazado";
  return "incierto";
}

async function enviarSms(ficha: Ficha, apiKey: string): Promise<Resultado> {
  const mensaje = smsTexto(ficha);
  // Solo caracteres de la tabla básica GSM7, con un septeto por carácter.
  if (mensaje.length > 160 || !/^[ A-Za-z0-9.:/_-]+$/.test(mensaje)) return "rechazado";
  return estadoSms(await pedirJson(sinRedireccion, `${SMS_PUBLI}/sms/send`, {
    method: "POST", timeoutMs: 15000,
    body: {
      api_key: apiKey, encoding: "GSM7", concat: 0,
      messages: [{ from: SMS_REMITENTE, to: ficha.movil.slice(1), text: mensaje }],
    },
  }));
}

async function enviarCorreo(ficha: Ficha, pdf: Buffer, proveedor: BrevoHttp): Promise<Resultado> {
  const r = await proveedor.enviar({
    para: ficha.email, asunto: "Su acreditación para las elecciones del Ecuador en Madrid",
    texto: `Estimada/o ${ficha.nombre}:\n\nAdjuntamos su acreditación de la Embajada del Ecuador para la jornada electoral del 29 de noviembre en la Caja Mágica. Presente el QR al llegar.\n\nTambién puede abrir su acreditación aquí:\n${ficha.url}\n\nConsulado General del Ecuador en Madrid`,
    remitente: BREVO_REMITENTE, responderA: BREVO_RESPUESTAS,
    adjunto: { nombre: "acreditacion-embajada.pdf", base64: pdf.toString("base64") },
  });
  return r.ok ? "aceptado" : r.incierto ? "incierto" : "rechazado";
}

async function estado(client: PoolClient) {
  const { rows: [lote] } = await client.query<{ registradas: number; activas: number }>(
    "SELECT count(*)::int AS registradas, count(*) FILTER (WHERE revocada_en IS NULL)::int AS activas FROM cne.acreditaciones_embajada",
  );
  const { rows } = await client.query<{ canal: Canal; estado: Estado; total: number; activas: number }>(
    `SELECT e.canal, e.estado, count(*)::int AS total, count(*) FILTER (WHERE a.revocada_en IS NULL)::int AS activas
       FROM cne.acreditaciones_embajada_envios e JOIN cne.acreditaciones_embajada a USING (token_hash)
       GROUP BY e.canal, e.estado`,
  );
  const inicial = () => ({ pendientes: lote.activas, en_curso: 0, incierto: 0, aceptado: 0, rechazado: 0 });
  const resultado = { ...lote, revocadas: lote.registradas - lote.activas, correo: inicial(), sms: inicial() };
  for (const fila of rows) {
    resultado[fila.canal][fila.estado] = fila.total;
    resultado[fila.canal].pendientes -= fila.activas;
  }
  return resultado;
}

async function intentar(client: PoolClient, ficha: Ficha, canal: Canal, entregar: () => Promise<Resultado>) {
  // La reserva se confirma antes de contactar al proveedor. Cualquier reserva anterior impide otro intento.
  const reserva = await client.query(
    `INSERT INTO cne.acreditaciones_embajada_envios (token_hash, canal, estado)
       SELECT token_hash, $2, 'en_curso' FROM cne.acreditaciones_embajada
        WHERE token_hash = $1 AND nombre = $3 AND cargo = $4 AND contactos_hash = $5 AND revocada_en IS NULL
       ON CONFLICT (token_hash, canal) DO NOTHING`, [ficha.tokenHash, canal, ficha.nombre, ficha.cargo, ficha.contactosHash],
  );
  if (!reserva.rowCount) return;
  const resultado = await entregar().catch((): Resultado => "incierto");
  await client.query(
    `UPDATE cne.acreditaciones_embajada_envios SET estado = $3, actualizado_en = now()
      WHERE token_hash = $1 AND canal = $2 AND estado = 'en_curso'`, [ficha.tokenHash, canal, resultado],
  );
}

async function enviar(client: PoolClient, fichas: Ficha[], pdfs: Buffer[]) {
  // Este proceso posee el candado. Las reservas anteriores quedaron interrumpidas.
  await client.query("UPDATE cne.acreditaciones_embajada_envios SET estado = 'incierto', actualizado_en = now() WHERE estado = 'en_curso'");
  const previo = await estado(client);
  const claveBrevo = process.env.BREVO_API_KEY?.trim();
  const claveSms = process.env.SMSPUBLI_API?.trim();
  const correo = claveBrevo ? new BrevoHttp({ apiKey: claveBrevo, fetch: sinRedireccion }) : null;
  const [correoListo, smsListo] = await Promise.all([
    previo.correo.pendientes > 0 && correo?.verificarRemitente(BREVO_REMITENTE.direccion).catch(() => false),
    previo.sms.pendientes > 0 && claveSms && pedirJson(sinRedireccion, `${SMS_PUBLI}/account/get-balance`, {
      body: { api_key: claveSms }, method: "POST", timeoutMs: 10000,
    }).then((r) => r.kind === "response" && r.status === 200 && (r.json as { status?: unknown } | null)?.status === "ok").catch(() => false),
  ]);
  console.log(JSON.stringify({
    correoSinProveedor: correoListo ? 0 : previo.correo.pendientes,
    smsSinProveedor: smsListo ? 0 : previo.sms.pendientes,
  }));
  for (const [i, ficha] of fichas.entries()) {
    if (correo && correoListo) await intentar(client, ficha, "correo", () => enviarCorreo(ficha, pdfs[i], correo));
    if (claveSms && smsListo) await intentar(client, ficha, "sms", () => enviarSms(ficha, claveSms));
  }
  const final = await estado(client);
  console.log(JSON.stringify(final));
  if (final.correo.aceptado !== TOTAL || final.sms.aceptado !== TOTAL) process.exitCode = 1;
}

async function main() {
  const modo = process.argv[2];
  if (process.argv.length !== 3 || !["verificar", "activar", "enviar", "estado"].includes(modo)) throw new Fallo("modoInvalido");
  loadEnv();
  const fichas = modo === "estado" ? [] : await leerLote();
  const client = await (await getAppPool()).connect();
  try {
    if (modo === "estado") {
      console.log(JSON.stringify(await estado(client)));
      return;
    }
    const { rows: [lock] } = await client.query<{ tomado: boolean }>("SELECT pg_try_advisory_lock($1) AS tomado", [CANDADO]);
    if (!lock.tomado) throw new Fallo("operacionEnCurso");
    try {
      if (modo === "activar") return await activar(client, fichas);
      const registradas = await leerRegistradas(client, fichas);
      console.log(JSON.stringify({ validadas: TOTAL, registradas }));
      if (!registradas && modo === "verificar") return;
      if (!registradas) throw new Fallo("loteSinActivar");
      const pdfs = await comprobarPdfs(fichas);
      await comprobarPuerta(fichas);
      if (modo === "enviar") await enviar(client, fichas, pdfs);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [CANDADO]);
    }
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ [error instanceof Fallo ? error.message : "errorOperacion"]: 1 }));
    process.exitCode = 1;
  }).finally(() => closePools().catch(() => { process.exitCode = 1; }));
}

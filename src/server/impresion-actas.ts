import { PDFDocument } from "pdf-lib";
import type { ActorPago } from "./finanzas";
import { fichaPago, generarActa } from "./finanzas";
import { query } from "./db";

export type ModoRecibo = "impresion" | "digital";

export async function leerModoRecibo(): Promise<ModoRecibo> {
  const [r] = await query<{ modo_recibo: string }>("SELECT modo_recibo FROM configuracion WHERE id = 1");
  return r?.modo_recibo === "digital" ? "digital" : "impresion";
}

export async function fijarModoRecibo(modo: ModoRecibo): Promise<void> {
  await query("UPDATE configuracion SET modo_recibo = $1, actualizado_en = now() WHERE id = 1", [modo]);
}

export type ResultadoEscaneo =
  | { ok: true; modo: "impresion"; junta: string; nombre: string }
  | { ok: true; modo: "digital"; mjrvId: number; junta: string; nombre: string }
  | { ok: false; mensaje: string };

// Un escaneo hace una sola cosa. No abre el recibo y no confirma el pago.
export async function escanearParaRecibo(actor: ActorPago, cedula: string): Promise<ResultadoEscaneo> {
  const f = await fichaPago(cedula);
  if (!f) return { ok: false, mensaje: "No encontramos esa cédula." };
  if (!f.activo) return { ok: false, mensaje: "La ficha está de baja." };
  if (f.pago) return { ok: false, mensaje: "Ya pagado. No vuelva a pagar." };
  if (!f.documentosCompletos) return { ok: false, mensaje: "Faltan las fotos de la cédula." };
  const modo = await leerModoRecibo();
  if (modo === "digital") return { ok: true, modo, mjrvId: f.mjrvId, junta: f.juntaVigente, nombre: f.nombre };
  const ya = await query("SELECT id FROM pendientes_impresion WHERE mjrv_id = $1 AND impreso_en IS NULL", [f.mjrvId]);
  if (!ya[0]) await query("INSERT INTO pendientes_impresion (mjrv_id, junta, usuario_id) VALUES ($1,$2,$3)", [f.mjrvId, f.juntaVigente, actor.usuarioId ?? null]);
  return { ok: true, modo: "impresion", junta: f.juntaVigente, nombre: f.nombre };
}

export async function listarPendientes(): Promise<{ id: number; junta: string; nombre: string }[]> {
  return query<{ id: number; junta: string; nombre: string }>(
    `SELECT p.id, p.junta, m.apellidos || ', ' || m.nombres AS nombre
       FROM pendientes_impresion p JOIN mjrv m ON m.id = p.mjrv_id
      WHERE p.impreso_en IS NULL ORDER BY p.creado_en, p.id`,
  );
}

// El clic imprime el acta que ya genera el sistema. No abre otra pantalla y no confirma el pago.
export async function imprimirPendiente(actor: ActorPago, id: number): Promise<{ ok: true; pdf: Uint8Array; junta: string } | { ok: false; mensaje: string }> {
  const [fila] = await query<{ mjrv_id: number; junta: string }>("SELECT mjrv_id, junta FROM pendientes_impresion WHERE id = $1 AND impreso_en IS NULL", [id]);
  if (!fila) return { ok: false, mensaje: "Esa acta ya no está pendiente." };
  const acta = await generarActa(actor, fila.mjrv_id, true);
  if (!acta.ok) return { ok: false, mensaje: acta.mensaje };
  const marcada = await query("UPDATE pendientes_impresion SET impreso_en = now() WHERE id = $1 AND impreso_en IS NULL RETURNING id", [id]);
  if (!marcada[0]) return { ok: false, mensaje: "Esa acta ya no está pendiente." };
  return { ok: true, pdf: acta.pdf, junta: fila.junta };
}

// La firma se guarda en el PDF. No confirma que el dinero se entregó.
export async function guardarFirma(actor: ActorPago, mjrvId: number, png: Buffer): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  if (await leerModoRecibo() !== "digital") return { ok: false, mensaje: "El modo digital no está activado." };
  if (png.length < 80 || png.length > 500_000) return { ok: false, mensaje: "La firma no es válida." };
  const acta = await generarActa(actor, mjrvId, true, png);
  if (!acta.ok) return { ok: false, mensaje: acta.mensaje };
  await query("INSERT INTO firmas_recibo (mjrv_id, usuario_id, pdf) VALUES ($1,$2,$3)", [mjrvId, actor.usuarioId ?? null, acta.pdf]);
  return { ok: true };
}

export async function loteFirmas(): Promise<Uint8Array | null> {
  const filas = await query<{ pdf: Buffer }>("SELECT pdf FROM firmas_recibo ORDER BY creado_en, id");
  if (!filas.length) return null;
  const salida = await PDFDocument.create();
  for (const f of filas) {
    const doc = await PDFDocument.load(f.pdf);
    const paginas = await salida.copyPages(doc, doc.getPageIndices());
    paginas.forEach((p) => salida.addPage(p));
  }
  return salida.save();
}

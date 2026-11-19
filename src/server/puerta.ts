import { query, withTx } from "./db";
import type { SesionEstacion } from "./estaciones";
import { ZONA_NOMBRE, type ZonaColor } from "../domain/juntas";
import { buscarNombreCamara, buscarPorNombre, normalizarCodigo, normalizarNombre } from "../domain/puerta-nombre";
import { claveAcceso, credencialRevocada, mjrvRevocado } from "./revocar-credencial";

export type Lectura =
  | { resultado: "valido"; nombre: string; junta: string; zona: string }
  | { resultado: "duplicado"; desde: string; mjrvId: number; nombre: string; junta: string }
  | { resultado: "desconocido" }
  | { resultado: "bloqueado" }
  | { resultado: "ambiguo" }
  | { resultado: "revocado" };

type FichaPuerta = { id: number; activo: boolean; apellidos: string; nombres: string; cedula: string };

// Ingreso idempotente (01 §5): el índice único (mjrv_id, es_prueba) WHERE valido impide dos ingresos aunque dos puertas lean a la vez.
// camara: el texto lo leyó la cámara. Si no identifica a una sola persona, no anota nada: se teclea.
export function registrarLectura(s: SesionEstacion, codigoBruto: string, dispositivo: string | null, camara?: false): Promise<Lectura>;
export function registrarLectura(s: SesionEstacion, codigoBruto: string, dispositivo: string | null, camara: true): Promise<Lectura | null>;
export async function registrarLectura(s: SesionEstacion, codigoBruto: string, dispositivo: string | null, camara = false): Promise<Lectura | null> {
  const compacto = normalizarCodigo(codigoBruto).slice(0, 40);
  const clave = claveAcceso(codigoBruto).slice(0, 200);
  return withTx(async (client) => {
    const dev = (dispositivo ?? "").slice(0, 100) || null;
    const anotarRevocado = async (mjrvId: number | null, leido: string) => {
      await client.query("INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo) VALUES ($1, $2, 'revocado', $3, $4, $5)", [leido, mjrvId, s.operadorId, s.enlaceId, dev]);
      return { resultado: "revocado" as const };
    };
    // Una credencial revocada no pasa, ni por cédula ni por el nombre impreso.
    const rev = await credencialRevocada(client, compacto, clave);
    if (rev) return anotarRevocado(rev.mjrvId, (compacto || clave).slice(0, 80));
    const porCedula = async (cedula: string) =>
      (await client.query<FichaPuerta>("SELECT id, activo, apellidos, nombres, cedula FROM mjrv WHERE cedula = $1", [cedula])).rows[0];
    let m = compacto ? await porCedula(compacto) : undefined;
    let codigo = compacto;
    if (!m) {
      const digitos = codigoBruto.match(/\d{10,20}/)?.[0];
      if (digitos && digitos !== compacto) {
        m = await porCedula(digitos);
        if (m) codigo = digitos;
      }
    }
    if (!m && /[A-Z]/.test(normalizarNombre(codigoBruto))) {
      const lista = (await client.query<FichaPuerta>("SELECT id, activo, apellidos, nombres, cedula FROM mjrv")).rows;
      const hallados = camara ? buscarNombreCamara(codigoBruto, lista) : buscarPorNombre(codigoBruto, lista);
      if (hallados.length > 1) return camara ? null : { resultado: "ambiguo" as const };
      if (hallados.length === 1) {
        m = hallados[0];
        codigo = normalizarNombre(codigoBruto).slice(0, 80);
      }
    }
    if (!m && camara) return null;
    if (m && await mjrvRevocado(client, m.id)) return anotarRevocado(m.id, codigo);
    // Junta vigente (la del último movimiento aceptado, si hay).
    const juntaVigente = async (id: number) => {
      const j = (await client.query<{ serie: string; numero: number; zona_color: ZonaColor }>(
        `SELECT j.serie, j.numero, j.zona_color FROM juntas_madrid j WHERE j.id = coalesce(
           (SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = $1 AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1),
           (SELECT junta_origen_id FROM mjrv WHERE id = $1))`, [id])).rows[0];
      // Sin fila de junta el ingreso es válido igual: la pantalla no debe caer en «No se pudo comprobar».
      if (!j) return { junta: "—", zona: "—" };
      return { junta: `${j.serie}${j.numero}`, zona: ZONA_NOMBRE[j.zona_color] ?? "—" };
    };
    if (!m) {
      await client.query("INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo) VALUES ($1, NULL, 'desconocido', $2, $3, $4)", [codigo, s.operadorId, s.enlaceId, dev]);
      return { resultado: "desconocido" as const };
    }
    const r = await client.query<{ resultado: string }>(
      `INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo)
       VALUES ($1, $2, CASE WHEN $5 THEN 'valido' ELSE 'bloqueado' END, $3, $4, $6)
       ON CONFLICT (mjrv_id, es_prueba) WHERE resultado = 'valido' DO NOTHING RETURNING resultado`,
      [codigo, m.id, s.operadorId, s.enlaceId, m.activo, dev]);
    if (!r.rows[0]) {
      const previa = (await client.query<{ creado_en: string }>("SELECT creado_en::text FROM lecturas_puerta WHERE mjrv_id = $1 AND resultado = 'valido'", [m.id])).rows[0];
      await client.query("INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo) VALUES ($1, $2, 'duplicado', $3, $4, $5)", [codigo, m.id, s.operadorId, s.enlaceId, dev]);
      return { resultado: "duplicado" as const, desde: previa.creado_en, mjrvId: m.id, nombre: `${m.apellidos}, ${m.nombres}`, junta: (await juntaVigente(m.id)).junta };
    }
    if (r.rows[0].resultado === "bloqueado") return { resultado: "bloqueado" as const };
    const j = await juntaVigente(m.id);
    return { resultado: "valido" as const, nombre: `${m.apellidos}, ${m.nombres}`, junta: j.junta, zona: j.zona };
  });
}

// Contadores del modo actual (el filtro de modo lo pone la RLS).
export async function contadoresPuerta(enlaceId: number): Promise<{ total: number; esteEnlace: number }> {
  const f = await query<{ total: number; este: number }>("SELECT count(*)::int AS total, count(*) FILTER (WHERE enlace_id = $1)::int AS este FROM lecturas_puerta WHERE resultado = 'valido'", [enlaceId]);
  return { total: f[0].total, esteEnlace: f[0].este };
}

export type ResultadoPase = { ok: true } | { ok: false; status: 404 | 409; mensaje: string };

// «Dejar pasar» un reingreso (09 §3.3): queda registrado con operador y puesto, pero no cuenta como segundo ingreso
// (lecturas_un_ingreso y los contadores solo miran «valido»). Solo se puede si la persona ya ingresó una vez.
export async function dejarPasar(s: SesionEstacion, mjrvId: number): Promise<ResultadoPase> {
  return withTx(async (client) => {
    const m = (await client.query<{ cedula: string; activo: boolean }>("SELECT cedula, activo FROM mjrv WHERE id = $1", [mjrvId])).rows[0];
    if (!m || !m.activo) return { ok: false as const, status: 404 as const, mensaje: "La ficha no existe o está de baja." };
    if (await mjrvRevocado(client, mjrvId)) return { ok: false as const, status: 409 as const, mensaje: "La credencial está revocada." };
    const previa = (await client.query("SELECT 1 FROM lecturas_puerta WHERE mjrv_id = $1 AND resultado = 'valido'", [mjrvId])).rows[0];
    if (!previa) return { ok: false as const, status: 409 as const, mensaje: "Esta persona aún no ha ingresado." };
    await client.query("INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id) VALUES ($1, $2, 'reingreso_autorizado', $3, $4)", [m.cedula, mjrvId, s.operadorId, s.enlaceId]);
    return { ok: true as const };
  });
}

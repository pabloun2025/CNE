import type { PoolClient } from "pg";
import { query, withTx } from "./db";
import type { SesionEstacion } from "./estaciones";
import { ZONA_NOMBRE, type ZonaColor } from "../domain/juntas";
import { buscarNombreCamara, buscarPorNombre, cedulaManualValida, cedulasDeCamara, normalizarCodigo, normalizarNombre, type PersonaLista } from "../domain/puerta-nombre";
import { claveAcceso, credencialRevocada, mjrvRevocado } from "./revocar-credencial";

export type Lectura =
  | { resultado: "valido"; nombre: string; junta: string; zona: string }
  | { resultado: "duplicado"; desde: string; mjrvId: number; nombre: string; junta: string }
  | { resultado: "desconocido" }
  | { resultado: "bloqueado" }
  | { resultado: "ambiguo" }
  | { resultado: "revocado" };

export type Coincidencia = { resultado: "pendiente"; mjrvId: number; cedula: string; nombre: string; junta: string };

type FichaPuerta = { id: number; activo: boolean; apellidos: string; nombres: string; cedula: string };

const CAMPOS_FICHA = "id, activo, apellidos, nombres, cedula";
const nombreDe = (m: FichaPuerta) => `${m.apellidos}, ${m.nombres}`;
const dispositivoDe = (dispositivo: string | null) => (dispositivo ?? "").slice(0, 100) || null;
// Mantiene el modo de las lecturas hasta terminar su registro.
const fijarModo = (client: PoolClient) => client.query("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");

async function juntaVigente(client: PoolClient, id: number) {
  const j = (await client.query<{ serie: string; numero: number; zona_color: ZonaColor }>(
    `SELECT j.serie, j.numero, j.zona_color FROM juntas_madrid j WHERE j.id = coalesce(
       (SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = $1 AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1),
       (SELECT junta_origen_id FROM mjrv WHERE id = $1))`, [id])).rows[0];
  return j ? { junta: `${j.serie}${j.numero}`, zona: ZONA_NOMBRE[j.zona_color] ?? "—" } : { junta: "—", zona: "—" };
}

async function anotarResultado(client: PoolClient, s: SesionEstacion, codigo: string, dispositivo: string | null, mjrvId: number | null, resultado: "revocado" | "desconocido" | "duplicado") {
  await client.query(
    "INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo) VALUES ($1, $2, $3, $4, $5, $6)",
    [codigo, mjrvId, resultado, s.operadorId, s.enlaceId, dispositivoDe(dispositivo)],
  );
}

async function registrarFicha(client: PoolClient, s: SesionEstacion, ficha: FichaPuerta, codigo: string, dispositivo: string | null): Promise<Lectura> {
  // La baja y la revocación de la ficha se ordenan con respecto al ingreso.
  const m = (await client.query<FichaPuerta>(`SELECT ${CAMPOS_FICHA} FROM mjrv WHERE id = $1 FOR UPDATE`, [ficha.id])).rows[0];
  if (!m || m.cedula !== ficha.cedula || m.nombres !== ficha.nombres || m.apellidos !== ficha.apellidos) return { resultado: "desconocido" };
  if (await mjrvRevocado(client, m.id)) {
    await anotarResultado(client, s, codigo, dispositivo, m.id, "revocado");
    return { resultado: "revocado" };
  }

  // El índice único impide dos ingresos de la misma ficha en el modo actual.
  const r = await client.query<{ resultado: "valido" | "bloqueado" }>(
    `INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo)
     VALUES ($1, $2, CASE WHEN $5 THEN 'valido' ELSE 'bloqueado' END, $3, $4, $6)
     ON CONFLICT (mjrv_id, es_prueba) WHERE resultado = 'valido' DO NOTHING RETURNING resultado`,
    [codigo, m.id, s.operadorId, s.enlaceId, m.activo, dispositivoDe(dispositivo)]);
  if (r.rows[0]?.resultado === "bloqueado") return { resultado: "bloqueado" };
  const j = await juntaVigente(client, m.id);
  if (r.rows[0]) return { resultado: "valido", nombre: nombreDe(m), ...j };

  const previa = (await client.query<{ creado_en: string }>("SELECT creado_en::text FROM lecturas_puerta WHERE mjrv_id = $1 AND resultado = 'valido'", [m.id])).rows[0];
  await anotarResultado(client, s, codigo, dispositivo, m.id, "duplicado");
  return { resultado: "duplicado", desde: previa.creado_en, mjrvId: m.id, nombre: nombreDe(m), junta: j.junta };
}

export async function registrarLectura(s: SesionEstacion, codigoBruto: string, dispositivo: string | null, origen: "codigo" | "cedula" = "codigo"): Promise<Lectura> {
  const compacto = normalizarCodigo(codigoBruto).slice(0, 40);
  const clave = claveAcceso(codigoBruto).slice(0, 200);
  if (origen === "cedula" && !cedulaManualValida(codigoBruto.trim())) return { resultado: "desconocido" };

  return withTx(async (client) => {
    await fijarModo(client);
    const rev = await credencialRevocada(client, [compacto], clave);
    if (rev) {
      await anotarResultado(client, s, (compacto || clave).slice(0, 80), dispositivo, rev.mjrvId, "revocado");
      return { resultado: "revocado" };
    }

    const porCedula = async (cedula: string) =>
      (await client.query<FichaPuerta>(`SELECT ${CAMPOS_FICHA} FROM mjrv WHERE cedula = $1`, [cedula])).rows[0];
    const exacta = compacto ? await porCedula(compacto) : undefined;
    if (exacta) return registrarFicha(client, s, exacta, compacto, dispositivo);

    if (origen === "codigo") {
      const digitos = codigoBruto.match(/\d{10,20}/)?.[0];
      if (digitos && digitos !== compacto) {
        const ficha = await porCedula(digitos);
        if (ficha) return registrarFicha(client, s, ficha, digitos, dispositivo);
      }

      const nombre = normalizarNombre(codigoBruto);
      if (/[A-Z]/.test(nombre)) {
        const lista = (await client.query<FichaPuerta>(`SELECT ${CAMPOS_FICHA} FROM mjrv`)).rows;
        const hallados = buscarPorNombre(nombre, lista);
        if (hallados.length > 1) return { resultado: "ambiguo" };
        if (hallados.length === 1) return registrarFicha(client, s, hallados[0], nombre.slice(0, 80), dispositivo);
      }
    }

    await anotarResultado(client, s, compacto, dispositivo, null, "desconocido");
    return { resultado: "desconocido" };
  });
}

export async function comprobarCredencial(s: SesionEstacion, codigoBruto: string, dispositivo: string | null, confirmarId?: number): Promise<Lectura | Coincidencia> {
  const texto = codigoBruto.slice(0, 500);
  const cedulas = cedulasDeCamara(texto);
  const textoConNombre = /[A-Z]/.test(normalizarNombre(texto));

  return withTx(async (client) => {
    if (confirmarId !== undefined) await fijarModo(client);
    let hallados = cedulas.length
      ? (await client.query<FichaPuerta>(`SELECT ${CAMPOS_FICHA} FROM mjrv WHERE cedula = ANY($1::text[])`, [cedulas])).rows
      : [];
    if (hallados.length > 1) return { resultado: "ambiguo" };
    const exacta = hallados[0];
    // Un nombre revocado completo puede revelar que el OCR leyó la cédula de otra ficha.
    if (textoConNombre && buscarNombreCamara(texto, hallados).length === 0) {
      const revocadas = (await client.query<PersonaLista>(
        `SELECT id, apellidos, nombres FROM credenciales_revocadas
          WHERE cedula IS DISTINCT FROM $1 AND (mjrv_id IS NULL OR mjrv_id IS DISTINCT FROM $2)`,
        [exacta?.cedula ?? null, exacta?.id ?? null],
      )).rows;
      if (buscarNombreCamara(texto, revocadas).length > 0) return { resultado: "revocado" };
    }
    if (hallados.length === 0) {
      if (await credencialRevocada(client, cedulas, claveAcceso(texto).slice(0, 200))) return { resultado: "revocado" };
      if (!textoConNombre) return { resultado: "desconocido" };
      const lista = (await client.query<FichaPuerta>(`SELECT ${CAMPOS_FICHA} FROM mjrv`)).rows;
      hallados = buscarNombreCamara(texto, lista);
    }

    if (hallados.length > 1) return { resultado: "ambiguo" };
    const m = hallados[0];
    if (!m) return { resultado: "desconocido" };
    // La confirmación repite la búsqueda: un identificador recibido nunca sustituye la coincidencia única.
    if (confirmarId === m.id) return registrarFicha(client, s, m, m.cedula, dispositivo);
    const { junta } = await juntaVigente(client, m.id);
    return { resultado: "pendiente", mjrvId: m.id, cedula: m.cedula, nombre: nombreDe(m), junta };
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
    await fijarModo(client);
    const m = (await client.query<{ cedula: string; activo: boolean }>("SELECT cedula, activo FROM mjrv WHERE id = $1 FOR UPDATE", [mjrvId])).rows[0];
    if (!m || !m.activo) return { ok: false as const, status: 404 as const, mensaje: "La ficha no existe o está de baja." };
    if (await mjrvRevocado(client, mjrvId)) return { ok: false as const, status: 409 as const, mensaje: "La credencial está revocada." };
    const previa = (await client.query("SELECT 1 FROM lecturas_puerta WHERE mjrv_id = $1 AND resultado = 'valido'", [mjrvId])).rows[0];
    if (!previa) return { ok: false as const, status: 409 as const, mensaje: "Esta persona aún no ha ingresado." };
    await client.query("INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id) VALUES ($1, $2, 'reingreso_autorizado', $3, $4)", [m.cedula, mjrvId, s.operadorId, s.enlaceId]);
    return { ok: true as const };
  });
}

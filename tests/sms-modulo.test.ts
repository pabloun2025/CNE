import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Sesion } from "@/server/auth";
import { leerTokenCredencialSms } from "@/server/credencial-sms";
import { closePools } from "@/server/db";
import { confirmarEnviosSms, listarDestinatariosSms, prepararEnviosSms } from "@/server/envios/sms-modulo";
import { registrarAcusesSms } from "@/server/envios/sms-seguimiento";
import { enviarSmsAccion } from "@/server/sms-actions";
import { revocarMjrv } from "@/server/revocar-credencial";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion: Sesion = { sesionId: "sesion-prueba-sms", usuarioId: 1, correo: "consul@ejemplo.invalid", nombre: "Cónsul de prueba", tipo: "madrid_admin", rol: "consul", debeCambiar: false };
vi.mock("@/server/guard", () => ({ requireAdmin: async () => sesion }));

const NUMEROS_PRUEBA = ["+34600000001", "+34600000002", "+34600000003", "+34600000004", "+34600000005", "+34600000006"];
const enviarPrueba = () => vi.fn(async () => respuesta("ID_PRUEBA_1"));
const respuesta = (id: string) => ({ status: 200, text: async () => JSON.stringify({ status: "ok", result: [{ status: "ok", sms_id: id }] }) });

async function insertarFicha(indice: number, opciones: { nombre?: string; telefono?: string | null; junta?: number; serie?: "H" | "M"; rol?: string; activo?: boolean; esPrueba?: boolean } = {}) {
  const [{ id }] = await consultarDueno<{ id: string }>(
    `INSERT INTO cne.mjrv (cedula, nombres, apellidos, rol, cargo_original, junta_origen_id, telefono_e164, activo, es_prueba)
     SELECT $1, $2, 'APELLIDO PRUEBA', $3, 'CARGO DE PRUEBA', j.id, $4, $5, $6
       FROM cne.juntas_madrid j WHERE j.serie=$7 AND j.numero=$8 RETURNING id`,
    [String(indice).padStart(10, "0"), opciones.nombre ?? "ÉLENA MARÍA", opciones.rol ?? "vocal", opciones.telefono === undefined ? NUMEROS_PRUEBA[indice - 1] : opciones.telefono,
      opciones.activo ?? true, opciones.esPrueba ?? false, opciones.serie ?? "M", opciones.junta ?? 1],
  );
  return Number(id);
}

async function vista(ids: number[]) {
  const resultado = await prepararEnviosSms(sesion, ids);
  if (!("confirmacion" in resultado)) throw new Error(JSON.stringify(resultado));
  return resultado;
}

beforeAll(() => reiniciarBase({ correo: "super@prueba.cne", password: "clave-de-prueba-1", modo: "eleccion" }));
beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-26T12:00:00+01:00"));
  vi.stubEnv("HOST_MADRID", "madrid.ejemplo.invalid");
  vi.stubEnv("SMSPUBLI_API", "clave-ficticia-para-transporte-simulado");
  await consultarDueno("UPDATE cne.configuracion SET modo='eleccion' WHERE id=1");
  await consultarDueno("DELETE FROM cne.mjrv");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(closePools);

it("muestra el primer nombre y envía al remitente de la junta con un enlace privado de la ficha", async () => {
  const id = await insertarFicha(1);
  const previa = await vista([id]);
  expect(previa.destinatarios).toEqual([expect.objectContaining({ id, movil: NUMEROS_PRUEBA[0], remitente: "+34679381651",
    texto: "ELENA, le esperamos el 29/11 a las 08:00 en la Caja Magica para las elecciones de Ecuador. Presente el QR de su credencial:\n[enlace al QR]",
  })]);
  expect(await consultarDueno("SELECT 1 FROM cne.envios_sms")).toEqual([]);

  const transporte = vi.fn(async (_url: string, peticion: { body?: string }) => {
    const body = JSON.parse(peticion.body ?? "{}");
    expect(body.messages).toEqual([expect.objectContaining({ from: "+34679381651", to: "34600000001",
      text: "ELENA, le esperamos el 29/11 a las 08:00 en la Caja Magica para las elecciones de Ecuador. Presente el QR de su credencial:\n{LINK}",
    })]);
    const url = new URL(body.link);
    expect(url.origin).toBe("https://madrid.ejemplo.invalid");
    expect(leerTokenCredencialSms(url.pathname.split("/").at(-1)!)).toEqual({ id, cedula: "0000000001", telefono: NUMEROS_PRUEBA[0] });
    return respuesta("ID_PRUEBA_1");
  });
  expect(await confirmarEnviosSms(sesion, [id], previa.confirmacion, transporte)).toMatchObject({ aceptado: 1, pendientes: 0 });
  expect(await consultarDueno("SELECT estado,id_externo FROM cne.envios_sms")).toEqual([{ estado: "aceptado", id_externo: "ID_PRUEBA_1" }]);
  expect(await consultarDueno("SELECT actor_nombre FROM cne.auditoria WHERE accion='sms_credencial_reservado'")).toContainEqual({ actor_nombre: sesion.nombre });
});

it("retira móviles compartidos, bajas, fichas de prueba, la secretaría de F23 y credenciales revocadas", async () => {
  const habilitada = await insertarFicha(1, { serie: "H" });
  const compartida = await insertarFicha(2);
  const noElegibles = [compartida, await insertarFicha(3, { telefono: NUMEROS_PRUEBA[1] }), await insertarFicha(4, { activo: false }),
    await insertarFicha(5, { esPrueba: true }), await insertarFicha(6, { junta: 23, rol: "secretario" }), await insertarFicha(7, { telefono: null })];
  const revocada = await insertarFicha(8, { telefono: "+34600000008" });
  await revocarMjrv(sesion, revocada);
  expect(await listarDestinatariosSms()).toEqual([expect.objectContaining({ id: habilitada })]);
  for (const id of [...noElegibles, revocada]) expect(await prepararEnviosSms(sesion, [id])).toHaveProperty("error");
  expect((await vista([habilitada])).destinatarios[0].remitente).toBe("+34615273435");
});

it("rechaza una selección fuera del límite, una confirmación alterada o ajena y un móvil modificado tras la vista previa", async () => {
  const id = await insertarFicha(1);
  const otro = await insertarFicha(2);
  const transporte = enviarPrueba();
  expect(await prepararEnviosSms(sesion, [1, 2, 3, 4, 5, 6])).toHaveProperty("error");
  expect(await prepararEnviosSms(sesion, [id, id])).toHaveProperty("error");
  const previa = await vista([id]);
  const mismaCuentaOtraSesion = { ...sesion, sesionId: "otra-sesion" };
  expect(await confirmarEnviosSms(mismaCuentaOtraSesion, [id], previa.confirmacion, transporte)).toHaveProperty("error");
  expect(await confirmarEnviosSms(sesion, [otro], previa.confirmacion, transporte)).toHaveProperty("error");
  expect(await confirmarEnviosSms(sesion, [id], previa.confirmacion.slice(0, -1), transporte)).toHaveProperty("error");
  await consultarDueno("UPDATE cne.mjrv SET telefono_e164=$2 WHERE id=$1", [id, NUMEROS_PRUEBA[5]]);
  expect(await confirmarEnviosSms(sesion, [id], previa.confirmacion, transporte)).toHaveProperty("error");
  expect(transporte).not.toHaveBeenCalled();
  expect(await consultarDueno("SELECT 1 FROM cne.envios_sms")).toEqual([]);
});

it("bloquea un envío en modo prueba, después de caducar la revisión y después del cierre electoral", async () => {
  const id = await insertarFicha(1);
  const previa = await vista([id]);
  const transporte = enviarPrueba();
  await consultarDueno("UPDATE cne.configuracion SET modo='prueba' WHERE id=1");
  expect(await listarDestinatariosSms()).toEqual([]);
  expect(await confirmarEnviosSms(sesion, [id], previa.confirmacion, transporte)).toHaveProperty("error");
  await consultarDueno("UPDATE cne.configuracion SET modo='eleccion' WHERE id=1");
  vi.mocked(Date.now).mockReturnValue(Date.parse("2026-11-26T12:16:00+01:00"));
  expect(await confirmarEnviosSms(sesion, [id], previa.confirmacion, transporte)).toHaveProperty("error");
  vi.mocked(Date.now).mockReturnValue(Date.parse("2026-11-30T00:00:00+01:00"));
  expect(await prepararEnviosSms(sesion, [id])).toHaveProperty("error");
  expect(transporte).not.toHaveBeenCalled();
});

it("exige marcar la confirmación en el formulario aunque exista una revisión válida", async () => {
  const id = await insertarFicha(1);
  const previa = await vista([id]);
  const datos = new FormData();
  datos.set("intencion", "enviar");
  datos.set("ids", String(id));
  datos.set("revision", previa.confirmacion);
  const transporte = enviarPrueba();
  vi.stubGlobal("fetch", transporte);
  try {
    expect(await enviarSmsAccion(null, datos)).toHaveProperty("error");
    expect(transporte).not.toHaveBeenCalled();
    expect(await consultarDueno("SELECT 1 FROM cne.envios_sms")).toEqual([]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("reserva una sola vez aunque dos solicitudes confirmen la misma ficha a la vez", async () => {
  const id = await insertarFicha(1);
  const previa = await vista([id]);
  const transporte = enviarPrueba();
  await Promise.all([confirmarEnviosSms(sesion, [id], previa.confirmacion, transporte), confirmarEnviosSms(sesion, [id], previa.confirmacion, transporte)]);
  expect(transporte).toHaveBeenCalledTimes(1);
  expect(await consultarDueno("SELECT mjrv_id FROM cne.envios_sms")).toEqual([{ mjrv_id: id }]);
  expect(await listarDestinatariosSms()).toEqual([]);
});

it("impide que Superadministración cambie de modo durante la llamada a SMS Publi", async () => {
  const id = await insertarFicha(1);
  const previa = await vista([id]);
  let bloqueo = "sin bloqueo";
  const transporte = vi.fn(async () => {
    try {
      await consultarDueno(`BEGIN; SET LOCAL lock_timeout = '100ms';
        SELECT modo FROM cne.configuracion WHERE id = 1 FOR UPDATE;
        UPDATE cne.configuracion SET modo = 'prueba' WHERE id = 1; COMMIT`);
    } catch (error) {
      bloqueo = (error as { code: string }).code;
    }
    return respuesta("ID_PRUEBA_1");
  });
  expect(await confirmarEnviosSms(sesion, [id], previa.confirmacion, transporte)).toMatchObject({ aceptado: 1 });
  expect(bloqueo).toBe("55P03");
  expect(await consultarDueno("SELECT modo FROM cne.configuracion WHERE id = 1")).toEqual([{ modo: "eleccion" }]);
});

it("informa entregas tempranas, intentos inciertos y destinatarios que quedaron pendientes", async () => {
  const primero = await insertarFicha(1);
  const segundo = await insertarFicha(2);
  const tercero = await insertarFicha(3);
  const previa = await vista([primero, segundo, tercero]);
  const transporte = vi.fn(async (_url: string, peticion: { body?: string }) => {
    const body = JSON.parse(peticion.body ?? "{}");
    const [{ custom, to }] = body.messages;
    if (to === "34600000001") {
      const envio = Number(new URL(body.report_url).searchParams.get("envio"));
      await registrarAcusesSms(envio, [{ to, sms_id: "ID_PRUEBA_1", status: "DELIVRD", custom }]);
      return respuesta("ID_PRUEBA_1");
    }
    throw new Error("SIN_RESPUESTA_PRUEBA");
  });
  expect(await confirmarEnviosSms(sesion, [primero, segundo, tercero], previa.confirmacion, transporte)).toMatchObject({ aceptado: 0, entregado: 1, incierto: 1, pendientes: 1 });
  expect(transporte).toHaveBeenCalledTimes(2);
  expect(await consultarDueno("SELECT mjrv_id,estado FROM cne.envios_sms ORDER BY id")).toEqual([{ mjrv_id: primero, estado: "entregado" }, { mjrv_id: segundo, estado: "incierto" }]);
  expect(await listarDestinatariosSms()).toEqual([expect.objectContaining({ id: tercero })]);
});

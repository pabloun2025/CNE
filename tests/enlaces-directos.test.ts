import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { login, type Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { crearEnlace, revocarEnlace } from "@/server/estaciones";
import { validarCedula } from "@/server/mjrv";
import { GET as contadores, POST as registrarIngreso } from "@/app/api/e/puerta/route";
import { POST as consultarDocumentos } from "@/app/api/e/documentacion/buscar/route";
import { consultarDueno, reiniciarBase } from "./helpers/db";

let cookieAdmin: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => n === "cne_admin" && cookieAdmin ? { value: cookieAdmin } : undefined }) }));

const superadmin: Sesion = { sesionId: "prueba", usuarioId: 1, correo: "super@prueba.cne", nombre: "Super Prueba", tipo: "superadmin", rol: "consul", debeCambiar: false };
const CEDULA = "0000000001";

function solicitud(token?: string, datos?: object, busqueda = ""): Request {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (datos) headers.set("content-type", "application/json");
  return new Request(`http://localhost/${busqueda}`, { headers, ...(datos && { method: "POST", body: JSON.stringify(datos) }) });
}

async function enlace(funcion: string) {
  const e = await crearEnlace(superadmin, funcion, `${funcion} de prueba`);
  if (!e.ok) throw new Error(e.mensaje);
  return e;
}

describe("enlaces directos de estación", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
      SELECT $1, 'APELLIDO PRUEBA', 'NOMBRE PRUEBA', 'VOCAL', 'vocal', id FROM cne.juntas_madrid WHERE serie = 'H' AND numero = 12`, [CEDULA]);
    await consultarDueno(`INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar, rol)
      SELECT 'madrid_admin', 'fin@prueba.cne', 'Finanzas Prueba', password_hash, false, 'financiero' FROM cne.usuarios WHERE id = 1`);
  });
  afterAll(closePools);

  it("el enlace de Puerta registra el ingreso y identifica el puesto sin operador", async () => {
    const puerta = await enlace("puerta");
    const r = await registrarIngreso(solicitud(puerta.token, { codigo: CEDULA }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ lectura: { resultado: "valido", junta: "H12" }, contadores: { total: 1, esteEnlace: 1 } });
    expect(await consultarDueno("SELECT operador_id, enlace_id FROM cne.lecturas_puerta")).toEqual([{ operador_id: null, enlace_id: puerta.id }]);
  });

  it("restringe Documentación a su enlace y lo invalida al revocarlo", async () => {
    const documentos = await enlace("documentacion");
    const finanzas = await enlace("finanzas");
    expect((await consultarDocumentos(solicitud(finanzas.token, { cedula: CEDULA }))).status).toBe(403);
    expect((await consultarDocumentos(solicitud(undefined, { cedula: CEDULA }))).status).toBe(401);
    expect((await contadores(solicitud(documentos.token))).status).toBe(403);
    const r = await consultarDocumentos(solicitud(documentos.token, { cedula: CEDULA }));
    expect(await r.json()).toMatchObject({ encontrada: true, cedula: CEDULA });
    await revocarEnlace(superadmin, documentos.id);
    expect((await consultarDocumentos(solicitud(documentos.token, { cedula: CEDULA }))).status).toBe(401);
  });

  it("envía una sola ficha a Revisión por modo y reserva Caja a los recibos definitivos y la cédula validada", async () => {
    const { POST: escanear } = await import("@/app/api/e/finanzas/escanear/route");
    const { GET: bandeja } = await import("@/app/api/admin/finanzas/escaneados/route");
    const finanzas = await enlace("finanzas");
    const puerta = await enlace("puerta");
    const consultarCaja = () => bandeja(solicitud(undefined, undefined, "?caja=1"));
    expect((await escanear(solicitud(puerta.token, { cedula: CEDULA }))).status).toBe(403);
    expect((await bandeja(solicitud(finanzas.token))).status).toBe(401);
    expect((await escanear(solicitud(finanzas.token, { cedula: "0000000099" }))).status).toBe(404);

    const respuestas = await Promise.all([1, 2].map(() => escanear(solicitud(finanzas.token, { cedula: CEDULA }))));
    for (const r of respuestas) expect(await r.json()).toEqual({ ok: true, etapa: "revision", nombre: "APELLIDO PRUEBA, NOMBRE PRUEBA" });
    const cuenta = await login({ correo: "fin@prueba.cne", password: "clave-de-prueba-1", portal: "admin", ip: "127.0.0.1", agente: "prueba" });
    if (!cuenta.ok) throw new Error("No entró la cuenta financiera de prueba");
    cookieAdmin = cuenta.token;

    const r = await bandeja(solicitud());
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toMatchObject({ modo: "prueba", escaneados: [{
      cedula: CEDULA, nombre: "APELLIDO PRUEBA, NOMBRE PRUEBA", junta: "M12", escaneadoEn: expect.any(String),
      emitido: false, pagado: false, documentado: false, actaId: null,
    }] });
    expect(await (await consultarCaja()).json()).toEqual({ modo: "prueba", escaneados: [] });

    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion' WHERE id = 1");
    expect(await (await bandeja(solicitud())).json()).toEqual({ modo: "eleccion", escaneados: [] });
    expect(await (await escanear(solicitud(finanzas.token, { cedula: CEDULA }))).json()).toMatchObject({ ok: true, etapa: "revision" });
    expect(await consultarDueno("SELECT es_prueba FROM cne.escaneos_finanzas ORDER BY es_prueba")).toEqual([{ es_prueba: false }, { es_prueba: true }]);
    await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba' WHERE id = 1");
    expect(await (await consultarCaja()).json()).toEqual({ modo: "prueba", escaneados: [] });

    await consultarDueno(`INSERT INTO cne.actas_pago (mjrv_id, usuario_id, importe_eur, parametros, impresion_n)
      SELECT id, 2, 5, '{}', 1 FROM cne.mjrv WHERE cedula = $1`, [CEDULA]);
    expect(await (await consultarCaja()).json()).toEqual({ modo: "prueba", escaneados: [] });
    await consultarDueno(`INSERT INTO cne.documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256, origen)
      SELECT m.id, lados.lado, decode('00','hex'), decode('00','hex'), 20000, 800, 600, decode(md5(lados.lado),'hex'), 'estacion'
      FROM cne.mjrv m CROSS JOIN (VALUES ('anverso'), ('reverso')) lados(lado) WHERE m.cedula = $1`, [CEDULA]);
    const [{ id }] = await consultarDueno<{ id: number }>("SELECT id FROM cne.mjrv WHERE cedula = $1", [CEDULA]);
    expect((await validarCedula({ tipo: "usuario", id: 2, nombre: "Finanzas Prueba", portal: "finanzas" }, id)).ok).toBe(true);
    expect(await (await consultarCaja()).json()).toMatchObject({ modo: "prueba", escaneados: [{ cedula: CEDULA, emitido: true, pagado: false, documentado: true, actaId: expect.any(Number) }] });

    await revocarEnlace(superadmin, finanzas.id);
    expect((await escanear(solicitud(finanzas.token, { cedula: CEDULA }))).status).toBe(401);
    expect(await (await consultarCaja()).json()).toMatchObject({ escaneados: [{ cedula: CEDULA }] });
  });
});

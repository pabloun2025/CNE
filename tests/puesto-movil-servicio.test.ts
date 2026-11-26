import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencias = vi.hoisted(() => ({
  consultar: vi.fn(), estado: vi.fn(), query: vi.fn(), correo: vi.fn(), config: vi.fn(), pdf: vi.fn(),
}));
vi.mock("@/server/justificante/documento.mjs", async importOriginal => {
  const real = await importOriginal<typeof import("@/server/justificante/documento.mjs")>();
  return { ...real, prepararDocumentoLaboral: (...args: Parameters<typeof real.prepararDocumentoLaboral>) => {
    dependencias.pdf(args[2]);
    return real.prepararDocumentoLaboral(...args);
  } };
});
vi.mock("@/server/puesto-movil/padron", () => ({
  consultarPadronMovil: dependencias.consultar, estadoPadronMovil: dependencias.estado,
}));
vi.mock("@/server/db", () => ({ query: dependencias.query }));
vi.mock("@/server/envios/brevo", () => ({
  clienteCorreo: () => ({ simulado: false, enviar: dependencias.correo, verificarRemitente: async (direccion: string) => direccion === "avisos@consulado.app" }),
}));
vi.mock("@/server/envios-config", () => ({
  leerConfigEnvios: dependencias.config, remitenteEfectivo: () => ({ direccion: "puesto@example.invalid", nombre: "Consulado" }),
}));

import { POST } from "@/app/api/puesto-movil/[operacion]/route";

const acceso = "A".repeat(43);
const gestion = "B".repeat(43);
const presente = "0000000001";
const ausente = "0000000002";
type Estado = "pendiente" | "aceptado" | "incierto" | "enviando";
let actividad: Map<string, { tipo: "con" | "sin"; estado: Estado; huella_peticion: string | null }>;

function post(operacion: string, body: Record<string, unknown>, token = acceso, origen = "https://madrid.consulado.app") {
  return POST(new Request(origen + "/api/puesto-movil/" + operacion, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token,
      origin: origen }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ operacion }) });
}

beforeEach(() => {
  vi.stubEnv("CNE_MOVIL_ACCESO", acceso);
  vi.stubEnv("CNE_MOVIL_SEGUIMIENTO", gestion);
  vi.stubEnv("CNE_MOVIL_CORREO_ACTIVO", "1");
  actividad = new Map();
  dependencias.estado.mockReturnValue({ abierto: true, disponible: true, servidorMs: Date.now(), cierreMs: Date.now() + 300000 });
  dependencias.consultar.mockImplementation((cedula: string) => cedula === presente ? {
    nombre: "APELLIDO FICTICIO ANA", junta: "M30", recinto: "Caja Mágica", zona: "Azul", verificarWeb: false,
  } : null);
  dependencias.config.mockResolvedValue({ correoReal: true, correoPausa: null });
  dependencias.correo.mockResolvedValue({ ok: true, idExterno: "simulado" });
  dependencias.query.mockImplementation(async (sql: string, args: string[] = []) => {
    const [id, param] = args;
    if (sql.startsWith("INSERT")) {
      actividad.set(id, { tipo: param as "con" | "sin", estado: "pendiente", huella_peticion: null });
      return [];
    }
    if (sql.trim().startsWith("SELECT count")) {
      const rows = [...actividad.values()];
      return [{ consultas: rows.length, con: rows.filter(f => f.tipo === "con").length, sin: rows.filter(f => f.tipo === "sin").length,
        correosAceptados: rows.filter(f => f.estado === "aceptado").length, correosInciertos: rows.filter(f => f.estado === "incierto").length }];
    }
    const dato = actividad.get(id);
    if (!dato) return [];
    if (sql.startsWith("SELECT estado")) return [{ ...dato }];
    if (sql.includes("SET estado='enviando'") && dato.estado === "pendiente") {
      dato.estado = "enviando"; dato.huella_peticion = param; return [{ id }];
    }
    if (sql.includes("SET estado=$2") && dato.estado === "enviando") dato.estado = param as Estado;
    return [];
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Puesto electoral móvil", () => {
  it("protege ambos enlaces, consulta una cédula exacta y omite el nombre del resultado", async () => {
    expect((await post("consulta", { cedula: presente }, gestion)).status).toBe(403);
    expect((await post("seguimiento", {}, acceso)).status).toBe(403);
    expect((await post("consulta", { cedula: presente + "7" })).status).toBe(400);
    const consulta = await post("consulta", { cedula: presente });
    expect(consulta.status).toBe(200);
    expect(consulta.headers.get("cache-control")).toContain("no-store");
    const datos = await consulta.json();
    expect(datos.resultado).toEqual({ junta: "M30", zona: "Azul", recinto: "Caja Mágica", verificarWeb: false });
    expect(datos.turno).not.toContain(presente);
    expect((await post("consulta", { cedula: presente }, acceso.slice(0,18), "https://cne.consulado.app")).status).toBe(200);
    expect((await post("seguimiento", {}, gestion.slice(0,18), "https://cne.consulado.app")).status).toBe(403);
  });

  it("usa el nombre del padrón, valida el DNI y envía el PDF una sola vez", async () => {
    const { turno } = await (await post("consulta", { cedula: presente })).json();
    const envio = { turno, correo: "persona@example.invalid" };
    expect((await post("envio", { ...envio, documento: "12345678A" })).status).toBe(400);
    const solicitud = { ...envio, documento: "12345678Z" };
    expect(await (await post("envio", solicitud)).json()).toEqual({ aceptado: true });
    expect(await (await post("envio", { ...solicitud, nombre: "Otra persona" })).json()).toEqual({ aceptado: true });
    expect((await post("envio", { ...solicitud, correo: "otro@example.invalid" })).status).toBe(409);
    expect(dependencias.correo).toHaveBeenCalledTimes(1);
    expect(dependencias.pdf).toHaveBeenCalledWith(expect.objectContaining({ nombre: "APELLIDO FICTICIO ANA" }));
    const mensaje = dependencias.correo.mock.calls[0][0];
    expect(mensaje.remitente.direccion).toBe("avisos@consulado.app");
    expect(mensaje.texto).toContain("Junta: 30M");
    expect(Buffer.from(mensaje.adjunto.base64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("incluye la guía si no consta, y tras el cierre mantiene las cifras", async () => {
    const { resultado, turno } = await (await post("consulta", { cedula: ausente })).json();
    expect(resultado).toBeNull();
    const envio = { turno, nombre: "Persona Ficticia", correo: "persona@example.invalid" };
    expect((await post("envio", { turno, correo: envio.correo })).status).toBe(400);
    expect(await (await post("envio", envio)).json()).toEqual({ aceptado: true });
    expect(dependencias.pdf).toHaveBeenCalledWith(expect.objectContaining({ nombre: "Persona Ficticia" }));
    expect(dependencias.correo.mock.calls[0][0].texto).toContain("/guia-electoral.pdf");
    expect(dependencias.correo.mock.calls[0][0].adjuntos[0].nombre).toBe("guia-electoral.pdf");
    dependencias.estado.mockReturnValue({ abierto: false, disponible: false, cierreMs: Date.now(), servidorMs: Date.now() });
    expect((await post("consulta", { cedula: presente })).status).toBe(410);
    expect((await post("envio", envio)).status).toBe(410);
    expect(await (await post("seguimiento", {}, gestion)).json()).toEqual({
      consultas: 1, con: 0, sin: 1, correosAceptados: 1, correosInciertos: 0,
    });
  });
});

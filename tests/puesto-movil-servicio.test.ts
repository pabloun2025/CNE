import { read } from "xlsx";
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
let actividad: Map<string, { tipo: "con" | "sin"; estado: Estado; huella_peticion: string | null; equipo?: number; solicitud?: string }>;

let contactos: Map<string, { huella_cedula: Buffer; nonce: Buffer; cifrado: Buffer }>;

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
  contactos = new Map();
  dependencias.estado.mockReturnValue({ abierto: true, disponible: true, servidorMs: Date.now(), cierreMs: Date.now() + 300000 });
  dependencias.consultar.mockImplementation((cedula: string) => cedula === presente ? {
    nombre: "APELLIDO FICTICIO ANA", junta: "M30", recinto: "Caja Mágica", zona: "Azul", verificarWeb: false,
  } : null);
  dependencias.config.mockResolvedValue({ correoReal: true, correoPausa: null });
  dependencias.correo.mockResolvedValue({ ok: true, idExterno: "simulado" });
  dependencias.query.mockImplementation(async (sql: string, args: unknown[] = []) => {
    if (sql.includes("INSERT INTO cne.puesto_movil_contactos")) {
      const [huella_cedula, nonce, cifrado, id, vence] = args as [Buffer, Buffer, Buffer, string, number];
      const turno = actividad.get(id);
      if (turno?.tipo !== "sin" || turno.estado !== "pendiente" || Date.now() >= vence) return [];
      contactos.set(huella_cedula.toString("hex"), { huella_cedula, nonce, cifrado });
      return [{}];
    }
    if (sql.includes("FROM cne.puesto_movil_contactos")) return [...contactos.values()];
    if (sql.startsWith("SELECT id,tipo FROM cne.puesto_movil_actividad")) {
      const anterior = [...actividad].find(([,fila]) => fila.equipo === args[0] && fila.solicitud === args[1]);
      return anterior ? [{ id:anterior[0], tipo:anterior[1].tipo }] : [];
    }
    const [id, param] = args as string[];
    if (sql.startsWith("INSERT")) {
      const [,,equipo,solicitud] = args as [string,string,number?,string?];
      if (equipo !== undefined && [...actividad.values()].some(fila => fila.equipo === equipo && fila.solicitud === solicitud)) return [];
      actividad.set(id, { tipo: param as "con" | "sin", estado: "pendiente", huella_peticion: null, equipo, solicitud });
      return [{ id }];
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

  it("deduplica por equipo y solicitud, conserva el envío y cuenta búsquedas nuevas y antiguas", async () => {
    const equipo = 999999999999, solicitud = "338b0327-9165-47de-93c2-b3d9b2884ae8";
    const datos = { cedula:presente, equipo, solicitud };
    const [uno, dos] = await Promise.all([post("consulta",datos), post("consulta",datos)]);
    expect([uno.status,dos.status]).toEqual([200,200]);
    expect(actividad.size).toBe(1);
    for (const consulta of [uno,dos]) {
      const { turno } = await consulta.json();
      expect((await post("envio",{ turno,correo:"prueba@example.invalid" })).status).toBe(200);
    }
    expect(dependencias.correo).toHaveBeenCalledTimes(1);
    expect((await post("consulta",{ ...datos,cedula:ausente })).status).toBe(409);
    dependencias.consultar.mockReturnValueOnce({ nombre:"OTRA PERSONA FICTICIA", junta:"M1", recinto:"Toledo", zona:"Zona Única", verificarWeb:false });
    expect((await post("consulta",{ ...datos,cedula:"0000000003" })).status).toBe(409);
    expect(actividad.size).toBe(1);
    expect((await post("consulta",{ ...datos,solicitud:"08f84a74-ef7b-4358-9392-dd0778e25a0a" })).status).toBe(200);
    expect((await post("consulta",{ ...datos,equipo:1 })).status).toBe(200);
    expect((await post("consulta",{ cedula:presente })).status).toBe(200);
    expect([...actividad.values()].map(fila=>fila.equipo)).toEqual([equipo,equipo,1,undefined]);
  });

  it("rechaza identificadores incompletos o fuera del rango", async () => {
    const solicitud="338b0327-9165-47de-93c2-b3d9b2884ae8";
    for (const ids of [{equipo:0,solicitud},{equipo:1e12,solicitud},{equipo:0.5,solicitud},
      {equipo:"12",solicitud},{equipo:1},{solicitud},{equipo:1,solicitud:"incorrecta"}]) {
      expect((await post("consulta",{ cedula:presente,...ids })).status).toBe(400);
    }
    expect(actividad.size).toBe(0);
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
    expect(contactos.size).toBe(0);
    expect(dependencias.pdf).toHaveBeenCalledWith(expect.objectContaining({ nombre: "APELLIDO FICTICIO ANA" }));
    const mensaje = dependencias.correo.mock.calls[0][0];
    expect(mensaje.remitente.direccion).toBe("avisos@consulado.app");
    expect(mensaje.texto).toContain("Junta: 30M");
    expect(Buffer.from(mensaje.adjunto.base64, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  });

  it.each([["Toledo","M1","1M"],["Zaragoza","F1","1F"]])("muestra y envía Zona Única en %s", async (recinto,junta,rotulo) => {
    dependencias.consultar.mockReturnValue({ nombre:"PERSONA FICTICIA", junta, recinto, zona:"Zona Única", verificarWeb:false });
    const { resultado, turno } = await (await post("consulta", { cedula: presente })).json();
    expect(resultado).toEqual({ junta, recinto, zona:"Zona Única", verificarWeb:false });
    expect((await post("envio", { turno, correo:"prueba@example.invalid" })).status).toBe(200);
    const texto=dependencias.correo.mock.calls[0][0].texto;
    expect(texto).toContain("Recinto: "+recinto+"\nJunta: "+rotulo+"\nZona Única");
    expect(texto).not.toContain("lugarvotacion");
  });

  it("incluye la guía si no consta, y tras el cierre mantiene las cifras", async () => {
    const { resultado, turno } = await (await post("consulta", { cedula: ausente })).json();
    expect(resultado).toBeNull();
    const envio = { turno, nombre: "Persona Ficticia", correo: "persona@example.invalid" };
    expect((await post("envio", { turno, correo: envio.correo })).status).toBe(400);
    expect(contactos.size).toBe(0);
    expect(await (await post("envio", envio)).json()).toEqual({ aceptado: true });
    expect(contactos.size).toBe(1);
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

it("guarda solicitudes válidas de ausentes antes de Brevo, deduplica y exporta texto sólo a seguimiento tras el cierre", async () => {
  const { turno } = await (await post("consulta", {cedula: ausente})).json();
  const inicial = { turno, nombre:"Persona Ficticia", correo:"prueba@example.invalid" };
  expect((await post("envio", {...inicial, documento:"12345678A"})).status).toBe(400);
  expect((await post("envio", {...inicial, correo:"incorrecto"})).status).toBe(400);
  expect(contactos.size).toBe(0);
  dependencias.correo.mockResolvedValue({ok:false, incierto:false});
  expect((await post("envio", inicial)).status).toBe(503);
  expect(contactos.size).toBe(1);
  const anterior = [...contactos.values()][0];
  expect(anterior.huella_cedula).toHaveLength(32);
  expect(anterior.nonce).toHaveLength(12);
  for (const text of [ausente, inicial.nombre, inicial.correo]) expect(anterior.cifrado.includes(Buffer.from(text))).toBe(false);
  vi.stubEnv("CNE_MOVIL_CORREO_ACTIVO", "0");
  const otroTurno = await (await post("consulta", {cedula: ausente})).json();
  const corregido = { turno:otroTurno.turno, nombre:"=PRUEBA", correo:"corregido@example.invalid" };
  expect((await post("envio",corregido)).status).toBe(503);
  expect(contactos.size).toBe(1);
  const actual = [...contactos.values()][0];
  expect(actual.huella_cedula.equals(anterior.huella_cedula)).toBe(true);
  expect(actual.nonce.equals(anterior.nonce)).toBe(false);
  expect(dependencias.correo).toHaveBeenCalledTimes(1);
  dependencias.estado.mockReturnValue({abierto:false,disponible:false,servidorMs:Date.now(),cierreMs:Date.now()});
  expect((await post("contactos",{},acceso)).status).toBe(403);
  expect((await post("contactos",{},gestion.slice(0,18))).status).toBe(403);
  const salida = await post("contactos",{},gestion);
  expect(salida.status).toBe(200);
  expect(salida.headers.get("content-type")).toContain("spreadsheetml.sheet");
  expect(salida.headers.get("content-disposition")).toContain("contactos-no-empadronados.xlsx");
  expect(salida.headers.get("cache-control")).toContain("no-store");
  const hoja=read(await salida.arrayBuffer(),{type:"array",cellNF:true}).Sheets["No empadronados"];
  expect(hoja["!ref"]).toBe("A1:C2");
  expect([hoja.A1.v,hoja.B1.v,hoja.C1.v]).toEqual(["Nombre","Cédula","Correo electrónico"]);
  expect(hoja.A2).toMatchObject({t:"s",v:corregido.nombre});
  expect(hoja.A2.f).toBeUndefined();
  expect(hoja.B2).toMatchObject({t:"s",v:ausente,z:"@"});
  expect(hoja.C2).toMatchObject({t:"s",v:corregido.correo});
});

it("no incorpora el contacto cuando la cédula ya consta al validar el formulario", async () => {
  const {turno}=await (await post("consulta",{cedula:ausente})).json();
  dependencias.consultar.mockReturnValue({nombre:"Persona Ficticia",junta:"F12",zona:"Celeste",recinto:"Caja Mágica"});
  expect((await post("envio",{ turno, nombre:"Persona Ficticia", correo:"prueba@example.invalid" })).status).toBe(409);
  expect(contactos.size).toBe(0);
  expect(dependencias.correo).not.toHaveBeenCalled();
});

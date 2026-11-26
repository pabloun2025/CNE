import { randomBytes } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import ejemplo from "./fixtures/justificante-ficticio.json";
import { reiniciarBase, consultarDueno } from "./helpers/db";
import { closePools } from "@/server/db";
import { validarDocumentoEspanol } from "@/server/justificante/documento.mjs";
import { GET as pagina } from "@/app/justificante-laboral/route";
import { GET as clave } from "@/app/api/voto/clave-publica/route";
import { POST as abrir } from "@/app/api/voto/abrir/route";
import { POST as pdf } from "@/app/api/voto/pdf/route";

// El puesto de PRUEBA firmó el ticket con el emisor efímero de la fixture.
// El descifrado, las comprobaciones del sobre, PostgreSQL y el PDF son reales.
vi.mock("@/server/justificante/emision.mjs", async original => {
  const real = await original<typeof import("@/server/justificante/emision.mjs")>();
  return { canjearEmision: (token: string, opciones: Parameters<typeof real.canjearEmision>[1]) => {
    const claves = Object.fromEntries(Object.keys(opciones.clavesPuestos).map(p => [p, ejemplo.emisor]));
    return real.canjearEmision(token, { ...opciones, clavesPuestos: claves, now: () => Date.parse("2026-11-30T11:00:00Z") });
  } };
});

const solicitud = () => randomBytes(16).toString("hex");
const post = (datos: object) => new Request("https://prueba.invalid/api/voto", {
  method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify(datos),
});
describe("Canje del ticket electoral", () => {
  beforeAll(() => reiniciarBase());
  afterAll(closePools);

  it("la página de entrada y la clave pública no consumen aperturas", async () => {
    expect(await pagina().text()).toContain("Abrir mi justificante");
    expect(await clave().text()).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(await consultarDueno("SELECT * FROM cne.aperturas_justificante")).toHaveLength(0);
  });

  it("valida la letra de DNI y NIE y permite omitirlos", () => {
    expect(validarDocumentoEspanol(" ")).toBeNull();
    expect(validarDocumentoEspanol("x1234567l")).toEqual({tipo:"NIE",numero:"X1234567L"});
    expect(validarDocumentoEspanol("12345678Z")).toEqual({tipo:"DNI",numero:"12345678Z"});
    expect(() => validarDocumentoEspanol("12345678A")).toThrow(/letra/);
  });

  it("rechaza un QR alterado y una sesión inventada", async () => {
    const token = (ejemplo.token[0] === "A" ? "B" : "A") + ejemplo.token.slice(1);
    expect((await abrir(post({ token, solicitud:solicitud() }))).status).toBe(403);
    expect((await pdf(post({ sesion:"inventada", documento:"" }))).status).toBe(403);
  });

  it("mantiene tres aperturas tras el cierre, deduplica reintentos y entrega el PDF firmado", async () => {
    const token=ejemplo.token, repetida=solicitud();
    const confirmar=(s:string)=>abrir(post({token,solicitud:s}));
    const primera=await confirmar(repetida);
    expect(primera.status).toBe(200);
    const datos=await primera.json();
    expect(datos).toMatchObject({ nombre:"ÁNGELA ŁUKASZ DE PRUEBA",cedula:"0000000001",restantes:2 });
    expect((await (await confirmar(repetida)).json()).restantes).toBe(2);
    const varias=await Promise.all([confirmar(solicitud()),confirmar(solicitud()),confirmar(solicitud())]);
    expect(varias.map(r=>r.status).sort()).toEqual([200,200,410]);
    expect((await pdf(post({sesion:datos.sesion,documento:"X1234567A"}))).status).toBe(400);
    for (const documento of ["", "x1234567l"]) {
      const response=await pdf(post({sesion:datos.sesion,documento,nombre:"SUSTITUCIÓN DE PRUEBA",cedula:"0000000002"}));
      expect(response.headers.get("content-type")).toBe("application/pdf");
      const doc=await PDFDocument.load(await response.arrayBuffer());
      expect(doc.getPageCount()).toBe(1);
      expect(doc.getTitle()).toBe("Justificante laboral de asistencia al recinto electoral");
    }
    const rows=await consultarDueno("SELECT * FROM cne.aperturas_justificante");
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(datos.nombre);
    expect(JSON.stringify(rows)).not.toContain(datos.cedula);
    const reloj=vi.spyOn(Date,"now").mockReturnValue(Date.now()+3600001);
    try { expect((await pdf(post({sesion:datos.sesion}))).status).toBe(403); } finally { reloj.mockRestore(); }
  });
});

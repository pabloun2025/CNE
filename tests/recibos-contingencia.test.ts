import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as descargar } from "@/app/api/admin/finanzas/recibos/contingencia/route";
import { POST as emitir } from "@/app/api/admin/finanzas/recibos/emitir/route";
import { login } from "@/server/auth";
import { closePools } from "@/server/db";
import { consultarDueno, reiniciarBase } from "./helpers/db";

let token: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (nombre: string) => nombre === "cne_admin" ? { value: token } : undefined }),
  headers: async () => new Headers({ host: "localhost" }),
}));

function solicitud(modo: string, origen?: string) {
  return new Request("http://localhost/api/admin/finanzas/recibos/contingencia", {
    method: "POST", body: new URLSearchParams({ modo }), headers: origen ? { origin: origen } : undefined,
  });
}

async function textoDePaginas(respuesta: Response) {
  const pdf = await PDFDocument.load(await respuesta.arrayBuffer());
  return pdf.getPages().map((pagina) => {
    const contenido = pagina.node.Contents();
    const flujo = contenido instanceof PDFArray ? contenido.lookup(0, PDFRawStream) : contenido;
    if (!(flujo instanceof PDFRawStream)) throw new Error("Falta contenido de la página");
    const comandos = Buffer.from(decodePDFRawStream(flujo).decode()).toString("ascii");
    return Array.from(comandos.matchAll(/<([\dA-F]+)> Tj/g), ([, hex]) => Buffer.from(hex, "hex").toString("latin1")).join("\n");
  });
}

async function iniciar(rol: string) {
  const sesion = await login({ correo: `${rol}@prueba.cne`, password: "clave-de-prueba-1", portal: "admin", ip: null, agente: "prueba" });
  if (!sesion.ok) throw new Error("No se pudo iniciar la sesión de prueba");
  token = sesion.token;
}

describe("descarga del padrón de actas de contingencia", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno(`INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar, rol)
      SELECT 'madrid_admin', r || '@prueba.cne', 'ADMIN PRUEBA', password_hash, false, r
        FROM cne.usuarios CROSS JOIN unnest(ARRAY['financiero','consul','coordinador']) r WHERE tipo = 'superadmin'`);
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, activo, es_prueba)
      SELECT f.cedula, f.apellidos, f.nombres, 'VOCAL', 'vocal', j.id, f.activo, f.prueba
        FROM (VALUES ('0000000010','APELLIDO Z PRUEBA','NOMBRE PRUEBA',10,true,false),
                     ('0000000003','APELLIDO A PRUEBA','NOMBRE B PRUEBA',2,true,false),
                     ('0000000002','APELLIDO A PRUEBA','NOMBRE A PRUEBA',2,true,false),
                     ('0000000001','APELLIDO BAJA PRUEBA','NOMBRE PRUEBA',1,false,false),
                     ('0000000004','APELLIDO DEMOSTRACIÓN','NOMBRE PRUEBA',10,true,true)) f(cedula,apellidos,nombres,numero,activo,prueba)
        JOIN cne.juntas_madrid j ON j.serie = 'H' AND j.numero = f.numero`);
    await consultarDueno(`INSERT INTO cne.decisiones_movimiento
      (mjrv_id, junta_origen_id, junta_destino_id, decision, actor_tipo, actor_id, actor_nombre, es_prueba)
      SELECT m.id, m.junta_origen_id, j.id, 'aceptada', 'madrid_admin', 1, 'OPERADOR PRUEBA', false
        FROM cne.mjrv m CROSS JOIN cne.juntas_madrid j
       WHERE m.cedula = '0000000003' AND j.serie = 'H' AND j.numero = 12`);
  });
  afterAll(closePools);

  it("exige una cuenta de Finanzas, comprueba el modo y descarga todas las fichas activas en orden", async () => {
    expect((await descargar(solicitud("prueba"))).status).toBe(401);
    await iniciar("coordinador");
    expect((await descargar(solicitud("prueba"))).status).toBe(403);
    await iniciar("financiero");
    expect((await descargar(solicitud("prueba", "https://externo.invalid"))).status).toBe(403);
    expect((await descargar(solicitud("otro"))).status).toBe(400);
    expect((await descargar(solicitud("eleccion"))).status).toBe(409);

    const prueba = await descargar(solicitud("prueba"));
    expect(prueba.status).toBe(200);
    expect(prueba.headers.get("content-type")).toBe("application/pdf");
    expect(prueba.headers.get("cache-control")).toBe("private, no-store");
    expect(prueba.headers.get("content-disposition")).toMatch(/^attachment;.*prueba/);
    const paginasPrueba = await textoDePaginas(prueba);
    expect(paginasPrueba).toHaveLength(4);
    expect(paginasPrueba.every((p) => p.includes("SIN VALIDEZ"))).toBe(true);
    expect(paginasPrueba.join("\n")).toContain("0000000004");

    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    await iniciar("consul");
    const estado = () => consultarDueno(`SELECT
      (SELECT count(*) FROM cne.actas_pago) actas, (SELECT count(*) FROM cne.pagos_confirmados) pagos,
      (SELECT count(*) FROM cne.documentos_mjrv) documentos, (SELECT count(*) FROM cne.cedulas_validadas) validaciones,
      (SELECT count(*) FROM cne.firmas_recibo) firmas, (SELECT max(ultimo_ordinal) FROM cne.secuencia_recibos) ordinal`);
    const antes = await estado();
    const eleccion = await descargar(solicitud("eleccion", "http://localhost"));
    expect(eleccion.status).toBe(200);
    const paginas = await textoDePaginas(eleccion);
    expect(paginas).toHaveLength(3);
    expect(paginas[0]).toContain("0000000002");
    expect(paginas[1]).toContain("0000000010");
    expect(paginas[2]).toContain("0000000003");
    expect(paginas[2]).toContain("Voto Nro. H12");
    expect(paginas.every((p) => p.includes("29 de noviembre de 2026") && p.includes("NRO. ____________"))).toBe(true);
    expect(paginas.join("\n")).not.toMatch(/000000000[14]|SIN VALIDEZ|ANVERSO|REVERSO/);
    const [{ id: uno }, { id: dos }] = await consultarDueno<{ id: number }>(
      "SELECT id FROM cne.mjrv WHERE cedula IN ('0000000002','0000000010') ORDER BY cedula");
    const seleccion = new URLSearchParams({ modo: "eleccion", formato: "manual" });
    seleccion.append("id", String(uno));
    seleccion.append("id", String(dos));
    const lote = await emitir(new Request("http://localhost/api/admin/finanzas/recibos/emitir", { method: "POST", body: seleccion }));
    expect(lote.status).toBe(200);
    expect(lote.headers.get("content-disposition")).toMatch(/^attachment/);
    const paginasSeleccion = await textoDePaginas(lote);
    expect(paginasSeleccion).toHaveLength(2);
    expect(paginasSeleccion[0]).toContain("0000000002");
    expect(paginasSeleccion[1]).toContain("0000000010");
    expect(paginasSeleccion.every((p) => p.includes("NRO. ____________"))).toBe(true);
    expect(await estado()).toEqual(antes);
    expect(await consultarDueno("SELECT datos FROM cne.auditoria WHERE accion = 'actas_contingencia_descargadas' ORDER BY id"))
      .toEqual([{ datos: { modo: "prueba", fichas: 4 } }, { datos: { modo: "eleccion", fichas: 3 } }, { datos: { modo: "eleccion", fichas: 2 } }]);

    await consultarDueno("UPDATE cne.mjrv SET activo = false");
    const vacio = await descargar(solicitud("eleccion"));
    expect(vacio.status).toBe(404);
    expect(await vacio.text()).toContain("No hay fichas activas");
  });
});

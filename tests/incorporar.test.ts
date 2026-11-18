import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { fichaPago } from "@/server/finanzas";
import { incorporarVotante, normalizarCedula } from "@/server/incorporar";
import { detalleJunta, estadoMando } from "@/server/mando";
import { prepararEleccion } from "@/server/preparar-eleccion";
import type { Actor } from "@/server/movimientos";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const actor: Actor = { tipo: "operador", id: 1, nombre: "Op Mando" };
let junta: number;
const datos = (o: Record<string, unknown> = {}) => ({ nombres: "NOMBRE PRUEBA", apellidos: "APELLIDO PRUEBA INCORPORADA", cedula: "0000000900", juntaId: junta, cargo: "vocal", ...o }) as Parameters<typeof incorporarVotante>[1];

describe("incorporar un votante como MJRV", () => {
  beforeAll(async () => {
    await reiniciarBase();
    [{ id: junta }] = await consultarDueno<{ id: number }>("SELECT id FROM cne.juntas_madrid WHERE serie = 'H' AND numero = 9");
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Op','x','{mando}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('mando','M','\\x01')");
  });
  beforeEach(async () => {
    await consultarDueno("DELETE FROM cne.asignaciones_cargo");
    await consultarDueno("DELETE FROM cne.lecturas_puerta");
    await consultarDueno("DELETE FROM cne.mjrv");
    for (const [c, rol] of [["0000000001", "presidente"], ["0000000002", "secretario"]]) {
      await consultarDueno("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) VALUES ($1,'APELLIDO PRUEBA','NOMBRE PRUEBA',upper($2),$2,$3)", [c, rol, junta]);
      await consultarDueno("INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, es_prueba) SELECT $1, id, 'valido', (SELECT id FROM cne.operadores_madrid), (SELECT id FROM cne.enlaces_estacion), true FROM cne.mjrv WHERE cedula = $1", [c]);
    }
  });
  afterAll(closePools);

  it("normaliza la cédula como el importador", () => {
    expect(normalizarCedula(" 12345 6789 ")).toBe("0123456789");
    expect(normalizarCedula("ab-123")).toBe("AB-123");
  });

  it("crea la ficha presente con la marca, cubre el cargo y deja auditoría; la junta pasa a verde", async () => {
    expect((await estadoMando()).juntas.find((j) => j.id === junta)).toMatchObject({ estado: "faltan", texto: "Falta gente" });
    const r = await incorporarVotante(actor, datos({ telefono: "612 345 678", correo: "Prueba@Ejemplo.invalid" }));
    expect(r).toMatchObject({ ok: true });
    const [m] = await consultarDueno<Record<string, unknown>>("SELECT rol, cargo_original, incorporado_por, fuente_archivo, correo, telefono_e164, es_prueba, incorporado_en IS NOT NULL AS inc, junta_origen_id::text FROM cne.mjrv WHERE cedula = '0000000900'");
    expect(m).toMatchObject({ rol: "otro", cargo_original: "VOTANTE INCORPORADO", incorporado_por: "Op Mando", fuente_archivo: "incorporado desde votantes", correo: "prueba@ejemplo.invalid", telefono_e164: "+34612345678", es_prueba: true, inc: true });
    expect((await estadoMando()).juntas.find((j) => j.id === junta)).toMatchObject({ estado: "completa", presentes: 3 });
    const d = (await detalleJunta(junta))!;
    expect(d.cargos[2]).toMatchObject({ cargo: "vocal", tipo: "incorporado", etiqueta: "Votante incorporado" });
    expect(d.miembros.find((x) => x.incorporado)).toMatchObject({ cargo: "vocal" });
    expect((await consultarDueno("SELECT 1 FROM cne.auditoria WHERE accion = 'votante_incorporado'")).length).toBe(1);
    // En finanzas se la encuentra como a cualquier MJRV (documentar y cobrar no exigen lectura de puerta).
    expect(await fichaPago("0000000900")).toMatchObject({ cargo: "VOTANTE INCORPORADO", activo: true, estado: "documentacion_incompleta" });
  });

  it("cédula repetida (activa o de baja) → rechazo sin crear nada; cargo ya cubierto → rechazo", async () => {
    const antes = (await consultarDueno("SELECT 1 FROM cne.mjrv")).length;
    expect(await incorporarVotante(actor, datos({ cedula: "0000000001" }))).toMatchObject({ ok: false, mensaje: `Ya existe una ficha con esa cédula (junta H9, estado activa). No se creó otra.` });
    await consultarDueno("UPDATE cne.mjrv SET activo = false WHERE cedula = '0000000002'");
    expect(await incorporarVotante(actor, datos({ cedula: "000000002" }))).toMatchObject({ ok: false, mensaje: expect.stringContaining("estado de baja") }); // 9 dígitos: se completa con el cero
    await consultarDueno("UPDATE cne.mjrv SET activo = true WHERE cedula = '0000000002'");
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv")).length).toBe(antes);
    expect(await incorporarVotante(actor, datos({ cargo: "presidente" }))).toMatchObject({ ok: false, cambio: true }); // el presidente ya está
    expect(await incorporarVotante(actor, datos({ cargo: "jefe" }))).toMatchObject({ ok: false });
    expect(await incorporarVotante(actor, datos({ cedula: "!!" }))).toMatchObject({ ok: false });
    expect(await incorporarVotante(actor, datos({ telefono: "123" }))).toMatchObject({ ok: false });
    expect(await incorporarVotante(actor, datos({ correo: "mal" }))).toMatchObject({ ok: false });
    expect(await incorporarVotante(actor, datos({ nombres: " " }))).toMatchObject({ ok: false });
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv")).length).toBe(antes);
  });

  it("dos incorporaciones simultáneas al mismo cargo: solo una", async () => {
    const r = await Promise.all([incorporarVotante(actor, datos({ cedula: "0000000901" })), incorporarVotante(actor, datos({ cedula: "0000000902" }))]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv WHERE incorporado_en IS NOT NULL")).length).toBe(1);
  });

  it("en modo prueba la ficha es de prueba y «Preparar elección» la borra; en modo elección sería real", async () => {
    await incorporarVotante(actor, datos());
    const sup: Sesion = { sesionId: "x", usuarioId: 1, correo: "s@x.y", nombre: "S", tipo: "superadmin", rol: "consul", debeCambiar: false };
    const r = await prepararEleccion(sup, "PREPARAR ELECCION", async () => ({ archivo: "x", bytes: 1 }));
    expect(r.ok).toBe(true);
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv WHERE incorporado_en IS NOT NULL")).length).toBe(0);
    expect((await consultarDueno("SELECT 1 FROM cne.asignaciones_cargo")).length).toBe(0);
    // En modo elección la ficha incorporada es real: las fichas reales de la junta siguen ahí, sin lecturas de puerta de prueba.
    expect(await incorporarVotante(actor, datos({ cedula: "0000000903" }))).toMatchObject({ ok: true });
    expect((await consultarDueno<{ es_prueba: boolean }>("SELECT es_prueba FROM cne.mjrv WHERE cedula = '0000000903'"))[0].es_prueba).toBe(false);
    expect((await consultarDueno<{ es_prueba: boolean }>("SELECT es_prueba FROM cne.asignaciones_cargo WHERE activa"))[0].es_prueba).toBe(false);
  });
});

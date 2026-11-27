import { afterAll, beforeAll, expect, it } from "vitest";
import { consultarJuntaVerificacion, verificarActuacion as verificar } from "@/server/verificacion-mesas";
import { fichaPago } from "@/server/finanzas";
import { closePools } from "@/server/db";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const actor = { tipo: "madrid_admin" as const, id: 1, nombre: "Verificador Prueba" };
const cedula = "0000000092";
async function verificarActuacion(actor: Parameters<typeof verificar>[0], datos: Omit<Parameters<typeof verificar>[1], "personaAnterior">) {
  const persona = (await consultarJuntaVerificacion(datos.juntaId, datos.cedula))?.persona ?? null;
  return verificar(actor, { ...datos, personaAnterior: persona });
}
beforeAll(async () => { await reiniciarBase(); });
afterAll(closePools);

it("incorpora por cédula al sustituto, registra la Vocalía y la muestra en Finanzas", async () => {
  const [{ id }] = await consultarDueno<{ id: number }>("SELECT id::int FROM cne.juntas_madrid WHERE serie='H' AND numero=4");
  const r = await verificarActuacion(actor, { cedula, nombres: "PERSONA", apellidos: "PRUEBA", juntaId: id, cargo: "vocal", modo: "prueba", verificacionAnterior: null });
  expect(r.ok).toBe(true);
  expect(await fichaPago(cedula)).toMatchObject({ cargo: "VOCAL", juntaVigente: "H4", actuacionVerificada: true });
  expect(await consultarDueno("SELECT id FROM cne.actas_pago")).toEqual([]);
});

it("traslada un suplente y rechaza una segunda confirmación que ignora la sustitución actual", async () => {
  const [{ id }] = await consultarDueno<{ id: number }>("SELECT id::int FROM cne.juntas_madrid WHERE serie='H' AND numero=7");
  const { id: suplente } = (await consultarDueno<{ id: number }>(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
    SELECT '0000000093','SUPLENTE PRUEBA','PERSONA','SUPLENTE','suplente',id FROM cne.juntas_madrid WHERE serie='H' AND numero=6 RETURNING id::int`))[0];
  const anterior = { cedula: "0000000093", juntaId: id, cargo: "vocal", modo: "prueba" as const, verificacionAnterior: null };
  const consultaAnterior = (await consultarJuntaVerificacion(id, anterior.cedula))?.persona ?? null;
  expect((await verificarActuacion(actor, anterior)).ok).toBe(true);
  expect((await verificar(actor, { ...anterior, cargo: "secretario", personaAnterior: consultaAnterior })).ok).toBe(false);
  expect(await fichaPago(anterior.cedula)).toMatchObject({ cargo: "VOCAL", juntaOrigen: "H6", juntaVigente: "H7", actuacionVerificada: true });
  expect((await verificarActuacion(actor, { ...anterior, cedula, nombres: "PERSONA", apellidos: "PRUEBA" })).ok).toBe(false);
  expect(await consultarDueno("SELECT cargo FROM cne.asignaciones_cargo WHERE mjrv_id=$1 AND activa", [suplente])).toEqual([{ cargo: "vocal" }]);
});

it("conserva el folio al reimprimir sin anexo si el cargo cambia y protege la actuación sustituida", async () => {
  const { generarRecibosContingencia, confirmarPago } = await import("@/server/finanzas");
  const { guardarDocumento } = await import("@/server/documentos");
  const { validarCedula } = await import("@/server/mjrv");
  const { default: sharp } = await import("sharp");
  const { randomBytes } = await import("node:crypto");
  await consultarDueno("UPDATE cne.parametros_pago SET pagador_nombre = 'PAGADOR PRUEBA', pagador_cargo = 'CARGO PRUEBA'");
  const [{ id, junta }] = await consultarDueno<{ id: number; junta: number }>(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
    SELECT '0000000094','PERSONA PRUEBA','NOMBRES','SUPLENTE','suplente',id FROM cne.juntas_madrid WHERE serie='H' AND numero=8
    RETURNING id::int, junta_origen_id::int AS junta`);
  const finanzas = { enlaceId: null, operadorId: null, operadorNombre: "Finanzas Prueba", usuarioId: 1 };
  const imagen = await sharp(randomBytes(560 * 400 * 3), { raw: { width: 560, height: 400, channels: 3 } }).jpeg().toBuffer();
  expect(await guardarDocumento({ mjrvId: id, lado: "pasaporte", imagen, origen: "estacion" })).toMatchObject({ ok: true });
  expect(await validarCedula({ tipo: "usuario", id: 1, nombre: "Finanzas Prueba", portal: "finanzas" }, id)).toMatchObject({ ok: true });
  expect(await generarRecibosContingencia(finanzas, [id], "prueba")).toMatchObject({ ok: true });
  const previa = await fichaPago("0000000094");
  const acta = previa?.acta;
  expect(previa).toMatchObject({ actuacionVerificada: false });
  if (!acta) throw Error("No se emitió el recibo de prueba");
  expect(await verificarActuacion(actor, {
    cedula: "0000000094", cargo: "presidente", juntaId: junta, modo: "prueba", verificacionAnterior: null,
  })).toMatchObject({ ok: true });
  const { quitarCargo } = await import("@/server/movimientos");
  expect(await quitarCargo(actor, { juntaId: junta, mjrvId: id })).toMatchObject({ ok: false, mensaje: expect.stringContaining("confirmado en mesa") });
  expect((await fichaPago("0000000094"))?.acta?.documentoPendiente).toBe(true);
  const datosPago = { mjrvId: id, actaId: acta.id, verificado: true };
  expect(await confirmarPago(finanzas, datosPago)).toMatchObject({ ok: false, mensaje: expect.stringContaining("Reimprima") });
  expect(await generarRecibosContingencia(finanzas, [id], "prueba", true)).toMatchObject({ ok: true, numeros: [acta.numero] });
  expect(await consultarDueno("SELECT parametros #>> '{persona_recibo,cargo}' AS cargo FROM cne.actas_pago WHERE id = $1", [acta.id]))
    .toEqual([{ cargo: "PRESIDENTE" }]);
  const puesto = (await consultarJuntaVerificacion(junta))?.puestos.find((x) => x.cargo === "presidente");
  expect(await verificarActuacion(actor, {
    cedula: "0000000095", nombres: "OTRA", apellidos: "PERSONA PRUEBA",
    cargo: "presidente", juntaId: junta, modo: "prueba", verificacionAnterior: puesto?.id ?? null,
  })).toMatchObject({ ok: true });
  expect((await fichaPago("0000000094"))?.actuacionRetirada).toBe(true);
  expect(await confirmarPago(finanzas, datosPago)).toMatchObject({ ok: false, mensaje: expect.stringContaining("retiró") });
});

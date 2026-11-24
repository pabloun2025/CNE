import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import type { ActorPago } from "@/server/finanzas";
import { confirmarPago, fichaPago, generarActa } from "@/server/finanzas";
import { borrarMjrv, borrarMjrvSeleccion, crearMjrv, editarMjrv, obtenerFicha, validarCedula, type DatosMjrv } from "@/server/mjrv";
import { revocarMjrv } from "@/server/revocar-credencial";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", rol: "consul", debeCambiar: false };
const datos = (o: Partial<DatosMjrv> = {}): DatosMjrv => ({ cedula: "0000000010", apellidos: "APELLIDO PRUEBA 010", nombres: "NOMBRE PRUEBA", cargo: "presidente", junta: "H20", correo: "a@b.c", telefono: "+34612345678", ...o });
const foto = () => sharp(randomBytes(900 * 600 * 3), { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();

describe("borrar fichas", () => {
  let usuarioId = 0;
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, rol, correo, nombre, password_hash) VALUES ('madrid_admin','consul','a@x.y','Admin','x')");
    usuarioId = (await consultarDueno<{ id: number }>("SELECT id FROM cne.usuarios WHERE correo = 'a@x.y'"))[0].id;
    sesion.usuarioId = usuarioId;
  });
  afterAll(closePools);

  it("añade, edita y borra una ficha limpia", async () => {
    const creada = await crearMjrv(sesion, datos());
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;
    expect(await obtenerFicha(creada.id)).toMatchObject({ rol: "presidente", cargo_original: "PRESIDENTE/A", origen: "M20", telefono_e164: "+34612345678", correo: "a@b.c" });
    expect((await editarMjrv(sesion, creada.id, datos({ cargo: "secretario", correo: "b@c.d" }))).ok).toBe(true);
    expect(await obtenerFicha(creada.id)).toMatchObject({ rol: "secretario", correo: "b@c.d" });
    expect(await borrarMjrv(sesion, creada.id, false)).toMatchObject({ ok: false });
    expect(await obtenerFicha(creada.id)).not.toBeNull();
    expect(await borrarMjrv(sesion, creada.id, true)).toEqual({ ok: true });
    expect(await obtenerFicha(creada.id)).toBeNull();
  });

  it("no guarda cédula corta, correo malo, fijo ni cargo libre", async () => {
    expect((await crearMjrv(sesion, datos({ cedula: "1234" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "1".repeat(21) }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000011", correo: "no-es" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000011", telefono: "+34911234567" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000011", cargo: "jefe" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000011", telefono: "+34", correo: "" }))).ok).toBe(true);
  });

  it("no borra si ya se pagó y deja editar o revocar", async () => {
    const creada = await crearMjrv(sesion, datos({ cedula: "0000000012", junta: "H21" }));
    expect(creada.ok).toBe(true);
    if (!creada.ok) return;
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd=100, importe_eur=55, pagador_nombre='PAGADOR PRUEBA', pagador_cargo='CARGO PRUEBA', lugar='LUGAR PRUEBA'");
    await guardarDocumento({ mjrvId: creada.id, lado: "anverso", imagen: await foto(), origen: "estacion" });
    await guardarDocumento({ mjrvId: creada.id, lado: "reverso", imagen: await foto(), origen: "estacion" });
    const actor: ActorPago = { enlaceId: null, operadorId: null, operadorNombre: "Admin", usuarioId };
    const acta = await generarActa(actor, creada.id, true);
    expect(acta.ok).toBe(true);
    if (!acta.ok) return;
    expect(await borrarMjrv(sesion, creada.id, true)).toMatchObject({ ok: false, mensaje: expect.stringContaining("recibo emitido") });
    expect(await validarCedula({ portal: "finanzas", tipo: "usuario", id: usuarioId, nombre: actor.operadorNombre }, creada.id)).toMatchObject({ ok: true });
    const [fila] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [creada.id]);
    expect(await confirmarPago(actor, { mjrvId: creada.id, actaId: fila.id, verificado: true })).toMatchObject({ ok: true });
    expect((await fichaPago("0000000012", actor))?.pago?.operador).toBe("Admin");
    const bloqueo = await borrarMjrv(sesion, creada.id, true);
    expect(bloqueo.ok).toBe(false);
    if (!bloqueo.ok) {
      expect(bloqueo.mensaje).toContain("Ya se pagó");
      expect(bloqueo.revocar).toBe(true);
    }
    expect(await obtenerFicha(creada.id)).not.toBeNull();
  });

  it("no borra a quien cubre un cargo de una junta constituida", async () => {
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Puerta Prueba','x','{puerta}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta 1','\\x11')");
    const [op] = await consultarDueno<{ id: number }>("SELECT id FROM cne.operadores_madrid");
    const [en] = await consultarDueno<{ id: number }>("SELECT id FROM cne.enlaces_estacion");
    const ids: number[] = [];
    for (const [rol, cedula] of [["presidente", "0000000021"], ["secretario", "0000000022"], ["vocal", "0000000023"]] as const) {
      const r = await crearMjrv(sesion, datos({ cedula, cargo: rol, junta: "H1", telefono: "", correo: "" }));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      ids.push(r.id);
      await consultarDueno(
        "INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id) VALUES ($1,$2,'valido',$3,$4)",
        [cedula, r.id, op.id, en.id],
      );
    }
    const bloqueo = await borrarMjrv(sesion, ids[0], true);
    expect(bloqueo.ok).toBe(false);
    if (!bloqueo.ok) expect(bloqueo.mensaje).toContain("quedó constituida");
    expect(await obtenerFicha(ids[0])).not.toBeNull();
  });

  it("borra las fichas seleccionadas, incluso de baja o sin rótulo, y devuelve las protegidas", async () => {
    const crear = async (cedula: string) => {
      const r = await crearMjrv(sesion, datos({ cedula }));
      if (!r.ok) throw new Error(r.mensaje);
      return r.id;
    };
    const activa = await crear("0000000091");
    const baja = await crear("0000000092");
    const sinSeleccionar = await crear("0000000093");
    await consultarDueno("UPDATE cne.mjrv SET activo = false WHERE id = $1", [baja]);
    const [{ id: pagada }] = await consultarDueno<{ id: number }>("SELECT id FROM cne.mjrv WHERE cedula = '0000000012'");
    const ids = [activa, baja, baja, pagada];
    expect(await borrarMjrvSeleccion(sesion, ids, false)).toMatchObject({ ok: false });
    expect(await borrarMjrvSeleccion(sesion, ids, true)).toEqual({
      ok: true, borradas: 2, retenidas: [{ id: pagada, mensaje: expect.stringContaining("Ya se pagó"), revocar: true }],
    });
    for (const id of [activa, baja]) expect(await obtenerFicha(id)).toBeNull();
    for (const id of [pagada, sinSeleccionar]) expect(await obtenerFicha(id)).not.toBeNull();
  });

  it("conserva recibos históricos y continúa con el lote si hay actividad invisible en el otro modo", async () => {
    const [vigente, otroModo, limpia] = await Promise.all(["0000000094", "0000000095", "0000000096"].map(async (cedula) => {
      const r = await crearMjrv(sesion, datos({ cedula }));
      if (!r.ok) throw new Error(r.mensaje);
      return r.id;
    }));
    await consultarDueno(
      `INSERT INTO cne.actas_pago (mjrv_id, usuario_id, importe_usd, importe_eur, parametros, impresion_n, es_prueba)
       VALUES ($1, $3, 70, 58.82, '{}', 1, true), ($2, $3, 70, 58.82, '{}', 1, false)`,
      [vigente, otroModo, usuarioId],
    );
    expect(await borrarMjrvSeleccion(sesion, [vigente, otroModo, limpia], true)).toMatchObject({
      ok: true, borradas: 1, retenidas: [
        { id: vigente, mensaje: expect.stringContaining("recibo emitido") },
        { id: otroModo, mensaje: expect.stringContaining("otro modo") },
      ],
    });
    expect(await obtenerFicha(limpia)).toBeNull();
  });

  it("al borrar una ficha notificada conserva el cómputo de la cola y una revocación existente", async () => {
    const creada = await crearMjrv(sesion, datos({ cedula: "0000000097" }));
    if (!creada.ok) throw new Error(creada.mensaje);
    await revocarMjrv(sesion, creada.id);
    await consultarDueno(
      `INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, estado, simulado, id_externo, enviado_en)
       VALUES ($1, 'whatsapp', '+34600000000', 'enviada_al_servicio', false, 'externo-prueba', now())`, [creada.id],
    );
    expect(await borrarMjrv(sesion, creada.id, true)).toEqual({ ok: true });
    expect(await consultarDueno("SELECT mjrv_id, cedula FROM cne.credenciales_revocadas WHERE cedula='0000000097'"))
      .toEqual([{ mjrv_id: null, cedula: "0000000097" }]);
    expect(await consultarDueno("SELECT mjrv_id, destino, id_externo FROM cne.envios_credencial WHERE enviado_en IS NOT NULL AND NOT simulado"))
      .toEqual([{ mjrv_id: null, destino: "", id_externo: null }]);
  });
});

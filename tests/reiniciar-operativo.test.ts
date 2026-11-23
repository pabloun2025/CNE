import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { Sesion } from "@/server/auth";
import { marcarGeneradas, seleccionarParaCredencial } from "@/server/credenciales";
import { closePools, getOwnerPool, withOwnerTx } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import { procesarCola } from "@/server/envios/cola";
import { registrarEscaneoFinanzas } from "@/server/escaneos-finanzas";
import type { SesionEstacion } from "@/server/estaciones";
import { confirmarPago, fichaPago, generarActa } from "@/server/finanzas";
import { aplicarImportacion } from "@/server/importar-mjrv";
import { crearMjrv, validarCedula } from "@/server/mjrv";
import { credencialesIndividuales } from "@/server/pdf/credencial";
import { dejarPasar, registrarLectura } from "@/server/puerta";
import { reiniciarOperativo, resumenReinicioTotal, revisionReinicio } from "@/server/reiniciar-operativo";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const superadmin: Sesion = {
  sesionId: "test", usuarioId: 1, correo: "super@prueba.cne", nombre: "Superadmin",
  tipo: "superadmin", rol: "consul", debeCambiar: false,
};
const cuentaAdmin: Sesion = { ...superadmin, tipo: "madrid_admin" };
const cantidad = async (tabla: string) => (
  await consultarDueno<{ n: number }>(`SELECT count(*)::int AS n FROM cne.${tabla}`)
)[0].n;
const serie = async () => withOwnerTx(async (client) => {
  const ord = [];
  const { rows: [cfg] } = await client.query<{ modo: string }>("SELECT modo FROM configuracion FOR UPDATE");
  for (const modo of ["eleccion", "prueba"]) {
    await client.query("UPDATE configuracion SET modo=$1", [modo]);
    const { rows } = await client.query("SELECT es_prueba, ultimo_ordinal FROM secuencia_recibos WHERE es_prueba = cne.en_prueba()");
    ord.push(...rows);
  }
  await client.query("UPDATE configuracion SET modo=$1", [cfg.modo]);
  return ord;
});
const revision = async () => revisionReinicio(await resumenReinicioTotal());
const reiniciar = async () => reiniciarOperativo(superadmin, "BORRAR TODO", await revision());
const foto = () => sharp(randomBytes(360 * 240 * 3), { raw: { width: 360, height: 240, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();

async function importar(cedula: string) {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet([{
    cedula, apellidos: "APELLIDO FICTICIO", nombres: "NOMBRE FICTICIO", cargo: "Vocal", serie: "H", junta: 1, rotulo: "H1",
  }]), "MJRV");
  const archivo: Buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });
  expect(await aplicarImportacion(cuentaAdmin, archivo, "ensayo-ficticio.xlsx", [])).toMatchObject({ ok: true, nuevas: 1 });
  const [ficha] = await consultarDueno<{ id: number; es_prueba: boolean }>("SELECT id, es_prueba FROM cne.mjrv WHERE cedula=$1", [cedula]);
  expect(ficha.es_prueba).toBe(false);
  return ficha.id;
}

let puesto: SesionEstacion;
let puerta: { enlaceId: number; operadorId: number };
let fotos: Buffer[];

async function prepararRecibo(id: number, cedula: string, modo: "prueba" | "eleccion") {
  for (const [i, lado] of (["anverso", "reverso"] as const).entries()) {
    expect(await guardarDocumento({ mjrvId: id, lado, imagen: fotos[i], origen: "estacion" })).toMatchObject({ ok: true });
  }
  expect(await validarCedula({ portal: "finanzas", tipo: "operador", id: puesto.operadorId, nombre: puesto.operadorNombre }, id)).toMatchObject({ ok: true });
  await fichaPago(cedula, puesto);
  const emitido = await generarActa(puesto, id, true, { modoEsperado: modo });
  expect(emitido).toMatchObject({ ok: true, borrador: false, numero: modo === "prueba" ? "PRUEBA-2026-001" : "MAD-2026-001" });
  if (!emitido.ok || emitido.borrador || emitido.actaId === null) throw new Error("Falta el recibo ficticio");
  return emitido.actaId;
}

const parametros = () => consultarDueno("SELECT * FROM cne.parametros_pago");
const configuracion = () => consultarDueno("SELECT to_jsonb(c) - ARRAY['modo','whatsapp_real','whatsapp_real_2','correo_real','whatsapp_proximo_en','whatsapp_proximo_en_2','correo_proximo_en','whatsapp_pausa_motivo','whatsapp_pausa_motivo_2','correo_pausa_motivo','actualizado_en','actualizado_por'] AS ajustes FROM cne.configuracion c");
const estructura = () => Promise.all(["usuarios", "operadores_madrid", "enlaces_estacion", "juntas_madrid"].map((tabla) =>
  consultarDueno(`SELECT to_jsonb(t) AS fila FROM cne.${tabla} t ORDER BY id`),
));

describe("reiniciar operativo completo en una base ficticia", () => {
  beforeAll(async () => {
    await reiniciarBase();
    fotos = await Promise.all([foto(), foto()]);
    const [operador] = await consultarDueno<{ id: number }>("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Operador de ensayo','hash-prueba','{puerta,finanzas}') RETURNING id");
    const [p, f] = await consultarDueno<{ id: number }>("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta prueba','\\x0102'), ('finanzas','Finanzas prueba','\\x0103') RETURNING id");
    puesto = { sesionId: "x", operadorId: operador.id, operadorNombre: "Operador de ensayo", enlaceId: f.id, funcion: "finanzas", etiqueta: "Finanzas prueba" };
    puerta = { enlaceId: p.id, operadorId: operador.id };
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd=70, importe_eur=58.82, pagador_nombre='FIRMANTE FICTICIO', pagador_cargo='CARGO FICTICIO', lugar='Madrid'");
    await consultarDueno("UPDATE cne.configuracion SET documentos_publico_abierto=true, correo_remitente='ensayo@ejemplo.invalid', credencial_ancho_mm=56, whatsapp_numero='34900000000', whatsapp_numero_2='34900000001'");
    expect(await crearMjrv(cuentaAdmin, { cedula: "0000000003", apellidos: "ALTA", nombres: "FICTICIA", cargo: "vocal", junta: "H3", correo: "", telefono: "" })).toMatchObject({ ok: true });
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, es_prueba)
      SELECT '0000000004','DEMO','FICTICIA','VOCAL','vocal',id,true FROM cne.juntas_madrid WHERE serie='H' AND numero=4`);
    for (const [modo, cedula] of [["prueba", "0000000001"], ["eleccion", "0000000002"]] as const) {
      await consultarDueno("UPDATE cne.configuracion SET modo=$1", [modo]);
      const id = await importar(cedula);
      const credencial = await seleccionarParaCredencial({ alcance: "ids", ids: [id] });
      expect(credencial.ids).toEqual([id]);
      expect(Buffer.from(await credencialesIndividuales(credencial.datos)).subarray(0, 5).toString()).toBe("%PDF-");
      await marcarGeneradas(credencial.ids);
      expect((await registrarLectura(puerta, cedula, null)).resultado).toBe("valido");
      expect((await registrarLectura(puerta, cedula, null)).resultado).toBe("duplicado");
      expect(await dejarPasar(puerta, id)).toEqual({ ok: true });
      expect((await registrarLectura(puerta, "0000099999", null)).resultado).toBe("desconocido");
      expect(await registrarEscaneoFinanzas(puesto.enlaceId, cedula)).toBe(true);
      const actaId = await prepararRecibo(id, cedula, modo);
      expect((await fichaPago(cedula))?.pago).toBeNull();
      expect(await confirmarPago(puesto, { mjrvId: id, actaId, verificado: true })).toMatchObject({ ok: true, simulado: modo === "prueba" });
      // Incluye formatos antiguos y movimientos, además de las operaciones actuales.
      await consultarDueno(`INSERT INTO cne.firmas_recibo (mjrv_id, acta_id, pdf) VALUES ($1,$2,'\\x0102')`, [id, actaId]);
      await consultarDueno("INSERT INTO cne.pendientes_impresion (mjrv_id,junta) VALUES ($1,'H1')", [id]);
      await consultarDueno(`INSERT INTO cne.decisiones_movimiento (mjrv_id,junta_origen_id,junta_destino_id,decision,actor_tipo,actor_id,actor_nombre)
        SELECT $1,j1.id,j2.id,'aceptada','operador',$2,'Ensayo' FROM cne.juntas_madrid j1, cne.juntas_madrid j2
        WHERE j1.serie='H' AND j1.numero=1 AND j2.serie='H' AND j2.numero=2`, [id, operador.id]);
      await consultarDueno(`INSERT INTO cne.asignaciones_cargo (mjrv_id,junta_id,cargo,origen,actor_tipo,actor_id,actor_nombre)
        SELECT $1,id,'vocal','traslado','operador',$2,'Ensayo' FROM cne.juntas_madrid WHERE serie='H' AND numero=2`, [id, operador.id]);
      await consultarDueno(`INSERT INTO cne.excepciones_disponibilidad (mjrv_id,motivo,actor_tipo,actor_id,actor_nombre) VALUES ($1,'Ensayo','operador',$2,'Ensayo')`, [id, operador.id]);
    }
    await consultarDueno(`INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, simulado, estado)
      SELECT id,'correo','ensayo@ejemplo.invalid',true,'enviada_al_servicio' FROM cne.mjrv`);
    await consultarDueno(`INSERT INTO cne.credenciales_revocadas (mjrv_id, cedula, actor_nombre)
      SELECT id,cedula,'Operador ficticio' FROM cne.mjrv WHERE es_prueba`);
    await consultarDueno("UPDATE cne.configuracion SET whatsapp_real=true, whatsapp_real_2=true, correo_real=true, whatsapp_pausa_motivo='ensayo', whatsapp_pausa_motivo_2='ensayo', whatsapp_proximo_en=now(), whatsapp_proximo_en_2=now()");
  });
  afterAll(closePools);

  it("exige superadministración y la frase escrita, y cuenta la actividad de los dos modos", async () => {
    await expect(reiniciarOperativo(cuentaAdmin, "BORRAR TODO", await revision())).rejects.toThrow("superadministración");
    expect(await reiniciarOperativo(superadmin, "borrar todo", await revision())).toMatchObject({ ok: false });
    const recuento = Object.fromEntries((await resumenReinicioTotal()).map((x) => [x.tabla, x.n]));
    expect(recuento).toEqual({
      mjrv: 4, envios_credencial: 4, credenciales_revocadas: 1, pagos_confirmados: 2, firmas_recibo: 2,
      pendientes_impresion: 2, actas_pago: 2, documentos_mjrv: 4, cedulas_validadas: 2,
      fichas_abiertas_finanzas: 2, escaneos_finanzas: 2, asignaciones_cargo: 2,
      decisiones_movimiento: 2, excepciones_disponibilidad: 2, lecturas_puerta: 8,
    });
    expect(await consultarDueno("SELECT modo FROM cne.configuracion")).toEqual([{ modo: "eleccion" }]);
  });

  it("deja terminar una escritura concurrente y rechaza la confirmación si cambia el recuento", async () => {
    const anterior = await revision();
    const escritor = await (await getOwnerPool()).connect();
    try {
      await escritor.query("BEGIN");
      await escritor.query("INSERT INTO cne.credenciales_revocadas (cedula, actor_nombre) VALUES ('0000000099','Ensayo')");
      expect(await reiniciarOperativo(superadmin, "BORRAR TODO", anterior)).toMatchObject({ ok: false, mensaje: expect.stringContaining("actividad en curso") });
      await escritor.query("COMMIT");
    } finally {
      await escritor.query("ROLLBACK");
      escritor.release();
    }
    try {
      expect(await reiniciarOperativo(superadmin, "BORRAR TODO", anterior)).toMatchObject({ ok: false, mensaje: expect.stringContaining("recuento") });
      expect(await cantidad("mjrv")).toBe(4);
      expect(await cantidad("credenciales_revocadas")).toBe(2);
    } finally {
      await consultarDueno("DELETE FROM cne.credenciales_revocadas WHERE cedula='0000000099'");
    }
  });

  it("una ficha que desaparece durante la consulta de Finanzas devuelve no encontrada", async () => {
    const cedula = "0000000033";
    const id = await importar(cedula);
    const escritor = await (await getOwnerPool()).connect();
    let consulta: ReturnType<typeof fichaPago>;
    try {
      await escritor.query("BEGIN");
      await escritor.query("SELECT id FROM configuracion WHERE id = 1 FOR UPDATE");
      await escritor.query("DELETE FROM mjrv WHERE id=$1", [id]);
      consulta = fichaPago(cedula, puesto);
      void consulta.catch(() => undefined);
      await expect.poll(async () => (await consultarDueno<{ bloqueado: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_stat_activity a USING (pid) WHERE a.datname=current_database() AND a.usename='cne_app' AND NOT l.granted) AS bloqueado",
      ))[0].bloqueado).toBe(true);
      await escritor.query("COMMIT");
    } finally {
      await escritor.query("ROLLBACK");
      escritor.release();
    }
    await expect(consulta).resolves.toBeNull();
  });

  it("revierte la operación si falta una de las dos series", async () => {
    const antes = await resumenReinicioTotal();
    await consultarDueno("UPDATE cne.configuracion SET modo='eleccion'");
    await consultarDueno("DELETE FROM cne.secuencia_recibos WHERE NOT es_prueba");
    try {
      expect(await reiniciar()).toMatchObject({ ok: false, mensaje: expect.stringContaining("revirtió") });
      expect(await resumenReinicioTotal()).toEqual(antes);
      expect(await serie()).toEqual([{ es_prueba: true, ultimo_ordinal: 1 }]);
    } finally {
      await consultarDueno("INSERT INTO cne.secuencia_recibos (es_prueba, ultimo_ordinal) VALUES (false, 1)");
    }
  });

  it("revierte el borrado, el modo, los canales y las series si falla incluso al registrar la auditoría", async () => {
    await consultarDueno("UPDATE cne.configuracion SET modo='prueba'");
    const antes = await resumenReinicioTotal();
    await consultarDueno(`CREATE FUNCTION cne.provocar_fallo_reinicio() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Fallo de auditoría ficticio'; END $$;
      CREATE TRIGGER fallo_reinicio BEFORE INSERT ON cne.auditoria FOR EACH ROW
        WHEN (NEW.accion = 'reinicio_total_operativo') EXECUTE FUNCTION cne.provocar_fallo_reinicio()`);
    try {
      expect(await reiniciar()).toMatchObject({ ok: false });
      expect(await resumenReinicioTotal()).toEqual(antes);
      expect(await consultarDueno("SELECT modo, whatsapp_real, whatsapp_real_2, correo_real FROM cne.configuracion"))
        .toEqual([{ modo: "prueba", whatsapp_real: true, whatsapp_real_2: true, correo_real: true }]);
      expect(await serie()).toEqual([{ es_prueba: false, ultimo_ordinal: 1 }, { es_prueba: true, ultimo_ordinal: 1 }]);
      expect(await cantidad("respaldo_limpieza")).toBe(0);
    } finally {
      await consultarDueno("DROP TRIGGER fallo_reinicio ON cne.auditoria");
    }
  });

  it("espera al trabajador de envíos y conserva los ajustes y la auditoría al reiniciar ambos modos", async () => {
    const [ajustes, datosPago, permanentes, auditorias] = await Promise.all([configuracion(), parametros(), estructura(), cantidad("auditoria")]);
    const vista = await revision();
    const trabajador = await (await getOwnerPool()).connect();
    let r: ReturnType<typeof reiniciarOperativo>;
    try {
      await trabajador.query("SELECT pg_advisory_lock(4343)");
      r = reiniciarOperativo(superadmin, "BORRAR TODO", vista);
      expect(await procesarCola()).toMatchObject({ whatsapp: { accion: "candado" }, correo: { accion: "candado" } });
      await expect.poll(async () => (await consultarDueno<{ bloqueado: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=4343 AND NOT granted) AS bloqueado",
      ))[0].bloqueado).toBe(true);
      expect(await cantidad("mjrv")).toBe(4);
    } finally {
      await trabajador.query("SELECT pg_advisory_unlock(4343)");
      trabajador.release();
    }
    const resultado = await r;
    expect(resultado).toMatchObject({ ok: true });
    if (!resultado.ok) return;
    expect(resultado.antes.find((fila) => fila.tabla === "mjrv")?.n).toBe(4);
    expect(resultado.despues.every((fila) => fila.n === 0)).toBe(true);
    expect(await resumenReinicioTotal()).toEqual(resultado.despues);
    expect(await configuracion()).toEqual(ajustes);
    expect(await parametros()).toEqual(datosPago);
    expect(await estructura()).toEqual(permanentes);
    expect(await cantidad("juntas_madrid")).toBe(95);
    expect(await cantidad("respaldo_limpieza")).toBe(0);
    expect(await cantidad("auditoria")).toBe(auditorias + 1);
    expect(await serie()).toEqual([{ es_prueba: false, ultimo_ordinal: 0 }, { es_prueba: true, ultimo_ordinal: 0 }]);
    expect(await consultarDueno("SELECT modo, whatsapp_real, whatsapp_real_2, correo_real, whatsapp_pausa_motivo, whatsapp_proximo_en, whatsapp_pausa_motivo_2, whatsapp_proximo_en_2 FROM cne.configuracion"))
      .toEqual([{ modo: "eleccion", whatsapp_real: false, whatsapp_real_2: false, correo_real: false, whatsapp_pausa_motivo: null, whatsapp_proximo_en: null, whatsapp_pausa_motivo_2: null, whatsapp_proximo_en_2: null }]);
    expect(await procesarCola()).toMatchObject({ whatsapp: { accion: "omitido" }, correo: { accion: "omitido" } });
  });

  it("después del reinicio se vuelve a importar y numerar desde 1 en los dos modos", async () => {
    const cedula = "0000000001";
    const id = await importar(cedula);
    for (const modo of ["eleccion", "prueba"] as const) {
      await consultarDueno("UPDATE cne.configuracion SET modo=$1", [modo]);
      await prepararRecibo(id, cedula, modo);
      expect((await fichaPago(cedula))?.pago).toBeNull();
    }
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closePools, withOwnerTx } from "@/server/db";
import type { SesionEstacion } from "@/server/estaciones";
import { normalizarCodigo } from "@/domain/puerta-nombre";
import { comprobarCredencial, contadoresPuerta, dejarPasar, registrarLectura } from "@/server/puerta";
import { consultarDueno, reiniciarBase } from "./helpers/db";

let s1: SesionEstacion, s2: SesionEstacion;

describe("puerta", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Op Prueba','x','{puerta}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta 1','\\x01'), ('puerta','Puerta 2','\\x02')");
    const j = "(SELECT id FROM cne.juntas_madrid WHERE serie='H' AND numero=12)";
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) VALUES ('0000000001','APELLIDO PRUEBA 001','NOMBRE PRUEBA','PRESIDENTE','presidente',${j}), ('0000000002','APELLIDO PRUEBA 002','NOMBRE PRUEBA','VOCAL','vocal',${j}), ('0000000003','APELLIDO PRUEBA 003','NOMBRE PRUEBA','VOCAL','vocal',${j})`);
    await consultarDueno("UPDATE cne.mjrv SET activo = false WHERE cedula = '0000000003'");
    const [o] = await consultarDueno<{ id: number }>("SELECT id FROM cne.operadores_madrid");
    const e = await consultarDueno<{ id: number }>("SELECT id FROM cne.enlaces_estacion ORDER BY id");
    const base = { sesionId: "x", funcion: "puerta" as const, operadorId: o.id, operadorNombre: "Op Prueba" };
    s1 = { ...base, enlaceId: e[0].id, etiqueta: "Puerta 1" };
    s2 = { ...base, enlaceId: e[1].id, etiqueta: "Puerta 2" };
  });
  afterAll(closePools);

  it("lectura válida muestra nombre y junta vigente; la segunda es duplicado", async () => {
    expect(await registrarLectura(s1, "0000000001", "tab")).toEqual({ resultado: "valido", nombre: "APELLIDO PRUEBA 001, NOMBRE PRUEBA", junta: "H12", zona: "Amarillo" });
    const d = await registrarLectura(s2, " 0000000001 ", null);
    expect(d).toMatchObject({ resultado: "duplicado", nombre: "APELLIDO PRUEBA 001, NOMBRE PRUEBA", junta: "H12", mjrvId: expect.any(Number) });
    expect(Number.isNaN(Date.parse((d as { desde: string }).desde))).toBe(false); // hora del primer ingreso
  });

  it("«Dejar pasar»: queda registrado y no cuenta como segundo ingreso; sin ingreso previo → 409", async () => {
    const d = await registrarLectura(s2, "0000000001", null);
    if (d.resultado !== "duplicado") throw new Error("se esperaba un reingreso");
    const antes = await contadoresPuerta(s1.enlaceId);
    expect(await dejarPasar(s2, d.mjrvId)).toEqual({ ok: true });
    expect(await dejarPasar(s2, d.mjrvId)).toEqual({ ok: true }); // cada pase se anota, ninguno suma ingresos
    expect(await contadoresPuerta(s1.enlaceId)).toEqual(antes);
    const r = await consultarDueno<{ n: number; enlace_id: string }>("SELECT count(*)::int AS n, min(enlace_id)::text AS enlace_id FROM cne.lecturas_puerta WHERE resultado = 'reingreso_autorizado'");
    expect(r[0].n).toBe(2);
    expect(r[0].enlace_id).toBe(String(s2.enlaceId));
    expect((await consultarDueno("SELECT 1 FROM cne.lecturas_puerta WHERE mjrv_id = $1 AND resultado = 'valido'", [d.mjrvId])).length).toBe(1);
    const [otra] = await consultarDueno<{ id: number }>("SELECT id FROM cne.mjrv WHERE cedula = '0000000002'");
    expect(await dejarPasar(s1, otra.id)).toMatchObject({ ok: false, status: 409 });
    expect(await dejarPasar(s1, 987654321)).toMatchObject({ ok: false, status: 404 });
  });

  it("código desconocido y ficha de baja (bloqueado)", async () => {
    expect(await registrarLectura(s1, "9999999999", null)).toEqual({ resultado: "desconocido" });
    expect(await registrarLectura(s1, "0000000003", null)).toEqual({ resultado: "bloqueado" });
  });

  it("dos lecturas simultáneas de la misma cédula producen un solo válido", async () => {
    const r = await Promise.all([registrarLectura(s1, "0000000002", null), registrarLectura(s2, "0000000002", null), registrarLectura(s1, "0000000002", null)]);
    expect(r.filter((x) => x.resultado === "valido")).toHaveLength(1);
    expect(r.filter((x) => x.resultado === "duplicado")).toHaveLength(2);
    expect((await consultarDueno("SELECT 1 FROM cne.lecturas_puerta WHERE resultado = 'valido' AND es_prueba")).length).toBe(2);
  });

  it("contadores por puesto y todas las lecturas quedan registradas con el modo", async () => {
    const c = await contadoresPuerta(s1.enlaceId);
    expect(c.total).toBe(2);
    expect(c.esteEnlace + (await contadoresPuerta(s2.enlaceId)).esteEnlace).toBe(2);
    expect((await consultarDueno("SELECT 1 FROM cne.lecturas_puerta WHERE NOT es_prueba")).length).toBe(0);
  });

  it("normaliza espacios y mayúsculas", () => {
    expect(normalizarCodigo(" ab 12 ")).toBe("AB12");
  });

  it("el nombre encuentra a la persona de la lista y el QR de la cédula sigue valiendo", async () => {
    const j = "(SELECT id FROM cne.juntas_madrid WHERE serie='H' AND numero=12)";
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) VALUES ('0000000004','APELLIDO UNICO','NOMBRE SOLO','VOCAL','vocal',${j})`);
    expect(await registrarLectura(s1, "0000000004", null)).toMatchObject({ resultado: "valido", nombre: "APELLIDO UNICO, NOMBRE SOLO", junta: "H12" });
    expect(await registrarLectura(s1, "Apellido Único", null)).toMatchObject({ resultado: "duplicado", nombre: "APELLIDO UNICO, NOMBRE SOLO" });
    expect(await registrarLectura(s1, "APELLIDO PRUEBA 003", null)).toEqual({ resultado: "bloqueado" });
    expect(await registrarLectura(s1, "APELLIDO PRUEBA", null)).toEqual({ resultado: "ambiguo" });
    expect(await registrarLectura(s1, "persona que no existe", null)).toEqual({ resultado: "desconocido" });
    const antes = (await consultarDueno<{ n: number }>("SELECT count(*)::int AS n FROM cne.lecturas_puerta"))[0].n;
    expect(await comprobarCredencial(s1, "APELLIDO PRUEBA NOMBRE PRUEBA", "cam")).toEqual({ resultado: "desconocido" });
    expect((await consultarDueno<{ n: number }>("SELECT count(*)::int AS n FROM cne.lecturas_puerta"))[0].n).toBe(antes);
  });

  async function ficha(cedula: string, apellidos: string, nombres: string) {
    const [m] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
       SELECT $1, $2, $3, 'VOCAL', 'vocal', id FROM cne.juntas_madrid WHERE serie = 'H' AND numero = 12 RETURNING id`,
      [cedula, apellidos, nombres],
    );
    return m.id;
  }

  it("la entrada manual conserva ceros y consulta solo el número exacto", async () => {
    await ficha("0000000021", "APELLIDO PRUEBA MANUAL", "NOMBRE PRUEBA");
    expect(await registrarLectura(s1, "000000002", null, "cedula")).toEqual({ resultado: "desconocido" });
    expect(await registrarLectura(s1, "Apellido Prueba Manual Nombre Prueba", null, "cedula")).toEqual({ resultado: "desconocido" });
    expect(await registrarLectura(s1, "0000000021", null, "cedula")).toMatchObject({ resultado: "valido", nombre: "APELLIDO PRUEBA MANUAL, NOMBRE PRUEBA" });
  });

  it("el número exacto en la cámara prima sobre el nombre y requiere confirmación", async () => {
    const id = await ficha("0000000022", "APELLIDO PRUEBA NUMERO", "NOMBRE PRUEBA");
    const otro = await ficha("0000000023", "APELLIDO PRUEBA CAMARA", "NOMBRE PRUEBA");
    const texto = "CREDENCIAL\nAPELLIDO PRUEBA CAMARA\nNOMBRE PRUEBA\nCédula: 0000 0000 22";
    const antes = await contadoresPuerta(s1.enlaceId);
    expect(await comprobarCredencial(s1, texto, "cam")).toEqual({ resultado: "pendiente", mjrvId: id, cedula: "0000000022", nombre: "APELLIDO PRUEBA NUMERO, NOMBRE PRUEBA", junta: "H12" });
    expect(await comprobarCredencial(s1, texto, "cam", otro)).toMatchObject({ resultado: "pendiente", mjrvId: id });
    expect(await contadoresPuerta(s1.enlaceId)).toEqual(antes);
    const lecturas = await Promise.all([comprobarCredencial(s1, texto, "cam", id), registrarLectura(s2, "0000000022", null, "cedula")]);
    expect(lecturas.map((lectura) => lectura.resultado).sort()).toEqual(["duplicado", "valido"]);
  });

  it("la cámara usa nombres y apellidos completos si la cédula no coincide", async () => {
    const id = await ficha("0000000024", "APELLIDO PRUEBA RESPALDO", "NOMBRE PRUEBA");
    const texto = "CREDENCIAL APELLIDO PRUEBA RESPALDO NOMBRE PRUEBA 0000000999";
    expect(await comprobarCredencial(s1, "APELLIDO PRUEBA RESPALDO", "cam")).toEqual({ resultado: "desconocido" });
    expect(await comprobarCredencial(s1, texto, "cam")).toMatchObject({ resultado: "pendiente", mjrvId: id });
    expect(await comprobarCredencial(s1, texto, "cam", id)).toMatchObject({ resultado: "valido", nombre: "APELLIDO PRUEBA RESPALDO, NOMBRE PRUEBA" });
  });

  it("impide confirmar un nombre que pasó a ser ambiguo y dos cédulas coincidentes", async () => {
    const id = await ficha("0000000025", "APELLIDO PRUEBA EMPATE", "NOMBRE PRUEBA");
    const texto = "CREDENCIAL APELLIDO PRUEBA EMPATE NOMBRE PRUEBA";
    const antes = (await consultarDueno<{ n: number }>("SELECT count(*)::int AS n FROM cne.lecturas_puerta"))[0].n;
    expect(await comprobarCredencial(s1, texto, "cam")).toMatchObject({ resultado: "pendiente", mjrvId: id });
    await ficha("0000000026", "APELLIDO PRUEBA EMPATE", "NOMBRE PRUEBA");
    expect(await comprobarCredencial(s1, texto, "cam", id)).toEqual({ resultado: "ambiguo" });
    expect(await comprobarCredencial(s1, "0000000025\n0000000026", "cam", id)).toEqual({ resultado: "ambiguo" });
    expect((await consultarDueno<{ n: number }>("SELECT count(*)::int AS n FROM cne.lecturas_puerta"))[0].n).toBe(antes);
  });

  it("la confirmación vuelve a comprobar baja y revocación", async () => {
    const baja = await ficha("0000000027", "APELLIDO PRUEBA BAJA", "NOMBRE PRUEBA");
    const revocada = await ficha("0000000028", "APELLIDO PRUEBA REVOCADA", "NOMBRE PRUEBA");
    const nombre = "APELLIDO PRUEBA REVOCADA NOMBRE PRUEBA";
    expect(await comprobarCredencial(s1, "0000000027", "cam")).toMatchObject({ resultado: "pendiente", mjrvId: baja });
    expect(await comprobarCredencial(s1, nombre, "cam")).toMatchObject({ resultado: "pendiente", mjrvId: revocada });
    await consultarDueno("UPDATE cne.mjrv SET activo = false WHERE id = $1", [baja]);
    await consultarDueno("INSERT INTO cne.credenciales_revocadas (mjrv_id, cedula, apellidos, nombres, actor_nombre) SELECT id, cedula, apellidos, nombres, 'Admin Prueba' FROM cne.mjrv WHERE id = $1", [revocada]);
    expect(await comprobarCredencial(s1, "0000000027", "cam", baja)).toEqual({ resultado: "bloqueado" });
    expect(await comprobarCredencial(s1, nombre, "cam", revocada)).toEqual({ resultado: "revocado" });
    expect(await registrarLectura(s1, "0000000028", null, "cedula")).toEqual({ resultado: "revocado" });
  });

  it("un reingreso espera a que termine la revocación de la ficha", async () => {
    const id = await ficha("0000000029", "APELLIDO PRUEBA REINGRESO", "NOMBRE PRUEBA");
    expect(await registrarLectura(s1, "0000000029", null, "cedula")).toMatchObject({ resultado: "valido" });
    let pase: ReturnType<typeof dejarPasar> | undefined;
    await withOwnerTx(async (client) => {
      await client.query("SELECT id FROM mjrv WHERE id = $1 FOR UPDATE", [id]);
      await client.query("INSERT INTO credenciales_revocadas (mjrv_id, cedula, apellidos, nombres, actor_nombre) SELECT id, cedula, apellidos, nombres, 'Admin Prueba' FROM mjrv WHERE id = $1", [id]);
      pase = dejarPasar(s2, id);
      await vi.waitFor(async () => {
        const { rows } = await client.query("SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))");
        expect(rows).toHaveLength(1);
      });
    });
    expect(await pase).toMatchObject({ ok: false, status: 409 });
    expect(await consultarDueno("SELECT 1 FROM cne.lecturas_puerta WHERE mjrv_id = $1 AND resultado = 'reingreso_autorizado'", [id])).toHaveLength(0);
  });

  it("un ingreso espera a que termine el cambio a modo elección", async () => {
    const id = await ficha("0000000030", "APELLIDO PRUEBA MODO", "NOMBRE PRUEBA");
    let lectura: ReturnType<typeof registrarLectura> | undefined;
    await withOwnerTx(async (client) => {
      await client.query("UPDATE configuracion SET modo = 'eleccion' WHERE id = 1");
      lectura = registrarLectura(s1, "0000000030", null, "cedula");
      await vi.waitFor(async () => {
        const { rows } = await client.query("SELECT 1 FROM pg_stat_activity WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))");
        expect(rows).toHaveLength(1);
      });
    });
    expect(await lectura).toMatchObject({ resultado: "valido" });
    expect(await consultarDueno("SELECT es_prueba FROM cne.lecturas_puerta WHERE mjrv_id = $1", [id])).toEqual([{ es_prueba: false }]);
  });
});

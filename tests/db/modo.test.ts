import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { reiniciarBase, consultarDueno } from "../helpers/db";

// Se usa cne_app (sujeto a RLS): el dueño puede ser superusuario y saltarse las políticas.
let app: Client;

describe("modo prueba y RLS", () => {
  beforeAll(async () => {
    await reiniciarBase();
    app = new Client({ connectionString: process.env.DATABASE_URL });
    await app.connect();
    await app.query("SET search_path TO cne, public");
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','A','x')");
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Op Prueba','x','{puerta}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta 1','\\x01')");
    await consultarDueno(
      "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, es_prueba) VALUES ('0000000001','APELLIDO PRUEBA 001','NOMBRE PRUEBA','PRESIDENTE','presidente',(SELECT id FROM cne.juntas_madrid WHERE serie='H' AND numero=1), true)",
    );
  });
  afterAll(async () => {
    await app.end();
  });

  const lectura = (resultado: string) =>
    app.query("INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id) SELECT '0000000001', (SELECT id FROM mjrv), $1, (SELECT id FROM operadores_madrid), (SELECT id FROM enlaces_estacion) RETURNING es_prueba", [resultado]);

  it("en modo prueba una fila insertada lleva es_prueba = true", async () => {
    const r = await lectura("valido");
    expect(r.rows[0].es_prueba).toBe(true);
  });

  it("el índice único impide dos ingresos válidos en el mismo modo", async () => {
    await expect(lectura("valido")).rejects.toThrow(/lecturas_un_ingreso/);
    await expect(lectura("duplicado")).resolves.toBeTruthy();
  });

  it("al pasar a elección las filas de prueba dejan de verse y el mismo ingreso vuelve a ser posible", async () => {
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    expect((await app.query("SELECT count(*)::int AS n FROM lecturas_puerta")).rows[0].n).toBe(0);
    const r = await lectura("valido");
    expect(r.rows[0].es_prueba).toBe(false);
    expect((await app.query("SELECT count(*)::int AS n FROM lecturas_puerta")).rows[0].n).toBe(1);
    // La fila etiquetada de otro modo no se puede insertar a mano.
    await expect(app.query("INSERT INTO lecturas_puerta (codigo_leido, resultado, operador_id, enlace_id, es_prueba) SELECT 'x','desconocido',(SELECT id FROM operadores_madrid),(SELECT id FROM enlaces_estacion), true")).rejects.toThrow(/row-level security/);
    await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
  });

  it("cne_app no borra un pago confirmado ni lee el respaldo de limpieza", async () => {
    await expect(app.query("DELETE FROM pagos_confirmados")).rejects.toThrow(/permission denied/);
    await expect(app.query("SELECT * FROM respaldo_limpieza")).rejects.toThrow(/permission denied/);
  });

  it("el índice único de pago impide dos pagos de la misma persona en el mismo modo", async () => {
    await app.query("INSERT INTO actas_pago (mjrv_id, operador_id, importe_usd, tipo_cambio, importe_eur, parametros, impresion_n) SELECT m.id, o.id, 100, 1, 100, '{}', 1 FROM mjrv m, operadores_madrid o");
    const insertar = () =>
      app.query("INSERT INTO pagos_confirmados (mjrv_id, acta_id, importe_usd, tipo_cambio, importe_eur, funciones_verificadas, operador_id, enlace_id) SELECT m.id, (SELECT id FROM actas_pago), 100, 1, 100, true, o.id, e.id FROM mjrv m, operadores_madrid o, enlaces_estacion e RETURNING id");
    await insertar();
    await expect(insertar()).rejects.toThrow(/pagos_confirmados_mjrv_id_es_prueba_key/);
  });
});

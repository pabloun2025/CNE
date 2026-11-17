import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { generarDemo } from "../domain/demo";
import type { Serie } from "../domain/juntas";
import { withOwnerTx } from "./db";

function exigirSuperadmin(sesion: Sesion): void {
  if (sesion.tipo !== "superadmin") throw new Error("Solo la superadministración puede hacer esto.");
}

// Usa el pool del dueño: cne_app no borra actividad. Solo en modo prueba.
async function exigirModoPrueba(client: { query: (s: string) => Promise<{ rows: { modo: string }[] }> }) {
  const m = (await client.query("SELECT modo FROM cne.configuracion WHERE id = 1")).rows[0].modo;
  if (m !== "prueba") throw new Error("Los datos de demostración solo se gestionan en modo prueba.");
}

export async function cargarDemo(sesion: Sesion): Promise<{ insertadas: number }> {
  exigirSuperadmin(sesion);
  return withOwnerTx(async (client) => {
    await exigirModoPrueba(client);
    const juntas = (await client.query<{ id: number; serie: Serie; numero: number }>("SELECT id, serie, numero FROM cne.juntas_madrid")).rows;
    const idDe = new Map(juntas.map((j) => [`${j.serie}${j.numero}`, j.id]));
    const fichas = generarDemo(juntas);
    // ON CONFLICT: cargar dos veces no duplica y nunca pisa una ficha existente (real o no).
    const r = await client.query(
      `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial, fuente_archivo, es_prueba)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::bigint[], $7::text[], $8::text[], $9::boolean[])
       ON CONFLICT (cedula) DO NOTHING`,
      [
        fichas.map((f) => f.cedula), fichas.map((f) => f.apellidos), fichas.map((f) => f.nombres), fichas.map((f) => f.cargo),
        fichas.map((f) => f.rol), fichas.map((f) => idDe.get(`${f.serie}${f.numero}`)), fichas.map((f) => f.rotulo),
        fichas.map((f) => f.fuente), fichas.map(() => true),
      ],
    );
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "demo_cargada", datos: { insertadas: r.rowCount } }, client);
    return { insertadas: r.rowCount ?? 0 };
  });
}

// Borra solo fichas de prueba y lo que cuelga de ellas; nunca fichas es_prueba = false.
export async function quitarDemo(sesion: Sesion): Promise<{ borradas: number }> {
  exigirSuperadmin(sesion);
  return withOwnerTx(async (client) => {
    await exigirModoPrueba(client);
    const ids = "(SELECT id FROM cne.mjrv WHERE es_prueba)";
    for (const [tabla, col] of [["pagos_confirmados", "mjrv_id"], ["actas_pago", "mjrv_id"], ["documentos_mjrv", "mjrv_id"], ["decisiones_movimiento", "mjrv_id"],
      ["excepciones_disponibilidad", "mjrv_id"], ["lecturas_puerta", "mjrv_id"], ["envios_credencial", "mjrv_id"]]) {
      await client.query(`DELETE FROM cne.${tabla} WHERE ${col} IN ${ids}`);
    }
    const r = await client.query("DELETE FROM cne.mjrv WHERE es_prueba");
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "demo_quitada", datos: { borradas: r.rowCount } }, client);
    return { borradas: r.rowCount ?? 0 };
  });
}

export async function contarDemo(): Promise<number> {
  return withOwnerTx(async (client) => (await client.query("SELECT count(*)::int AS n FROM cne.mjrv WHERE es_prueba")).rows[0].n);
}

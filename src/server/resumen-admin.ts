import type { RolAdmin } from "../domain/roles";
import { estadoMando } from "./mando";
import { query } from "./db";
import { leerModo } from "./config";

export type ResumenAdmin = {
  generado_en: string; modoPrueba: boolean;
  apertura: { preparadas: number; pendientes: number; ingresados: number; total: number; completas: number; incompletas: number; sinNadie: number };
  pagos: { documentosCompletos: number; documentosIncompletos: number; pagados: number; totalEur: string };
};

// Dos bloques (§13.1): apertura de juntas y desembolsos. Los pagos salen solo de confirmaciones.
export async function resumenAdmin(): Promise<ResumenAdmin> {
  const [mando, cred, docs, pagos, modo] = await Promise.all([
    estadoMando(),
    query<{ preparadas: number; pendientes: number }>("SELECT count(*) FILTER (WHERE credencial_generada_en IS NOT NULL)::int AS preparadas, count(*) FILTER (WHERE credencial_generada_en IS NULL)::int AS pendientes FROM mjrv WHERE activo"),
    query<{ completos: number; incompletos: number }>(
      `SELECT count(*) FILTER (WHERE d.n = 2)::int AS completos, count(*) FILTER (WHERE d.n < 2)::int AS incompletos
         FROM mjrv m CROSS JOIN LATERAL (SELECT count(DISTINCT lado)::int AS n FROM documentos_mjrv WHERE mjrv_id = m.id) d WHERE m.activo`),
    query<{ n: number; total: string }>("SELECT count(*)::int AS n, coalesce(sum(importe_eur), 0)::text AS total FROM pagos_confirmados"),
    leerModo(),
  ]);
  const i = mando.indicadores;
  return {
    generado_en: new Date().toISOString(), modoPrueba: modo === "prueba",
    apertura: { preparadas: cred[0].preparadas, pendientes: cred[0].pendientes, ingresados: i.ingresados, total: i.total, completas: i.completas, incompletas: i.incompletas, sinNadie: i.sinNadie },
    pagos: { documentosCompletos: docs[0].completos, documentosIncompletos: docs[0].incompletos, pagados: pagos[0].n, totalEur: pagos[0].total },
  };
}

// Inicio limitado por rol: el coordinador solo ve lo de juntas y el financiero solo los pagos. El otro bloque ni sale del servidor.
export type ResumenAdminRol = Omit<ResumenAdmin, "apertura" | "pagos"> & { apertura: ResumenAdmin["apertura"] | null; pagos: ResumenAdmin["pagos"] | null };
export function resumenParaRol(r: ResumenAdmin, rol: RolAdmin): ResumenAdminRol {
  return { ...r, apertura: rol === "financiero" ? null : r.apertura, pagos: rol === "coordinador" ? null : r.pagos };
}

import { juntaEnCredencial, rotuloPublico } from "../domain/juntas";
import { registrarAuditoria } from "./auditoria";
import { withTx } from "./db";

// Opcional: reescribe `rotulo_credencial` con la letra pública (M masculino, F femenino).
// El código ya no depende de este dato (deriva la letra de la junta asignada). Atención: la preparación de
// la rectificación de WhatsApp compara el rótulo guardado con el correcto; no lo ejecute antes de enviarla.
export type ResumenRotulos = { fichas: number; cambian: number; yaCorrectas: number; textoLibre: number; aplicada: boolean };

export async function normalizarRotulos(aplicar: boolean): Promise<ResumenRotulos> {
  return withTx(async (client) => {
    const { rows } = await client.query<{ id: number; rotulo: string; serie: "H" | "M"; numero: number }>(
      `SELECT m.id, m.rotulo_credencial AS rotulo, j.serie, j.numero FROM mjrv m JOIN juntas_madrid j ON j.id = m.junta_origen_id
        WHERE m.rotulo_credencial IS NOT NULL AND btrim(m.rotulo_credencial) <> '' ORDER BY m.id FOR UPDATE OF m`);
    const r: ResumenRotulos = { fichas: rows.length, cambian: 0, yaCorrectas: 0, textoLibre: 0, aplicada: false };
    const cambios: { id: number; rotulo: string }[] = [];
    for (const f of rows) {
      const nuevo = rotuloPublico(f.rotulo, juntaEnCredencial(f.serie, f.numero));
      if (nuevo === f.rotulo) { if (/^[A-Za-z]\s*0*\d+$/.test(f.rotulo.trim())) r.yaCorrectas++; else r.textoLibre++; }
      else { r.cambian++; cambios.push({ id: f.id, rotulo: nuevo }); }
    }
    if (!aplicar) return r;
    for (const c of cambios) await client.query("UPDATE mjrv SET rotulo_credencial = $2 WHERE id = $1", [c.id, c.rotulo]);
    r.aplicada = true;
    await registrarAuditoria({ portal: "superadmin", actorTipo: "sistema", accion: "rotulos_normalizados", entidad: "mjrv", datos: r }, client);
    return r;
  });
}

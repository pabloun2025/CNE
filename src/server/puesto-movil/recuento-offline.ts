import { z } from "zod";
import { withTx } from "../db";
import { ErrorJustificante } from "../justificante/servicio";

const corte = z.string().max(64).regex(/^1\.[1-9]\d?\.[a-f0-9]{16}\.(?:0|[1-9]\d{0,6})(?:\.(?:0|[1-9]\d{0,5})){3}$/);
type Fila = { terminal: number; instalacion: string; revision: number; con_padron: number; sin_padron: number; otra: number; recibido: Date };

export async function recuentoOffline(codigo?: unknown) {
  const snapshot = codigo === undefined ? null : corte.safeParse(codigo);
  if (snapshot && !snapshot.success) throw new ErrorJustificante(400, "El código de recuento no es válido.");
  return withTx(async client => {
    let estado = null;
    if (snapshot?.success) {
      const [, terminal, instalacion, revision, con, sin, otra] = snapshot.data.split(".");
      const valores = [Number(terminal), instalacion, Number(revision), Number(con), Number(sin), Number(otra)];
      if (Number(revision) > 2_000_000 || [con, sin, otra].some(n => Number(n) > 500_000) ||
          Number(con) + Number(sin) + Number(otra) > Number(revision))
        throw new ErrorJustificante(400, "Los totales del corte no son válidos.");
      const alta = await client.query(`
        INSERT INTO cne.recuento_puesto_offline (terminal,instalacion,revision,con_padron,sin_padron,otra)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (terminal) DO NOTHING RETURNING terminal
      `, valores);
      estado = "registrado";
      if (!alta.rowCount) {
        const { rows: [actual] } = await client.query<Fila>(
          "SELECT * FROM cne.recuento_puesto_offline WHERE terminal=$1 FOR UPDATE", [terminal]);
        if (actual.instalacion !== instalacion)
          throw new ErrorJustificante(409, "Ese número ya está asignado a otro terminal. Conserve ambos archivos y avise a coordinación.");
        if (actual.revision > Number(revision)) estado = "anterior";
        else if (actual.revision === Number(revision)) {
          if (actual.con_padron !== Number(con) || actual.sin_padron !== Number(sin) || actual.otra !== Number(otra))
            throw new ErrorJustificante(409, "Ya existe un corte diferente con la misma revisión.");
          estado = "ya registrado";
        } else {
          await client.query(`
            UPDATE cne.recuento_puesto_offline SET revision=$3,con_padron=$4,sin_padron=$5,otra=$6,recibido=now()
            WHERE terminal=$1 AND instalacion=$2
          `, valores);
        }
      }
    }
    const { rows } = await client.query<Omit<Fila, "instalacion">>(
      "SELECT terminal,revision,con_padron,sin_padron,otra,recibido FROM cne.recuento_puesto_offline ORDER BY terminal");
    return { estado, terminales: rows };
  });
}

// Importe fijo en EUR, con aritmética entera (céntimos): nunca float (§7.5, 09 §3.1).
// No hay ningún valor por defecto: el importe lo aprueba Pablo.

export type ParametrosPago = { importe_eur: string | null; pagador_nombre: string | null; pagador_cargo: string | null; lugar: string | null };

export const PARAMETROS_VACIOS: ParametrosPago = { importe_eur: null, pagador_nombre: null, pagador_cargo: null, lugar: null };

const ETIQUETAS: Record<keyof ParametrosPago, string> = {
  importe_eur: "importe en EUR", pagador_nombre: "nombre del pagador", pagador_cargo: "cargo del pagador", lugar: "lugar",
};

const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

// Lo que falta para generar un acta definitiva y confirmar pagos.
export function faltanParametros(p: ParametrosPago): string[] {
  return (Object.keys(ETIQUETAS) as (keyof ParametrosPago)[]).filter((k) => vacio(p[k])).map((k) => ETIQUETAS[k]);
}

// «123.45» → céntimos como entero. Devuelve null si no es un decimal con ≤ 2 decimales.
function aCentimos(texto: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto.trim());
  if (!m) return null;
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

export const centimosATexto = (c: bigint): string => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;

export type ImporteEur = { estado: "ok"; centimos: bigint; texto: string } | { estado: "pendiente"; faltan: string[] };

export function calcularImporteEur(p: ParametrosPago): ImporteEur {
  if (vacio(p.importe_eur)) return { estado: "pendiente", faltan: [ETIQUETAS.importe_eur] };
  const centimos = aCentimos(String(p.importe_eur));
  if (centimos === null || centimos <= 0n) return { estado: "pendiente", faltan: ["importe en EUR válido"] };
  return { estado: "ok", centimos, texto: centimosATexto(centimos) };
}

export type ParametrosValidados = { ok: true; valores: ParametrosPago } | { ok: false; mensaje: string };

// Validación del formulario de administración: todo opcional, pero lo que se escriba debe ser coherente.
export function validarParametros(e: Record<keyof ParametrosPago, string>): ParametrosValidados {
  const o = (v: string) => (v.trim() === "" ? null : v.trim());
  const importe = o(e.importe_eur);
  if (importe !== null && (aCentimos(importe) ?? 0n) <= 0n) return { ok: false, mensaje: "El importe en EUR debe ser mayor que 0, con hasta 2 decimales." };
  const largo = (v: string | null, n: number) => v === null || v.length <= n;
  const nombre = o(e.pagador_nombre), cargo = o(e.pagador_cargo), lugar = o(e.lugar);
  if (!largo(nombre, 120) || !largo(cargo, 120) || !largo(lugar, 160)) return { ok: false, mensaje: "Algún texto es demasiado largo." };
  return { ok: true, valores: { importe_eur: importe, pagador_nombre: nombre, pagador_cargo: cargo, lugar } };
}

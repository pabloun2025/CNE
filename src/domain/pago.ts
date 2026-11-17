// Cálculo del importe en EUR con aritmética entera (céntimos y millonésimas): nunca float (§7.5, 07 §M14).
// No hay ningún valor por defecto: importe, cambio, sentido, decimales y redondeo los aprueba Pablo (P-7).

export type Sentido = "eur_por_usd" | "usd_por_eur";
export type Redondeo = "mitad_arriba" | "truncar";

export type ParametrosPago = {
  importe_usd: string | null; tipo_cambio: string | null; sentido_cambio: Sentido | null; decimales_eur: number | null; redondeo: Redondeo | null;
  pagador_nombre: string | null; pagador_cargo: string | null; lugar: string | null;
};

export const PARAMETROS_VACIOS: ParametrosPago = { importe_usd: null, tipo_cambio: null, sentido_cambio: null, decimales_eur: null, redondeo: null, pagador_nombre: null, pagador_cargo: null, lugar: null };

const ETIQUETAS: Record<keyof ParametrosPago, string> = {
  importe_usd: "importe en USD", tipo_cambio: "tipo de cambio", sentido_cambio: "sentido del cambio", decimales_eur: "decimales en EUR", redondeo: "redondeo",
  pagador_nombre: "nombre del pagador", pagador_cargo: "cargo del pagador", lugar: "lugar",
};
const CALCULO: (keyof ParametrosPago)[] = ["importe_usd", "tipo_cambio", "sentido_cambio", "decimales_eur", "redondeo"];

const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

// Lo que falta para calcular el importe.
export function faltanParaCalcular(p: ParametrosPago): string[] {
  return CALCULO.filter((k) => vacio(p[k])).map((k) => ETIQUETAS[k]);
}
// Lo que falta para generar un acta definitiva y confirmar pagos (incluye pagador y lugar).
export function faltanParametros(p: ParametrosPago): string[] {
  return (Object.keys(ETIQUETAS) as (keyof ParametrosPago)[]).filter((k) => vacio(p[k])).map((k) => ETIQUETAS[k]);
}

// «123.45» → céntimos/millonésimas como entero. Devuelve null si no es un decimal positivo con ≤ `dec` decimales.
function aEntero(texto: string, dec: number): bigint | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(texto.trim());
  if (!m || (m[2]?.length ?? 0) > dec) return null;
  return BigInt(m[1]) * 10n ** BigInt(dec) + BigInt((m[2] ?? "").padEnd(dec, "0") || "0");
}

export const centimosATexto = (c: bigint): string => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;

export type ImporteEur = { estado: "ok"; centimos: bigint; texto: string } | { estado: "pendiente"; faltan: string[] };

export function calcularImporteEur(p: ParametrosPago): ImporteEur {
  const faltan = faltanParaCalcular(p);
  if (faltan.length) return { estado: "pendiente", faltan };
  const usd = aEntero(String(p.importe_usd), 2); // céntimos de USD
  const cambio = aEntero(String(p.tipo_cambio), 6); // millonésimas
  if (usd === null || cambio === null || usd <= 0n || cambio <= 0n) return { estado: "pendiente", faltan: ["importe o tipo de cambio válidos"] };
  // EUR (en céntimos) = num / den
  const [num, den] = p.sentido_cambio === "eur_por_usd" ? [usd * cambio, 1_000_000n] : [usd * 1_000_000n, cambio];
  const unidad = p.decimales_eur === 0 ? 100n : 1n; // se redondea a euros enteros o a céntimos
  const divisor = den * unidad;
  let q = num / divisor;
  if (p.redondeo === "mitad_arriba" && 2n * (num % divisor) >= divisor) q += 1n;
  const centimos = q * unidad;
  return { estado: "ok", centimos, texto: centimosATexto(centimos) };
}

export type ParametrosValidados = { ok: true; valores: ParametrosPago } | { ok: false; mensaje: string };

// Validación del formulario de administración: todo opcional, pero lo que se escriba debe ser coherente.
export function validarParametros(e: Record<keyof ParametrosPago, string>): ParametrosValidados {
  const o = (v: string) => (v.trim() === "" ? null : v.trim());
  const importe = o(e.importe_usd), cambio = o(e.tipo_cambio);
  if (importe !== null && (aEntero(importe, 2) ?? 0n) <= 0n) return { ok: false, mensaje: "El importe en USD debe ser mayor que 0, con hasta 2 decimales." };
  if (cambio !== null && (aEntero(cambio, 6) ?? 0n) <= 0n) return { ok: false, mensaje: "El tipo de cambio debe ser mayor que 0, con hasta 6 decimales." };
  const sentido = o(e.sentido_cambio), redondeo = o(e.redondeo), dec = o(e.decimales_eur);
  if (sentido !== null && sentido !== "eur_por_usd" && sentido !== "usd_por_eur") return { ok: false, mensaje: "El sentido del cambio no es válido." };
  if (redondeo !== null && redondeo !== "mitad_arriba" && redondeo !== "truncar") return { ok: false, mensaje: "El redondeo no es válido." };
  if (dec !== null && dec !== "0" && dec !== "2") return { ok: false, mensaje: "Los decimales en EUR deben ser 0 o 2." };
  const largo = (v: string | null, n: number) => v === null || v.length <= n;
  const nombre = o(e.pagador_nombre), cargo = o(e.pagador_cargo), lugar = o(e.lugar);
  if (!largo(nombre, 120) || !largo(cargo, 120) || !largo(lugar, 160)) return { ok: false, mensaje: "Algún texto es demasiado largo." };
  return { ok: true, valores: { importe_usd: importe, tipo_cambio: cambio, sentido_cambio: sentido as Sentido | null, decimales_eur: dec === null ? null : Number(dec), redondeo: redondeo as Redondeo | null, pagador_nombre: nombre, pagador_cargo: cargo, lugar } };
}

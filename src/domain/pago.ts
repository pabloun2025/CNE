// Un monto en dólares, el tipo de cambio del día y el nombre de quien paga. Los escribe el administrador.
// La fórmula que une ese monto, el tipo de cambio, el monto recibido y el monto entregado sigue abierta:
// no se multiplica. El acta repite el monto escrito en las dos líneas e imprime el tipo de cambio tal cual.

export type ParametrosPago = {
  importe_usd: string | null;
  tipo_cambio: string | null;
  pagador_nombre: string | null;
  pagador_cargo: string | null;
  lugar: string | null;
};

export const PARAMETROS_VACIOS: ParametrosPago = {
  importe_usd: null, tipo_cambio: null, pagador_nombre: null, pagador_cargo: null, lugar: null,
};

const ETIQUETAS = {
  importe_usd: "monto en dólares",
  tipo_cambio: "tipo de cambio del día",
  pagador_nombre: "nombre de quien paga",
} as const;

const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

// Lo que falta para un acta con cifras. Cargo y lugar siguen en la plantilla, pero no bloquean la impresión.
export function faltanParametros(p: ParametrosPago): string[] {
  return (Object.keys(ETIQUETAS) as (keyof typeof ETIQUETAS)[]).filter((k) => vacio(p[k])).map((k) => ETIQUETAS[k]);
}

// «123.45» → céntimos. Null si no es un decimal positivo con ≤ 2 decimales.
function aCentimos(texto: string): bigint | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto.trim());
  if (!m) return null;
  const c = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
  return c > 0n ? c : null;
}

export const centimosATexto = (c: bigint): string => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;

// Tipo de cambio escrito por el administrador. Hasta 6 decimales. No se usa para convertir.
export function textoCambio(valor: string): string | null {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(valor.trim().replace(",", "."));
  if (!m) return null;
  const entera = m[1].replace(/^0+(?=\d)/, "");
  const frac = (m[2] ?? "").replace(/0+$/, "");
  if (entera === "0" && frac === "") return null;
  return frac ? `${entera}.${frac}` : entera;
}

export type MontosActa = { estado: "ok"; usd: string; tipoCambio: string } | { estado: "pendiente"; faltan: string[] };

// Los dos montos del acta son el mismo monto en dólares que escribió el administrador. El tipo de cambio se imprime al lado, sin aplicarlo.
export function montosParaActa(p: ParametrosPago): MontosActa {
  const faltan = faltanParametros(p);
  if (faltan.length) return { estado: "pendiente", faltan };
  const centimos = aCentimos(String(p.importe_usd));
  const cambio = textoCambio(String(p.tipo_cambio));
  if (centimos === null || cambio === null) return { estado: "pendiente", faltan: ["monto o tipo de cambio"] };
  return { estado: "ok", usd: centimosATexto(centimos), tipoCambio: cambio };
}

export type ParametrosValidados = { ok: true; valores: ParametrosPago } | { ok: false; mensaje: string };

export function validarParametros(e: Record<keyof ParametrosPago, string>): ParametrosValidados {
  const o = (v: string) => (v.trim() === "" ? null : v.trim());
  const usdBruto = o(e.importe_usd);
  const cambioBruto = o(e.tipo_cambio);
  if (usdBruto !== null && aCentimos(usdBruto) === null) return { ok: false, mensaje: "El monto en dólares debe ser mayor que 0, con hasta 2 decimales." };
  if (cambioBruto !== null && textoCambio(cambioBruto) === null) return { ok: false, mensaje: "El tipo de cambio del día debe ser mayor que 0, con hasta 6 decimales." };
  const nombre = o(e.pagador_nombre), cargo = o(e.pagador_cargo), lugar = o(e.lugar);
  const largo = (v: string | null, n: number) => v === null || v.length <= n;
  if (!largo(nombre, 120) || !largo(cargo, 120) || !largo(lugar, 160)) return { ok: false, mensaje: "Algún texto es demasiado largo." };
  return {
    ok: true,
    valores: {
      importe_usd: usdBruto === null ? null : centimosATexto(aCentimos(usdBruto)!),
      tipo_cambio: cambioBruto === null ? null : textoCambio(cambioBruto),
      pagador_nombre: nombre, pagador_cargo: cargo, lugar,
    },
  };
}

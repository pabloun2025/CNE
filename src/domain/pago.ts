// Un monto en dólares, un valor en euros y el nombre de quien paga. Los escribe el administrador.
// No hay fórmula: el euro no sale del dólar ni de un tipo de cambio. El acta imprime el euro escrito.

export type ParametrosPago = {
  importe_usd: string | null;
  importe_eur: string | null;
  pagador_nombre: string | null;
  pagador_cargo: string | null;
  lugar: string | null;
};

export const PARAMETROS_VACIOS: ParametrosPago = {
  importe_usd: null, importe_eur: null, pagador_nombre: null, pagador_cargo: null, lugar: null,
};

const ETIQUETAS = {
  importe_usd: "monto en dólares",
  importe_eur: "valor en euros",
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

export type MontosActa = { estado: "ok"; usd: string; eur: string } | { estado: "pendiente"; faltan: string[] };

// Las dos cifras son las que escribió el administrador. No se multiplican.
export function montosParaActa(p: ParametrosPago): MontosActa {
  const faltan = faltanParametros(p);
  if (faltan.length) return { estado: "pendiente", faltan };
  const usd = aCentimos(String(p.importe_usd));
  const eur = aCentimos(String(p.importe_eur));
  if (usd === null || eur === null) return { estado: "pendiente", faltan: ["monto en dólares o valor en euros"] };
  return { estado: "ok", usd: centimosATexto(usd), eur: centimosATexto(eur) };
}

export type ParametrosValidados = { ok: true; valores: ParametrosPago } | { ok: false; mensaje: string };

export function validarParametros(e: Record<keyof ParametrosPago, string>): ParametrosValidados {
  const o = (v: string) => (v.trim() === "" ? null : v.trim());
  const usdBruto = o(e.importe_usd);
  const eurBruto = o(e.importe_eur);
  if (usdBruto !== null && aCentimos(usdBruto) === null) return { ok: false, mensaje: "El monto en dólares debe ser mayor que 0, con hasta 2 decimales." };
  if (eurBruto !== null && aCentimos(eurBruto) === null) return { ok: false, mensaje: "El valor en euros debe ser mayor que 0, con hasta 2 decimales." };
  const nombre = o(e.pagador_nombre), cargo = o(e.pagador_cargo), lugar = o(e.lugar);
  const largo = (v: string | null, n: number) => v === null || v.length <= n;
  if (!largo(nombre, 120) || !largo(cargo, 120) || !largo(lugar, 160)) return { ok: false, mensaje: "Algún texto es demasiado largo." };
  return {
    ok: true,
    valores: {
      importe_usd: usdBruto === null ? null : centimosATexto(aCentimos(usdBruto)!),
      importe_eur: eurBruto === null ? null : centimosATexto(aCentimos(eurBruto)!),
      pagador_nombre: nombre, pagador_cargo: cargo, lugar,
    },
  };
}

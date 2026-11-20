// La puerta compara los nombres sin tildes ni signos.

export type PersonaLista = { id: number; apellidos: string; nombres: string };

export const normalizarCodigo = (t: string) => t.trim().toUpperCase().replace(/\s+/g, "");

export const cedulaManualValida = (t: string) => /^\d{1,20}$/.test(t);

export const normalizarNombre = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const tokens = (t: string) => normalizarNombre(t).split(" ").filter((x) => x.length > 0);

// Cuántos tokens coinciden. 0 = no es esta persona.
// Si el texto trae palabras de más (rótulo, cargo), basta con que el nombre entero esté dentro.
// Si quien escribe puso solo una parte, esa parte tiene que estar en el nombre.
export function puntajeNombre(consulta: string, apellidos: string, nombres: string): number {
  const q = tokens(consulta);
  const nombre = tokens(`${apellidos} ${nombres}`);
  if (q.length === 0 || nombre.length === 0 || q.join(" ").length < 4) return 0;
  const setQ = new Set(q);
  const setN = new Set(nombre);
  const consultaDentro = q.every((t) => setN.has(t));
  const nombreDentro = nombre.every((t) => setQ.has(t));
  if (consultaDentro && nombreDentro) return nombre.length + q.length;
  if (nombreDentro) return nombre.length;
  if (consultaDentro) return q.length;
  return 0;
}

// Devuelve quienes empatan en el mejor puntaje. Más de uno: hay que precisar.
export function buscarPorNombre<T extends PersonaLista>(consulta: string, personas: T[]): T[] {
  const puntuados = personas
    .map((p) => ({ p, s: puntajeNombre(consulta, p.apellidos, p.nombres) }))
    .filter((x) => x.s > 0);
  if (puntuados.length === 0) return [];
  const mejor = Math.max(...puntuados.map((x) => x.s));
  return puntuados.filter((x) => x.s === mejor).map((x) => x.p);
}

// La cámara propone solo nombres y apellidos completos. Conserva todos los candidatos para detectar ambigüedad.
export function buscarNombreCamara<T extends PersonaLista>(consulta: string, personas: T[]): T[] {
  const vistos = new Set(tokens(consulta));
  return personas.filter((p) => {
    const apellidos = tokens(p.apellidos);
    const nombres = tokens(p.nombres);
    return apellidos.length > 0 && nombres.length > 0
      && [...apellidos, ...nombres].every((t) => vistos.has(t));
  });
}

// Una cédula impresa puede leerse en bloques separados por espacios en la misma línea.
export function cedulasDeCamara(texto: string): string[] {
  const mayusculas = texto.toUpperCase();
  const palabras = mayusculas.match(/[A-Z0-9-]+/g) ?? [];
  const bloquesNumericos = (mayusculas.match(/(?<![A-Z0-9-])\d+(?:[ \t]+\d+)+(?![A-Z0-9-])/g) ?? []).map(normalizarCodigo);
  return [...new Set([...palabras, ...bloquesNumericos].filter((t) => t.length >= 5 && t.length <= 20 && /\d/.test(t)))];
}

// La puerta identifica por el QR de la cédula y, si no hay QR, por el nombre de la lista.
// El nombre se compara sin tildes ni signos: lo tecleado y lo que lee la cámara usan la misma regla.

export type PersonaLista = { id: number; apellidos: string; nombres: string };

export const normalizarCodigo = (t: string) => t.trim().toUpperCase().replace(/\s+/g, "");

export const pareceCedula = (t: string) => /^[0-9A-Z-]{5,20}$/.test(normalizarCodigo(t));

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
// minTokens: la cámara exige ver el apellido entero (varias palabras); el teclado acepta una parte única.
export function buscarPorNombre<T extends PersonaLista>(consulta: string, personas: T[], minTokens = 1): T[] {
  const puntuados = personas
    .map((p) => ({ p, s: puntajeNombre(consulta, p.apellidos, p.nombres) }))
    .filter((x) => x.s >= minTokens);
  if (puntuados.length === 0) return [];
  const mejor = Math.max(...puntuados.map((x) => x.s));
  return puntuados.filter((x) => x.s === mejor).map((x) => x.p);
}

// La cámara solo acepta si el apellido impreso se leyó entero y la persona es única.
export function buscarNombreCamara<T extends PersonaLista>(consulta: string, personas: T[]): T[] {
  const hallados = buscarPorNombre(consulta, personas, 2);
  if (hallados.length !== 1) return [];
  const ap = tokens(hallados[0].apellidos);
  const vistos = new Set(tokens(consulta));
  return ap.length > 0 && ap.every((t) => vistos.has(t)) ? hallados : [];
}

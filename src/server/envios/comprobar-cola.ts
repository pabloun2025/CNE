import { query } from "../db";
import { medidasCredencial } from "../credencial-config";
import { seleccionarParaCredencial } from "../credenciales";
import { prepararContenidoEnvio } from "./contenido";

export type RecuentoCola = {
  grupo: string; total: number; letraM_serieH: number; letraF_serieM: number; textoLibre: number;
  incoherentes: number; textoConSerieInterna: number; sinCredencial: number; errorAlPreparar: number;
};

// Comprueba la cola sin enviar: construye el mismo texto, rótulo y PDF que la cola y solo cuenta.
// No llama a Evolution ni a Brevo, no escribe en la base y no devuelve datos personales.
export async function comprobarCola(): Promise<RecuentoCola[]> {
  const envios = await query<{ mjrv_id: number; canal: "whatsapp" | "correo"; linea: number; rectificacion: boolean }>(
    `SELECT e.mjrv_id, e.canal, e.linea_whatsapp AS linea, e.whatsapp_rectificacion AS rectificacion
       FROM envios_credencial e JOIN mjrv m ON m.id = e.mjrv_id
      WHERE e.estado = 'en_cola' AND NOT e.simulado AND NOT m.es_prueba ORDER BY e.id`);
  const medidas = await medidasCredencial();
  const grupos = new Map<string, RecuentoCola>();
  const grupo = (g: string) => {
    if (!grupos.has(g)) grupos.set(g, { grupo: g, total: 0, letraM_serieH: 0, letraF_serieM: 0, textoLibre: 0, incoherentes: 0, textoConSerieInterna: 0, sinCredencial: 0, errorAlPreparar: 0 });
    return grupos.get(g)!;
  };
  // Un envío por ficha y canal: se agrupan las fichas para consultar de a lotes.
  const ids = [...new Set(envios.map((e) => e.mjrv_id))];
  const seleccion = new Map<number, { ficha: Awaited<ReturnType<typeof seleccionarParaCredencial>>["datos"][number]; persona: Awaited<ReturnType<typeof seleccionarParaCredencial>>["personas"][number] }>();
  for (let i = 0; i < ids.length; i += 50) {
    const sel = await seleccionarParaCredencial({ alcance: "ids", ids: ids.slice(i, i + 50) });
    sel.personas.forEach((persona, k) => seleccion.set(persona.id, { ficha: sel.datos[k], persona }));
  }
  for (const e of envios) {
    const g = grupo(`${e.canal === "whatsapp" ? `whatsapp línea ${e.linea}` : "correo"} · ${e.rectificacion ? "rectificación" : "normal"}`);
    g.total++;
    const s = seleccion.get(e.mjrv_id);
    if (!s) { g.sinCredencial++; continue; }
    const serie = s.ficha.serie;
    let c;
    try {
      c = await prepararContenidoEnvio({ canal: e.canal, ficha: s.ficha, persona: s.persona, rectificacion: e.rectificacion, medidas });
    } catch {
      g.errorAlPreparar++; g.incoherentes++; continue;
    }
    const letra = /^\s*([MFHmfh])\s*\d/.exec(c.rotulo)?.[1].toUpperCase();
    if (!letra) g.textoLibre++;
    else if (letra === "M" && serie === "H") g.letraM_serieH++;
    else if (letra === "F" && serie === "M") g.letraF_serieM++;
    else g.incoherentes++;
    // La serie interna (H, o M seguida del número de una junta femenina) no debe salir en nada de lo que recibe el ciudadano.
    const salida = [c.texto, c.asunto, c.html ?? "", c.nombreArchivo, c.rotulo].join("\n");
    const interna = new RegExp(`(?<![A-Za-z0-9_./-])${serie}${s.persona.junta.slice(1)}(?!\\d)`);
    if (/(?<![A-Za-z0-9_./-])H\s?\d/.test(salida) || (serie === "M" && interna.test(salida))) { g.textoConSerieInterna++; g.incoherentes++; }
  }
  return [...grupos.values()].sort((a, b) => a.grupo.localeCompare(b.grupo));
}

export function lineasRecuento(r: RecuentoCola[]): string[] {
  return r.map((g) => `${g.grupo}: total ${g.total}; letra M con serie interna H ${g.letraM_serieH}; letra F con serie M ${g.letraF_serieM}; texto libre ${g.textoLibre}; sin credencial ${g.sinCredencial}; incoherentes ${g.incoherentes}; texto con serie interna ${g.textoConSerieInterna}`);
}

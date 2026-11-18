import { procesarCola, recuperarInterrumpidas } from "./cola";

// Temporizador de la cola de envío real: vive dentro del propio contenedor `cne-app` (no hay otro trabajador).
// El estado está en la base, así que un reinicio no pierde nada. Solo escribe cifras en el registro, nunca datos personales.
const CADA_MS = 5000;
const LATIDO_CADA = 120; // vueltas: ~10 min
let arrancado = false;

export function arrancarCola(): void {
  if (arrancado) return;
  arrancado = true;
  let vueltas = 0;
  let ocupado = false;
  recuperarInterrumpidas()
    .then((n) => console.log(`[cola de envíos] arrancada; filas interrumpidas pasadas a fallo: ${n}`))
    .catch((e) => console.error(`[cola de envíos] no se pudo revisar al arrancar: ${(e as Error).message}`));
  const t = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try {
      const r = await procesarCola();
      if (r.whatsapp.accion === "enviado" || r.correo.accion === "enviado") console.log(`[cola de envíos] enviados: whatsapp=${r.whatsapp.accion === "enviado" ? 1 : 0} correo=${r.correo.accion === "enviado" ? 1 : 0}`);
      if (++vueltas % LATIDO_CADA === 0) console.log(`[cola de envíos] latido: whatsapp=${r.whatsapp.accion} correo=${r.correo.accion}`);
    } catch (e) {
      console.error(`[cola de envíos] error: ${(e as Error).message}`);
    } finally {
      ocupado = false;
    }
  }, CADA_MS);
  t.unref?.();
}

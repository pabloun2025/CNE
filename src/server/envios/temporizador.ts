import { procesarCola, recuperarInterrumpidas } from "./cola";

// El estado vive en la base. El correo drena su cola sin esperar la cadencia de WhatsApp.
const ESPERA_SIN_TRABAJO_MS = 5000;
let arrancado = false;

export function arrancarCola(): void {
  if (arrancado) return;
  arrancado = true;
  async function vuelta() {
    let espera = ESPERA_SIN_TRABAJO_MS;
    try {
      const r = await procesarCola();
      if (r.whatsapp.accion === "enviado" || r.correo.accion === "enviado") {
        console.log(`[cola de envíos] enviados: whatsapp=${r.whatsapp.accion === "enviado" ? 1 : 0} correo=${r.correo.accion === "enviado" ? 1 : 0}`);
      }
      if (r.correo.accion === "enviado") espera = 0;
    } catch (e) {
      console.error(`[cola de envíos] error: ${(e as Error).message}`);
    } finally {
      setTimeout(vuelta, espera).unref();
    }
  }

  void recuperarInterrumpidas()
    .then((n) => console.log(`[cola de envíos] arrancada; filas interrumpidas recuperadas: ${n}`))
    .catch((e) => console.error(`[cola de envíos] no se pudo revisar al arrancar: ${(e as Error).message}`))
    .then(vuelta);
}

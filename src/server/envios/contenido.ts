import { juntaEnCredencial, nombreSerie } from "../../domain/juntas";
import { mensajeCredencial } from "../envios";
import type { PersonaCredencial } from "../credenciales";
import type { MedidasCredencial } from "../../domain/credencial-layout";
import { credencialesIndividuales, type DatosCredencial } from "../pdf/credencial";
import type { Canal } from "./proveedor";

export type ContenidoEnvio = { asunto: string; texto: string; html?: string; nombreArchivo: string; pdfBase64: string; rotulo: string };

// Todo lo que sale al ciudadano en un envío real. Lo usan la cola al enviar y la comprobación sin envío,
// así lo que se comprueba es exactamente lo que se enviaría. No toca la base ni los proveedores.
export async function prepararContenidoEnvio(
  { canal, ficha, persona, rectificacion, medidas }: { canal: Canal; ficha: DatosCredencial; persona: PersonaCredencial; rectificacion: boolean; medidas: MedidasCredencial },
): Promise<ContenidoEnvio> {
  // Los envíos reales autorizados usan el PDF definitivo incluso durante el ensayo.
  const d = { ...ficha, prueba: false, rotulo: canal === "whatsapp" ? juntaEnCredencial(ficha.serie, persona.junta.slice(1)) : ficha.rotulo };
  const m = await mensajeCredencial(canal === "whatsapp" ? d : ficha, canal, persona);
  const pdfBase64 = Buffer.from(await credencialesIndividuales([d], medidas)).toString("base64");
  let texto = m.texto;
  if (canal === "whatsapp" && rectificacion) {
    texto = `Rectificación de su credencial MJRV. Adjuntamos su credencial corregida con la junta ${d.rotulo} (${nombreSerie(ficha.serie)}). Su junta y zona asignadas siguen siendo las mismas. Presente el QR de esta credencial en la entrada. Disculpe la confusión.\nConsulado General del Ecuador en Madrid`;
  }
  return { asunto: m.asunto, texto, html: m.html, nombreArchivo: m.nombreArchivo, pdfBase64, rotulo: d.rotulo };
}

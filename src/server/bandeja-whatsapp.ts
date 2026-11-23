import type { LineaEnvioWhatsApp } from "../domain/envios-ritmo";
import { decryptBuffer } from "./crypto";
import { query } from "./db";

const TAMANO_PAGINA = 40;

type RespuestaFila = {
  id: number;
  mjrv_id: number;
  nombres: string;
  apellidos: string;
  recibido_en: Date;
  ultimo_envio_en: Date | null;
  texto_cifrado: Buffer;
  texto_nonce: Buffer;
};

export async function leerBandejaWhatsApp(linea: LineaEnvioWhatsApp, pagina: number) {
  const filas = await query<RespuestaFila>(
    `SELECT r.id, r.mjrv_id, m.nombres, m.apellidos, r.recibido_en, r.ultimo_envio_en, r.texto_cifrado, r.texto_nonce
       FROM whatsapp_respuestas r JOIN mjrv m ON m.id = r.mjrv_id
      WHERE r.linea = $1
      ORDER BY r.recibido_en DESC, r.id DESC
      LIMIT $2 OFFSET $3`, [linea, TAMANO_PAGINA + 1, (pagina - 1) * TAMANO_PAGINA],
  );
  return {
    hayMas: filas.length > TAMANO_PAGINA,
    mensajes: filas.slice(0, TAMANO_PAGINA).map((r) => ({
      id: r.id, mjrvId: r.mjrv_id, nombre: `${r.apellidos}, ${r.nombres}`, recibidoEn: r.recibido_en,
      ultimoEnvioEn: r.ultimo_envio_en, texto: decryptBuffer(r.texto_cifrado, r.texto_nonce).toString("utf8"),
    })),
  };
}

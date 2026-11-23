import { PAUSA_MANUAL_WHATSAPP, type LineaEnvioWhatsApp } from "../../domain/envios-ritmo";
import { etiquetaJunta, juntaEnCredencial, rotuloCredencial, type Serie } from "../../domain/juntas";
import { registrarAuditoria } from "../auditoria";
import { withTx } from "../db";
import { CLAVE_CANDADO_COLA } from "./cola";

const ACCION = "rectificacion_whatsapp_2026";

type Ficha = {
  id: number; telefono: string | null; rotulo: string | null; serie: Serie; numero: number; revocada: boolean;
};
type Envio = {
  id: number; mjrv_id: number; destino: string; estado: string; linea_whatsapp: LineaEnvioWhatsApp;
  error: string | null; intentos: number; entrega: string | null;
};
type Resumen = {
  aplicada: boolean; avisos: number; pdfExistentes: number; pdfNuevos: number; yaCorrectos: number;
  sinTelefono: number; sinWhatsApp: number; inciertos: number; revocadas: number; pendientesParaRevisar: number;
  linea1: number; linea2: number;
};

// Operación única para la elección del 29 de noviembre. Nunca llama al proveedor.
export async function prepararRectificacionWhatsApp(aplicar: boolean): Promise<Resumen> {
  return withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [CLAVE_CANDADO_COLA]);
    const anterior = (await client.query<{ datos: Resumen }>("SELECT datos FROM auditoria WHERE accion = $1 ORDER BY id DESC LIMIT 1", [ACCION])).rows[0];
    if (anterior) return anterior.datos;
    const { pausadas } = (await client.query<{ pausadas: boolean }>(
      `SELECT (NOT whatsapp_real OR whatsapp_pausa_motivo IS NOT NULL)
          AND (NOT whatsapp_real_2 OR whatsapp_pausa_motivo_2 IS NOT NULL) AS pausadas
         FROM configuracion WHERE id = 1 FOR UPDATE`,
    )).rows[0];
    if (!pausadas) throw new Error("Las dos líneas deben estar pausadas antes de preparar la rectificación.");

    // Comparte el bloqueo de ficha con el alta ordinaria de la cola.
    const fichas = (await client.query<Ficha>(
      `SELECT m.id, m.telefono_e164 AS telefono, m.rotulo_credencial AS rotulo, j.serie, j.numero,
              EXISTS (SELECT 1 FROM credenciales_revocadas r WHERE r.mjrv_id = m.id OR r.cedula = m.cedula) AS revocada
         FROM mjrv m JOIN juntas_madrid j ON j.id = m.junta_origen_id
        WHERE m.activo AND NOT m.es_prueba AND m.incorporado_en IS NULL ORDER BY m.id FOR UPDATE OF m`,
    )).rows;
    const envios = (await client.query<Envio>(
      `SELECT e.id, e.mjrv_id, e.destino, e.estado, e.linea_whatsapp, e.error, e.intentos, d.estado AS entrega
         FROM envios_credencial e LEFT JOIN entregas_whatsapp d ON d.envio_id = e.id AND d.id_externo = e.id_externo
        WHERE e.canal = 'whatsapp' AND NOT e.simulado ORDER BY e.id DESC`,
    )).rows;
    if (envios.some((e) => e.estado === "en_cola" && e.intentos > 0)) throw new Error("Hay un WhatsApp en curso. Compruebe el resultado antes de preparar la rectificación.");

    const resumen: Resumen = {
      aplicada: false, avisos: 0, pdfExistentes: 0, pdfNuevos: 0, yaCorrectos: 0, sinTelefono: 0,
      sinWhatsApp: 0, inciertos: 0, revocadas: 0, pendientesParaRevisar: 0, linea1: 0, linea2: 0,
    };
    const ids = new Set(fichas.map((f) => f.id));
    resumen.pendientesParaRevisar = envios.filter((e) => e.estado === "en_cola" && !ids.has(e.mjrv_id)).length;
    const avisosExistentes: number[] = [];
    const nuevos: { id: number; destino: string; linea: LineaEnvioWhatsApp; aviso: boolean; reenvio: boolean }[] = [];
    for (const f of fichas) {
      const historial = envios.filter((e) => e.mjrv_id === f.id);
      const pendiente = historial.find((e) => e.estado === "en_cola");
      const mismoNumero = historial.filter((e) => e.destino === f.telefono);
      const aceptado = mismoNumero.find((e) => ["enviada_al_servicio", "entregada"].includes(e.estado) && e.entrega !== "error");
      const ultimoIntento = mismoNumero.find((e) => e.estado !== "en_cola");
      const anterior = rotuloCredencial(f.rotulo, etiquetaJunta(f.serie, f.numero)).toUpperCase().replace(/\s+/g, "").replace(/^(\D)0+(?=\d)/, "$1");
      const yaCorrecto = !!aceptado && anterior === juntaEnCredencial(f.serie, f.numero);
      const motivo = f.revocada ? "revocadas"
        : !f.telefono || !/^\+[1-9]\d{7,14}$/.test(f.telefono) ? "sinTelefono"
        : yaCorrecto ? "yaCorrectos"
        : ultimoIntento?.error === "El número no tiene WhatsApp." ? "sinWhatsApp"
        : !aceptado && mismoNumero.some((e) => /pudo haber salido|interrumpido|sin devolver identificador|^error al enviar/i.test(e.error ?? "")) ? "inciertos"
        : null;
      if (motivo || (pendiente && pendiente.destino !== f.telefono)) {
        if (motivo) resumen[motivo]++;
        if (pendiente) resumen.pendientesParaRevisar++;
        continue;
      }
      const aviso = !!aceptado;
      const linea = pendiente?.linea_whatsapp ?? aceptado?.linea_whatsapp ?? historial[0]?.linea_whatsapp ?? (f.serie === "H" ? 1 : 2);
      resumen[linea === 1 ? "linea1" : "linea2"]++;
      if (aviso) resumen.avisos++;
      else if (pendiente) resumen.pdfExistentes++;
      else resumen.pdfNuevos++;

      if (pendiente) {
        if (aviso) avisosExistentes.push(pendiente.id);
      } else {
        nuevos.push({
          id: f.id, destino: f.telefono!, linea, aviso,
          reenvio: historial.some((e) => e.estado === "enviada_al_servicio" || e.estado === "entregada"),
        });
      }
    }
    if (!aplicar || resumen.pendientesParaRevisar) return resumen;

    await client.query("UPDATE configuracion SET whatsapp_pausa_motivo = $1, whatsapp_pausa_motivo_2 = $1 WHERE id = 1", [PAUSA_MANUAL_WHATSAPP]);
    await client.query("UPDATE envios_credencial SET whatsapp_rectificacion = true WHERE id = ANY($1::bigint[])", [avisosExistentes]);
    for (const f of nuevos) {
      await client.query(
        `INSERT INTO envios_credencial (mjrv_id, canal, destino, simulado, reenvio, linea_whatsapp, whatsapp_rectificacion)
         VALUES ($1, 'whatsapp', $2, false, $3, $4, $5)`,
        [f.id, f.destino, f.reenvio, f.linea, f.aviso],
      );
    }
    resumen.aplicada = true;
    await registrarAuditoria({ portal: "superadmin", actorTipo: "sistema", accion: ACCION, entidad: "configuracion", entidadId: 1, datos: resumen }, client);
    return resumen;
  });
}

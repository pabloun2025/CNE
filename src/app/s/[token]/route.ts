import { etiquetaCargoCredencial } from "@/domain/cargos-credencial";
import { juntaEnCredencial, type Serie, type ZonaColor } from "@/domain/juntas";
import { medidasCredencial } from "@/server/credencial-config";
import { leerTokenCredencialSms } from "@/server/credencial-sms";
import { registrarAperturaSms } from "@/server/envios/sms-seguimiento";
import { query } from "@/server/db";
import { credencialesIndividuales, type DatosCredencial } from "@/server/pdf/credencial";

export const dynamic = "force-dynamic";
const cabeceras = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };
const noEncontrada = () => new Response("Enlace no disponible.", { status: 404, headers: cabeceras });
const prueba: DatosCredencial = {
  cedula: "0000000001", apellidos: "APELLIDO PRUEBA 001", nombres: "NOMBRE PRUEBA",
  cargo: "SECRETARIO", rotulo: "M9", serie: "H", zona: "amarillo", prueba: true,
};

export async function GET(peticion: Request, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params;
  const enlace = leerTokenCredencialSms(token);
  if (!enlace) return noEncontrada();
  let ficha = prueba;
  if (enlace !== "prueba") {
    const [f] = await query<{ apellidos: string; nombres: string; cargo_original: string; serie: Serie; numero: number; zona: ZonaColor }>(
      `SELECT m.apellidos,m.nombres,m.cargo_original,j.serie,j.numero,j.zona_color AS zona
         FROM mjrv m JOIN juntas_madrid j ON j.id=m.junta_origen_id
        WHERE m.id=$1 AND m.cedula=$2 AND m.telefono_e164=$3 AND m.activo AND NOT m.es_prueba
          AND m.incorporado_en IS NULL AND NOT cne.en_prueba()
          AND NOT EXISTS (SELECT 1 FROM credenciales_revocadas r WHERE r.mjrv_id=m.id OR r.cedula=m.cedula)`,
      [enlace.id, enlace.cedula, enlace.telefono],
    );
    if (!f) return noEncontrada();
    ficha = { cedula: enlace.cedula, apellidos: f.apellidos, nombres: f.nombres,
      cargo: etiquetaCargoCredencial(f.cargo_original), rotulo: juntaEnCredencial(f.serie, f.numero),
      serie: f.serie, zona: f.zona, prueba: false };
  }
  const pdf = await credencialesIndividuales([ficha], enlace === "prueba" ? undefined : await medidasCredencial());
  if (enlace !== "prueba" && peticion.method === "GET" &&
      ![peticion.headers.get("purpose"), peticion.headers.get("sec-purpose")].some((v) => v?.includes("prefetch"))) {
    await registrarAperturaSms(token, enlace.id);
  }
  return new Response(new Uint8Array(pdf), { headers: {
    ...cabeceras, "content-type": "application/pdf",
    "content-disposition": enlace === "prueba" ? 'inline; filename="credencial-prueba.pdf"' : 'inline; filename="credencial-mjrv.pdf"',
  } });
}

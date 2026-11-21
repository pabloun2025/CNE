import { query } from "@/server/db";
import { leerModo } from "@/server/config";
import { requiredEnv } from "@/server/env";
import { asegurarClase, configWallet, leerTokenWallet, urlGuardar } from "@/server/wallet/google";

export const dynamic = "force-dynamic";

// «Guardar en Google Wallet»: ruta pública. El token está firmado por ficha y no lleva la cédula. Solo fichas reales activas,
// con rótulo y sin revocar, y solo en modo elección: nunca se generan pases de prueba.
export async function GET(_peticion: Request, contexto: { params: Promise<{ token: string }> }) {
  const config = configWallet();
  const noEncontrada = () => new Response("No encontrada", { status: 404, headers: { "cache-control": "no-store" } });
  if (!config) return noEncontrada();
  const secreto = requiredEnv("APP_MASTER_KEY");
  const id = leerTokenWallet((await contexto.params).token, secreto);
  if (!id || (await leerModo()) !== "eleccion") return noEncontrada();
  const [f] = await query<{ id: number; cedula: string; apellidos: string; nombres: string; cargo_original: string; rotulo_credencial: string }>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.cargo_original, m.rotulo_credencial FROM mjrv m
      WHERE m.id = $1 AND m.activo AND NOT m.es_prueba AND btrim(coalesce(m.rotulo_credencial, '')) <> ''
        AND NOT EXISTS (SELECT 1 FROM credenciales_revocadas r WHERE r.mjrv_id = m.id OR r.cedula = m.cedula)`, [id]);
  if (!f) return noEncontrada();
  const claseLista = await asegurarClase(config);
  const url = urlGuardar(config, { id: f.id, cedula: f.cedula, apellidos: f.apellidos, nombres: f.nombres, cargo: f.cargo_original, rotulo: f.rotulo_credencial.trim() }, secreto, { claseEnJwt: !claseLista });
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "private, no-store" } });
}

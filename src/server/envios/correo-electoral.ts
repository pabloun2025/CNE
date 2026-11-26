import { z } from "zod";
import { clienteCorreo, type ClienteCorreo } from "./brevo";
import { leerConfigEnvios, remitenteEfectivo } from "../envios-config";

const email = z.email().max(254);

let verificacion: { candidatos: string; vence: number; direccion: Promise<string | null> } | undefined;

async function remitenteActivo(proveedor: ClienteCorreo, direcciones: string[]) {
  const candidatos = direcciones.join("|");
  if (verificacion?.candidatos !== candidatos || verificacion.vence <= Date.now()) {
    const registro = {
      candidatos, vence: Date.now() + 20_000,
      direccion: Promise.all(direcciones.map(d => proveedor.verificarRemitente(d).catch(() => false)))
        .then(activos => direcciones.find((_, i) => activos[i]) ?? null),
    };
    verificacion = registro;
    if (await registro.direccion) registro.vence = Date.now() + 300_000;
    return registro.direccion;
  }
  return verificacion.direccion;
}

export async function correoElectoral() {
  const config = await leerConfigEnvios();
  const proveedor = clienteCorreo();
  const remitente = remitenteEfectivo(config);
  const configurado = process.env.CNE_MOVIL_CORREO_ACTIVO === "1" && !config.correoPausa && !proveedor.simulado;
  const candidatos = [...new Set([remitente.direccion, process.env.MAIL_FROM_ADDRESS ?? "", "avisos@consulado.app"])]
    .filter(direccion => email.safeParse(direccion).success);
  const activo = configurado ? await remitenteActivo(proveedor, candidatos) : null;
  return { proveedor, remitente: { ...remitente, direccion: activo ?? "" }, configurado, habilitado: Boolean(activo) };
}

import { PestanasCredenciales } from "@/components/pestanas-credenciales";
import { PAUSA_WHATSAPP_MIN_S, PAUSA_WHATSAPP_MAX_S } from "@/domain/envios-ritmo";
import { SOLO_CONSUL } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { resumenCredenciales, seleccionarParaCredencial } from "@/server/credenciales";
import { AccionesCredenciales } from "@/components/envios-credenciales";
import { leerConfigEnvios } from "@/server/envios-config";

export default async function Credenciales() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [r, cfg, seleccion] = await Promise.all([
    resumenCredenciales(), leerConfigEnvios(), seleccionarParaCredencial({ alcance: "todas" }),
  ]);
  return (
    <main className="max-w-2xl stack-lg">
      <h1>Credenciales</h1>
      <PestanasCredenciales actual="" />
      {r.activos === 0 && <p>Cargue el Excel de MJRV para empezar.</p>}
      <p className="cifra">{r.activos} fichas activas · {r.preparadas} preparadas · {r.pendientes} pendientes.</p>
      <section aria-label="Estado del envío por WhatsApp y correo" className="stack">
        {cfg.whatsappReal || cfg.whatsappReal2 || cfg.correoReal ? (
          <p role="note">WhatsApp 1: {cfg.whatsappReal ? "real" : "simulado"} · WhatsApp 2: {cfg.whatsappReal2 ? "real" : "simulado"} · Correo: {cfg.correoReal ? "real" : "simulado"}. WhatsApp espera entre {PAUSA_WHATSAPP_MIN_S} y {PAUSA_WHATSAPP_MAX_S} segundos por línea. Las fichas de demostración siempre se simulan.</p>
        ) : (
          <p role="note">Ambos canales están en simulación. Solo la superadministración puede activar el envío real.</p>
        )}
      </section>
      <AccionesCredenciales personas={seleccion.personas} numeros={[cfg.whatsappNumero, cfg.whatsappNumero2]} />
    </main>
  );
}

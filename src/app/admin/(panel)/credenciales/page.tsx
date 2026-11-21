import Link from "next/link";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Credenciales</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/credenciales/envios" className="button-like secondary">Seguimiento de envíos</Link>
          <Link href="/admin/credenciales/imprimir" className="button-like secondary">Imprimir planchas A4</Link>
        </div>
      </div>
      {r.activos === 0 && <p>Cargue el Excel de MJRV para empezar.</p>}
      <p className="cifra">{r.activos} fichas activas · {r.preparadas} preparadas · {r.pendientes} pendientes.</p>
      <section aria-label="Estado del envío por WhatsApp y correo" className="stack">
        {cfg.whatsappReal || cfg.correoReal ? (
          <p role="note">WhatsApp: {cfg.whatsappReal ? "real" : "simulado"} · Correo: {cfg.correoReal ? "real" : "simulado"}. WhatsApp deja de 20 a 45 segundos entre mensajes. Las fichas de demostración siempre se simulan.</p>
        ) : (
          <p role="note">Ambos canales están en simulación. Solo la superadministración puede activar el envío real.</p>
        )}
      </section>
      <AccionesCredenciales personas={seleccion.personas} />
    </main>
  );
}

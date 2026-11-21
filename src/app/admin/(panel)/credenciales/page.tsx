import Link from "next/link";
import { SOLO_CONSUL } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { resumenCredenciales, seleccionarParaCredencial } from "@/server/credenciales";
import { AccionesCredenciales } from "@/components/envios-credenciales";
import { leerConfigEnvios } from "@/server/envios-config";
import { formularioAbierto } from "@/server/documentos";

export default async function Credenciales() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [r, cfg, abierto, seleccion] = await Promise.all([
    resumenCredenciales(), leerConfigEnvios(), formularioAbierto(), seleccionarParaCredencial({ alcance: "todas" }),
  ]);
  const hayHost = !!process.env.HOST_MADRID?.trim();
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
      {r.sinRotulo > 0 && <p role="alert" className="border-2 border-stone-900 bg-stone-100 p-2 font-medium">Complete el rótulo de {r.sinRotulo} fichas para preparar sus credenciales.</p>}
      <section aria-label="Estado del envío por WhatsApp y correo" className="stack">
        {cfg.whatsappReal || cfg.correoReal ? (
          <p role="note">WhatsApp: {cfg.whatsappReal ? "real" : "simulado"} · Correo: {cfg.correoReal ? "real" : "simulado"}. WhatsApp deja de 20 a 45 segundos entre mensajes. Las fichas de demostración siempre se simulan.</p>
        ) : (
          <p role="note">Ambos canales están en simulación. Solo la superadministración puede activar el envío real.</p>
        )}
        {hayHost && !abierto && <p role="alert" className="border-2 border-stone-900 bg-stone-100 p-2 text-sm font-medium">El formulario de la cédula está cerrado. Solicite su apertura a Superadministración antes de enviar.</p>}
      </section>
      <AccionesCredenciales personas={seleccion.personas} />
    </main>
  );
}

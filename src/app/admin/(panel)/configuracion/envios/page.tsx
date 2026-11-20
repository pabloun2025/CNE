import Link from "next/link";
import { LineaWhatsAppPanel } from "@/components/linea-whatsapp";
import { SOLO_CONSUL } from "@/domain/roles";
import { leerConfigEnvios } from "@/server/envios-config";
import { requireAdmin } from "@/server/guard";
import { estadoLinea } from "@/server/whatsapp-linea";

export default async function ConfiguracionEnvios() {
  const sesion = await requireAdmin({ roles: SOLO_CONSUL });
  const [linea, config] = await Promise.all([estadoLinea(sesion), leerConfigEnvios()]);
  return (
    <main className="max-w-xl stack-lg">
      <h1>Configuración de envíos</h1>
      <section id="whatsapp" className="card stack">
        <h2>WhatsApp · Evolution API</h2>
        <LineaWhatsAppPanel inicial={linea} rutaEstado="/api/admin/whatsapp/estado" />
      </section>
      <section className="card stack">
        <h2>Envío real</h2>
        <p>WhatsApp {config.whatsappReal ? "activado" : "apagado"} · Correo {config.correoReal ? "activado" : "apagado"}</p>
        <Link href="/superadmin/envios">Administrar envíos reales y el remitente de Brevo en Superadministración</Link>
      </section>
      <Link href="/admin/configuracion">Volver a Configuración</Link>
    </main>
  );
}

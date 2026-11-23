import { PanelWhatsAppCredenciales } from "@/components/panel-whatsapp-credenciales";
import { PestanasCredenciales } from "@/components/pestanas-credenciales";
import { SOLO_CONSUL } from "@/domain/roles";
import { seleccionarParaCredencial } from "@/server/credenciales";
import { estadoCola, leerConfigEnvios } from "@/server/envios-config";
import { requireAdmin } from "@/server/guard";

export default async function WhatsAppCredenciales() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [seleccion, cfg, cola] = await Promise.all([
    seleccionarParaCredencial({ alcance: "todas" }), leerConfigEnvios(), estadoCola(),
  ]);
  return (
    <main className="stack-lg">
      <h1>Envíos de WhatsApp</h1>
      <PestanasCredenciales actual="/whatsapp" />
      <PanelWhatsAppCredenciales personas={seleccion.personas} lineas={[
        { ...cola.whatsapp, id: 1, numero: cfg.whatsappNumero, real: cfg.whatsappReal },
        { ...cola.whatsapp2, id: 2, numero: cfg.whatsappNumero2, real: cfg.whatsappReal2 },
      ]} />
    </main>
  );
}

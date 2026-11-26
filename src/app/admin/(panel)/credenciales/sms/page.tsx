import Link from "next/link";
import { PanelSmsCredenciales } from "@/components/panel-sms-credenciales";
import { PestanasCredenciales } from "@/components/pestanas-credenciales";
import { SOLO_CONSUL } from "@/domain/roles";
import { bloqueoEnviosSms, listarDestinatariosSms, MAX_SELECCION_SMS } from "@/server/envios/sms-modulo";
import { requireAdmin } from "@/server/guard";

export default async function SmsCredenciales() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const bloqueo = await bloqueoEnviosSms();
  const destinatarios = bloqueo ? [] : await listarDestinatariosSms();
  return (
    <main className="stack-lg">
      <h1>Envíos SMS</h1>
      <PestanasCredenciales actual="/sms" />
      <Link className="w-fit underline" href="/admin/credenciales/envios?canal=sms">Ver seguimiento de SMS</Link>
      <PanelSmsCredenciales destinatarios={destinatarios} maxSeleccion={MAX_SELECCION_SMS} bloqueo={bloqueo} />
    </main>
  );
}

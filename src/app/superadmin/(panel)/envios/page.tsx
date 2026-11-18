import { LineaWhatsAppPanel } from "@/components/linea-whatsapp";
import { requireSuperadmin } from "@/server/guard";
import { estadoLinea } from "@/server/whatsapp-linea";

export const dynamic = "force-dynamic";

export default async function Envios() {
  const sesion = await requireSuperadmin();
  const linea = await estadoLinea(sesion);
  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-xl font-semibold">Envíos de credenciales</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Línea de WhatsApp de CNE</h2>
        <LineaWhatsAppPanel inicial={linea} />
      </section>
    </main>
  );
}

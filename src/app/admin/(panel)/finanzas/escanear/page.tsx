import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { EscanearQr } from "@/components/escanear-qr";
import { requireAdmin } from "@/server/guard";

export default async function Escanear() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  return (
    <main className="space-y-4">
      <h1>Escanear QR</h1>
      <PestanasFinanzas />
      <p>Apunte al QR de la cédula. Si no se lee, escríbala.</p>
      <EscanearQr />
    </main>
  );
}

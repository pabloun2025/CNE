import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { EscanearQr } from "@/components/escanear-qr";
import { requireAdmin } from "@/server/guard";

export default async function Escanear() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Escanear QR</h1>
      <p>Apunte al QR de la cédula. Si no se lee, escríbala.</p>
      <EscanearQr />
    </main>
  );
}

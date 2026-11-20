import Link from "next/link";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { FormMedidasCredencial } from "@/components/form-medidas-credencial";
import { FormParametrosPago } from "@/components/form-parametros-pago";
import { medidasCredencial } from "@/server/credencial-config";
import { requireAdmin } from "@/server/guard";
import { leerParametros } from "@/server/pago";

export default async function Configuracion() {
  const sesion = await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const [p, medidas] = await Promise.all([leerParametros(), sesion.rol === "consul" ? medidasCredencial() : null]);
  return (
    <main className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Configuración</h1>
      {sesion.rol === "consul" && (
        <section className="card stack">
          <h2>Envío de credenciales</h2>
          <p>Consulte Evolution API y vincule el teléfono con un código QR.</p>
          <Link className="button-like" href="/admin/configuracion/envios#whatsapp">Configurar WhatsApp</Link>
        </section>
      )}
      {medidas && (
        <section id="medidas-credencial" className="card stack">
          <h2>Medidas de la credencial</h2>
          <FormMedidasCredencial medidas={medidas} />
        </section>
      )}
      <section className="card stack">
        <h2>Comprobantes de pago</h2>
        <p>El recibo muestra el valor de referencia en USD y el importe entregado en EUR.</p>
        <FormParametrosPago valores={p} />
      </section>
    </main>
  );
}

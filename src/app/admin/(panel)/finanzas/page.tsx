import Link from "next/link";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { PanelFinanciero } from "@/components/panel-financiero";
import { requireAdmin } from "@/server/guard";

export default async function Finanzas() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  return (
    <main className="stack-lg">
      <h1>Finanzas</h1>
      <PestanasFinanzas />
      <ol className="home-cards">
        <li className="home-card"><h2>Escanear</h2><p>Use en el móvil el enlace de Escaneo de Finanzas que le entregue el cónsul.</p></li>
        <li className="home-card"><h2><Link href="/admin/finanzas/documentos">Documentos de identidad</Link></h2><p>Vea las fotos cargadas y capture las que falten.</p></li>
        <li className="home-card"><h2><Link href="/admin/finanzas/pagar">Revisar e imprimir</Link></h2><p>Valide el documento de identidad, imprima el recibo y entréguelo a Caja.</p></li>
        <li className="home-card"><h2><Link href="/admin/finanzas/caja">Caja</Link></h2><p>Recoja la firma en papel, entregue el efectivo y confirme el pago.</p></li>
      </ol>
      <section className="stack">
        <h2>Estado de los pagos</h2>
        <PanelFinanciero />
      </section>
    </main>
  );
}

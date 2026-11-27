import Link from "next/link";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { PanelFinanciero } from "@/components/panel-financiero";
import { requireAdmin } from "@/server/guard";

export default async function Finanzas() {
  const cuenta = await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  return (
    <main className="stack-lg">
      <h1>Finanzas</h1>
      <PestanasFinanzas />
      <ol className="home-cards" aria-label="Puestos de Finanzas">
        <li className="home-card">
          <h2>1. Ingreso a Finanzas</h2>
          <p><strong>1–2 personas</strong></p>
          <p>Abra el enlace de estación. Escanee la credencial o introduzca la cédula. CNE indica el siguiente puesto.</p>
          {cuenta.rol === "consul"
            ? <p><Link href="/admin/operadores">Ver enlaces de estación</Link></p>
            : <p>Use el enlace de Ingreso a Finanzas que le entregue el cónsul.</p>}
        </li>
        <li className="home-card">
          <h2><Link href="/admin/finanzas/documentos">2. Revisión</Link></h2>
          <p><strong>2 personas</strong></p>
          <p>Revise las fotos. Valídelas o indique si deben repetirse.</p>
        </li>
        <li className="home-card">
          <h2><Link href="/admin/finanzas/pagar">3. Impresión</Link></h2>
          <p><strong>2 personas</strong></p>
          <p>Emita el recibo, imprímalo y confirme cuando tenga el papel para Caja.</p>
        </li>
        <li className="home-card">
          <h2><Link href="/admin/finanzas/caja">4. Caja</Link></h2>
          <p><strong>1 persona</strong></p>
          <p>Recoja la firma, entregue el efectivo y confirme el pago.</p>
        </li>
      </ol>
      <section className="card stack">
        <h2>Orientación y equipo itinerante</h2>
        <p>El equipo itinerante usa <Link href="/admin/validacion-documental">Validación de documentos</Link>. Si las fotos ya están validadas al ingresar, indique que pase directo a Impresión.</p>
      </section>
      <section className="stack">
        <h2>Estado de los pagos</h2>
        <PanelFinanciero />
      </section>
    </main>
  );
}

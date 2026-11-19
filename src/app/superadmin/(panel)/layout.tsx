import { Masthead } from "@/components/marca";
import { salirSuperadmin } from "@/server/acceso-actions";
import { requireSuperadmin } from "@/server/guard";

export default async function PanelSuperadmin({ children }: { children: React.ReactNode }) {
  const sesion = await requireSuperadmin();
  return (
    <div className="funcionario sheet">
      <Masthead titulo="Superadministración" detalle={sesion.nombre} acciones={<form action={salirSuperadmin}><button className="quiet" type="submit">Salir ({sesion.nombre})</button></form>} />
      <main>
        <nav className="section-tabs" aria-label="Superadministración">
          <a className="section-tab" href="/superadmin">Superadministración</a>
          <a className="section-tab" href="/superadmin/envios">Envíos</a>
        </nav>
        {children}
      </main>
    </div>
  );
}

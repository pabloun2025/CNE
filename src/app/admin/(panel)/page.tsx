import Link from "next/link";
import { PASOS_MADRID, TODOS_LOS_ROLES } from "@/domain/roles";
import { InicioAdmin } from "@/components/inicio-admin";
import { requireAdmin } from "@/server/guard";

export default async function AdminInicio() {
  const sesion = await requireAdmin({ roles: TODOS_LOS_ROLES });
  const pasos = PASOS_MADRID.filter((p) => p.roles.includes(sesion.rol));
  return (
    <main className="stack-lg">
      <h1>Administración Madrid</h1>
      <ol className="circuit" aria-label="Orden del día">
        {pasos.map((p, i) => (
          <li key={p.href}>
            <Link href={p.href} className="home-card">
              <p className="circuit-post"><span className="circuit-n" aria-hidden="true">{i + 1}</span> {p.texto}</p>
            </Link>
          </li>
        ))}
      </ol>
      <InicioAdmin />
    </main>
  );
}

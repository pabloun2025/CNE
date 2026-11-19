import Link from "next/link";
import { PASOS_MADRID, TODOS_LOS_ROLES } from "@/domain/roles";
import { InicioAdmin } from "@/components/inicio-admin";
import { requireAdmin } from "@/server/guard";

export default async function AdminInicio() {
  const sesion = await requireAdmin({ roles: TODOS_LOS_ROLES });
  const pasos = PASOS_MADRID.filter((p) => p.roles.includes(sesion.rol));
  return (
    <main className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Administración Madrid</h1>
      <ol className="list-decimal space-y-1 pl-5">
        {pasos.map((p) => <li key={p.href}><Link href={p.href} className="font-semibold underline">{p.texto}</Link></li>)}
      </ol>
      <InicioAdmin />
    </main>
  );
}

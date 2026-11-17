import { salirSuperadmin } from "@/server/acceso-actions";
import { requireSuperadmin } from "@/server/guard";

export default async function PanelSuperadmin({ children }: { children: React.ReactNode }) {
  const sesion = await requireSuperadmin();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b bg-slate-100 px-4 py-3">
        <span className="font-semibold">Superadministración</span>
        <form action={salirSuperadmin}><button className="rounded px-3 py-2 text-sm font-medium text-red-700">Salir ({sesion.nombre})</button></form>
      </header>
      <div className="p-4">{children}</div>
    </div>
  );
}

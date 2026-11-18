import Link from "next/link";
import { ENLACES_ADMIN, type RolAdmin } from "@/domain/roles";
import { salirAdmin } from "@/server/acceso-actions";

// Menú lateral en escritorio; a 375 px es un desplegable.
// Solo muestra lo que el rol puede abrir; el servidor lo vuelve a comprobar en cada pantalla.
export function MenuAdmin({ nombre, rol }: { nombre: string; rol: RolAdmin }) {
  const lista = (
    <nav className="flex flex-col gap-1">
      {ENLACES_ADMIN.filter((e) => e.roles.includes(rol)).map((e) => (
        <Link key={e.href} href={e.href} className="rounded px-3 py-3 text-base font-medium hover:bg-slate-200">{e.texto}</Link>
      ))}
      <form action={salirAdmin}>
        <button className="w-full rounded px-3 py-3 text-left text-base font-medium text-red-700 hover:bg-slate-200">Salir ({nombre})</button>
      </form>
    </nav>
  );
  return (
    <>
      <details className="border-b bg-slate-100 md:hidden">
        <summary className="cursor-pointer px-4 py-3 font-semibold">Menú</summary>
        <div className="px-2 pb-2">{lista}</div>
      </details>
      <aside className="hidden w-56 shrink-0 border-r bg-slate-100 p-2 md:block">{lista}</aside>
    </>
  );
}

import Link from "next/link";
import { salirAdmin } from "@/server/acceso-actions";

export const ENLACES_ADMIN: { href: string; texto: string }[] = [
  { href: "/admin", texto: "Inicio" },
  { href: "/admin/mjrv", texto: "MJRV" },
];

// Menú lateral en escritorio; a 375 px es un desplegable.
export function MenuAdmin({ nombre }: { nombre: string }) {
  const lista = (
    <nav className="flex flex-col gap-1">
      {ENLACES_ADMIN.map((e) => (
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/admin/finanzas", texto: "Resumen" },
  { href: "/admin/finanzas/pagar", texto: "Revisar e imprimir" },
  { href: "/admin/finanzas/caja", texto: "Caja" },
  { href: "/admin/finanzas/recibos", texto: "Recibos" },
];

export function PestanasFinanzas() {
  const path = usePathname();
  return (
    <nav aria-label="Finanzas" className="section-tabs">
      {PESTANAS.map((p) => {
        const actual = path === p.href || (p.href.endsWith("/recibos") && path.startsWith(`${p.href}/`));
        return <Link key={p.href} href={p.href} className="section-tab" aria-current={actual ? "page" : undefined}>{p.texto}</Link>;
      })}
    </nav>
  );
}

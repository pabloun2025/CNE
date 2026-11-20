"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PESTANAS = [
  { href: "/admin/finanzas", texto: "Finanzas" },
  { href: "/admin/finanzas/pagar", texto: "Módulo de pago" },
  { href: "/admin/finanzas/escanear", texto: "Escanear QR" },
  { href: "/admin/finanzas/imprimir", texto: "Impresión de actas" },
  { href: "/admin/finanzas/recibos", texto: "Recibos" },
];

export function PestanasFinanzas() {
  const path = usePathname();
  return (
    <nav aria-label="Finanzas" className="section-tabs">
      {PESTANAS.map((p) => (
        <Link key={p.href} href={p.href} className="section-tab" aria-current={path === p.href ? "page" : undefined}>{p.texto}</Link>
      ))}
    </nav>
  );
}

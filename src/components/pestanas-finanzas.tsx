"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Las cuatro pantallas de finanzas siguen en su ruta. Aquí solo se eligen, como las pestañas de DEMP.
const PESTANAS = [
  { href: "/admin/finanzas", texto: "Finanzas" },
  { href: "/admin/finanzas/pagar", texto: "Módulo de pago" },
  { href: "/admin/finanzas/escanear", texto: "Escanear QR" },
  { href: "/admin/finanzas/imprimir", texto: "Impresión de actas" },
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

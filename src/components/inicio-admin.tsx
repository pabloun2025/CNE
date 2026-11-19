"use client";

import Link from "next/link";
import type { ResumenAdminRol } from "@/server/resumen-admin";
import { horaCorta, useSondeo } from "./sondeo";

function Tarjeta({ titulo, valor, detalle, tono = "" }: { titulo: string; valor: string | number; detalle?: string; tono?: string }) {
  return (
    <article className={`home-card stat ${tono}`}>
      <h3>{titulo}</h3>
      <p className="stat-figure">{valor}</p>
      {detalle && <p className="hint">{detalle}</p>}
    </article>
  );
}

// Sondeo de 10 s. Apertura de juntas y pagos van separados: son momentos distintos de la jornada.
export function InicioAdmin() {
  const { datos, ultima, falla } = useSondeo<ResumenAdminRol>("/api/admin/resumen", 10000);
  if (!datos) return <p>{falla ? "No se pudo cargar el resumen. Reintentando…" : "Cargando…"}</p>;
  const a = datos.apertura; // null si el rol no ve las juntas
  const p = datos.pagos; // null si el rol no ve los pagos
  return (
    <div className="space-y-6">
      {falla && ultima && <p role="status" className="text-sm font-medium text-amber-900">Sin actualizar desde {horaCorta(ultima)}.</p>}
      {a && <section className="space-y-2">
        <h2 className="text-lg font-semibold">Apertura de juntas</h2>
        <div className="home-cards">
          <Tarjeta titulo="Credenciales preparadas" valor={a.preparadas} detalle={`${a.pendientes} pendientes`} />
          <Tarjeta titulo="MJRV ingresados" valor={`${a.ingresados} / ${a.total}`} />
          <Tarjeta titulo="Juntas con tres presentes" valor={a.completas} tono="bg-green-50" />
          <Tarjeta titulo="Juntas incompletas" valor={a.incompletas} detalle="Con uno o dos presentes" tono="bg-amber-50" />
          <Tarjeta titulo="Juntas sin nadie" valor={a.sinNadie} tono="bg-red-50" />
        </div>
        <Link href="/admin/mando" className="button-like">Ir al centro de mando</Link>
      </section>}
      {p && <section className="space-y-2">
        <h2 className="text-lg font-semibold">Pagos</h2>
        <div className="home-cards">
          <Tarjeta titulo="Documentos completos" valor={p.documentosCompletos} detalle={`${p.documentosIncompletos} incompletos`} />
          <Tarjeta titulo="Pagos confirmados" valor={p.pagados} detalle={datos.modoPrueba ? "Simulados (modo prueba)" : undefined} />
          <Tarjeta titulo="Total entregado" valor={`${p.totalUsd} USD`} detalle="Solo pagos confirmados" />
        </div>
        <Link href="/admin/finanzas" className="button-like secondary">Ir a finanzas</Link>
      </section>}
      {ultima && <p className="text-xs">Actualizado a las {horaCorta(ultima)}.</p>}
    </div>
  );
}

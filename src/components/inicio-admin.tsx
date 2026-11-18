"use client";

import Link from "next/link";
import type { ResumenAdmin } from "@/server/resumen-admin";
import { horaCorta, useSondeo } from "./sondeo";

function Tarjeta({ titulo, valor, detalle, tono = "" }: { titulo: string; valor: string | number; detalle?: string; tono?: string }) {
  return (
    <div className={`rounded border p-3 ${tono}`}>
      <p className="text-sm font-medium">{titulo}</p>
      <p className="text-3xl font-bold">{valor}</p>
      {detalle && <p className="text-xs">{detalle}</p>}
    </div>
  );
}

// Sondeo de 10 s. Apertura de juntas y pagos van separados: son momentos distintos de la jornada.
export function InicioAdmin() {
  const { datos, ultima, falla } = useSondeo<ResumenAdmin>("/api/admin/resumen", 10000);
  if (!datos) return <p>{falla ? "No se pudo cargar el resumen. Reintentando…" : "Cargando…"}</p>;
  const a = datos.apertura;
  const p = datos.pagos;
  return (
    <div className="space-y-6">
      {falla && ultima && <p role="status" className="text-sm font-medium text-amber-900">Sin actualizar desde {horaCorta(ultima)}.</p>}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Apertura de juntas</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tarjeta titulo="Credenciales preparadas" valor={a.preparadas} detalle={`${a.pendientes} pendientes`} />
          <Tarjeta titulo="MJRV ingresados" valor={`${a.ingresados} / ${a.total}`} />
          <Tarjeta titulo="Juntas con tres presentes" valor={a.completas} tono="bg-green-50" />
          <Tarjeta titulo="Juntas incompletas" valor={a.incompletas} detalle="Con uno o dos presentes" tono="bg-amber-50" />
          <Tarjeta titulo="Juntas sin nadie" valor={a.sinNadie} tono="bg-red-50" />
        </div>
        <Link href="/admin/mando" className="inline-block rounded bg-blue-700 px-4 py-3 font-semibold text-white">Ir al centro de mando</Link>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Pagos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tarjeta titulo="Documentos completos" valor={p.documentosCompletos} detalle={`${p.documentosIncompletos} incompletos`} />
          <Tarjeta titulo="Pagos confirmados" valor={p.pagados} detalle={datos.modoPrueba ? "Simulados (modo prueba)" : undefined} />
          <Tarjeta titulo="Total entregado" valor={`${p.totalEur} EUR`} detalle="Solo pagos confirmados" />
        </div>
        <Link href="/admin/finanzas" className="inline-block rounded border border-slate-500 px-4 py-3 font-semibold">Ir a finanzas</Link>
      </section>
      {ultima && <p className="text-xs">Actualizado a las {horaCorta(ultima)}.</p>}
    </div>
  );
}

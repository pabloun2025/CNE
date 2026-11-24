import Link from "next/link";
import { FUNCIONES, FUNCION_NOMBRE } from "@/domain/estaciones";
import { SOLO_CONSUL } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { contextoGuias } from "@/server/guias";
import { GUIAS } from "@/server/pdf/guias";

export default async function Guias() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const { enlaces } = await contextoGuias();
  const sin = FUNCIONES.filter((f) => !enlaces[f]);
  return (
    <main className="max-w-3xl stack">
      <h1>Guías rápidas</h1>
      <p>Cada guía es una hoja A4. Los QR de estación dan acceso al puesto. Comparta las guías con el personal asignado y vuelva a descargarlas si se revoca o se crea un enlace.</p>
      {sin.length > 0 && <p role="status" className="font-medium text-red-700">Sin enlace activo: {sin.map((f) => FUNCION_NOMBRE[f]).join(", ")}. Pida un enlace a Superadministración.</p>}
      <div className="flex flex-wrap gap-3">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button-like" href="/admin/operadores/guias/zip">Descargar ZIP (7 PDF)</a>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button-like secondary" href="/admin/operadores/guias/todas">Descargar un PDF para imprimir</a>
      </div>
      <ul className="divide-y">
        {GUIAS.map((g) => (
          <li key={g.n} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span><strong>{g.n}. {g.titulo}</strong><span className="block text-sm text-slate-600">{g.subtitulo}</span></span>
            <a className="underline" href={`/admin/operadores/guias/${g.n}`}>Descargar PDF</a>
          </li>
        ))}
      </ul>
      <p><Link className="underline" href="/admin/operadores">Volver a Enlaces de estación</Link></p>
    </main>
  );
}

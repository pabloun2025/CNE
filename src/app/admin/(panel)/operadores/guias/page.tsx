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
      <p>Cada guía es una hoja A4 con el QR de acceso directo al puesto. Vuelva a descargarlas si revoca o crea un enlace.</p>
      {sin.length > 0 && <p role="status" className="font-medium text-red-700">Sin enlace activo: {sin.map((f) => FUNCION_NOMBRE[f]).join(", ")}. Créelo en Operadores; mientras tanto la guía lo indica.</p>}
      {/* Descarga de un PDF: no es navegación entre páginas. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <p><a className="button-like" href="/admin/operadores/guias/todas">Descargar todas (un PDF, 7 páginas)</a></p>
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

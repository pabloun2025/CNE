import Link from "next/link";
import { PestanasCredenciales } from "@/components/pestanas-credenciales";
import { SOLO_CONSUL } from "@/domain/roles";
import { leerBandejaWhatsApp } from "@/server/bandeja-whatsapp";
import { requireAdmin } from "@/server/guard";
import { leerLineaWhatsApp } from "@/server/whatsapp-linea";

const RUTA = "/admin/credenciales/whatsapp/bandeja";
const MAX_PAGINA = 200;
const fechaMadrid = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

export default async function BandejaWhatsApp({ searchParams }: {
  searchParams: Promise<{ linea?: string | string[]; pagina?: string | string[] }>;
}) {
  await requireAdmin({ roles: SOLO_CONSUL });
  const params = await searchParams;
  const linea = leerLineaWhatsApp(params.linea) ?? 1;
  const pagina = typeof params.pagina === "string" && /^[1-9]\d{0,2}$/.test(params.pagina)
    ? Math.min(Number(params.pagina), MAX_PAGINA) : 1;
  const bandeja = await leerBandejaWhatsApp(linea, pagina).catch(() => null);
  const enlacePagina = (n: number) => `${RUTA}?linea=${linea}&pagina=${n}`;

  return (
    <main className="stack-lg">
      <h1>Bandeja de WhatsApp</h1>
      <PestanasCredenciales actual="/whatsapp/bandeja" />
      <p className="hint">Respuestas de texto de números registrados en el padrón, recibidas desde que se habilita la bandeja de cada línea.</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Líneas de WhatsApp">
          {([1, 2] as const).map((numero) => (
            <Link key={numero} href={`${RUTA}?linea=${numero}`} prefetch={false} className="section-tab"
              aria-current={numero === linea ? "page" : undefined}>Línea {numero}</Link>
          ))}
        </nav>
        <form method="get" action={RUTA}>
          <input type="hidden" name="linea" value={linea} />
          <button type="submit" className="quiet">Actualizar bandeja</button>
        </form>
      </div>
      {!bandeja ? (
        <p className="banner bad" role="alert">La bandeja no está disponible en este momento. Vuelva a intentarlo.</p>
      ) : bandeja.mensajes.length === 0 ? (
        <p className="empty">{pagina === 1 ? "Sin respuestas registradas para esta línea." : "Sin respuestas en esta página."}</p>
      ) : (
        <ul aria-label="Respuestas de WhatsApp" className="stack">
          {bandeja.mensajes.map((mensaje) => (
            <li className="card stack min-w-0" key={mensaje.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <Link href={`/admin/mjrv/${mensaje.mjrvId}`} className="min-w-0 [overflow-wrap:anywhere] font-semibold">{mensaje.nombre}</Link>
                <time dateTime={mensaje.recibidoEn.toISOString()} className="hint">{fechaMadrid.format(mensaje.recibidoEn)}</time>
              </div>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{mensaje.texto}</p>
              {mensaje.ultimoEnvioEn && (
                <small>Último envío por esta línea aceptado por Evolution el {fechaMadrid.format(mensaje.ultimoEnvioEn)}.</small>
              )}
            </li>
          ))}
        </ul>
      )}
      {(pagina > 1 || (bandeja?.hayMas && pagina < MAX_PAGINA)) && (
        <nav className="flex flex-wrap gap-2" aria-label="Páginas de la bandeja">
          {pagina > 1 && <Link href={enlacePagina(pagina - 1)} prefetch={false} className="button-like secondary">Más recientes</Link>}
          {bandeja?.hayMas && pagina < MAX_PAGINA && <Link href={enlacePagina(pagina + 1)} prefetch={false} className="button-like secondary">Más antiguas</Link>}
        </nav>
      )}
    </main>
  );
}

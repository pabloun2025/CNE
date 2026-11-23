import Link from "next/link";
import { requireAdmin } from "@/server/guard";
import { SOLO_CONSUL } from "@/domain/roles";
import { enlaceWallet } from "@/server/wallet/google";
import { estadoEntregasCredenciales, TEXTO_ENTREGA, type EstadoEntrega } from "@/server/envios-estado";

const FILTROS: { clave: string; texto: string; estados: EstadoEntrega[] }[] = [
  { clave: "pendientes", texto: "Sin enviar", estados: ["sin_envio", "sin_contacto"] },
  { clave: "cola", texto: "En cola", estados: ["en_cola"] },
  { clave: "aceptados", texto: "Aceptados por el proveedor", estados: ["aceptado", "enviada_al_servicio"] },
  { clave: "entregados", texto: "Entregados", estados: ["entregado", "entregada"] },
  { clave: "diferidos", texto: "Entrega diferida", estados: ["diferido"] },
  { clave: "fallidos", texto: "Fallidos y rebotes", estados: ["fallo", "rebote_permanente", "rebote_temporal", "bloqueado", "invalido", "spam", "error"] },
];
const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

function Estado({ estado, fecha }: { estado: EstadoEntrega; fecha: string | null }) {
  return <>
    <span className="font-medium">{TEXTO_ENTREGA[estado]}</span>
    {fecha && <time dateTime={fecha} className="block text-sm">{hora.format(new Date(fecha))}</time>}
  </>;
}

export default async function SeguimientoEnvios({ searchParams }: { searchParams: Promise<{ q?: string; canal?: string; estado?: string }> }) {
  await requireAdmin({ roles: SOLO_CONSUL });
  const f = await searchParams;
  const fichas = await estadoEntregasCredenciales();
  const q = typeof f.q === "string" ? f.q.trim().slice(0, 120) : "";
  const buscado = q.toLocaleLowerCase("es");
  const canal = f.canal === "correo" || f.canal === "whatsapp" ? f.canal : "";
  const filtro = FILTROS.find((x) => x.clave === f.estado);
  const coinciden = fichas.filter((p) => {
    const texto = `${p.nombre} ${p.cedula} ${p.junta}`.toLocaleLowerCase("es");
    if (!texto.includes(buscado)) return false;
    if (!filtro) return true;
    return canal ? filtro.estados.includes(p[canal].estado) : filtro.estados.includes(p.correo.estado) || filtro.estados.includes(p.whatsapp.estado);
  });

  const enlaces = Object.fromEntries(coinciden.map((p) => [p.id, enlaceWallet(p.id, process.env.HOST_MADRID)]));

  return (
    <main className="stack-lg">
      <Link href="/admin/credenciales" className="underline">Volver a credenciales</Link>
      <h1>Seguimiento de envíos</h1>
      <p>Último envío real por canal para cada ficha activa. Brevo confirma la entrega del correo.</p>
      <form className="card flex flex-wrap items-end gap-3">
        <label>Nombre, cédula o junta<input name="q" type="search" defaultValue={q} className="block w-full" /></label>
        <label>Canal<select name="canal" defaultValue={canal} className="block">
          <option value="">Cualquiera</option><option value="correo">Correo</option><option value="whatsapp">WhatsApp</option>
        </select></label>
        <label>Estado<select name="estado" defaultValue={filtro?.clave ?? ""} className="block">
          <option value="">Todos</option>{FILTROS.map((x) => <option key={x.clave} value={x.clave}>{x.texto}</option>)}
        </select></label>
        <button className="bg-slate-800 px-4 py-2 text-white">Filtrar</button>
      </form>
      <p role="status">{coinciden.length} de {fichas.length} fichas</p>
      <ul className="stack">
        {coinciden.map((p) => (
          <li key={p.id} className="card grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Link href={`/admin/mjrv/${p.id}`} className="font-semibold underline">{p.nombre}</Link>
              <p className="text-sm">{p.junta} · {p.cedula}</p>
              {enlaces[p.id] && <label className="block text-sm">Enlace de Google Wallet (Android)<input readOnly value={enlaces[p.id]!} className="block w-full" /></label>}
            </div>
            <div><h2 className="text-sm font-semibold">WhatsApp{p.whatsapp.linea && ` · Línea ${p.whatsapp.linea}`}</h2><Estado {...p.whatsapp} /></div>
            <div><h2 className="text-sm font-semibold">Correo</h2><Estado {...p.correo} /></div>
          </li>
        ))}
      </ul>
    </main>
  );
}

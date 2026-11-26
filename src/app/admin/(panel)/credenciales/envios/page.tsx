import Link from "next/link";
import { PestanasCredenciales } from "@/components/pestanas-credenciales";
import { requireAdmin } from "@/server/guard";
import { SOLO_CONSUL } from "@/domain/roles";
import { enlaceWallet } from "@/server/wallet/google";
import { estadoEntregasCredenciales, ESTADOS_INCIDENCIA, TEXTO_ENTREGA, type EstadoEntrega } from "@/server/envios-estado";

const CANALES = ["correo", "whatsapp", "sms"] as const;
const FILTROS: { clave: string; texto: string; estados: EstadoEntrega[] }[] = [
  { clave: "pendientes", texto: "Sin enviar", estados: ["sin_envio", "sin_contacto"] },
  { clave: "cola", texto: "En cola", estados: ["en_cola"] },
  { clave: "reservados", texto: "Reservados para envío", estados: ["reservado"] },
  { clave: "aceptados", texto: "Aceptados por el proveedor", estados: ["aceptado", "enviada_al_servicio"] },
  { clave: "entregados", texto: "Entregados", estados: ["entregado", "entregada"] },
  { clave: "diferidos", texto: "Entrega diferida", estados: ["diferido"] },
  { clave: "fallidos", texto: "Fallidos y rebotes", estados: ESTADOS_INCIDENCIA },
  { clave: "inciertos", texto: "Resultado incierto", estados: ["incierto"] },
];
const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

function Fecha({ fecha }: { fecha: string }) {
  return <time dateTime={fecha} className="block text-sm">{hora.format(new Date(fecha))}</time>;
}

function Estado({ estado, fecha }: { estado: EstadoEntrega; fecha: string | null }) {
  return <>
    <span className="font-medium">{TEXTO_ENTREGA[estado]}</span>
    {fecha && <Fecha fecha={fecha} />}
  </>;
}

export default async function SeguimientoEnvios({ searchParams }: { searchParams: Promise<{ q?: string; canal?: string; estado?: string; apertura?: string }> }) {
  await requireAdmin({ roles: SOLO_CONSUL });
  const f = await searchParams;
  const fichas = await estadoEntregasCredenciales();
  const q = typeof f.q === "string" ? f.q.trim().slice(0, 120) : "";
  const buscado = q.toLocaleLowerCase("es");
  const canal = CANALES.find((c) => c === f.canal) ?? "";
  const filtro = FILTROS.find((x) => x.clave === f.estado);
  const apertura = f.apertura === "abierto" || f.apertura === "sin_apertura" ? f.apertura : "";
  const coinciden = fichas.filter((p) => {
    const texto = `${p.nombre} ${p.cedula} ${p.junta}`.toLocaleLowerCase("es");
    if (!texto.includes(buscado)) return false;
    if (apertura === "abierto" && !p.sms.abierto_en) return false;
    if (apertura === "sin_apertura" && (!p.sms.fecha || p.sms.abierto_en)) return false;
    return !filtro || (canal ? [canal] : CANALES).some((c) => filtro.estados.includes(p[c].estado));
  });

  const enlaces = Object.fromEntries(coinciden.map((p) => [p.id, enlaceWallet(p.id, process.env.HOST_MADRID)]));

  return (
    <main className="stack-lg">
      <h1>Seguimiento de envíos</h1>
      <PestanasCredenciales actual="/envios" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>Último envío real por canal para cada ficha activa.</p>
        <a href="/admin/credenciales/envios/descargar" className="button-like secondary">Descargar informe Excel</a>
      </div>
      <form className="card flex flex-wrap items-end gap-3">
        <label>Nombre, cédula o junta<input name="q" type="search" defaultValue={q} className="block w-full" /></label>
        <label>Canal<select name="canal" defaultValue={canal} className="block">
          <option value="">Cualquiera</option><option value="correo">Correo</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
        </select></label>
        <label>Estado<select name="estado" defaultValue={filtro?.clave ?? ""} className="block">
          <option value="">Todos</option>{FILTROS.map((x) => <option key={x.clave} value={x.clave}>{x.texto}</option>)}
        </select></label>
        <label>Apertura por SMS<select name="apertura" defaultValue={apertura} className="block">
          <option value="">Todas</option>
          <option value="abierto">Credencial abierta</option>
          <option value="sin_apertura">Sin apertura registrada</option>
        </select></label>
        <button className="bg-slate-800 px-4 py-2 text-white">Filtrar</button>
      </form>
      <p role="status">{coinciden.length} de {fichas.length} fichas</p>
      <ul className="stack">
        {coinciden.map((p) => (
          <li key={p.id} className="card grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2 lg:col-span-1">
              <Link href={`/admin/mjrv/${p.id}`} className="font-semibold underline">{p.nombre}</Link>
              <p className="text-sm">{p.junta} · {p.cedula}</p>
              {enlaces[p.id] && <label className="block text-sm">Enlace de Google Wallet (Android)<input readOnly value={enlaces[p.id]!} className="block w-full" /></label>}
              <p className="mt-2 text-sm font-semibold">Ingreso por Puerta</p>
              {p.ingreso_en ? <Fecha fecha={p.ingreso_en} /> : <p className="text-sm">Sin registro</p>}
            </div>
            <div><h2 className="text-sm font-semibold">WhatsApp{p.whatsapp.linea && ` · Línea ${p.whatsapp.linea}`}</h2>{p.whatsapp.rectificacion && <p className="text-sm">Aviso de rectificación</p>}<Estado {...p.whatsapp} /></div>
            <div><h2 className="text-sm font-semibold">Correo</h2><Estado {...p.correo} /></div>
            <div className="col-span-2 lg:col-span-1">
              <h2 className="text-sm font-semibold">SMS</h2>
              <Estado {...p.sms} />
              {p.sms.abierto_en ? <>
                <p className="mt-2 text-sm">Apertura de credencial registrada</p><Fecha fecha={p.sms.abierto_en} />
              </> : p.sms.clic_en ? <>
                <p className="mt-2 text-sm">Clic informado por el proveedor</p><Fecha fecha={p.sms.clic_en} />
              </> : p.sms.fecha && <p className="mt-2 text-sm">Sin apertura registrada</p>}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

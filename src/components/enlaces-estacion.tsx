import Link from "next/link";
import QRCode from "qrcode";
import { FUNCION_NOMBRE, type Funcion } from "@/domain/estaciones";
import { revocarEnlaceAccion } from "@/server/estacion-actions";
import type { Enlace } from "@/server/estaciones";
import { urlBase } from "@/server/url";
import { AccionesEnlaceEstacion } from "./admin-operadores";

async function prepararEnlaces(enlaces: Enlace[]) {
  const base = await urlBase();
  return Promise.all(enlaces.map(async (enlace) => {
    const url = enlace.token ? `${base}/e/${enlace.token}` : null;
    return { ...enlace, url, qr: url ? await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" }) : null };
  }));
}

export async function ListaEnlacesEstacion({ enlaces, administrar = false }: { enlaces: Enlace[]; administrar?: boolean }) {
  if (enlaces.length === 0) return <p>No hay enlaces {administrar ? "creados" : "activos"}.</p>;

  const conQr = await prepararEnlaces(enlaces);

  return (
    <ul className="divide-y">
      {conQr.map((e) => (
        <li key={e.id} className="space-y-2 py-3">
          <p className="font-medium">{e.etiqueta} <span className="font-normal text-slate-600">· {FUNCION_NOMBRE[e.funcion]}{administrar && (e.activo ? " · activo" : " · revocado")}</span></p>
          {e.url && e.qr && (
            <>
              <AccionesEnlaceEstacion url={e.url} etiqueta={e.etiqueta} funcion={e.funcion} />
              <details>
                <summary className="cursor-pointer text-sm font-medium underline">Ver enlace y QR</summary>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.qr} alt={`QR del enlace ${e.etiqueta}`} width={200} height={200} className="my-2" />
                <p className="break-all font-mono text-xs">{e.url}</p>
              </details>
            </>
          )}
          {administrar && e.activo && (
            <form action={revocarEnlaceAccion}>
              <input type="hidden" name="id" value={e.id} />
              <button className="rounded border border-red-600 px-3 py-2 text-sm font-medium text-red-700">Revocar</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

const PUESTOS: Record<Funcion, { titulo: string; equipo: string; tarea: string }> = {
  puerta: { titulo: "Puerta", equipo: "Personal de seguridad", tarea: "Verifica las credenciales y registra el ingreso al recinto." },
  mando: { titulo: "Centro de mando", equipo: "Coordinación de la jornada", tarea: "Consulta la cobertura de juntas y gestiona traslados. Requiere el PIN del operador." },
  mesas: { titulo: "Verificación de mesas", equipo: "Funcionarios que recorren las juntas", tarea: "Confirma quién ejerció, registra ausencias y reemplazos, y toma fotos de los documentos." },
  validacion_documental: { titulo: "Validación de documentos", equipo: "Personal autorizado para validar fotos", tarea: "Valida las fotos de cédulas y pasaportes y repite las tomas marcadas." },
  finanzas: { titulo: "1. Ingreso a Finanzas", equipo: "Personal que recibe a los MJRV en ventanilla", tarea: "Escanea el QR o busca por cédula. CNE indica si la persona pasa a Revisión o a Impresión." },
  documentacion: { titulo: "Captura de fotos", equipo: "Apoyo de fotografía", tarea: "Toma fotos de cédulas y pasaportes." },
};

const FINANZAS_CON_CUENTA = [
  { href: "/admin/finanzas/documentos", nombre: "2. Revisión" },
  { href: "/admin/finanzas/pagar", nombre: "3. Impresión" },
  { href: "/admin/finanzas/caja", nombre: "4. Caja" },
] as const;

type Compartible = Enlace & { url: string; qr: string };

function CompartirPuesto({ enlace, titulo, identificar }: { enlace: Compartible; titulo: string; identificar: boolean }) {
  return (
    <div className="grid min-w-0 gap-2">
      {identificar && <p className="font-semibold">{enlace.etiqueta}</p>}
      <AccionesEnlaceEstacion url={enlace.url} etiqueta={identificar ? enlace.etiqueta : undefined} funcion={enlace.funcion} conTexto />
      <details>
        <summary className="w-fit cursor-pointer text-sm font-semibold text-[var(--blue)]">Ver enlace y QR</summary>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enlace.qr} alt={`QR de ${identificar ? enlace.etiqueta : titulo}`} width={200} height={200} className="my-2" />
        <a href={enlace.url} className="break-all text-sm underline" target="_blank" rel="noreferrer">{enlace.url}</a>
      </details>
    </div>
  );
}

function TarjetaPuesto({ funcion, enlaces }: { funcion: Funcion; enlaces: Compartible[] }) {
  const { titulo, equipo, tarea } = PUESTOS[funcion];
  const puestos = enlaces.filter((enlace) => enlace.funcion === funcion);
  return (
    <article className="home-card min-w-0">
      <h3>{titulo}</h3>
      <p className="text-sm font-semibold text-[var(--blue)]">{equipo}</p>
      <p className="text-sm text-[var(--text-2)]">{tarea}</p>
      {puestos.length === 1 ? (
        <CompartirPuesto enlace={puestos[0]} titulo={titulo} identificar={false} />
      ) : puestos.length > 1 ? (
        <details>
          <summary className="w-fit cursor-pointer font-semibold text-[var(--blue)]">Elegir enlace ({puestos.length})</summary>
          <ul className="mt-2 grid divide-y divide-[var(--line)]">
            {puestos.map((enlace) => <li key={enlace.id} className="min-w-0 py-2"><CompartirPuesto enlace={enlace} titulo={titulo} identificar /></li>)}
          </ul>
        </details>
      ) : <p className="text-sm font-semibold">Sin enlace activo.</p>}
    </article>
  );
}

export async function AccesosPorEquipo({ enlaces }: { enlaces: Enlace[] }) {
  const compartibles = (await prepararEnlaces(enlaces)).filter((enlace): enlace is Compartible => enlace.url !== null && enlace.qr !== null);
  return (
    <>
      <section className="stack" aria-labelledby="puestos-recinto">
        <h2 id="puestos-recinto">Puerta y coordinación</h2>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <TarjetaPuesto funcion="puerta" enlaces={compartibles} />
          <TarjetaPuesto funcion="mando" enlaces={compartibles} />
        </div>
      </section>
      <section className="stack" aria-labelledby="puestos-itinerantes">
        <h2 id="puestos-itinerantes">Equipo itinerante</h2>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <TarjetaPuesto funcion="mesas" enlaces={compartibles} />
          <TarjetaPuesto funcion="validacion_documental" enlaces={compartibles} />
        </div>
      </section>
      <section id="finanzas" className="stack scroll-mt-20" aria-labelledby="puestos-finanzas">
        <h2 id="puestos-finanzas">Finanzas</h2>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <TarjetaPuesto funcion="finanzas" enlaces={compartibles} />
          <article className="home-card min-w-0">
            <h3>Con cuenta de Finanzas</h3>
            <p className="text-sm text-[var(--text-2)]">Abra el puesto asignado en el ordenador de trabajo.</p>
            <ul className="flex flex-wrap gap-2">
              {FINANZAS_CON_CUENTA.map(({ href, nombre }) => (
                <li key={href}><Link className="button-like secondary !px-3 text-sm" href={href}>{nombre}</Link></li>
              ))}
            </ul>
          </article>
        </div>
      </section>
      {compartibles.some((enlace) => enlace.funcion === "documentacion") && (
        <details>
          <summary className="w-fit cursor-pointer font-semibold text-[var(--blue)]">Otros accesos</summary>
          <div className="mt-2"><TarjetaPuesto funcion="documentacion" enlaces={compartibles} /></div>
        </details>
      )}
    </>
  );
}

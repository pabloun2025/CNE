import { SOLO_CONSUL } from "@/domain/roles";
import QRCode from "qrcode";
import { AccionesEnlaceEstacion, FormEnlace, FormOperador, FormPin } from "@/components/admin-operadores";
import { FUNCION_NOMBRE } from "@/domain/estaciones";
import { requireAdmin } from "@/server/guard";
import { activarOperadorAccion, revocarEnlaceAccion } from "@/server/estacion-actions";
import { listarEnlaces, listarOperadores } from "@/server/estaciones";
import { urlBase } from "@/server/url";

export default async function Operadores() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [operadores, enlaces, base] = await Promise.all([listarOperadores(), listarEnlaces(), urlBase()]);
  const conQr = await Promise.all(enlaces.map(async (e) => {
    const url = e.token ? `${base}/e/${e.token}` : null;
    return { ...e, url, qr: url ? await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" }) : null };
  }));
  const hayPuerta = enlaces.some((e) => e.activo && e.funcion === "puerta");
  return (
    <main className="max-w-3xl space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Operadores</h1>
        {operadores.length === 0 || !hayPuerta ? <p className="mt-1 text-sm">Cree al menos un enlace de puerta y un operador.</p> : null}
        <ul className="mt-2 divide-y">
          {operadores.map((o) => (
            <li key={o.id} className="space-y-2 py-3">
              <p className="font-medium">{o.nombre} {o.apellido} <span className="font-normal text-slate-600">· {o.funciones.map((f) => FUNCION_NOMBRE[f]).join(", ")}</span></p>
              <p className="text-sm">{o.activo ? "Activo" : "Desactivado"}{o.bloqueado ? " · bloqueado por PIN" : ""}</p>
              <div className="flex flex-wrap items-start gap-3">
                <form action={activarOperadorAccion}>
                  <input type="hidden" name="id" value={o.id} /><input type="hidden" name="activo" value={o.activo ? "0" : "1"} />
                  <button className="rounded border border-slate-500 px-3 py-2 text-sm font-medium">{o.activo ? "Desactivar" : "Reactivar"}</button>
                </form>
                {o.activo && <FormPin id={o.id} />}
              </div>
            </li>
          ))}
        </ul>
        <h2 className="mb-2 mt-4 font-semibold">Nuevo operador</h2>
        <FormOperador />
      </section>

      <section>
        <h2 className="text-xl font-semibold">Enlaces de estación</h2>
        <h3 className="mb-2 mt-4 font-semibold">Nuevo enlace</h3>
        <FormEnlace />
        <ul className="mt-2 divide-y">
          {conQr.map((e) => (
            <li key={e.id} className="space-y-2 py-3">
              <p className="font-medium">{e.etiqueta} <span className="font-normal text-slate-600">· {FUNCION_NOMBRE[e.funcion]} · {e.activo ? "activo" : "revocado"}</span></p>
              {e.url && <AccionesEnlaceEstacion url={e.url} etiqueta={e.etiqueta} funcion={e.funcion} />}
              {e.url && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium underline">Ver enlace y QR</summary>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={e.qr!} alt={`QR del enlace ${e.etiqueta}`} width={200} height={200} className="my-2" />
                  <p className="break-all font-mono text-xs">{e.url}</p>
                </details>
              )}
              {e.activo && (
                <form action={revocarEnlaceAccion}><input type="hidden" name="id" value={e.id} />
                  <button className="rounded border border-red-600 px-3 py-2 text-sm font-medium text-red-700">Revocar</button></form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

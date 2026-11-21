import QRCode from "qrcode";
import { FUNCION_NOMBRE } from "@/domain/estaciones";
import { revocarEnlaceAccion } from "@/server/estacion-actions";
import type { Enlace } from "@/server/estaciones";
import { urlBase } from "@/server/url";
import { AccionesEnlaceEstacion } from "./admin-operadores";

export async function ListaEnlacesEstacion({ enlaces, administrar = false }: { enlaces: Enlace[]; administrar?: boolean }) {
  if (enlaces.length === 0) return <p>No hay enlaces {administrar ? "creados" : "activos"}.</p>;

  const base = await urlBase();
  const conQr = await Promise.all(enlaces.map(async (e) => {
    const url = e.token ? `${base}/e/${e.token}` : null;
    return { ...e, url, qr: url ? await QRCode.toDataURL(url, { margin: 1, width: 320, errorCorrectionLevel: "M" }) : null };
  }));

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

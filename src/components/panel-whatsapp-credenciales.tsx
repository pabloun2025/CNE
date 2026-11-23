"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { PAUSA_MANUAL_WHATSAPP, PAUSA_WHATSAPP_MIN_S, PAUSA_WHATSAPP_MAX_S, type LineaEnvioWhatsApp } from "@/domain/envios-ritmo";
import type { PersonaCredencial } from "@/server/credenciales";
import type { EstadoCanal } from "@/server/envios-config";
import { controlarColaWhatsAppAccion, enviarLoteAccion } from "@/server/envios-actions";
import { IdsCredenciales } from "./envios-credenciales";
import { SelectorCredenciales } from "./selector-credenciales";

type Linea = EstadoCanal & { id: LineaEnvioWhatsApp; numero: string | null; real: boolean };
const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function TarjetaLinea({ linea }: { linea: Linea }) {
  const [estado, controlar, pendiente] = useActionState(controlarColaWhatsAppAccion, null);
  const pausaManual = linea.pausa === PAUSA_MANUAL_WHATSAPP;
  const estadoLinea = linea.pausa ? "En pausa" : linea.real ? "Envío real activo" : linea.numero ? "Envío real apagado" : "Sin vincular";
  return (
    <section className="card stack min-w-0 content-start" aria-labelledby={`wa-linea-${linea.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`wa-linea-${linea.id}`}>Línea {linea.id}</h3>
          {linea.numero && <p className="text-sm font-medium tabular-nums">{linea.numero}</p>}
        </div>
        <span className={`rounded-md px-2 py-1 text-sm font-semibold ${linea.pausa ? "bg-amber-100 text-amber-900" : linea.real ? "bg-green-100 text-green-900" : "bg-slate-100 text-slate-700"}`}>{estadoLinea}</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3">
        {([["En cola", linea.enCola], ["Aceptados hoy", linea.enviadosHoy], ["Fallidos", linea.fallidos]] as const).map(([titulo, valor]) => (
          <div key={titulo}>
            <dt className="text-sm text-slate-700">{titulo}</dt>
            <dd className="text-xl font-bold tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
      {linea.pausa && <p className="text-sm text-amber-900">{linea.pausa}{!pausaManual && " Revise la línea en Superadministración."}</p>}
      {linea.real && !linea.pausa && linea.enCola > 0 && linea.proximoEn &&
        <p className="text-sm">Próximo intento a partir de las {hora.format(new Date(linea.proximoEn))}</p>}
      {(pausaManual || (linea.real && !linea.pausa)) && (
        <form action={controlar}>
          <input type="hidden" name="linea" value={linea.id} />
          <button type="submit" name="accion" value={pausaManual ? "reanudar" : "pausar"} className="secondary" disabled={pendiente}>
            {pausaManual ? "Reanudar cola" : "Pausar cola"} <span className="sr-only">de la línea {linea.id}</span>
          </button>
        </form>
      )}
      {estado && <p role="status" className={estado.error ? "text-red-700" : "text-green-800"}>{estado.error ?? estado.aviso}</p>}
    </section>
  );
}

export function PanelWhatsAppCredenciales({ personas, lineas }: { personas: PersonaCredencial[]; lineas: Linea[] }) {
  const [seleccion, cambiar] = useState(new Set<number>());
  const [numero, setNumero] = useState("");
  const [estado, enviar, pendiente] = useActionState(enviarLoteAccion, null);
  const router = useRouter();
  const [actualizando, actualizar] = useTransition();
  const enMovimiento = lineas.some((l) => l.real && !l.pausa && l.enCola > 0);
  useEffect(() => {
    if (!enMovimiento) return;
    const timer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [enMovimiento, router]);

  const ids = personas.filter((p) => seleccion.has(p.id)).map((p) => p.id);
  const elegida = lineas.find((l) => String(l.id) === numero);
  const disponibles = lineas.filter((l) => l.numero || l.real);
  return (
    <>
      <section className="stack" aria-labelledby="wa-estado">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="wa-estado">Estado de las líneas</h2>
          <button className="quiet" type="button" disabled={actualizando} onClick={() => actualizar(() => router.refresh())}>Actualizar estado</button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">{lineas.map((linea) => <TarjetaLinea key={linea.id} linea={linea} />)}</div>
        <p className="text-sm">WhatsApp espera al azar entre {PAUSA_WHATSAPP_MIN_S} y {PAUSA_WHATSAPP_MAX_S} segundos por línea. Si Evolution indica un límite o rechaza el acceso, la línea se pausa. Al pausar, un envío ya iniciado puede terminar.</p>
        <Link className="w-fit underline" href="/admin/credenciales/envios?canal=whatsapp">Ver seguimiento por persona</Link>
      </section>
      <section aria-labelledby="wa-enviar" className="stack">
        <h2 id="wa-enviar">Enviar credenciales por WhatsApp</h2>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)]">
          <div className="card min-w-0"><SelectorCredenciales personas={personas} elegidas={seleccion} cambiar={cambiar} /></div>
          <form action={enviar} className="card stack min-w-0">
            <input type="hidden" name="canal" value="whatsapp" />
            <IdsCredenciales ids={ids} />
            <fieldset className="stack" disabled={pendiente}>
              <legend>Número remitente</legend>
              {disponibles.map((l) => (
                <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3" key={l.id}>
                  <input type="radio" name="linea" value={l.id} checked={numero === String(l.id)} onChange={(e) => setNumero(e.target.value)} required />
                  <span>Línea {l.id}{l.numero ? ` · ${l.numero}` : ""}{!l.real && <small className="block">Simulación</small>}</span>
                </label>
              ))}
              {!disponibles.length && <p>Vincule una línea de WhatsApp en Superadministración.</p>}
            </fieldset>
            {elegida?.pausa && elegida.real && <p className="text-sm text-amber-900">El lote quedará en espera hasta reanudar la línea.</p>}
            <label className="flex items-center gap-2"><input type="checkbox" name="reenviar" value="1" disabled={pendiente} /> Reenviar también las ya enviadas</label>
            <button disabled={!ids.length || !elegida || pendiente}>
              {pendiente ? "Procesando…" : !ids.length ? "Seleccione fichas" : `Enviar ${ids.length} ${ids.length === 1 ? "credencial" : "credenciales"}`}
            </button>
            {estado && <p role="status" className={estado.error ? "text-red-700" : "text-green-800"}>{estado.error ?? estado.aviso}</p>}
          </form>
        </div>
      </section>
    </>
  );
}

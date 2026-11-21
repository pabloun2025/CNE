"use client";

import { useActionState, useState } from "react";
import { CARGOS_FICHA, etiquetaCargoCredencial } from "@/domain/cargos-credencial";
import { CEDULA_MAX, CEDULA_MIN, opcionesJuntas, PREFIJO_MOVIL } from "@/domain/ingreso";
import { leerJunta, zonaDe, ZONA_NOMBRE, type Serie } from "@/domain/juntas";
import { crearMjrvAccion, editarMjrvAccion, type EstadoMjrv } from "@/server/mjrv-actions";
import type { DatosMjrv } from "@/server/mjrv";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";

export function FormMjrv({ id, inicial }: { id?: number; inicial?: DatosMjrv }) {
  const [estado, enviar, pendiente] = useActionState<EstadoMjrv, FormData>(id ? editarMjrvAccion : crearMjrvAccion, null);
  const v = inicial;
  const junta = leerJunta(v?.junta ?? "");
  const [serie, fijarSerie] = useState<Serie | "">(junta?.serie ?? "");
  const [numero, fijarNumero] = useState(junta ? String(junta.numero) : "");
  const zona = serie ? zonaDe(serie, Number(numero)) : null;
  const cargoActual = v ? etiquetaCargoCredencial(v.cargo) : undefined;
  const cargoDelCatalogo = CARGOS_FICHA.some((c) => c.etiqueta === cargoActual);
  return (
    <form action={enviar} className="grid max-w-xl gap-3">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="text-sm font-medium">Número de cédula o pasaporte
        <input name="cedula" defaultValue={v?.cedula} required minLength={CEDULA_MIN} maxLength={CEDULA_MAX} pattern="[0-9A-Za-z-]{5,20}" className={campo} />
      </label>
      <label className="text-sm font-medium">Apellidos<input name="apellidos" defaultValue={v?.apellidos} required className={campo} /></label>
      <label className="text-sm font-medium">Nombres<input name="nombres" defaultValue={v?.nombres} required className={campo} /></label>
      <label className="text-sm font-medium">Cargo
        <select key={v?.cargo} name="cargo" defaultValue="" required={!v} className={campo}>
          {!cargoDelCatalogo && <option value="">{v ? cargoActual || "Conservar cargo actual" : "Elija el cargo"}</option>}
          {CARGOS_FICHA.map((c) => <option key={c.valor} value={c.etiqueta === cargoActual ? "" : c.valor}>{c.etiqueta}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-medium">Serie de la junta
          <select name="serie" value={serie} onChange={(e) => { fijarSerie(e.target.value as Serie | ""); fijarNumero(""); }} required className={campo}>
            <option value="">Elija H o M</option>
            <option value="H">H</option>
            <option value="M">M</option>
          </select>
        </label>
        <label className="text-sm font-medium">Número de la junta
          <select name="numero" value={numero} onChange={(e) => fijarNumero(e.target.value)} disabled={!serie} required className={campo}>
            <option value="">Elija el número</option>
            {serie && opcionesJuntas(serie).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      {zona && <p role="status" className="text-sm font-medium">Zona {ZONA_NOMBRE[zona]}</p>}
      <label className="text-sm font-medium">Correo (opcional)<input name="correo" type="email" defaultValue={v?.correo} className={campo} /></label>
      <label className="text-sm font-medium">Móvil (opcional)
        <input name="telefono" defaultValue={v?.telefono || PREFIJO_MOVIL} inputMode="tel" autoComplete="tel" className={campo} />
      </label>
      {estado?.error && <p role="alert" className="font-medium text-red-700">{estado.error}</p>}
      {estado?.aviso && <p role="status" className="font-medium text-green-800">{estado.aviso}</p>}
      <button disabled={pendiente} className="rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{id ? "Guardar cambios" : "Crear ficha"}</button>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import type { PersonaCredencial } from "@/server/credenciales";
import { enviarCredencialAccion, enviarLoteAccion, type EstadoEnvios } from "@/server/envios-actions";
import { SelectorCredenciales } from "./selector-credenciales";

function Resultado({ estado }: { estado: EstadoEnvios }) {
  if (!estado) return null;
  return <p role="status" className={estado.error ? "text-red-700" : "text-green-800"}>{estado.error ?? estado.aviso}</p>;
}

function CanalEnvio({ whatsapp, correo }: { whatsapp: boolean; correo: boolean }) {
  return (
    <label>Canal
      <select name="canal" defaultValue="" required>
        <option value="" disabled>Seleccione un canal</option>
        <option value="whatsapp" disabled={!whatsapp}>WhatsApp</option>
        <option value="correo" disabled={!correo}>Correo</option>
        <option value="ambos" disabled={!whatsapp || !correo}>WhatsApp y correo</option>
      </select>
    </label>
  );
}

export function BotonesEnvio({ id, tieneTelefono, tieneCorreo }: { id: number; tieneTelefono: boolean; tieneCorreo: boolean }) {
  const [estado, enviar, pendiente] = useActionState(enviarCredencialAccion, null);
  if (!tieneTelefono && !tieneCorreo) return <p>Añada un teléfono o correo para enviar esta credencial.</p>;
  return (
    <form action={enviar} className="stack">
      <input type="hidden" name="id" value={id} />
      <CanalEnvio whatsapp={tieneTelefono} correo={tieneCorreo} />
      <Reenvio />
      <button disabled={pendiente}>{pendiente ? "Procesando…" : "Enviar credencial"}</button>
      <Resultado estado={estado} />
    </form>
  );
}

function Reenvio() {
  return <label className="flex items-center gap-2"><input type="checkbox" name="reenviar" value="1" /> Reenviar también las ya enviadas</label>;
}

export function IdsCredenciales({ ids }: { ids: readonly number[] }) {
  return ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />);
}

export function DistribuirCredenciales({ ids, bloqueado = false }: { ids: readonly number[]; bloqueado?: boolean }) {
  const [estado, enviar, pendiente] = useActionState(enviarLoteAccion, null);
  const desactivado = bloqueado || pendiente || !ids.length;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form method="post" action="/admin/credenciales/pdf" target="_blank" className="stack">
        <IdsCredenciales ids={ids} />
        <button name="formato" value="individual" className="secondary" disabled={desactivado}>
          {ids.length > 1 ? "Descargar ZIP de PDFs" : "Descargar PDF individual"}
        </button>
      </form>
      <form action={enviar} className="stack">
        <IdsCredenciales ids={ids} />
        <fieldset className="stack" disabled={desactivado}>
          <CanalEnvio whatsapp correo />
          <Reenvio />
          <button>{pendiente ? "Procesando…" : "Enviar credenciales"}</button>
        </fieldset>
        <Resultado estado={estado} />
      </form>
    </div>
  );
}

export function AccionesCredenciales({ personas }: { personas: PersonaCredencial[] }) {
  const [seleccion, cambiar] = useState(new Set<number>());
  const elegidas = new Set(personas.filter((p) => seleccion.has(p.id)).map((p) => p.id));
  return (
    <div className="card stack">
      <SelectorCredenciales personas={personas} elegidas={elegidas} cambiar={cambiar} />
      <DistribuirCredenciales ids={[...elegidas]} />
    </div>
  );
}

export function ImprimirCredenciales({ personas }: { personas: PersonaCredencial[] }) {
  const [seleccion, cambiar] = useState(new Set<number>());
  const ids = personas.filter((p) => seleccion.has(p.id)).map((p) => p.id);
  return (
    <form method="post" action="/admin/credenciales/pdf" target="_blank" className="card stack">
      <SelectorCredenciales personas={personas} elegidas={new Set(ids)} cambiar={cambiar} />
      <button name="formato" value="a4" disabled={!ids.length}>Abrir planchas A4 para imprimir</button>
      <IdsCredenciales ids={ids} />
    </form>
  );
}

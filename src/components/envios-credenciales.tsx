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
      <button disabled={pendiente}>{pendiente ? "Procesando…" : "Enviar credencial"}</button>
      <Resultado estado={estado} />
    </form>
  );
}

export function AccionesCredenciales({ personas }: { personas: PersonaCredencial[] }) {
  const [estado, enviar, pendiente] = useActionState(enviarLoteAccion, null);
  const [seleccion, cambiar] = useState(new Set<number>());
  const elegidas = new Set(personas.filter((p) => seleccion.has(p.id)).map((p) => p.id));
  const desactivado = pendiente || !elegidas.size;
  return (
    <div className="card stack">
      <SelectorCredenciales personas={personas} elegidas={elegidas} cambiar={cambiar} />
      <form method="post" action="/admin/credenciales/pdf" target="_blank" className="flex flex-wrap gap-3">
        {[...elegidas].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <button name="formato" value="a4" disabled={desactivado}>Abrir PDF A4</button>
        <button name="formato" value="individual" formTarget={elegidas.size > 1 ? "_self" : "_blank"} className="secondary" disabled={desactivado}>{elegidas.size > 1 ? "Descargar ZIP de PDFs" : "Abrir PDF individual"}</button>
      </form>
      <form action={enviar} className="stack">
        {[...elegidas].map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <CanalEnvio whatsapp correo />
        <button disabled={desactivado}>{pendiente ? "Procesando…" : "Procesar envíos"}</button>
        <Resultado estado={estado} />
      </form>
    </div>
  );
}

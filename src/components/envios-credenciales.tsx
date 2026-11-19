"use client";

import { useActionState } from "react";
import { enviarCredencialAccion, enviarLoteAccion, type EstadoEnvios } from "@/server/envios-actions";
import { SelectorCredenciales, type PersonaCredencial } from "./selector-credenciales";

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

export function EnvioLote({ personas, whatsapp, correo }: { personas: PersonaCredencial[]; whatsapp: boolean; correo: boolean }) {
  const [estado, enviar, pendiente] = useActionState(enviarLoteAccion, null);
  if (!whatsapp && !correo) return <p>No hay envíos pendientes con datos de contacto.</p>;
  return (
    <form action={enviar} className="stack">
      <SelectorCredenciales personas={personas} />
      <CanalEnvio whatsapp={whatsapp} correo={correo} />
      <button disabled={pendiente}>{pendiente ? "Procesando…" : "Procesar envíos"}</button>
      <Resultado estado={estado} />
    </form>
  );
}

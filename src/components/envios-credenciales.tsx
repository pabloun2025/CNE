"use client";

import { useActionState } from "react";
import { enviarCredencialAccion, enviarLoteAccion, type EstadoEnvios } from "@/server/envios-actions";

const boton = "rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60";

function Resultado({ estado }: { estado: EstadoEnvios }) {
  if (!estado) return null;
  return <p role="status" className={`mt-2 text-sm font-medium ${estado.error ? "text-red-700" : "text-green-800"}`}>{estado.error ?? estado.aviso}</p>;
}

export function BotonesEnvio({ id, tieneTelefono, tieneCorreo }: { id: number; tieneTelefono: boolean; tieneCorreo: boolean }) {
  const [w, enviarW, pw] = useActionState(enviarCredencialAccion, null);
  const [c, enviarC, pc] = useActionState(enviarCredencialAccion, null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        <form action={enviarW}><input type="hidden" name="id" value={id} /><input type="hidden" name="canal" value="whatsapp" /><button disabled={pw || !tieneTelefono} className={boton}>Enviar por WhatsApp</button></form>
        <form action={enviarC}><input type="hidden" name="id" value={id} /><input type="hidden" name="canal" value="correo" /><button disabled={pc || !tieneCorreo} className={boton}>Enviar por correo</button></form>
      </div>
      <Resultado estado={w} /><Resultado estado={c} />
    </div>
  );
}

export function EnvioLote({ canal, titulo, pendientes }: { canal: "whatsapp" | "correo"; titulo: string; pendientes: number }) {
  const [estado, enviar, pendiente] = useActionState(enviarLoteAccion, null);
  return (
    <form action={enviar}>
      <input type="hidden" name="canal" value={canal} />
      <button disabled={pendiente || pendientes === 0} className={boton}>{titulo}</button>
      <Resultado estado={estado} />
    </form>
  );
}

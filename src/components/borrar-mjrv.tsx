"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { borrarMjrvAccion, type EstadoMjrv } from "@/server/mjrv-actions";
import { quitarCargoAccion } from "@/server/movimiento-actions";

export function BorrarMjrv({ id }: { id: number }) {
  const [estado, enviar, pendiente] = useActionState<EstadoMjrv, FormData>(borrarMjrvAccion, null);
  const bloqueo = estado && "borrar" in estado ? estado.borrar : undefined;
  const [anular, setAnular] = useState("");
  const router = useRouter();
  return (
    <div id="borrar" className="space-y-2">
      <form action={enviar} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="confirmar" value="1" required className="h-5 w-5" />
          Confirmo el borrado
        </label>
        <button disabled={pendiente} className="rounded border-2 border-red-800 px-4 py-2 font-semibold text-red-800 disabled:opacity-60">Borrar ficha</button>
      </form>
      {estado?.error && <p role="alert" className="font-medium text-red-700">{estado.error}</p>}
      {bloqueo && !bloqueo.ok && (
        <div className="flex flex-wrap gap-2">
          <a href={`/admin/mjrv/${id}`} className="underline">Editar la ficha</a>
          {bloqueo.revocar && <a href="/admin/revocar" className="underline">Revocar la credencial</a>}
          {bloqueo.anularJuntaId != null && (
            <form action={async (f) => {
              const r = await quitarCargoAccion(f);
              setAnular(r.ok ? "Asignación anulada." : r.mensaje);
              if (r.ok) router.refresh();
            }}>
              <input type="hidden" name="juntaId" value={bloqueo.anularJuntaId} />
              <input type="hidden" name="mjrvId" value={id} />
              <button className="underline">Anular la asignación del cargo</button>
            </form>
          )}
        </div>
      )}
      {anular && <p role="status" className="font-medium">{anular}</p>}
    </div>
  );
}

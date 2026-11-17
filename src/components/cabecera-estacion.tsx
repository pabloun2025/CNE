"use client";

import { useEffect, useState } from "react";
import { cambiarOperadorAccion } from "@/server/estacion-actions";

// Función · operador · conexión · «Cambiar operador». Sin menú hacia otras funciones (§13.10).
export function CabeceraEstacion({ token, funcion, etiqueta, operador }: { token: string; funcion: string; etiqueta: string; operador: string }) {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const a = () => setEnLinea(navigator.onLine);
    a();
    window.addEventListener("online", a);
    window.addEventListener("offline", a);
    return () => { window.removeEventListener("online", a); window.removeEventListener("offline", a); };
  }, []);
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-slate-100 px-3 py-2 text-sm">
      <strong>{funcion}</strong>
      <span className="text-slate-600">{etiqueta}</span>
      <span>· {operador}</span>
      <span className={enLinea ? "text-green-800" : "font-bold text-red-700"}>{enLinea ? "● Conectado" : "● Sin conexión"}</span>
      <form action={cambiarOperadorAccion.bind(null, token)} className="ml-auto">
        <button className="rounded border border-slate-500 px-3 py-2 font-medium">Cambiar operador</button>
      </form>
    </header>
  );
}

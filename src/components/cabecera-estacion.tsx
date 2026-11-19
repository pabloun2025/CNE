"use client";

import { useEffect, useState } from "react";
import { cambiarOperadorAccion } from "@/server/estacion-actions";

import { MarcaEstado, Tricolor } from "./marca";

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
    <header className="mbar puesto-mbar">
      <Tricolor />
      <div className="mbar-row">
        <span className="mbar-brand">
          <MarcaEstado size={30} />
          <span className="mbar-name"><small>{funcion}</small><span>{etiqueta}</span></span>
        </span>
        <span>{operador}</span>
        <span className={enLinea ? "status-line online" : "status-line offline"}>{enLinea ? "● Conectado" : "● Sin conexión"}</span>
        <form action={cambiarOperadorAccion.bind(null, token)}>
          <button className="quiet" type="submit">Cambiar operador</button>
        </form>
      </div>
    </header>
  );
}

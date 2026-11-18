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
    <header className="cabecera-puesto">
      <strong>{funcion}</strong>
      <span>{etiqueta}</span>
      <span>{operador}</span>
      <span className={enLinea ? "en-linea" : "sin-linea"}>{enLinea ? "● Conectado" : "● Sin conexión"}</span>
      <form action={cambiarOperadorAccion.bind(null, token)}>
        <button>Cambiar operador</button>
      </form>
    </header>
  );
}

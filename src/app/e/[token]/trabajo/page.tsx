import { CabeceraEstacion } from "@/components/cabecera-estacion";
import { FUNCION_NOMBRE, FUNCIONES } from "@/domain/estaciones";
import { requireEstacion } from "@/server/guard";
import { Puerta } from "./puerta";

// La pantalla la decide la función del enlace; no hay forma de elegir otra desde aquí.
export default async function Trabajo({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await requireEstacion(token, FUNCIONES);
  return (
    <>
      <CabeceraEstacion token={token} funcion={FUNCION_NOMBRE[s.funcion]} etiqueta={s.etiqueta} operador={s.operadorNombre} />
      <main className="p-4">
        {s.funcion === "puerta" && <Puerta />}
        {s.funcion === "mando" && <p>Centro de mando: en construcción.</p>}
        {s.funcion === "documentacion" && <p>Documentación: en construcción.</p>}
        {s.funcion === "finanzas" && <p>Finanzas: en construcción.</p>}
      </main>
    </>
  );
}

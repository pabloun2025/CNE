import { CabeceraEstacion } from "@/components/cabecera-estacion";
import { FUNCION_NOMBRE, FUNCIONES } from "@/domain/estaciones";
import { requireEstacion } from "@/server/guard";
import { Documentacion } from "./documentacion";
import { Finanzas } from "./finanzas";
import { Mando } from "./mando";
import { Puerta } from "./puerta";

// La pantalla la decide la función del enlace; no hay forma de elegir otra desde aquí.
export default async function Trabajo({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await requireEstacion(token, FUNCIONES);
  return (
    <div className="funcionario">
      <CabeceraEstacion token={token} funcion={FUNCION_NOMBRE[s.funcion]} etiqueta={s.etiqueta} operador={s.operadorNombre} />
      <main className="p-3">
        {s.funcion === "puerta" && <Puerta />}
        {s.funcion === "mando" && <Mando />}
        {s.funcion === "documentacion" && <Documentacion />}
        {s.funcion === "finanzas" && <Finanzas />}
      </main>
    </div>
  );
}

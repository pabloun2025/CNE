import { CabeceraEstacion } from "@/components/cabecera-estacion";
import { FUNCION_NOMBRE } from "@/domain/estaciones";
import { medidasCredencial } from "@/server/credencial-config";
import { enlacePorToken } from "@/server/estaciones";
import { requireEstacion } from "@/server/guard";
import { redirect } from "next/navigation";
import { Documentacion } from "./documentacion";
import { Finanzas } from "./finanzas";
import { Mando } from "./mando";
import { Puerta } from "./puerta";

export const dynamic = "force-dynamic";

// La pantalla la decide la función del enlace; no hay forma de elegir otra desde aquí.
export default async function Trabajo({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const enlace = await enlacePorToken(token);
  if (!enlace) redirect(`/e/${token}`);
  const operador = enlace.funcion === "mando" ? (await requireEstacion(token, enlace.id)).operadorNombre : undefined;
  return (
    <div className="funcionario">
      <CabeceraEstacion token={token} funcion={FUNCION_NOMBRE[enlace.funcion]} etiqueta={enlace.etiqueta} operador={operador} />
      <main className="mx-auto max-w-7xl p-3">
        {enlace.funcion === "puerta" && <Puerta token={token} medidas={await medidasCredencial()} />}
        {enlace.funcion === "mando" && <Mando />}
        {enlace.funcion === "documentacion" && <Documentacion token={token} />}
        {enlace.funcion === "finanzas" && <Finanzas token={token} />}
      </main>
    </div>
  );
}

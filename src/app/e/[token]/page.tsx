import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Masthead } from "@/components/marca";
import { TecladoPin } from "@/components/teclado-pin";
import { FUNCION_NOMBRE } from "@/domain/estaciones";
import { registrarAuditoria } from "@/server/auditoria";
import { enlacePorToken, leerSesionEstacion, operadoresDelEnlace } from "@/server/estaciones";
import { COOKIE_ESTACION } from "@/server/guard";

export const dynamic = "force-dynamic";

export default async function Identificacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const enlace = await enlacePorToken(token);
  if (!enlace) {
    await registrarAuditoria({ portal: "estacion", actorTipo: "publico", accion: "enlace_inactivo_abierto" });
    return (
      <div className="funcionario sheet">
        <Masthead titulo="CNE 2026" detalle="Madrid" />
        <main>
          <h1>Enlace no activo</h1>
          <p>Este enlace ya no está activo. Pida uno nuevo a la administración.</p>
        </main>
      </div>
    );
  }
  if (enlace.funcion !== "mando") redirect(`/e/${token}/trabajo`);
  const sesion = await leerSesionEstacion((await cookies()).get(COOKIE_ESTACION)?.value);
  if (sesion && sesion.enlaceId === enlace.id) redirect(`/e/${token}/trabajo`);
  const operadores = await operadoresDelEnlace(enlace);
  return (
    <div className="funcionario sheet">
      <Masthead titulo={FUNCION_NOMBRE[enlace.funcion]} detalle={enlace.etiqueta} />
      <main>
        <p className="eyebrow">{FUNCION_NOMBRE[enlace.funcion]}</p>
        <h1>{enlace.etiqueta}</h1>
        <TecladoPin token={token} operadores={operadores} />
      </main>
    </div>
  );
}

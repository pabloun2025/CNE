import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { TecladoPin } from "@/components/teclado-pin";
import { FUNCION_NOMBRE } from "@/domain/estaciones";
import { registrarAuditoria } from "@/server/auditoria";
import { enlacePorToken, leerSesionEstacion, operadoresDelEnlace } from "@/server/estaciones";
import { COOKIE_ESTACION } from "@/server/guard";

export default async function Identificacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const enlace = await enlacePorToken(token);
  if (!enlace) {
    await registrarAuditoria({ portal: "estacion", actorTipo: "publico", accion: "enlace_inactivo_abierto" });
    return (
      <main className="mx-auto max-w-sm p-6">
        <h1 className="text-xl font-semibold">Enlace no activo</h1>
        <p className="mt-2">Este enlace ya no está activo. Pida uno nuevo a la administración.</p>
      </main>
    );
  }
  const sesion = await leerSesionEstacion((await cookies()).get(COOKIE_ESTACION)?.value);
  if (sesion && sesion.enlaceId === enlace.id) redirect(`/e/${token}/trabajo`);
  const operadores = await operadoresDelEnlace(enlace);
  return (
    <main className="mx-auto max-w-sm p-4">
      <p className="text-sm text-slate-600">{FUNCION_NOMBRE[enlace.funcion]}</p>
      <h1 className="text-2xl font-semibold">{enlace.etiqueta}</h1>
      <TecladoPin token={token} operadores={operadores} />
    </main>
  );
}

import { PestanasCredenciales } from "@/components/pestanas-credenciales";
import { ImprimirCredenciales } from "@/components/envios-credenciales";
import { planchaA4 } from "@/domain/credencial-layout";
import { SOLO_CONSUL } from "@/domain/roles";
import { medidasCredencial } from "@/server/credencial-config";
import { seleccionarParaCredencial } from "@/server/credenciales";
import { requireAdmin } from "@/server/guard";

export default async function ImprimirPlanchas() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [seleccion, medidas] = await Promise.all([seleccionarParaCredencial({ alcance: "todas" }), medidasCredencial()]);
  const plancha = planchaA4(medidas);
  return (
    <main className="max-w-2xl stack-lg">
      <h1>Imprimir credenciales en A4</h1>
      <PestanasCredenciales actual="/imprimir" />
      <p>Hasta {plancha.huecos.length} credenciales de {medidas.ancho.toLocaleString("es-ES")} × {medidas.alto.toLocaleString("es-ES")} mm por hoja A4.</p>
      <p>Las planchas usan F para juntas femeninas y M para juntas masculinas. El número y la zona de cada junta se conservan.</p>
      <ol className="list-decimal space-y-1 pl-6">
        <li>Seleccione las credenciales y abra las planchas.</li>
        <li>En el visor de PDF, imprima en papel A4 a tamaño real (100 %).</li>
        <li>Pruebe el QR de una hoja y recorte por las guías punteadas.</li>
      </ol>
      <ImprimirCredenciales personas={seleccion.personas} />
    </main>
  );
}

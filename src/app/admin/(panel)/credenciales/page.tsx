import Link from "next/link";
import { planchaA4 } from "@/domain/credencial-layout";
import { SOLO_CONSUL } from "@/domain/roles";
import { medidasCredencial } from "@/server/credencial-config";
import { requireAdmin } from "@/server/guard";
import { resumenCredenciales, seleccionarParaCredencial } from "@/server/credenciales";
import { AccionesCredenciales } from "@/components/envios-credenciales";
import { resumenEnvios } from "@/server/envios";
import { leerConfigEnvios } from "@/server/envios-config";
import { formularioAbierto } from "@/server/documentos";

export default async function Credenciales() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [r, e, cfg, abierto, seleccion, medidas] = await Promise.all([
    resumenCredenciales(), resumenEnvios(), leerConfigEnvios(), formularioAbierto(), seleccionarParaCredencial({ alcance: "todas" }), medidasCredencial(),
  ]);
  const porHoja = planchaA4(medidas).huecos.length;
  const milimetros = (valor: number) => valor.toLocaleString("es-ES");
  const hayHost = !!process.env.HOST_MADRID?.trim();
  return (
    <main className="max-w-2xl stack-lg">
      <h1>Credenciales</h1>
      {r.activos === 0 && <p>Cargue el Excel de MJRV para empezar.</p>}
      <p className="cifra">{r.activos} fichas activas · {r.preparadas} preparadas · {r.pendientes} pendientes.</p>
      {r.sinRotulo > 0 && <p role="alert" className="border-2 border-stone-900 bg-stone-100 p-2 font-medium">Falta el rótulo de credencial de {r.sinRotulo} personas. No se imprimirán hasta tenerlo.</p>}
      <p>Hasta {porHoja} por hoja A4, de {milimetros(medidas.ancho)} × {milimetros(medidas.alto)} mm. Imprima a tamaño real (100 %) y recorte por las guías punteadas. <Link className="underline" href="/admin/configuracion#medidas-credencial">Cambiar medidas</Link></p>
      <section aria-label="Estado del envío por WhatsApp y correo" className="stack">
        {cfg.whatsappReal || cfg.correoReal ? (
          <p role="note">WhatsApp: {cfg.whatsappReal ? "real" : "simulado"} · Correo: {cfg.correoReal ? "real" : "simulado"}. La cola envía credenciales definitivas entre las 9 y las 21 h de Madrid. Las fichas de demostración siempre se simulan.</p>
        ) : (
          <p role="note">Ambos canales están en simulación. Solo la superadministración puede activar el envío real.</p>
        )}
        {hayHost && !abierto && <p role="alert" className="border-2 border-stone-900 bg-stone-100 p-2 text-sm font-medium">El enlace del mensaje lleva al formulario de la cédula, que ahora está cerrado. Ábralo en Documentos antes de enviar.</p>}
        <p className="text-sm">Pendientes con contacto: {e.conTelefono - e.whatsapp} por WhatsApp · {e.conCorreo - e.correo} por correo.</p>
        <Link className="underline" href="/admin/configuracion/envios#whatsapp">Configurar WhatsApp</Link>
      </section>
      <AccionesCredenciales personas={seleccion.personas} />
      <p className="text-sm">Comprobar la lectura del QR con un móvil antes de imprimir todas. En modo prueba las credenciales llevan la marca «PRUEBA».</p>
    </main>
  );
}

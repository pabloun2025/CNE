import { SOLO_CONSUL } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { resumenCredenciales, seleccionarParaCredencial } from "@/server/credenciales";
import { EnvioLote } from "@/components/envios-credenciales";
import { SelectorCredenciales } from "@/components/selector-credenciales";
import { resumenEnvios } from "@/server/envios";
import { leerConfigEnvios } from "@/server/envios-config";
import { formularioAbierto } from "@/server/documentos";

export default async function Credenciales() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [r, e, cfg, abierto, seleccion] = await Promise.all([
    resumenCredenciales(), resumenEnvios(), leerConfigEnvios(), formularioAbierto(), seleccionarParaCredencial({ alcance: "todas" }),
  ]);
  const personas = seleccion.datos.map((d, i) => ({ id: seleccion.ids[i], nombre: `${d.apellidos}, ${d.nombres}`, rotulo: d.rotulo }));
  const hayHost = !!process.env.HOST_MADRID?.trim();
  return (
    <main className="max-w-2xl stack-lg">
      <h1>Credenciales</h1>
      {r.activos === 0 && <p>Cargue el Excel de MJRV para empezar.</p>}
      <p className="cifra">{r.activos} fichas activas · {r.preparadas} preparadas · {r.pendientes} pendientes.</p>
      {r.sinRotulo > 0 && <p role="alert" className="border-2 border-stone-900 bg-stone-100 p-2 font-medium">Falta el rótulo de credencial de {r.sinRotulo} personas. No se imprimirán hasta tenerlo.</p>}
      <form method="get" action="/admin/credenciales/pdf" target="_blank" className="card stack">
        <h2>Impresión</h2>
        <p>Hasta 10 credenciales de 54 × 85,6 mm por hoja A4. Imprima a tamaño real (100 %) y recorte por las guías punteadas.</p>
        <SelectorCredenciales personas={personas} imprimir />
        <div className="flex flex-wrap gap-3">
          <button name="formato" value="a4" className="bg-stone-900 px-4 py-3 text-white" disabled={!personas.length}>Abrir PDF A4</button>
          <button name="formato" value="individual" className="secondary px-4 py-3" disabled={!personas.length}>Abrir PDF individual</button>
        </div>
      </form>
      <section className="card stack">
        <h2>Envío por WhatsApp y correo</h2>
        {cfg.whatsappReal || cfg.correoReal ? (
          <p role="note">WhatsApp: {cfg.whatsappReal ? "real" : "simulado"} · Correo: {cfg.correoReal ? "real" : "simulado"}. La cola envía credenciales definitivas entre las 9 y las 21 h de Madrid. Las fichas de demostración siempre se simulan.</p>
        ) : (
          <p role="note">Ambos canales están en simulación. Solo la superadministración puede activar el envío real.</p>
        )}
        {hayHost && !abierto && <p role="alert" className="border-2 border-stone-900 bg-stone-100 p-2 text-sm font-medium">El enlace del mensaje lleva al formulario de la cédula, que ahora está cerrado. Ábralo en Documentos antes de enviar.</p>}
        <p className="text-sm">Pendientes con contacto: {e.conTelefono - e.whatsapp} por WhatsApp · {e.conCorreo - e.correo} por correo.</p>
        <EnvioLote personas={personas} whatsapp={e.conTelefono > e.whatsapp} correo={e.conCorreo > e.correo} />
      </section>
      <p className="text-sm">Comprobar la lectura del QR con un móvil antes de imprimir todas. En modo prueba las credenciales llevan la marca «PRUEBA».</p>
    </main>
  );
}

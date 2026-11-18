import { ZONAS, ZONA_NOMBRE } from "@/domain/juntas";
import { requireAdmin } from "@/server/guard";
import { resumenCredenciales } from "@/server/credenciales";
import { EnvioLote } from "@/components/envios-credenciales";
import { resumenEnvios } from "@/server/envios";
import { leerConfigEnvios } from "@/server/envios-config";
import { formularioAbierto } from "@/server/documentos";

const campo = "rounded border border-slate-400 px-2 py-2 text-base";

export default async function Credenciales() {
  await requireAdmin();
  const [r, e, cfg, abierto] = await Promise.all([resumenCredenciales(), resumenEnvios(), leerConfigEnvios(), formularioAbierto()]);
  const hayHost = !!process.env.HOST_MADRID?.trim();
  return (
    <main className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Credenciales</h1>
      {r.activos === 0 && <p>Cargue el Excel de MJRV para empezar.</p>}
      <p>{r.activos} fichas activas · {r.preparadas} preparadas · {r.pendientes} pendientes.</p>
      {r.sinRotulo > 0 && <p role="alert" className="rounded bg-amber-100 p-2 font-medium text-amber-900">Falta el rótulo de credencial de {r.sinRotulo} personas. No se imprimirán hasta tenerlo.</p>}
      <form method="get" action="/admin/credenciales/pdf" target="_blank" className="space-y-3 rounded border p-3">
        <label className="block text-sm font-medium">Quién
          <select name="alcance" className={`${campo} mt-1 block w-full`}>
            <option value="todas">Todas las fichas activas</option>
            <option value="sin_generar">Las que aún no tienen credencial preparada</option>
            <option value="junta">Una junta (escriba abajo, por ejemplo H12)</option>
            <option value="zona">Una zona (escriba abajo el color)</option>
          </select>
        </label>
        <label className="block text-sm font-medium">Junta o zona
          <input name="valor" list="zonas" placeholder="H12 o amarillo" className={`${campo} mt-1 block w-full`} />
          <datalist id="zonas">{ZONAS.map((z) => <option key={z} value={z}>{ZONA_NOMBRE[z]}</option>)}</datalist>
        </label>
        <div className="flex flex-wrap gap-3">
          <button name="formato" value="a4" className="rounded bg-blue-700 px-4 py-3 font-semibold text-white">Hoja A4 (10 por hoja)</button>
          <button name="formato" value="individual" className="rounded border border-slate-500 px-4 py-3 font-semibold">PDF individual (una por página)</button>
        </div>
      </form>
      <section className="space-y-2 rounded border p-3">
        <h2 className="text-lg font-semibold">Envío por WhatsApp y correo</h2>
        {cfg.whatsappReal || cfg.correoReal ? (
          <p role="note" className="rounded bg-red-100 p-2 text-sm font-medium text-red-900">Envío REAL encendido ({[cfg.whatsappReal && "WhatsApp", cfg.correoReal && "correo"].filter(Boolean).join(" y ")}): los mensajes a fichas reales quedan en cola y salen poco a poco, de 9 a 21 h. Las fichas de demostración siguen siendo simuladas.</p>
        ) : (
          <p role="note" className="rounded bg-amber-100 p-2 text-sm font-medium text-amber-900">Envío SIMULADO: queda registrado pero no sale ningún mensaje. Solo la superadministración puede encender el envío real.</p>
        )}
        {hayHost && !abierto && <p role="alert" className="rounded bg-amber-100 p-2 text-sm font-medium text-amber-900">El enlace del mensaje lleva al formulario de la cédula, que ahora está cerrado. Ábralo en Documentos antes de enviar.</p>}
        <p className="text-sm">Con teléfono: {e.conTelefono} (enviadas o en cola: {e.whatsapp}). Con correo: {e.conCorreo} (enviadas o en cola: {e.correo}). No se repite un envío ya hecho.</p>
        <div className="flex flex-wrap gap-3">
          <EnvioLote canal="whatsapp" titulo="Enviar por WhatsApp a quienes falten" pendientes={e.conTelefono - e.whatsapp} />
          <EnvioLote canal="correo" titulo="Enviar por correo a quienes falten" pendientes={e.conCorreo - e.correo} />
        </div>
      </section>
      <p className="text-sm">Comprobar la lectura del QR con un móvil antes de imprimir todas. En modo prueba las credenciales llevan la marca «PRUEBA».</p>
    </main>
  );
}

import { FormInterruptor, FormReanudar, FormRemitente } from "@/components/superadmin-formularios";
import { LineaWhatsAppPanel } from "@/components/linea-whatsapp";
import { clientesPorDefecto, estadoCola, impedimentos, leerConfigEnvios, remitenteEfectivo } from "@/server/envios-config";
import { requireSuperadmin } from "@/server/guard";
import { estadoLinea } from "@/server/whatsapp-linea";

export const dynamic = "force-dynamic";

const hora = (t: string | null) => (t ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" }).format(new Date(t)) : "—");

export default async function Envios() {
  const sesion = await requireSuperadmin();
  const clientes = clientesPorDefecto();
  const [linea, cfg, cola, faltaW, faltaC] = await Promise.all([
    estadoLinea(sesion, { cliente: clientes.whatsapp }), leerConfigEnvios(), estadoCola(), impedimentos("whatsapp", clientes), impedimentos("correo", clientes),
  ]);
  const rem = remitenteEfectivo(cfg);
  const canales = [
    { id: "whatsapp" as const, titulo: "Envío real por WhatsApp", encendido: cfg.whatsappReal, falta: faltaW },
    { id: "correo" as const, titulo: "Envío real por correo", encendido: cfg.correoReal, falta: faltaC },
  ];
  return (
    <main className="mx-auto max-w-3xl stack-lg">
      <h1>Configuración de envíos</h1>
      <p>Active cada canal cuando esté listo para enviar. Los canales apagados funcionan en simulación.</p>

      <section id="whatsapp" className="card stack">
        <h2>WhatsApp · Evolution API</h2>
        <LineaWhatsAppPanel inicial={linea} rutaEstado="/api/superadmin/whatsapp/estado" />
      </section>

      <section className="card stack">
        <h2>Correo · Brevo</h2>
        {faltaC.length === 0
          ? <p role="status">Remitente verificado en Brevo.</p>
          : <ul className="list-disc pl-5 text-sm text-amber-900">{faltaC.map((f) => <li key={f}>{f}</li>)}</ul>}
        <FormRemitente direccion={rem.direccion} nombre={rem.nombre} />
      </section>

      {canales.map((c) => (
        <section key={c.id} className="card stack">
          <h2 className="text-lg font-semibold">{c.titulo}: {c.encendido ? "ENCENDIDO" : "apagado"}</h2>
          {c.id === "whatsapp" && c.falta.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{c.falta.map((f) => <li key={f}>{f}</li>)}</ul>}
          <FormInterruptor canal={c.id} encendido={c.encendido} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-600">En cola</dt><dd className="font-semibold">{cola[c.id].enCola}</dd></div>
            <div><dt className="text-slate-600">Enviados hoy</dt><dd className="font-semibold">{cola[c.id].enviadosHoy} de {cola[c.id].tope}</dd></div>
            <div><dt className="text-slate-600">Fallidos</dt><dd className="font-semibold">{cola[c.id].fallidos}</dd></div>
            <div><dt className="text-slate-600">Próximo envío desde</dt><dd className="font-semibold">{hora(cola[c.id].proximoEn)}</dd></div>
            <div><dt className="text-slate-600">Horario (9 a 21 h)</dt><dd className="font-semibold">{cola[c.id].dentroDeHorario ? "dentro" : "fuera"}</dd></div>
          </dl>
          {cola[c.id].pausa && (
            <div role="alert" className="space-y-2 rounded bg-red-50 p-3">
              <p className="font-medium text-red-800">En pausa: {cola[c.id].pausa}</p>
              <FormReanudar canal={c.id} />
            </div>
          )}
        </section>
      ))}
    </main>
  );
}

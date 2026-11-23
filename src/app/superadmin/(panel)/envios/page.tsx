import { FormActivarBandejaWhatsApp, FormInterruptor, FormReanudar, FormRemitente } from "@/components/superadmin-formularios";
import { LineaWhatsAppPanel } from "@/components/linea-whatsapp";
import { clientesPorDefecto, estadoCola, impedimentos, leerConfigEnvios, remitenteEfectivo } from "@/server/envios-config";
import { requireSuperadmin } from "@/server/guard";
import { estadoLinea } from "@/server/whatsapp-linea";

export const dynamic = "force-dynamic";

const hora = (t: string | null) => (t ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" }).format(new Date(t)) : "—");

export default async function Envios() {
  const sesion = await requireSuperadmin();
  const clientes = clientesPorDefecto();
  const [linea1, linea2, cfg, cola, faltaW, faltaW2, faltaC] = await Promise.all([
    estadoLinea(sesion, { cliente: clientes.whatsapp }), estadoLinea(sesion, { linea: 2, cliente: clientes.whatsapp2 }),
    leerConfigEnvios(), estadoCola(), impedimentos("whatsapp", clientes), impedimentos("whatsapp", clientes, 2), impedimentos("correo", clientes),
  ]);
  const rem = remitenteEfectivo(cfg);
  const canales = [
    { id: "whatsapp", titulo: "WhatsApp · Línea 1", canal: "whatsapp", numero: 1, linea: linea1, encendido: cfg.whatsappReal, falta: faltaW },
    { id: "whatsapp2", titulo: "WhatsApp · Línea 2", canal: "whatsapp", numero: 2, linea: linea2, encendido: cfg.whatsappReal2, falta: faltaW2 },
    { id: "correo", titulo: "Correo · Brevo", canal: "correo", numero: undefined, linea: null, encendido: cfg.correoReal, falta: faltaC },
  ] as const;
  return (
    <main className="mx-auto max-w-3xl stack-lg">
      <h1>Configuración de envíos</h1>
      <p>Active cada línea de WhatsApp y el correo cuando estén listos para enviar.</p>

      {canales.map((c) => (
        <section key={c.id} id={c.id} className="card stack">
          <h2>{c.titulo}</h2>
          {c.linea
            ? <LineaWhatsAppPanel inicial={c.linea} numeroLinea={c.numero} />
            : <FormRemitente direccion={rem.direccion} nombre={rem.nombre} responderA={cfg.correoReplyTo ?? ""} />}
          {c.numero && c.linea?.estado === "vinculada" && !c.linea.simulada && <FormActivarBandejaWhatsApp linea={c.numero} />}
          {c.falta.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{c.falta.map((f) => <li key={f}>{f}</li>)}</ul>}
          {!c.linea && c.falta.length === 0 && <p role="status">Remitente verificado en Brevo.</p>}
          <h3 className="text-base font-semibold">Envío real {c.encendido ? "encendido" : "apagado"}</h3>
          <FormInterruptor canal={c.canal} linea={c.numero} encendido={c.encendido} />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-600">En cola</dt><dd className="font-semibold">{cola[c.id].enCola}</dd></div>
            <div><dt className="text-slate-600">Enviados hoy</dt><dd className="font-semibold">{cola[c.id].enviadosHoy}</dd></div>
            <div><dt className="text-slate-600">Fallos de envío</dt><dd className="font-semibold">{cola[c.id].fallidos}</dd></div>
            {c.linea && <div><dt className="text-slate-600">Próximo envío desde</dt><dd className="font-semibold">{hora(cola[c.id].proximoEn)}</dd></div>}
          </dl>
          {cola[c.id].pausa && (
            <div role="alert" className="space-y-2 rounded bg-red-50 p-3">
              <p className="font-medium text-red-800">En pausa: {cola[c.id].pausa}</p>
              <FormReanudar canal={c.canal} linea={c.numero} />
            </div>
          )}
        </section>
      ))}
    </main>
  );
}

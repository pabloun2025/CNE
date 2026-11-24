import { SOLO_CONSUL } from "@/domain/roles";
import { rotuloPublico } from "@/domain/juntas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonesEnvio } from "@/components/envios-credenciales";
import { leerConfigEnvios } from "@/server/envios-config";
import { enviosDe } from "@/server/envios";
import { TEXTO_ENTREGA } from "@/server/envios-estado";
import { BorrarMjrv } from "@/components/borrar-mjrv";
import { FormMjrv } from "@/components/form-mjrv";
import { requireAdmin } from "@/server/guard";
import { obtenerFicha } from "@/server/mjrv";
import { bajaMjrvAccion } from "@/server/mjrv-actions";

const hora = (t: string | null) => (t ? new Date(t).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "—");

export default async function FichaMjrv({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ roles: SOLO_CONSUL });
  const id = Number((await params).id);
  const m = Number.isInteger(id) ? await obtenerFicha(id) : null;
  if (!m) notFound();
  const [envios, cfg] = await Promise.all([enviosDe(m.id), leerConfigEnvios()]);
  const tieneCredencial = m.activo && !m.incorporado_en;
  return (
    <main className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/mjrv" className="text-sm underline">← Volver a la lista</Link>
        <h1 className="text-xl font-semibold">{m.apellidos}, {m.nombres}{m.es_prueba ? " (PRUEBA)" : ""}</h1>
        {m.incorporado_en && <p className="mt-1 rounded bg-blue-100 p-2 font-medium text-blue-900">Incorporada desde votantes{m.incorporado_por ? ` por ${m.incorporado_por}` : ""} el {hora(m.incorporado_en)}. Está presente sin lectura de puerta y no lleva credencial.</p>}
        {!m.activo && <p className="mt-1 rounded bg-red-100 p-2 font-medium text-red-800">De baja{m.baja_motivo ? `: ${m.baja_motivo}` : ""}. La puerta responde «bloqueado».</p>}
      </div>

      <section className="grid gap-1 text-sm sm:grid-cols-2">
        <p><strong>Número registrado:</strong> {m.cedula}</p>
        <p><strong>Cargo original:</strong> {m.cargo_original} (rol: {m.rol})</p>
        <p><strong>Junta de origen:</strong> {m.origen}</p>
        <p><strong>Junta vigente:</strong> {m.vigente}{m.vigente !== m.origen ? " (trasladado)" : ""}</p>
        {tieneCredencial && <p><strong>Rótulo de credencial:</strong> {rotuloPublico(m.rotulo_credencial, m.origen)}</p>}
        <p><strong>Credencial preparada:</strong> {hora(m.credencial_generada_en)}</p>
        <p><strong>Contacto:</strong> {[m.correo, m.telefono_e164].filter(Boolean).join(" · ") || "sin datos"}</p>
        <p><strong>Llegada:</strong> {m.incorporado_en ? `${hora(m.incorporado_en)} (incorporada)` : m.ingreso_en ? hora(m.ingreso_en) : "no registrada"}</p>
        <p><strong>Documento:</strong> {m.pasaporte ? "página de datos del pasaporte guardada" : m.anverso && m.reverso ? "ambas caras de la cédula guardadas" : m.anverso ? "falta el reverso de la cédula" : m.reverso ? "falta el anverso de la cédula" : "sin fotos"}</p>
        <p><strong>Actas generadas:</strong> {m.actas}</p>
        <p className="sm:col-span-2"><strong>Pago:</strong> {m.pago ? `Pagado el ${hora(m.pago.en)} por ${m.pago.operador}: ${m.pago.importe_eur ? `${m.pago.importe_eur} EUR` : "importe EUR no registrado"}` : "sin pago confirmado"}</p>
      </section>

      {(m.anverso || m.reverso || m.pasaporte) && (
        <section>
          <h2 className="font-semibold">Fotos del documento</h2>
          <div className="mt-1 flex flex-wrap gap-3">
            {(["anverso", "reverso", "pasaporte"] as const).filter((l) => m[l]).map((l) => (
              <a key={l} href={`/api/admin/documentos/${m.id}/${l}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/documentos/${m.id}/${l}`} alt={l === "pasaporte" ? "Página de datos del pasaporte" : `Cédula · ${l}`} width={160} className="rounded border" />
              </a>
            ))}
          </div>
        </section>
      )}
      {tieneCredencial && <p><a className="underline" href={`/admin/credenciales/pdf?formato=individual&ids=${m.id}`}>Descargar credencial (PDF)</a></p>}

      {(tieneCredencial || envios.length > 0) && <section className="space-y-2">
        <h2 className="font-semibold">Envío de la credencial</h2>
        {tieneCredencial && <>
          <p role="note" className="text-sm font-medium text-amber-900">Los canales activos envían las fichas reales desde la cola. Los envíos simulados se indican en el historial.</p>
          <BotonesEnvio id={m.id} tieneTelefono={!!m.telefono_e164} tieneCorreo={!!m.correo} numeros={[cfg.whatsappNumero, cfg.whatsappNumero2]} />
        </>}
        {envios.length > 0 && (
          <ul className="text-sm">{envios.map((x) => <li key={x.id}>{hora(x.creado_en)} · {x.canal === "whatsapp" ? `WhatsApp · Línea ${x.linea_whatsapp}` : "Correo"}{x.whatsapp_rectificacion ? " · Aviso de rectificación" : ""} · {TEXTO_ENTREGA[x.brevo_estado ?? x.estado]}{x.brevo_evento_en && ` (${hora(x.brevo_evento_en)})`}{x.simulado ? " (simulado)" : ""}{x.error && !x.brevo_estado ? ` · ${x.error}` : ""}</li>)}</ul>
        )}
      </section>}

      <section>
        <h2 className="font-semibold">Movimientos</h2>
        {m.movimientos.length === 0 ? <p className="text-sm">Ninguno.</p> : (
          <ul className="text-sm">{m.movimientos.map((x, i) => <li key={i}>{hora(x.creado_en)} · {x.origen} → {x.destino} · {x.decision}{x.manual ? " (manual)" : ""} · {x.actor_nombre}</li>)}</ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Editar</h2>
        <FormMjrv id={m.id} inicial={{ cedula: m.cedula, apellidos: m.apellidos, nombres: m.nombres, cargo: m.cargo_original, junta: m.origen, correo: m.correo ?? "", telefono: m.telefono_e164 ?? "" }} />
      </section>

      <section>
        <form action={bajaMjrvAccion} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="baja" value={m.activo ? "1" : "0"} />
          {m.activo && <label className="text-sm font-medium">Motivo de la baja<input name="motivo" className="mt-1 block rounded border border-slate-400 px-3 py-2" /></label>}
          <button className="rounded border border-slate-500 px-4 py-3 font-semibold">{m.activo ? "Dar de baja" : "Reactivar"}</button>
        </form>
        <p className="mt-1 text-sm">La baja no borra el historial.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Borrar</h2>
        <p className="text-sm">Borrar quita la ficha. Si ya se pagó o la junta quedó constituida con esta persona, no se borra.</p>
        <BorrarMjrv id={m.id} />
      </section>
    </main>
  );
}

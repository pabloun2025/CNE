import { FormMedidasCredencial } from "@/components/form-medidas-credencial";
import { FormParametrosPago } from "@/components/form-parametros-pago";
import { CUPO_RECIBOS, importeReciboEUR, RECIBOS_IMPORTE_USD, RECIBOS_TIPO_CAMBIO, RECIBOS_TRAMO_INICIAL } from "@/domain/recibos";
import { medidasCredencial } from "@/server/credencial-config";
import { requireSuperadmin } from "@/server/guard";
import { leerParametros } from "@/server/pago";
import { urlBase } from "@/server/url";

export default async function ConfiguracionMadrid() {
  await requireSuperadmin();
  const [parametros, medidas, base] = await Promise.all([leerParametros(), medidasCredencial(), urlBase()]);
  const enlace = `${base}/d`;

  return (
    <div className="mx-auto max-w-3xl stack-lg">
      <h1>Configuración de Madrid</h1>
      <section id="pagos" className="card stack">
        <h2>Comprobantes de pago</h2>
        <p>El valor de referencia es {RECIBOS_IMPORTE_USD.replace(".", ",")} USD y el tipo de cambio es {RECIBOS_TIPO_CAMBIO.replace(".", ",")}. Los primeros {RECIBOS_TRAMO_INICIAL} recibos son de {importeReciboEUR(1).replace(".", ",")} € y los siguientes {CUPO_RECIBOS - RECIBOS_TRAMO_INICIAL} son de {importeReciboEUR(CUPO_RECIBOS).replace(".", ",")} €.</p>
        <FormParametrosPago nombre={parametros.pagador_nombre ?? ""} cargo={parametros.pagador_cargo ?? ""} />
      </section>
      <section id="medidas-credencial" className="card stack">
        <h2>Medidas de la credencial</h2>
        <FormMedidasCredencial medidas={medidas} />
      </section>
      <section id="documentos" className="card stack">
        <h2>Formulario público de cédula o pasaporte</h2>
        <p>Disponible en <a className="underline break-all" href={enlace} target="_blank" rel="noreferrer">{enlace}</a></p>
        <p><a className="button-like secondary" target="_blank" rel="noreferrer" href="/admin/documentos/cartel">Abrir guía A4 de documentos y pago</a></p>
      </section>
    </div>
  );
}

import { FormMedidasCredencial } from "@/components/form-medidas-credencial";
import { FormParametrosPago } from "@/components/form-parametros-pago";
import { CUPO_RECIBOS, importeReciboEUR, RECIBOS_IMPORTE_USD, RECIBOS_TIPO_CAMBIO, RECIBOS_TRAMO_INICIAL } from "@/domain/recibos";
import { medidasCredencial } from "@/server/credencial-config";
import { formularioAbierto } from "@/server/documentos";
import { fijarFormularioAccion } from "@/server/documentos-actions";
import { requireSuperadmin } from "@/server/guard";
import { leerParametros } from "@/server/pago";

export default async function ConfiguracionMadrid() {
  await requireSuperadmin();
  const [parametros, medidas, abierto] = await Promise.all([leerParametros(), medidasCredencial(), formularioAbierto()]);

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
        <h2>Formulario público de cédula</h2>
        <p>El formulario del QR está <strong>{abierto ? "ABIERTO" : "CERRADO"}</strong>.</p>
        <form action={fijarFormularioAccion}>
          <input type="hidden" name="abierto" value={abierto ? "0" : "1"} />
          <button className={abierto ? "secondary" : undefined}>{abierto ? "Cerrar formulario" : "Abrir formulario"}</button>
        </form>
        <p><a className="font-semibold underline" target="_blank" rel="noreferrer" href="/admin/documentos/cartel">Descargar cartel A4 con el QR</a></p>
        <p className="text-sm">Al cerrar el formulario se desactivan las consultas y la carga de fotos desde el QR. El puesto de documentación sigue disponible.</p>
      </section>
    </div>
  );
}

import * as XLSX from "xlsx";
import { estadoEntregasCredenciales, ESTADOS_INCIDENCIA, TEXTO_ENTREGA } from "./envios-estado";

const hora = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" });
const columnas = ["Junta", "Nombre", "Cédula", "Canal", "Línea", "Destino", "Estado", "Fecha (Madrid)", "Motivo"];

export async function informeEnviosExcel(): Promise<Buffer> {
  const fichas = await estadoEntregasCredenciales();
  const grupos: Record<"Entregados" | "Rechazos y fallos" | "Sin confirmar", (string | number)[][]> = {
    Entregados: [], "Rechazos y fallos": [], "Sin confirmar": [],
  };

  for (const ficha of fichas) {
    const { correo, whatsapp } = ficha;
    for (const [canal, estado, linea] of [["Correo", correo, null], ["WhatsApp", whatsapp, whatsapp.linea]] as const) {
      const grupo = estado.estado === "entregado" ? "Entregados"
        : ESTADOS_INCIDENCIA.includes(estado.estado) ? "Rechazos y fallos" : "Sin confirmar";
      grupos[grupo].push([
        ficha.junta, ficha.nombre, ficha.cedula, canal, linea ?? "", estado.destino ?? "",
        TEXTO_ENTREGA[estado.estado], estado.fecha ? hora.format(new Date(estado.fecha)) : "", estado.error ?? "",
      ]);
    }
  }

  const libro = XLSX.utils.book_new();
  const resumen = XLSX.utils.aoa_to_sheet([
    ["Envíos de credenciales · Madrid"],
    ["Fecha de consulta (Madrid)", hora.format(new Date())],
    ["Ficha activa y canal", "Se muestra el último intento real. Los simulados quedan excluidos."],
    ["Entregados", "Entrega confirmada por un acuse de Brevo o WhatsApp."],
    ["Rechazos y fallos", "Incluye rebotes, bloqueos y fallos técnicos. Consulte Estado y Motivo."],
    ["Sin confirmar", "Incluye aceptados por el proveedor, en cola, diferidos y sin envío o contacto."],
    ["WhatsApp", "La aceptación de Evolution solo pasa a Entregados si llega un acuse de entrega o lectura."],
    [],
    ["Resultado", "Correo", "WhatsApp"],
    ...Object.entries(grupos).map(([nombre, filas]) => [
      nombre, filas.filter((f) => f[3] === "Correo").length, filas.filter((f) => f[3] === "WhatsApp").length,
    ]),
  ]);
  resumen["!cols"] = [{ wch: 36 }, { wch: 86 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(libro, resumen, "Resumen");
  for (const [nombre, filas] of Object.entries(grupos)) {
    const hoja = XLSX.utils.aoa_to_sheet([columnas, ...filas]);
    hoja["!cols"] = [9, 36, 16, 13, 8, 40, 30, 23, 65].map((wch) => ({ wch }));
    hoja["!autofilter"] = { ref: hoja["!ref"]! };
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  }
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

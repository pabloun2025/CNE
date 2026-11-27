import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { A4, MM } from "../../domain/credencial-layout";
import { FUNCION_NOMBRE, type Funcion } from "../../domain/estaciones";

// Guías rápidas A4 de una página para el personal. Los QR de puesto salen del enlace de estación activo.
export type EnlaceGuia = { etiqueta: string; token: string };
export type ContextoGuias = { base: string; enlaces: Partial<Record<Funcion, EnlaceGuia>> };

type Qr = { titulo: string; detalle?: string; url: string | null; funcion?: Funcion };
type Extra =
  | { tipo: "nota"; texto: string }
  | { tipo: "tarjetas"; items: { t: string; d: string }[] }
  | { tipo: "estados"; items: { t: string; d: string; ok: boolean }[] };
type Guia = {
  n: number; archivo: string; titulo: string; subtitulo: string;
  chips?: { t: string; d: string }[];
  caja?: { t: string; d: (c: ContextoGuias) => string };
  pasos: { t: string; d: string; extra?: Extra }[];
  recuadro?: { t: string; d: string };
  qrs: (c: ContextoGuias) => Qr[];
};

export const SIN_ENLACE = "Sin enlace activo: pida un enlace a Superadministración.";
const dominio = (base: string) => base.replace(/^https?:\/\//, "");
const estacion = (funcion: Funcion, c: ContextoGuias, titulo?: string): Qr => ({ funcion, titulo: titulo ?? FUNCION_NOMBRE[funcion], url: c.enlaces[funcion] ? `${c.base}/e/${c.enlaces[funcion]!.token}` : null, detalle: c.enlaces[funcion]?.etiqueta });
const admin = (c: ContextoGuias, ruta: string, titulo: string): Qr => ({ titulo, detalle: ruta, url: `${c.base}${ruta}` });

export const GUIAS: Guia[] = [
  {
    n: 1, archivo: "01-mjrv-y-credenciales", titulo: "Alta de MJRV y credenciales",
    subtitulo: "Para quien actualiza el padrón y envía las credenciales con una cuenta de cónsul.",
    pasos: [
      { t: "Busque la cédula en MJRV", d: "Abra MJRV y busque el número de cédula. Si la persona ya aparece, abra su ficha para corregir los datos que hagan falta." },
      { t: "Cree la ficha", d: "Pulse Crear nueva ficha. Escriba cédula, apellidos y nombres. Elija el cargo, la serie y el número de junta. Añada el correo y el móvil si los tiene. Pulse Crear ficha.", extra: { tipo: "nota", texto: "Junta: M = masculino · F = femenino" } },
      { t: "Marque y envíe", d: "En Credenciales, busque y marque una o varias fichas. Revise cuántas seleccionó. Elija Correo, WhatsApp o ambos. Para WhatsApp, seleccione la línea remitente. Pulse Enviar credenciales." },
      { t: "Compruebe la entrega", d: "Abra Seguimiento y busque a la persona. Entregado confirma la entrega. Si dice En cola, espere. Si hay un fallo, revise el contacto y acuerde el reenvío con el cónsul." },
    ],
    recuadro: { t: "Antes de entregar una credencial", d: "Compruebe letra y número. Use Imprimir planchas A4 para imprimir en papel. Avise al cónsul si ve una diferencia." },
    qrs: (c) => [admin(c, "/admin/mjrv", "Abrir MJRV"), admin(c, "/admin/credenciales", "Abrir Credenciales")],
  },
  {
    n: 2, archivo: "02-flujo-finanzas", titulo: "Flujo de Finanzas",
    subtitulo: "Siga el aviso de Ingreso para orientar a cada persona al siguiente puesto.",
    chips: [{ t: "Ingreso", d: "1–2 personas" }, { t: "Revisión", d: "2 personas" }, { t: "Impresión", d: "2 personas" }, { t: "Caja", d: "1 persona" }],
    pasos: [
      { t: "Identifique a la persona en Ingreso", d: "Escanee la credencial o escriba la cédula. CNE indica a qué puesto debe pasar. Si el equipo itinerante ya validó las fotos, indique que pase directo a Impresión." },
      { t: "Compruebe las fotos en Revisión", d: "Abra la ficha en Revisión en Finanzas. Valide las fotos legibles o indique que necesitan repetirse. Envíe a la persona a Impresión después de validar." },
      { t: "Imprima y entregue el recibo", d: "Abra la ficha en Impresión, emita el recibo e imprímalo. Cuando tenga el papel, pulse Papel listo · Enviar a Caja y entregue el recibo." },
      { t: "Recoja la firma, pague y confirme en Caja", d: "Compruebe la persona y el importe. Recoja la firma y entregue el efectivo. Pulse Confirmar entrega solo después del desembolso." },
    ],
    recuadro: { t: "Revisión itinerante y contingencia", d: "El equipo itinerante usa Validación de documentos. Para imprimir en lote o preparar recibos sin anexo, abra Recibos en Finanzas. Caja necesita las fotos validadas y el recibo vigente." },
    qrs: (c) => [estacion("finanzas", c), admin(c, "/admin/finanzas/documentos", "Revisión"), admin(c, "/admin/finanzas/pagar", "Impresión"), admin(c, "/admin/finanzas/caja", "Caja")],
  },
  {
    n: 3, archivo: "03-escaneo-puerta", titulo: "Escaneo en Puerta",
    subtitulo: "Su tarea es registrar la entrada y orientar a cada MJRV hacia el color de su junta.",
    pasos: [
      { t: "Abra su enlace de Puerta", d: "Escanee el QR de Puerta de esta guía. Pulse Activar cámara y permita el acceso cuando el móvil lo pida." },
      { t: "Coloque la credencial en el recuadro amarillo", d: "Si tiene QR, apunte al código del papel o de la pantalla. Si no hay QR, centre la credencial completa. Si aparece una ficha para revisar, confirme que corresponde a esa persona y pulse Confirmar ingreso." },
      { t: "Mire el resultado antes de seguir", d: "Con el OK verde, indique el número y la zona que aparecen. Si sale Ya usada o Ingreso no autorizado, pida al responsable de Puerta que revise el caso.", extra: { tipo: "estados", items: [{ t: "OK · Junta F1", d: "Rojo", ok: true }, { t: "Ingreso no autorizado", d: "Consulte al responsable", ok: false }] } },
      { t: "Si la cámara sigue sin leer, use el ingreso manual", d: "Pulse Ingreso manual por cédula, escriba el número y pulse Comprobar. Si hace falta, use Ingreso por nombre y escriba nombres y apellidos." },
    ],
    qrs: (c) => [estacion("puerta", c)],
  },
  {
    n: 4, archivo: "04-apoyo-documentos", titulo: "Apoyo para subir documentos",
    subtitulo: "Ayude a la persona a guardar las fotos antes de ir al punto de pago.",
    caja: { t: "En el teléfono de la persona", d: (c) => `Abra el QR o visite ${dominio(c.base)}/d. Escriba su número de cédula, pulse Continuar y confirme con Sí, soy yo.` },
    pasos: [
      { t: "Elija el documento que trae", d: "El número de cédula identifica la ficha, aunque la persona use su pasaporte para la foto.", extra: { tipo: "tarjetas", items: [{ t: "Cédula", d: "Dos fotos. Tome la parte de delante y la parte de atrás." }, { t: "Pasaporte", d: "Una foto. Tome la página de datos donde sale su foto." }] } },
      { t: "Tome la foto y guárdela", d: "Busque buena luz. Centre el documento entero y pulse Tomar foto. Si se lee bien, pulse Usar esta foto. Con cédula, repita en la otra cara." },
      { t: "Compruebe que terminó", d: "En el formulario, espere a que diga Listo. Indique que lleve su credencial y su documento al punto de pago cuando termine su trabajo en la junta." },
    ],
    recuadro: { t: "Si necesita que el puesto tome las fotos", d: "Escanee el QR de Documentación de esta guía. Pulse Buscar con la cédula o escanee el QR de la credencial. Compruebe el nombre y guarde las fotos ahí." },
    qrs: (c) => [estacion("documentacion", c), { titulo: "Formulario de la persona", detalle: `${dominio(c.base)}/d`, url: `${c.base}/d` }],
  },
  {
    n: 5, archivo: "05-coordinacion-centro-de-mando", titulo: "Coordinación del recinto",
    subtitulo: "Use el Centro de mando para saber qué juntas necesitan personal y registrar los cambios.",
    chips: [{ t: "Ver faltantes", d: "Elija la zona" }, { t: "Cubrir el cargo", d: "Revise la propuesta" }, { t: "Confirmar", d: "Avise a la junta" }],
    pasos: [
      { t: "Abra el Centro de mando", d: "Entre con la cuenta de Coordinación. Si usa un enlace de Centro de mando, seleccione su operador e introduzca su PIN. Para ver todo el recinto, pulse Vista general de las 95 juntas." },
      { t: "Localice qué falta", d: "Elija la zona y, en Estado de la junta, seleccione Faltan miembros. Abra una junta para ver quién está presente y qué cargo falta." },
      { t: "Resuelva la suplencia", d: "Si el sistema ofrece un traslado, confirme que la persona está disponible y revise destino y cargo. Pulse Aceptar, Siguiente o No se puede, según lo que confirme en el recinto." },
      { t: "Comunique el cambio", d: "Diga a la persona a qué junta debe ir y avise al responsable de esa zona. Compruebe en el Centro de mando que quedó registrada la asignación." },
    ],
    recuadro: { t: "Si no hay suplentes disponibles", d: "Confirme con el cónsul si corresponde incorporar a un votante. Use Incorporar votante y revise la junta y el cargo antes de guardar." },
    qrs: (c) => [estacion("mando", c)],
  },
  {
    n: 6, archivo: "06-consul-responsable-de-turno", titulo: "Responsable de turno",
    subtitulo: "Prepare los puestos y resuelva las incidencias que el personal le derive.",
    pasos: [
      { t: "Abra y reparta los enlaces", d: "En Enlaces de estación, identifique Puerta, Documentación, Ingreso a Finanzas y Centro de mando. Use el icono Copiar enlace o el de WhatsApp y comparta cada enlace con la persona asignada." },
      { t: "Compruebe que cada puesto está listo", d: "Con el personal, abra los enlaces en los móviles correspondientes. Asigne Ingreso, Revisión, Impresión y Caja. Confirme quién coordina al equipo itinerante y quién hace el cierre. Si la pantalla muestra Modo prueba al empezar la jornada, avise a Superadministración." },
      { t: "Resuelva incidencias de ingreso o de ficha", d: "Pida el número de cédula y compruebe la ficha en MJRV. Si Puerta indica Ya usada o Ingreso no autorizado, revise el motivo antes de decidir cómo proceder. Derive las dudas sobre cargos o traslados a Coordinación." },
      { t: "Supervise el envío de credenciales", d: "Consulte Seguimiento para ver entregas y fallos. En Envíos de WhatsApp, compruebe la línea y su cola. Si está desvinculada o en pausa por un fallo, pida a Superadministración que la revise." },
    ],
    recuadro: { t: "Al terminar el turno", d: "Entregue al siguiente responsable los casos pendientes. Al final de la jornada, confirme con Caja y con quien prepara el informe qué incidencias quedan abiertas." },
    qrs: (c) => (["puerta", "documentacion", "finanzas", "mando"] as Funcion[]).map((f) => estacion(f, c)),
  },
  {
    n: 7, archivo: "07-cierre-de-finanzas", titulo: "Cierre de Finanzas",
    subtitulo: "Haga el cierre con la persona de Caja y comparta el resultado con el cónsul.",
    chips: [{ t: "Cuadrar Caja", d: "Pagos y recibos" }, { t: "Revisar pendientes", d: "Motivo y seguimiento" }, { t: "Guardar el cierre", d: "Informe y recibos" }],
    pasos: [
      { t: "Cuadre los pagos con Caja", d: "Abra Finanzas y compare Pagados y Total entregado EUR con el recuento del efectivo y los recibos firmados. Si falta un recibo, búsquelo en Recibos por número o cédula." },
      { t: "Revise quién quedó pendiente", d: "En el resumen de Finanzas, filtre por estado. Distinga los recibos preparados de los pagos confirmados. Anote a quién le falta el documento, la validación o el pago." },
      { t: "Descargue el informe", d: "Abra Informes y vaya a Cierre de finanzas. Marque las columnas que necesita. Pulse Descargar PDF para el archivo y Descargar Excel para revisar las cifras." },
      { t: "Entregue el cierre al cónsul", d: "Compruebe la hora de corte del informe. Guarde el informe, los recibos firmados y la lista de incidencias en el lugar de archivo indicado por el cónsul." },
    ],
    recuadro: { t: "Si el total de Caja no cuadra", d: "Anote la diferencia y localice los recibos correspondientes. Informe al cónsul. Confirme desembolsos en CNE solo después de verificar que el efectivo se entregó." },
    qrs: (c) => [admin(c, "/admin/finanzas", "Abrir Finanzas"), admin(c, "/admin/informes", "Abrir Informes")],
  },
];

// ───────────── Dibujo ─────────────
const AZUL = rgb(0.07, 0.2, 0.35), TEXTO = rgb(0.1, 0.1, 0.12), GRIS = rgb(0.38, 0.4, 0.44), FONDO = rgb(0.95, 0.96, 0.97), LINEA = rgb(0.78, 0.8, 0.84);
const AMARILLO = rgb(0.949, 0.718, 0.02), AZUL_BANDERA = rgb(0.039, 0.239, 0.561), ROJO = rgb(0.784, 0.063, 0.18);
const VERDE = rgb(0.13, 0.5, 0.25), VERDE_FONDO = rgb(0.9, 0.96, 0.92), ROJO_FONDO = rgb(0.99, 0.92, 0.92);
const W = A4.ancho * MM, H = A4.alto * MM, MARGEN = 40, ANCHO = W - 2 * MARGEN;
export const LADO_QR_MM = 36;
const LADO_QR = LADO_QR_MM * MM;

type Fuentes = { n: PDFFont; b: PDFFont };

function ajustar(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (actual && font.widthOfTextAtSize(prueba, size) > ancho) { lineas.push(actual); actual = palabra; } else actual = prueba;
    }
    lineas.push(actual);
  }
  return lineas;
}

async function dibujarGuia(pdf: PDFDocument, f: Fuentes, g: Guia, c: ContextoGuias, total: number): Promise<void> {
  const page: PDFPage = pdf.addPage([W, H]);
  const texto = (t: string, x: number, y: number, size: number, font = f.n, color = TEXTO) => page.drawText(t, { x, y, size, font, color });
  const parrafo = (t: string, x: number, y: number, size: number, ancho: number, font = f.n, color = TEXTO, interlinea = size * 1.32): number => {
    for (const l of ajustar(t, font, size, ancho)) { texto(l, x, y, size, font, color); y -= interlinea; }
    return y;
  };
  const alto = (t: string, size: number, ancho: number, font = f.n, interlinea = size * 1.32) => ajustar(t, font, size, ancho).length * interlinea;

  // Cabecera: franja tricolor en las proporciones de la bandera, marca y fecha.
  page.drawRectangle({ x: 0, y: H - 8, width: W / 2, height: 8, color: AMARILLO });
  page.drawRectangle({ x: W / 2, y: H - 8, width: W / 4, height: 8, color: AZUL_BANDERA });
  page.drawRectangle({ x: W * 0.75, y: H - 8, width: W / 4, height: 8, color: ROJO });
  texto("CNE 2026 / MADRID", MARGEN, H - 36, 11, f.b, AZUL);
  const fecha = `Guía ${g.n} de ${total}`;
  texto(fecha, W - MARGEN - f.n.widthOfTextAtSize(fecha, 10), H - 36, 10, f.n, GRIS);
  page.drawLine({ start: { x: MARGEN, y: H - 46 }, end: { x: W - MARGEN, y: H - 46 }, thickness: 0.8, color: LINEA });

  let y = H - 78;
  texto(g.titulo, MARGEN, y, 26, f.b, AZUL);
  y -= 20;
  y = parrafo(g.subtitulo, MARGEN, y, 12, ANCHO, f.n, GRIS) - 6;

  if (g.chips) {
    const w = (ANCHO - 12 * (g.chips.length - 1)) / g.chips.length;
    g.chips.forEach((ch, i) => {
      const x = MARGEN + i * (w + 12);
      page.drawRectangle({ x, y: y - 36, width: w, height: 36, color: FONDO, borderColor: LINEA, borderWidth: 0.7 });
      texto(ch.t, x + 10, y - 15, 11.5, f.b, AZUL);
      texto(ch.d, x + 10, y - 29, 9, f.n, GRIS);
    });
    y -= 62;
  }
  if (g.caja) {
    const cuerpo = g.caja.d(c), h = 30 + alto(cuerpo, 10.5, ANCHO - 28);
    page.drawRectangle({ x: MARGEN, y: y - h, width: ANCHO, height: h, color: FONDO, borderColor: LINEA, borderWidth: 0.7 });
    texto(g.caja.t, MARGEN + 14, y - 18, 11.5, f.b, AZUL);
    parrafo(cuerpo, MARGEN + 14, y - 33, 10.5, ANCHO - 28);
    y -= h + 26;
  }

  // Pasos numerados.
  for (const [i, p] of g.pasos.entries()) {
    const x = MARGEN + 34, ancho = ANCHO - 34;
    page.drawCircle({ x: MARGEN + 12, y: y - 5, size: 12, color: AZUL });
    texto(String(i + 1), MARGEN + 12 - f.b.widthOfTextAtSize(String(i + 1), 12) / 2, y - 9, 12, f.b, rgb(1, 1, 1));
    texto(p.t, x, y, 14, f.b);
    y = parrafo(p.d, x, y - 17, 11.5, ancho, f.n, TEXTO, 15.5) - 2;
    const e = p.extra;
    if (e?.tipo === "nota") {
      const h = 24;
      page.drawRectangle({ x, y: y - h + 4, width: ancho, height: h, color: FONDO, borderColor: LINEA, borderWidth: 0.7 });
      texto(e.texto, x + 10, y - 11, 10.5, f.b, AZUL);
      y -= h + 4;
    } else if (e?.tipo === "tarjetas") {
      const w = (ancho - 12) / 2, h = 44;
      e.items.forEach((t, k) => {
        const tx = x + k * (w + 12);
        page.drawRectangle({ x: tx, y: y - h + 4, width: w, height: h, color: FONDO, borderColor: LINEA, borderWidth: 0.7 });
        texto(t.t, tx + 10, y - 10, 11.5, f.b, AZUL);
        parrafo(t.d, tx + 10, y - 23, 9, w - 20, f.n, GRIS);
      });
      y -= h + 4;
    } else if (e?.tipo === "estados") {
      const w = (ancho - 12) / 2, h = 40;
      e.items.forEach((t, k) => {
        const tx = x + k * (w + 12);
        page.drawRectangle({ x: tx, y: y - h + 4, width: w, height: h, color: t.ok ? VERDE_FONDO : ROJO_FONDO, borderColor: t.ok ? VERDE : ROJO, borderWidth: 1 });
        texto(t.t, tx + 10, y - 12, 12, f.b, t.ok ? VERDE : ROJO);
        texto(t.d, tx + 10, y - 27, 10, f.n, TEXTO);
      });
      y -= h + 4;
    }
    y -= 16;
  }

  // Pie y recuadro final se colocan desde abajo; los QR ocupan el espacio entre los pasos y el recuadro.
  texto("Jornada electoral · 29 de noviembre de 2026", MARGEN, 30, 9.5, f.n, GRIS);
  page.drawLine({ start: { x: MARGEN, y: 44 }, end: { x: W - MARGEN, y: 44 }, thickness: 0.8, color: LINEA });
  const ry = 56;
  let rh = -10;
  if (g.recuadro) {
    rh = 22 + alto(g.recuadro.d, 10.5, ANCHO - 34);
    page.drawRectangle({ x: MARGEN, y: ry, width: ANCHO, height: rh, color: FONDO });
    page.drawRectangle({ x: MARGEN, y: ry, width: 5, height: rh, color: AMARILLO });
    texto(g.recuadro.t, MARGEN + 18, ry + rh - 17, 11.5, f.b, AZUL);
    parrafo(g.recuadro.d, MARGEN + 18, ry + rh - 32, 10.5, ANCHO - 34);
  }

  await dibujarQrs(pdf, page, f, g.qrs(c), { arriba: y, abajo: ry + rh + 10 });
}

async function dibujarQrs(pdf: PDFDocument, page: PDFPage, f: Fuentes, qrs: Qr[], { arriba, abajo }: { arriba: number; abajo: number }): Promise<void> {
  const n = qrs.length;
  const imagenes = new Map<string, PDFImage>();
  for (const q of qrs) if (q.url && !imagenes.has(q.url)) imagenes.set(q.url, await pdf.embedPng(await QRCode.toBuffer(q.url, { margin: 4, scale: 8, errorCorrectionLevel: "M" })));
  const horizontal = n <= 2, gap = 14;
  const colAncho = (ANCHO - gap * (n - 1)) / n;
  const anchoTexto = horizontal ? colAncho - LADO_QR - 14 : colAncho;
  const altoTexto = Math.max(...qrs.map((q) => alturaTexto(f, q, anchoTexto)));
  const conEstacion = qrs.some((q) => q.funcion && q.url);
  const conMando = qrs.some((q) => q.funcion === "mando" && q.url);
  const aviso = [
    conMando ? "Solo Centro de mando pide nombre y PIN." : "",
    conEstacion ? "Si se revoca el enlace, vuelva a descargar la guía." : "",
  ].filter(Boolean).join(" ");
  const altoQr = horizontal ? Math.max(LADO_QR, altoTexto) : LADO_QR + 8 + altoTexto;
  const altoBloque = altoQr + (aviso ? 24 : 0);
  if (altoBloque > arriba - abajo) throw new Error("La guía no cabe en una página.");
  const top = abajo + altoBloque + (arriba - abajo - altoBloque) / 2;

  qrs.forEach((q, i) => {
    const x0 = MARGEN + i * (colAncho + gap), l = LADO_QR;
    const qx = x0;
    const qy = top - l;
    if (q.url) page.drawImage(imagenes.get(q.url)!, { x: qx, y: qy, width: l, height: l });
    else {
      page.drawRectangle({ x: qx, y: qy, width: l, height: l, borderColor: ROJO, borderWidth: 1, borderDashArray: [4, 3], color: ROJO_FONDO });
      let yy = qy + l / 2 + 8;
      for (const t of ajustar(SIN_ENLACE, f.b, 9, l - 14)) { page.drawText(t, { x: qx + 7, y: yy, size: 9, font: f.b, color: ROJO }); yy -= 12; }
    }
    const tx = horizontal ? x0 + l + 14 : x0, tw = anchoTexto;
    let ty = horizontal ? top - 12 : qy - 14;
    const titulo = ajustar(q.titulo, f.b, 11, tw);
    for (const t of titulo) { page.drawText(t, { x: tx, y: ty, size: 11, font: f.b, color: AZUL }); ty -= 14; }
    if (q.detalle) for (const t of ajustar(q.detalle, f.n, 9, tw)) { page.drawText(t, { x: tx, y: ty, size: 9, font: f.n, color: GRIS }); ty -= 12; }
    if (n === 4 && i > 0) page.drawLine({ start: { x: x0 - 7, y: top - altoQr }, end: { x: x0 - 7, y: top }, thickness: 0.7, color: LINEA });
  });
  if (aviso) page.drawText(aviso, { x: MARGEN, y: top - altoQr - 16, size: 10, font: f.n, color: GRIS });
}

function alturaTexto(f: Fuentes, q: Qr, ancho: number): number {
  let h = ajustar(q.titulo, f.b, 11, ancho).length * 14;
  if (q.detalle) h += ajustar(q.detalle, f.n, 9, ancho).length * 12;
  return h + 4;
}

async function crear(numeros: number[], c: ContextoGuias): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setLanguage("es");
  pdf.setTitle(numeros.length === 1 ? `${GUIAS[numeros[0] - 1].titulo} | CNE Madrid` : "Guías rápidas | CNE Madrid");
  const f: Fuentes = { n: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold) };
  for (const n of numeros) await dibujarGuia(pdf, f, GUIAS[n - 1], c, GUIAS.length);
  return pdf.save();
}

export const guiaPdf = (n: number, c: ContextoGuias) => crear([n], c);
export const todasLasGuiasPdf = (c: ContextoGuias) => crear(GUIAS.map((g) => g.n), c);

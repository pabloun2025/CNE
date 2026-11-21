"use client";

import { useEffect, useRef, useState } from "react";

type Estado = "preparando" | "listo" | "visor";

export type PdfRecibo = { archivo: Blob; url: string; nombre: string };

export async function leerPdfRecibo(respuesta: Response): Promise<PdfRecibo> {
  if (!respuesta.ok) {
    const problema = await respuesta.json().catch(() => null) as { error?: string } | null;
    throw new Error(problema?.error ?? "No se pudo cargar el recibo.");
  }
  const archivo = await respuesta.blob();
  if (archivo.type !== "application/pdf" || !archivo.size) throw new Error("No se recibió el PDF del recibo.");
  const nombre = respuesta.headers.get("content-disposition")?.match(/filename="([^"]+\.pdf)"/i)?.[1] ?? "recibo-mjrv.pdf";
  return { archivo, nombre, url: URL.createObjectURL(archivo) };
}

const ESTILO = (horizontal: boolean) => `
  body { margin: 0; }
  @media screen {
    body { background: #e7eef9; padding: 12px; }
    canvas { display: block; width: 100%; max-width: 794px; height: auto; margin: 0 auto 12px; background: white; }
  }
  @page { size: A4 ${horizontal ? "landscape" : "portrait"}; margin: 0; }
  @media print {
    canvas { display: block; width: ${horizontal ? 297 : 210}mm; height: ${horizontal ? 210 : 297}mm; break-inside: avoid; }
    canvas + canvas { break-before: page; }
  }
`;

function imprimir(visor: HTMLIFrameElement | null) {
  const ventana = visor?.contentWindow;
  if (!ventana) throw new Error("El visor no está disponible.");
  ventana.focus();
  ventana.print();
}

export function VisorRecibo({ archivo, url, nombre }: PdfRecibo) {
  const visor = useRef<HTMLIFrameElement>(null);
  const [estado, setEstado] = useState<Estado>("preparando");

  useEffect(() => {
    const marco = visor.current;
    const doc = marco?.contentDocument;
    let activo = true;

    async function preparar() {
      if (!doc) throw new Error("El visor no está disponible.");
      const [pdfjs, datos] = await Promise.all([import("pdfjs-dist"), archivo.arrayBuffer()]);
      if (!activo) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const tarea = pdfjs.getDocument({ data: new Uint8Array(datos), useWasm: false, useSystemFonts: true });
      try {
        const pdf = await tarea.promise;
        const estilo = doc.createElement("style");
        const primera = (await pdf.getPage(1)).getViewport({ scale: 1 });
        estilo.textContent = ESTILO(primera.width > primera.height);
        doc.head.append(estilo);
        doc.title = nombre;
        doc.documentElement.lang = "es";
        for (let numero = 1; activo && numero <= pdf.numPages; numero++) {
          const pagina = await pdf.getPage(numero);
          const canvas = doc.createElement("canvas");
          // Rasteriza a 300 ppp para la impresión, con el tamaño A4 del PDF.
          const viewport = pagina.getViewport({ scale: 300 / 72 });
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          await pagina.render({ canvas, viewport, intent: "print", background: "#fff" }).promise;
          if (activo) doc.body.append(canvas);
        }
      } finally {
        await tarea.destroy();
      }
      if (!activo) return;
      setEstado("listo");
    }

    void preparar().catch(() => { if (activo) setEstado("visor"); });
    return () => { activo = false; };
  }, [archivo, nombre]);

  useEffect(() => {
    if (estado !== "listo") return;
    const intento = requestAnimationFrame(() => {
      try { imprimir(visor.current); }
      catch { setEstado("visor"); }
    });
    return () => cancelAnimationFrame(intento);
  }, [estado]);

  const claseVisor = "h-[70vh] min-h-64 w-full rounded border";
  return (
    <section className="stack min-w-0 rounded border p-3" aria-label="Recibo de pago MJRV">
      <div className="flex flex-wrap items-center gap-2">
        {estado === "visor" ? (
          <a className="button-like" href={url} target="_blank" rel="noopener">Imprimir recibo</a>
        ) : (
          <button type="button" className="button-like" disabled={estado !== "listo"} onClick={() => {
            try { imprimir(visor.current); }
            catch { setEstado("visor"); }
          }}>Imprimir recibo</button>
        )}
        <a className="button-like secondary" href={url} target="_blank" rel="noopener">Abrir PDF</a>
        <a className="button-like secondary" href={url} download={nombre}>Descargar PDF</a>
      </div>
      <p className="hint" role="status">
        {estado === "preparando" ? "Preparando la vista previa…" :
          estado === "visor" ? "Pulse «Imprimir recibo» y use el botón de impresión del visor PDF." :
            "Si no aparece el cuadro de impresión, pulse «Imprimir recibo» o use el visor de «Abrir PDF»."}
      </p>
      <iframe ref={visor} hidden={estado !== "listo"} title="Vista previa del recibo oficial en PDF" className={claseVisor} />
      {estado === "visor" && <iframe src={url} title="Vista previa del PDF en el navegador" className={claseVisor} />}
    </section>
  );
}

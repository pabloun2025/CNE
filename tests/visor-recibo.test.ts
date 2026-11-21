import { describe, expect, it } from "vitest";
import { leerPdfRecibo } from "@/components/visor-recibo";

describe("archivo del visor de recibos", () => {
  it("conserva los bytes y el nombre del PDF que entregó el servidor", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7\n% Prueba ficticia");
    const resultado = await leerPdfRecibo(new Response(bytes, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'inline; filename="recibo-PRUEBA-2026-001.pdf"',
      },
    }));
    try {
      expect(resultado.nombre).toBe("recibo-PRUEBA-2026-001.pdf");
      expect(new Uint8Array(await (await fetch(resultado.url)).arrayBuffer())).toEqual(bytes);
    } finally {
      URL.revokeObjectURL(resultado.url);
    }
  });

  it("presenta el error del servidor sin preparar un documento para imprimir", async () => {
    const respuesta = Response.json({ error: "No se encontró el recibo en el modo actual." }, { status: 404 });
    await expect(leerPdfRecibo(respuesta)).rejects.toThrow("No se encontró el recibo en el modo actual.");
  });

  it("rechaza una respuesta HTML como PDF", async () => {
    const respuesta = new Response("<h1>Iniciar sesión</h1>", { headers: { "content-type": "text/html" } });
    await expect(leerPdfRecibo(respuesta)).rejects.toThrow("No se recibió el PDF del recibo.");
  });
});

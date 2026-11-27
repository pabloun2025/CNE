import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Finanzas } from "../src/app/e/[token]/trabajo/finanzas";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";

vi.mock("@/components/lector-qr", () => ({ LectorQr: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/finanzas/pagar" }));

describe("circuito de Finanzas", () => {
  it("permite remitir una ficha por cédula desde el mismo puesto que escanea la credencial", () => {
    const html = renderToStaticMarkup(createElement(Finanzas, { token: "prueba" }));
    expect(html).toContain("Escanear credencial");
    expect(html).toContain("Ingresar por cédula");
    expect(html).toContain("Enviar ficha");
  });

  it("distingue Revisión, Impresión y Caja en las URL existentes", () => {
    const html = renderToStaticMarkup(createElement(PestanasFinanzas));
    expect(html).toContain('href="/admin/finanzas/documentos">2. Revisión');
    expect(html).toContain('href="/admin/finanzas/pagar">3. Impresión');
    expect(html).toContain('href="/admin/finanzas/caja">4. Caja');
    expect(html).toContain('aria-current="page" href="/admin/finanzas/pagar"');
  });
});

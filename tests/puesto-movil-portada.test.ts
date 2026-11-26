import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/puesto-movil/route";

const acceso = "p".repeat(43);
const seguimiento = "s".repeat(43);

afterEach(() => vi.unstubAllEnvs());

it("habilita el puesto desde su dominio público con el acceso abreviado", async () => {
  vi.stubEnv("CNE_MOVIL_ACCESO", acceso);
  vi.stubEnv("CNE_MOVIL_SEGUIMIENTO", seguimiento);
  const request = new Request("https://cne.consulado.app/", { headers: { host: "cne.consulado.app" } });
  const response = GET(request);
  const html = await response.text();
  expect(html).toContain(`data-acceso-puesto="${acceso.slice(0, 18)}"`);
  expect(html).not.toContain(acceso);
  expect(html).not.toContain(seguimiento);
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("requiere el enlace de acceso en el dominio de Madrid", async () => {
  vi.stubEnv("CNE_MOVIL_ACCESO", acceso);
  const request = new Request("https://madrid.consulado.app/puesto-movil", { headers: { host: "madrid.consulado.app" } });
  const html = await GET(request).text();
  expect(html).not.toContain(acceso.slice(0, 18));
});

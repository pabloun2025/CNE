import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Servicio = {
  networks?: string[] | Record<string, { aliases?: string[] } | null>;
  mem_limit?: string;
  logging?: { options?: Record<string, string> };
  environment?: Record<string, string>;
  command?: string[];
};
const compose = parse(readFileSync("docker-compose.oracle.yml", "utf8"), { merge: true }) as {
  name: string;
  services: Record<string, Servicio>;
  networks: Record<string, { external?: boolean; name?: string }>;
};
const redes = (s: Servicio) => Object.keys(Array.isArray(s.networks) ? Object.fromEntries(s.networks.map((n) => [n, 1])) : (s.networks ?? {}));

describe("docker-compose.oracle.yml", () => {
  it("usa el proyecto cne-prod y solo servicios cne-*", () => {
    expect(compose.name).toBe("cne-prod");
    expect(Object.keys(compose.services).sort()).toEqual(["cne-app", "cne-backup", "cne-migrate", "cne-postgres", "cne-worker"]);
    for (const nombre of ["app", "postgres", "worker"]) expect(compose.services[nombre]).toBeUndefined();
  });

  it("cne-postgres no está en la red de consulares", () => {
    expect(redes(compose.services["cne-postgres"])).toEqual(["cne_interna"]);
    expect(compose.networks["citas-prod_interna"]).toBeUndefined();
  });

  it("solo app y worker se unen a la red externa citas-prod_interna", () => {
    const externa = Object.entries(compose.networks).find(([, v]) => v?.external);
    expect(externa?.[1].name).toBe("citas-prod_interna");
    const nombreExterna = externa![0];
    const unidos = Object.entries(compose.services).filter(([, s]) => redes(s).includes(nombreExterna)).map(([n]) => n);
    expect(unidos.sort()).toEqual(["cne-app", "cne-worker"]);
    const redApp = compose.services["cne-app"].networks as Record<string, { aliases?: string[] }>;
    expect(redApp[nombreExterna].aliases).toContain("cne-app");
  });

  it("la base y Evolution se configuran como indica el diseño", () => {
    const env = compose.services["cne-app"].environment!;
    expect(env.DATABASE_URL).toBe("postgres://cne_app:${CNE_APP_PASSWORD}@cne-postgres:5432/cne");
    expect(env.EVOLUTION_API_URL).toBe("http://evolution-api:8080");
  });

  it("registros y memoria acotados", () => {
    expect(compose.services["cne-app"].mem_limit).toBe("768m");
    expect(compose.services["cne-worker"].mem_limit).toBe("384m");
    expect(compose.services["cne-postgres"].mem_limit).toBe("512m");
    for (const s of Object.values(compose.services)) expect(s.logging?.options?.["max-size"]).toBe("10m");
  });

  it("no hay --remove-orphans en el script de despliegue", () => {
    expect(readFileSync("scripts/deploy-oracle.sh", "utf8")).not.toMatch(/--remove-orphans/);
  });
});

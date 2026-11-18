import { headers } from "next/headers";

// URL pública: HOST_MADRID si está definido (la aplicación no depende de él); si no, la de la petición.
export async function urlBase(): Promise<string> {
  const host = process.env.HOST_MADRID?.trim();
  if (host) return `https://${host}`;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || (process.env.COOKIE_SECURE === "1" ? "https" : "http");
  return `${proto}://${h.get("x-forwarded-host") || h.get("host") || "localhost"}`;
}

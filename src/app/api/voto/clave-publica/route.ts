import { clavePublicaReceptor } from "@/server/justificante/servicio";
export const dynamic = "force-dynamic";
export function GET() {
  return new Response(clavePublicaReceptor(), { headers: { "content-type": "application/x-pem-file", "cache-control": "no-store" } });
}

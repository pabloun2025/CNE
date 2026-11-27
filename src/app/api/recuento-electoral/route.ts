import { recuentoElectoral } from "@/server/recuento-electoral";

export async function GET() {
  return Response.json(await recuentoElectoral(), { headers: {
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow",
  } });
}

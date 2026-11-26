import { aprovisionar } from "@/server/puesto-movil/provision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return aprovisionar(request);
}

import { atenderEntrega } from "@/server/entrega-puesto";

export const dynamic = "force-dynamic";
export function GET(request: Request) { return atenderEntrega(request); }
export function POST(request: Request) { return atenderEntrega(request); }

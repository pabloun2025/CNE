// Arranca la cola de envío real dentro del propio contenedor (09 §3.7). Solo en Node y nunca durante la construcción.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) return;
  const { arrancarCola } = await import("./server/envios/temporizador");
  arrancarCola();
}

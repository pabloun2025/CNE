import { requireSuperadmin } from "@/server/guard";

// Provisional: la consola llega en M04.
export default async function SuperInicio() {
  await requireSuperadmin();
  return <main><h1 className="text-xl font-semibold">Superadministración</h1></main>;
}

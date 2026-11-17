import { requireAdmin } from "@/server/guard";

// Provisional: el inicio con indicadores llega en M22.
export default async function AdminInicio() {
  await requireAdmin();
  return (
    <main>
      <h1 className="text-xl font-semibold">Administración Madrid</h1>
      <p className="mt-2">Bienvenido.</p>
    </main>
  );
}

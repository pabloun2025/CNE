import { CentroMando } from "@/components/centro-mando";
import { requireAdmin } from "@/server/guard";

export default async function Mando() {
  await requireAdmin();
  return (
    <main>
      <h1 className="mb-3 text-xl font-semibold">Centro de mando</h1>
      <CentroMando />
    </main>
  );
}

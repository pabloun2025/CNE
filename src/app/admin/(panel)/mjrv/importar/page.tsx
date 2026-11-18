import { SOLO_CONSUL } from "@/domain/roles";
import { ImportadorMjrv } from "@/components/importador-mjrv";
import { requireAdmin } from "@/server/guard";

export default async function Importar() {
  await requireAdmin({ roles: SOLO_CONSUL });
  return (
    <main className="max-w-3xl">
      <h1 className="mb-3 text-xl font-semibold">Importar MJRV</h1>
      <ImportadorMjrv />
    </main>
  );
}

import { SOLO_CONSUL } from "@/domain/roles";
import { FormMjrv } from "@/components/form-mjrv";
import { requireAdmin } from "@/server/guard";

export default async function Nueva() {
  await requireAdmin({ roles: SOLO_CONSUL });
  return (
    <main>
      <h1 className="mb-3 text-xl font-semibold">Nueva ficha de MJRV</h1>
      <FormMjrv />
    </main>
  );
}

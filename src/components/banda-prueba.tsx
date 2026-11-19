import { connection } from "next/server";
import { leerModo } from "@/server/config";

// Banda roja fija en todas las pantallas mientras el modo sea «prueba» (§8, §14.2).
export async function BandaPrueba() {
  await connection();
  if ((await leerModo()) !== "prueba") return null;
  return (
    <div role="status" className="banda-prueba sticky top-0 z-50 bg-red-700 px-3 py-1 text-center text-sm font-bold text-white">
      MODO PRUEBA — los datos son simulados
    </div>
  );
}

import { sinTildes, type Rol } from "./importacion/mjrv";

type CargoFicha = Exclude<Rol, "otro">;

export const CARGOS_FICHA: { valor: CargoFicha; etiqueta: string }[] = [
  { valor: "presidente", etiqueta: "PRESIDENTE/A" },
  { valor: "secretario", etiqueta: "SECRETARIO/A" },
  { valor: "vocal", etiqueta: "2do. VOCAL PRINCIPAL" },
  { valor: "suplente", etiqueta: "2do. VOCAL SUPLENTE" },
];

const ALIAS: Record<CargoFicha, readonly string[]> = {
  presidente: ["presidente", "presidenta"],
  secretario: ["secretario", "secretaria"],
  vocal: ["vocal", "vocal 2", "vocal principal", "2do vocal", "segundo vocal principal"],
  suplente: ["suplente", "vocal suplente", "vocal suplente 2", "segundo vocal suplente"],
};

export function etiquetaCargoCredencial(cargo: string): string {
  const texto = sinTildes(cargo);
  return CARGOS_FICHA.find(({ valor, etiqueta }) => sinTildes(etiqueta) === texto || ALIAS[valor].includes(texto))?.etiqueta ?? cargo;
}

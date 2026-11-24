import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// La serie interna H/M no se muestra. Quien arme una junta para el usuario usa juntaEnCredencial,
// formatoPublicoJunta o juntaPublicaSql. Estos archivos construyen la cadena interna a propósito:
// o son consultas internas, o el texto se convierte con formatoPublicoJunta antes de llegar a pantalla.
const PERMITIDOS = new Set([
  "src/server/junta-sql.ts", "src/domain/juntas.ts",
  "src/server/importar-mjrv.ts", "src/domain/importacion/mjrv.ts", "src/server/demo.ts", "src/domain/demo.ts", // claves del importador y datos de prueba
  "src/server/movimientos.ts", // solo alimenta la propuesta de la IA
  "src/server/puerta.ts", "src/server/documentos.ts", "src/server/finanzas.ts", "src/server/recibos.ts", // las rutas y componentes aplican formatoPublicoJunta
]);
const USO_ETIQUETA_PERMITIDO = new Set(["src/domain/juntas.ts", "src/server/envios/rectificacion.ts"]); // compara el rótulo guardado

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const raiz = path.resolve(__dirname, "..");
const fuentes = archivos(path.join(raiz, "src")).map((p) => ({ ruta: path.relative(raiz, p).split(path.sep).join("/"), texto: readFileSync(p, "utf8") }));

describe("barrido de la serie interna", () => {
  it("no hay `serie || numero` ni `${x.serie}${...}` fuera de los archivos permitidos", () => {
    const malos = fuentes.filter((f) => !PERMITIDOS.has(f.ruta) && /\.serie\s*\|\||\bserie\s*\|\|\s*numero|\.serie\}\$\{/.test(f.texto)).map((f) => f.ruta);
    expect(malos).toEqual([]);
  });

  it("etiquetaJunta solo se usa donde se compara con el rótulo guardado", () => {
    const malos = fuentes.filter((f) => !USO_ETIQUETA_PERMITIDO.has(f.ruta) && /etiquetaJunta\(/.test(f.texto)).map((f) => f.ruta);
    expect(malos).toEqual([]);
  });

  it("ninguna pantalla rotula una serie con Hombres o Mujeres", () => {
    const malos = fuentes.filter((f) => f.ruta.endsWith(".tsx") && />\s*(Hombres|Mujeres)\s*</.test(f.texto)).map((f) => f.ruta);
    expect(malos).toEqual([]);
  });

  it("los archivos permitidos existen (la lista no se queda vieja)", () => {
    const rutas = new Set(fuentes.map((f) => f.ruta));
    expect([...PERMITIDOS, ...USO_ETIQUETA_PERMITIDO].filter((r) => !rutas.has(r))).toEqual([]);
  });
});

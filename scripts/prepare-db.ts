// Prepara la base: esquema, migraciones, 95 juntas, permisos y superadmin inicial. Lo ejecuta cne-migrate antes de la web.
import { prepararBase } from "../src/server/schema-apply";

prepararBase()
  .then((r) => {
    console.log(`db:prepare: esquema ${r.esquemaNuevo ? "creado" : "ya existía"}; migraciones nuevas: ${r.migraciones.length}; SELECT count(*) FROM cne.juntas_madrid = ${r.juntas}; superadmin ${r.superadminCreada ? "creada" : "ya existía"}.`);
  })
  .catch((error: Error) => {
    console.error(`db:prepare falló: ${error.message}`);
    process.exit(1);
  });

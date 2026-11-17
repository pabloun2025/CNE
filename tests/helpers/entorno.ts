// Entorno de pruebas: base cne_test local o del servicio de CI. Valores ficticios, nunca de producción.
const dueno = process.env.DATABASE_TEST_URL || "postgres://cne_owner:local@localhost:5432/cne_test";
const clave = process.env.CNE_APP_TEST_PASSWORD || "local";
const app = new URL(dueno);
app.username = "cne_app";
app.password = clave;

process.env.DATABASE_TEST_URL = dueno;
process.env.DATABASE_OWNER_URL = dueno;
process.env.DATABASE_URL = app.toString();
process.env.CNE_APP_TEST_PASSWORD = clave;
// 32 bytes fijos (ficticios) para cifrar en pruebas.
process.env.APP_MASTER_KEY = Buffer.from("clave-ficticia-de-pruebas-32-byt!").toString("base64");
process.env.COOKIE_SECURE = "0";

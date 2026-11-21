"use strict";

// Procedimiento manual ejecutado dentro de cne-app desde GitHub Actions.
// Recibe la contraseña NUEVA solo por stdin, jamás como argumento o en logs.
async function main() {
  const [{ Client }, { hash, verify }, { createHash }] = await Promise.all([
    import("pg"), import("@node-rs/argon2"), import("node:crypto")
  ]);
  let password = "";
  for await (const fragment of process.stdin) password += fragment.toString("utf8");
  if (password.length < 12 || password.length > 200) {
    throw new Error("La contraseña temporal debe contener entre 12 y 200 caracteres.");
  }
  const connectionString = process.env.DATABASE_OWNER_URL;
  if (!connectionString) throw new Error("La aplicación no tiene DATABASE_OWNER_URL.");
  const cliente = new Client({ connectionString });
  await cliente.connect();
  let transaccion = false;
  try {
    await cliente.query("BEGIN");
    transaccion = true;
    const r = await cliente.query(
      "SELECT id, correo FROM cne.usuarios WHERE tipo = $1 AND activo = true FOR UPDATE",
      ["superadmin"]
    );
    if (r.rowCount !== 1) {
      throw new Error(
        "Se encontraron " + r.rowCount + " cuentas superadmin activas. " +
        "No se ha cambiado ninguna contraseña. Revisar la migración de cuentas."
      );
    }
    if (password.toLowerCase() === r.rows[0].correo.toLowerCase()) {
      throw new Error("La contraseña no puede coincidir con el correo de acceso.");
    }

    // Mismos parámetros Argon2id utilizados en src/server/passwords.ts.
    const hashNuevo = await hash(password, {
      memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2
    });
    const verificado = await verify(hashNuevo, password, {
      memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2
    });
    if (!verificado) throw new Error("No se pudo verificar el hash de la contraseña.");

    await cliente.query(
      `UPDATE cne.usuarios
         SET password_hash = $1, password_pendiente = false,
             debe_cambiar = true, fallos = 0, bloqueado_hasta = NULL
       WHERE id = $2 AND tipo = 'superadmin'`,
      [hashNuevo, r.rows[0].id]
    );
    await cliente.query(
      "UPDATE cne.sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL",
      [r.rows[0].id]
    );
    // Eliminar bloqueos por intentos fallidos de ESTE usuario, no de los demás.
    const claveCorreo = "correo:" + createHash("sha256")
      .update(r.rows[0].correo).digest("hex");
    await cliente.query("DELETE FROM cne.intentos_acceso WHERE clave = $1", [claveCorreo]);
    await cliente.query("COMMIT");
    transaccion = false;
    console.log("OK: contraseña restablecida para la única cuenta superadmin activa.");
    console.log("Sesiones anteriores revocadas; cambio de contraseña obligatorio al entrar.");
    console.log("No se han modificado otras cuentas ni datos electorales.");
  } catch (error) {
    if (transaccion) await cliente.query("ROLLBACK");
    throw error;
  } finally {
    await cliente.end();
    password = "";
  }
}
main().catch(e => {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
});

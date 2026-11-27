const { constants, publicEncrypt } = require("node:crypto");
const { query, closePools } = require("./src/server/db.ts");
const { decryptBuffer } = require("./src/server/crypto.ts");
const { enlacePorToken } = require("./src/server/estaciones.ts");
const publica="-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAwE2s54Yv1FopfD9p/kpv\nwW6CwpBstcqNw1a/iH9c9AuY8ZXaGIC4w/8cKd7CaJ+O1FU2y3/wOAEhe/bsNjka\n7PZlUKJ3dHvpDZl2hEJ30Nr/wwLxZOFnJ0dirAzWGbW4BEhuKwW5A3cy6uxuOd2n\nhvHSAk6eVpVdyFl8iUh1uv5CQq6bcuNWB4xohBjpiR9nUTQ2yLuKO9jJ5oAA92/e\nYcgBZ3Wi9EMwfN86NwFvMVrA/AS1DcHGurn8fBSNcRfMr0DB2ZUVSVBVfoNVlxfJ\nQadyZN9nJz1Us9f+xkU3Cc2fgjW3W08uoZ2cDyfKIpVQ2MVruYODwXR7UxeC3gTL\nhzw2J3NfbHLUHZ8ZPPhdqpQM0HxZ4QSq1AOhRK91qseNOyg7K4JjeVCq6EgqPA3z\nhw8BcJdmac80292SmjFDfxqmlTo0s6F7mOCVvzQK3aOhsAYzswrXrIUSmtnj8sl4\nwVI7IN2qgEwVEFTHZhGHEVx5CkkmK1cBWygTgUJBfS97AgMBAAE=\n-----END PUBLIC KEY-----\n";
(async () => {
  try {
    const [fila]=await query("SELECT id, token_cifrado, token_nonce FROM cne.enlaces_estacion WHERE funcion = $1 AND activo AND revocado_en IS NULL AND token_cifrado IS NOT NULL AND token_nonce IS NOT NULL ORDER BY id DESC LIMIT 1",["documentacion"]);
    if (!fila) throw Error();
    const datos=decryptBuffer(fila.token_cifrado,fila.token_nonce);
    try {
      const token=datos.toString("utf8");
      const activo=await enlacePorToken(token);
      if (!activo || activo.funcion!=="documentacion" || activo.id!==fila.id || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw Error();
      const enlace=Buffer.from("https://madrid.consulado.app/e/"+token);
      try {
        console.log("DOCUMENTACION_CIFRADA="+publicEncrypt({key:publica,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},enlace).toString("base64"));
      } finally { enlace.fill(0); }
    } finally { datos.fill(0); }
  } catch {
    console.error("No se encontró un enlace activo y recuperable de Documentación.");
    process.exitCode=1;
  } finally { await closePools(); }
})();

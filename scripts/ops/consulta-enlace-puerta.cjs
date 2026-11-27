const { constants, publicEncrypt } = require("node:crypto");
const { query, closePools } = require("./src/server/db.ts");
const { decryptBuffer } = require("./src/server/crypto.ts");
const { enlacePorToken } = require("./src/server/estaciones.ts");
const publica="-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAt97PKVEXtwWuDGQDT+Rh\njOgXhnOpdYP4/5GtHM/bxPZqkccUoewbTL1VjhNtn3y98dRaoj0bWtCQAmp0sGws\nVAkUCek1do0xXlMFZeK1rQnYngxCtdHfg5kttgA45nfRyDoJalXh6itpZyys9Quq\nG6AogLyINeWOgMDneV5WyzIPAYWeyrDFD9i73Czx2/ACb36rWcyE3UyG1MbqF1Ng\nQ+IswsYCgqMdJpopDozduCjXbxAz34BQLpr7f1PTY6bWJUNsjUCl0JlU/VB/s1gL\nASmPkwOYXxCo2xBWK/Rk5wluFkw0AQSfyDkT9sJd0BXuSTQ/ljWNI2jM+ge3pUwA\nc5GGNEouLZsQ9U0fQnKgDihJIP4Dydfecx/3oam15g4jp3TC4Ku/hKXGaTY9ztl6\ncfvRrtRogUs1F+Bdi2Q12n6Xmf1ZJrB/Yuci2k6KMfwuM9fe2WaAUUIgGr0wKZB0\n2zoEHHGd6ZD4sKhNwEYtL1fWYB4Rg1fhU2iYkXe2dJ4rAgMBAAE=\n-----END PUBLIC KEY-----\n";
(async () => {
  try {
    const [fila]=await query("SELECT id, token_cifrado, token_nonce FROM cne.enlaces_estacion WHERE funcion = $1 AND activo AND revocado_en IS NULL AND token_cifrado IS NOT NULL AND token_nonce IS NOT NULL ORDER BY id DESC LIMIT 1",["puerta"]);
    if (!fila) throw Error();
    const datos=decryptBuffer(fila.token_cifrado,fila.token_nonce);
    try {
      const token=datos.toString("utf8");
      const activo=await enlacePorToken(token);
      if (!activo || activo.funcion!=="puerta" || activo.id!==fila.id || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw Error();
      const enlace=Buffer.from("https://madrid.consulado.app/e/"+token);
      try {
        console.log("PUERTA_CIFRADA="+publicEncrypt({key:publica,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},enlace).toString("base64"));
      } finally { enlace.fill(0); }
    } finally { datos.fill(0); }
  } catch {
    console.error("No se encontró un enlace activo y recuperable de Puerta.");
    process.exitCode=1;
  } finally { await closePools(); }
})();

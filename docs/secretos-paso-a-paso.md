# Secretos del Proyecto CNE — paso a paso

GitHub **no permite leer ni copiar** los secretos de un repositorio a otro: solo se pueden escribir. Por eso los secretos que ya usan `teinvito` y `consulares` hay que volver a pegarlos en `pabloun2025/CNE`. Son **solo dos**. El resto de claves (Brevo, Evolution API, contraseñas de base) ya están en el servidor y el despliegue de CNE las tomará de allí.

| Secreto | Para qué | Dónde está el valor original |
|---|---|---|
| `ORACLE_SSH_KEY` | Entrar en la VM de Oracle para inspeccionar y desplegar CNE | La clave privada SSH con la que entra en `ubuntu@51.170.51.109` (la misma que pegó en teinvito). Suele ser un archivo `.key` o `id_...` en su ordenador. |
| `CLOUDFLARE_API_TOKEN` | Crear los subdominios `*.consulares.app` en el túnel de Cloudflare | El token que pegó en teinvito. Si no lo conserva, cree uno nuevo (abajo). |

## Opción A — desde el navegador (5 minutos)

1. Abra https://github.com/pabloun2025/CNE/settings/secrets/actions/new
2. En **Name** escriba `ORACLE_SSH_KEY`. En **Secret** pegue el contenido completo del archivo de la clave privada, incluidas las líneas `-----BEGIN ...-----` y `-----END ...-----`. Pulse **Add secret**.
3. Vuelva a abrir el mismo enlace. **Name** `CLOUDFLARE_API_TOKEN`, pegue el token y pulse **Add secret**.

Si no tiene el token de Cloudflare: https://dash.cloudflare.com/profile/api-tokens → **Create Token** → plantilla **Edit zone DNS** → en *Zone Resources* elija `consulares.app` → añada también el permiso *Account › Cloudflare Tunnel › Edit* → **Create** y copie el token (solo se muestra una vez).

## Opción B — con la terminal de su ordenador (GitHub CLI)

Requiere tener `gh` instalado (https://cli.github.com) y haber hecho `gh auth login`.

```bash
gh secret set ORACLE_SSH_KEY --repo pabloun2025/CNE < ~/ruta/a/su/clave-oracle.key
```

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo pabloun2025/CNE
```

(El segundo comando le pedirá que pegue el token.)

## Comprobar

1. Abra https://github.com/pabloun2025/CNE/actions/workflows/oracle-inspect.yml
2. Pulse **Run workflow** → **Run workflow**. Es de solo lectura: no cambia nada en el servidor.
3. Si termina en verde, la clave funciona. Avise a Claude: con ese resultado se confirma la capacidad de la VM y se decide dónde va la base de datos de CNE.

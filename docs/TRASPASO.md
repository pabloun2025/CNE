# Traspaso del Proyecto CNE — estado al 18-11-2026

Documento para que otra IA (o persona) continúe el trabajo sin perder contexto. **Léalo entero antes de tocar nada.** Responsable del proyecto: Pablo Martínez (Ministro, Embajada del Ecuador en España). Se comunica en español, trato de usted, preguntas en opciones de selección (A/B/C) con recomendación.

**Codex, 19-11-2026:** continúe por la sección 9. La estética de DEMP está en la rama `cursor/estetica-demp-madrid-08cc` y no está en producción.

## 1. Qué es y qué alcance tiene hoy

- Repositorio privado `pabloun2025/CNE`. Rama de trabajo `claude/optimistic-wozniak-ksg62y`; **producción se publica solo desde `main`** (Pablo autorizó trabajar sobre `main`).
- **Alcance vigente: solo el sistema operativo de Madrid** (miembros de las juntas receptoras del voto, MJRV) para la jornada del **29-11-2026** en la Caja Mágica (95 juntas: H 1–41, M 1–54, seis zonas de color).
- **Fuera de alcance por decisión de Pablo (18-11):** el portal de reporte consular y el tablero DGSMH **no se construyen**. Sus documentos de diseño (00–06) quedan como referencia; la maqueta estática del tablero sigue en `maqueta/` y en https://tablero-dgsmh.onrender.com (Render, sitio estático gratuito).
- Las tres funciones principales del sistema (así lo presenta Pablo): **el QR de la credencial sirve para armar las juntas**, **la foto de la cédula sirve para el comprobante de pago**, y **el pago es ordenado y seguro** (nadie cobra dos veces).

## 2. Orden de lectura

1. `AGENTS.md` (reglas que no se negocian) y `.claude/skills/karpathy-guidelines/SKILL.md`.
2. Este documento.
3. `ESPECIFICACION_FUNCIONAL.md` §7, «Mapa de juntas de Madrid», §8 y las entradas **«DECIDIDO (18-11-2026)»** (prevalecen; lo antiguo está marcado «SUSTITUIDO»).
4. `docs/diseno/07-plan-madrid.md` (plan M01–M25), `09-cambios-decisiones.md` (D01–D14) y `08-comprobacion-primera-version.md` (listas de comprobación A–H).
5. `insumos/GUIA_DE_USO_PARA_CLAUDE.md` (insumos y fuentes oficiales). `INSTRUCCIONES.md` es solo historial.

## 3. Estado: qué está construido y publicado

Producción: **https://madrid.consulado.app** — versión `c6134f4` (main), publicada el 18-11-2026 15:35 UTC. Arranca en **modo prueba** (banda visible). 882 pruebas automáticas en verde.

| Bloque | Estado |
|---|---|
| M01–M17 primera versión (accesos, importador Excel/CSV, fichas MJRV, credencial CR80 + A4 con QR de cédula, operadores con PIN y enlaces de estación, puerta, centro de mando, propuestas deterministas, documentos `/d` con fotos cifradas, parámetros de pago, finanzas con acta y confirmación atómica, panel financiero) | Publicado |
| M18–M23, M25 (2FA TOTP obligatoria superadmin, «Borrar datos de prueba y preparar para elección» con respaldo verificado, informe de cierre PDF/Excel, envío de credenciales, inicio admin, captura automática de cédula, matriz de permisos) | Publicado |
| M24 (reserva en finanzas) | Sustituido por D12 (aviso no bloqueante) |
| D01–D13 decisiones del 18-11 (importe fijo EUR, «Comprobante de pago», reingreso amarillo, baja = rojo, tres cargos por junta, incorporar votantes, traslados con cargo, línea WhatsApp propia de CNE, cola de envío real con interruptor, enlace `/d` en el mensaje, aviso en finanzas, borrar fotos) | Publicado |
| C1–C3 cuentas: la cuenta `admin` define su contraseña en el primer ingreso; roles `consul` / `coordinador` / `financiero`; las otras cuentas las crea la superadmin | Publicado |

### Cuentas

| Cuenta | Acceso | Permisos |
|---|---|---|
| superadmin | `/superadmin/acceso` | Todo, incluida la creación de las otras cuentas |
| `admin` | `/admin/acceso`; el primer ingreso pide definir la contraseña. No se toca esa cuenta ni ese flujo | Administración completa de Madrid (rol cónsul) |
| cónsul, coordinador, financiero | Los crea la superadmin en `/superadmin`. Ella escribe la contraseña inicial y elige el permiso; puede cambiarlo o desactivar la cuenta | Según el permiso: todo, solo centro de mando, o finanzas e informes |

No hay usuarios ni contraseñas de fábrica para esas cuentas. La puerta no es una cuenta: sigue siendo un enlace revocable.

### Rutas principales

`/admin` (inicio, mjrv, importar, credenciales, operadores, mando, documentos y cartel, finanzas, informes) · `/superadmin` (cuentas y roles, modo prueba, datos de demostración, preparar elección y respaldo, envíos y línea de WhatsApp, borrar fotos, verificación 2FA) · `/e/<token>` estaciones (puerta, documentación, centro de mando, finanzas) con nombre + PIN · `/d` formulario público de la cédula · `/api/salud`.

## 4. Infraestructura y despliegue

- **Servidor:** VM Oracle `ubuntu@51.170.51.109` (23 GB RAM), compartida con consulares (`citas-prod`), teinvito (`teinvito-prod`) y DEMP (`demp-whatsapp`). **Nunca tocar contenedores, redes ni volúmenes ajenos.**
- CNE vive en `/home/ubuntu/cne`, proyecto Compose `cne-prod`: `cne-postgres` (PostgreSQL 16 propio), `cne-migrate` (aplica `db/schema.sql` + `db/migrations/` + `db/grants.sql`), `cne-app` (Next.js 16, puerto 38473; une también la red `citas-prod_interna` con alias `cne-app` para el túnel y para llegar a `evolution-api:8080`), `cne-backup` (copia diaria, 14 días, en `/home/ubuntu/cne/backups`).
- **Secretos del servidor** en `/home/ubuntu/cne/.env.production` (600). `APP_MASTER_KEY` se generó allí: **no debe cambiar nunca** (cifra fotos y 2FA). Recomendar a Pablo guardarla fuera del servidor. Las claves de Evolution/Brevo se copian en cada despliegue desde `/home/ubuntu/consulares/.env.production` (solo lectura).
- **Dominio:** `madrid.consulado.app`, regla añadida al túnel Cloudflare «recordatorio» (el de consulares), servicio `http://cne-app:38473`. No existe `consulares.app` en la cuenta de Cloudflare.
- **Secretos de GitHub** (pabloun2025/CNE): `ORACLE_SSH_KEY` (clave dedicada `cne_deploy`, autorizada en la VM) y `CLOUDFLARE_API_TOKEN`. Pasos para el usuario en `docs/secretos-paso-a-paso.md`.
- **Flujos de GitHub Actions** (lanzar con `workflow_dispatch`, ref `main`):
  - `oracle-deploy.yml` — entrada `accion` = `desplegar` (pasa CI y publica `main`; hace `pg_dump` previo y guarda `cne:anterior`) o `revertir` (vuelve a la imagen anterior).
  - `verificar-sitios.yml` — comprueba desde fuera `madrid.consulado.app` y que `recordatorio.consulado.app` sigue bien. **Ejecutarlo tras cada despliegue** (desde este entorno no hay salida a esos dominios).
  - `dominio.yml` — `comprobar` (solo lectura) / `crear` hostname en el túnel conservando las reglas existentes.
  - `oracle-inspect.yml` y `cloudflare-inspect.yml` — inspección de solo lectura.
  - `ci.yml` — tipos, lint, pruebas, compilación.
- **Procedimiento seguido en cada entrega:** trabajo en la rama → `npx tsc --noEmit -p .`, `npm run lint`, `npm test` (PostgreSQL 16 local: `pg_ctlcluster 16 main start`), `npm run build` → push de la rama → merge en `main` (se hizo con un worktree aislado) → `oracle-deploy.yml` → leer el registro (debe terminar con `{"ok":true,...}` y `cne-app (healthy)`) → `verificar-sitios.yml`.
- **Leer la contraseña inicial u otras variables:** solo Pablo, por SSH desde su Mac con `~/.ssh/cne_deploy`. Nunca imprimir secretos.
- **Render:** base `cne-madrid-db` (Frankfurt, gratuita) creada por error de enfoque y sin uso; la herramienta no permite borrarla. Pablo puede borrarla en el panel de Render; caduca sola el 17-12.

## 5. Modelo de trabajo con agentes

- `.claude/agents/cne-disenador.md` (Opus): diseña y escribe planes en `docs/diseno/`, no programa.
- `.claude/agents/cne-programador.md` (Sonnet): implementa tarea a tarea con pruebas, commit por tarea, **sin push ni despliegue** (lo hace el coordinador).
- Repositorios de referencia **solo lectura**: `pabloun2025/consulares`, `pabloun2025/teinvito`, `pabloun2025/DEMP`.

## 6. Decisiones de Pablo vigentes (18-11-2026)

- Importe **fijo en EUR** (sin USD ni tipo de cambio). Acta = «Comprobante de pago», **modelo provisional** hasta que haya plantilla oficial.
- Rótulo de credencial: **el que traiga el Excel** (si usa M/F: M = masculino, F = femenino, con aviso).
- WhatsApp: mismo despliegue de Evolution API de consulares, **línea propia `cne-madrid`** vinculada desde `/superadmin/envios`. Envío real **apagado** hasta que la superadmin lo encienda escribiendo `ENVIO REAL`; 20–45 s entre mensajes, 9–21 h todos los días, 150/día, pausa tras 5 fallos.
- Puerta: segundo escaneo **amarillo**, decide el operador («Dejar pasar»); rojo = desconocida o **dada de baja**.
- Cada junta necesita **presidente, secretario y vocal**; verde solo con los tres. Orden para cubrir: suplente de la misma junta (automático, editable) → misma zona → zona más cercana (orden deducido del plano) → **votante incorporado** por el centro de mando, uno por uno.
- Traslado cuenta **al aceptarlo**. «No viable» saca a la persona de las propuestas hasta reactivarla. El sistema propone, **decide siempre el coordinador**.
- Finanzas: aviso no bloqueante si otro puesto tiene abierta la misma ficha. Imprimir **no** confirma el pago.
- Fotos de cédula: se guardan hasta que la superadmin las borre (`BORRAR FOTOS`).
- Producción directa, sin entorno de ensayo: se ensaya en **modo prueba** y luego «Borrar datos de prueba y preparar para elección».

## 7. Pendiente

### De Pablo (insumos y decisiones)
1. **Excel nominativo de MJRV** — lo más urgente. Con 150 WhatsApp/día, el envío de credenciales debe empezar **a más tardar el 24-11**. Revisar el archivo antes de cargarlo (columnas, rótulo, cargos, duplicados); no inventar datos.
2. **Importe en EUR** por persona (lo configura `consul` o `financiero` en Finanzas).
3. **Nombre del remitente del correo** (Q-D2). Sin él no se puede encender el correo real.
4. **Definir su contraseña de superadmin** si aún no lo hizo, configurar la 2FA y guardar códigos de recuperación y `APP_MASTER_KEY`.
5. **Vincular la línea de WhatsApp** de CNE (QR en `/superadmin/envios`) con un teléfono dedicado, y decidir cuándo encender el envío real.
6. Decisión abierta **P-10**: ¿el traslado debe confirmarse cuando la persona llega físicamente? (hoy cuenta al aceptar).
7. Confirmar el **orden de cercanía de zonas** (hoy: deducido del plano) y la **distribución del QR de documentos** (hoy: cartel + enlace en el mensaje).
8. Plantilla oficial del acta, si la hay.

### Técnico (para la siguiente IA)
1. **Ensayo con dispositivos reales** (lista `docs/diseno/08-comprobacion-primera-version.md`, secciones C, D, G, H): cámara y lector QR en móviles, captura automática (calibrar `src/domain/captura-auto.ts`), impresión de credenciales A4/CR80 y del acta, vinculación de WhatsApp y un envío real controlado a teléfonos de prueba de Pablo, «Preparar elección» en modo prueba.
2. **`npm audit` (19-11-2026).** La alta era `xlsx` (SheetJS, sin parche). La lectura y el informe usan `exceljs`. Quedan avisos de `vitest`/`tinypool` (solo el entorno de pruebas; la imagen de producción hace `npm prune --omit=dev`) y uno moderado de `uuid` que arrastra `exceljs`.
3. **Respaldo de «Preparar elección».** `RESPALDO_DIR=/respaldos`, montado en `/home/ubuntu/cne/backups/preparar`. Sobrevive a recrear el contenedor. Se conservan los tres últimos. La copia que hay que guardar fuera sigue siendo la descarga.
4. **2FA.** Ya no existe (`db/migrations/2026-11-22-sin-2fa.sql` y la especificación: sin doble factor). No hay pantalla de restablecimiento que construir.
5. Si `pabloun@gmail.com` coincidiera con una cuenta admin, el arranque fallaría por unicidad (improbable).
6. Copias externas: las diarias quedan solo en la VM; valorar copia cifrada fuera (R2 ya se usa en teinvito).
7. La noche del 28-11: comprobar que no queda actividad de prueba, ejecutar «Borrar datos de prueba y preparar para elección», descargar el respaldo y verificar el modo elección.

## 8. Documentos entregados a Pablo (no versionados, generados en la conversación)

- Memorando, ERS y descripción funcional del tablero DGSMH y portal consular (ya fuera de alcance).
- «Sistema operativo de Madrid» (4 páginas) e infografía **«Así funciona el sistema de Madrid»** (2 páginas, vigente): tres funciones principales, recorrido, tres cargos por junta, cómo se completa una junta, pago.

## 9. Traspaso a Codex (19-11-2026) — estética DEMP, sin publicar

Pablo pidió commit de este trabajo y que Codex se haga cargo de lo que sigue. La sección 3 está atrasada: el `main` publicado el 19-11-2026 a las 21:39 (Madrid) es `f63e6f5` (Action «Deploy to Oracle», run 14, éxito). Ese despliegue no incluye esta estética.

### Qué está hecho

Solo presentación, copiada de DEMP (repositorio de solo lectura; no se editó ningún archivo allí). Textos, rutas, permisos y reglas quedan como estaban. El protocolo unslop se aplicó a la interfaz, no al tono de los textos.

Archivos nuevos: `src/components/marca.tsx` (marca, tricolor, masthead) y `src/components/pestanas-finanzas.tsx`.

Pantallas tocadas:

- Acceso de admin y cambio de contraseña (`formulario-acceso.tsx`): hoja centrada, tricolor y marca.
- Cascarón del personal (`menu-admin.tsx`, layout del panel): barra en el móvil y menú lateral en escritorio, agrupado en Preparación, Jornada y Cierre. El rol sigue decidiendo qué enlaces se ven; el servidor sigue comprobando cada pantalla.
- Inicio `/admin`: orden del día en circuito y tarjetas de cifras.
- Finanzas, módulo de pago, escanear QR e impresión de actas: pestañas entre esas cuatro rutas.
- Panel financiero: las cifras van en tarjetas.
- Identificación de estación `/e/[token]` y cabecera del puesto.
- Formulario público `/d`: masthead. Sigue pidiendo solo el número de cédula.
- Superadmin: hoja, masthead y pestañas.
- `globals.css` y `layout.tsx`: tokens y fuentes de DEMP (Public Sans y Archivo). La banda de prueba sigue visible en modo prueba.

### Qué no se toca

- La cuenta `admin` y su primer ingreso.
- Reglas de pago, puerta y constitución de juntas.
- No añadir nombre, teléfono ni correo en `/d`.
- No imprimir secretos. No reiniciar contenedores ajenos en la VM.

### Comprobado el 19-11-2026

`npx tsc --noEmit -p .` y `npm run lint` terminaron sin errores. No se ejecutaron `npm test` ni `npm run build` en este cierre: los corre el CI del pull request. No está desplegado, así que madrid.consulado.app sigue con el aspecto anterior.

### Qué hace Codex

1. Revisar el diff: tiene que ser presentación. Si aparece un cambio de pago, puerta, constitución o de la cuenta admin, no lo una.
2. Esperar el CI en verde (`ci.yml`: tipos, lint, pruebas, compilación).
3. Unir el pull request a `main`.
4. Publicar desde `main` con la Action `oracle-deploy.yml`, entrada `accion` = `desplegar`. Después, `verificar-sitios.yml`.
5. El token de la app de GitHub que usa Cursor en el agente responde HTTP 403 en `workflow_dispatch` (le falta `actions:write`). Se probó el 19-11 y no cambió. No reintentar el disparo con ese token.
6. Pablo guardó un secreto de Cloud Agents con el nombre exacto `GH_TOKEN` (mayúsculas), token fino de GitHub para este repositorio. Esta sesión no lo ve: el secreto entra al arrancar el agente, y este ya estaba en marcha. En un agente nuevo, usarlo solo para lanzar la Action, sin imprimirlo y sin escribirlo en el repositorio. Si no está en el entorno, parar y decirle a Pablo que pulse **Run workflow** en https://github.com/pabloun2025/CNE/actions/workflows/oracle-deploy.yml con la rama `main`.

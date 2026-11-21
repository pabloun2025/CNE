# Traspaso del Proyecto CNE — estado al 20-11-2026

Documento para que otra IA (o persona) continúe el trabajo sin perder contexto. **Léalo entero antes de tocar nada.** Responsable del proyecto: Pablo Martínez (Ministro, Embajada del Ecuador en España). Se comunica en español, trato de usted, preguntas en opciones de selección (A/B/C) con recomendación.

**Último estado, 21-11-2026.** Consulte la [sección 13](#13-circuito-de-los-tres-puestos-de-madrid) para el circuito desplegado, la numeración y los enlaces.

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

Producción: **https://madrid.consulado.app**. La versión verificada del circuito de tres puestos es `4e73cb9`. [Estado público](https://madrid.consulado.app/api/salud)

| Bloque | Estado |
|---|---|
| M01–M17 primera versión (accesos, importador Excel/CSV, fichas MJRV, credencial CR80 + A4 con QR de cédula, operadores con PIN y enlaces de estación, puerta, centro de mando, propuestas deterministas, documentos `/d` con fotos cifradas, parámetros de pago, finanzas con acta y confirmación atómica, panel financiero) | Publicado |
| M19–M23, M25 («Borrar datos de prueba y preparar para elección» con respaldo verificado, informe de cierre PDF/Excel, envío de credenciales, inicio admin, captura automática de cédula, matriz de permisos) | Publicado |
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

`/admin` (inicio, mjrv, importar, credenciales, operadores, mando, documentos y cartel, finanzas, informes) · `/superadmin` (cuentas y roles, modo prueba, datos de demostración, preparar elección y respaldo, envíos y línea de WhatsApp, borrar fotos) · `/e/<token>` estaciones (puerta, documentación, centro de mando, finanzas) con nombre + PIN · `/d` formulario público de la cédula · `/api/salud`.

## 4. Infraestructura y despliegue

- **Servidor:** VM Oracle `ubuntu@51.170.51.109` (23 GB RAM), compartida con consulares (`citas-prod`), teinvito (`teinvito-prod`) y DEMP (`demp-whatsapp`). **Nunca tocar contenedores, redes ni volúmenes ajenos.**
- CNE vive en `/home/ubuntu/cne`, proyecto Compose `cne-prod`: `cne-postgres` (PostgreSQL 16 propio), `cne-migrate` (aplica `db/schema.sql` + `db/migrations/` + `db/grants.sql`), `cne-app` (Next.js 16, puerto 38473; une también la red `citas-prod_interna` con alias `cne-app` para el túnel y para llegar a `evolution-api:8080`), `cne-backup` (copia diaria, 14 días, en `/home/ubuntu/cne/backups`).
- **Secretos del servidor** en `/home/ubuntu/cne/.env.production` (600). `APP_MASTER_KEY` se generó allí: **no debe cambiar** porque cifra fotografías y documentos archivados. Las claves de Evolution/Brevo se copian en cada despliegue desde `/home/ubuntu/consulares/.env.production` (solo lectura).
- **Dominio:** `madrid.consulado.app`, regla añadida al túnel Cloudflare «recordatorio» (el de consulares), servicio `http://cne-app:38473`. No existe `consulares.app` en la cuenta de Cloudflare.
- **Secretos de GitHub** (pabloun2025/CNE): `ORACLE_SSH_KEY` (clave dedicada `cne_deploy`, autorizada en la VM) y `CLOUDFLARE_API_TOKEN`. Pasos para el usuario en `docs/secretos-paso-a-paso.md`.
- **Flujos de GitHub Actions** (lanzar con `workflow_dispatch`, ref `main`):
  - `oracle-deploy.yml` — entrada `accion` = `desplegar` (pasa CI y publica `main`; hace `pg_dump` previo y guarda `cne:anterior`) o `revertir` (vuelve a la imagen anterior).
  - `verificar-sitios.yml` — comprueba desde fuera `madrid.consulado.app` y que `recordatorio.consulado.app` sigue bien. **Ejecutarlo tras cada despliegue**.
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

- Acta = «Comprobante de pago», **modelo provisional** hasta que haya plantilla oficial. La entrega del 20-11 registra la referencia USD y el importe entregado en EUR por separado.
- Rótulo de credencial: **el que traiga el Excel** (si usa M/F: M = masculino, F = femenino, con aviso).
- WhatsApp: mismo despliegue de Evolution API de consulares, **línea propia `cne-madrid`** vinculada desde `/superadmin/envios`. Envío real **apagado** hasta que la superadmin lo encienda escribiendo `ENVIO REAL`; 20–45 s entre mensajes y pausa tras 5 fallos. La decisión del 21-11 quita el horario y el cupo diario de ambos canales.
- Puerta: segundo escaneo **amarillo**, decide el operador («Dejar pasar»); rojo = desconocida o **dada de baja**.
- Cada junta necesita **presidente, secretario y vocal**; verde solo con los tres. Orden para cubrir: suplente de la misma junta (automático, editable) → misma zona → zona más cercana (orden deducido del plano) → **votante incorporado** por el centro de mando, uno por uno.
- Traslado cuenta **al aceptarlo**. «No viable» saca a la persona de las propuestas hasta reactivarla. El sistema propone, **decide siempre el coordinador**.
- Finanzas: aviso no bloqueante si otro puesto tiene abierta la misma ficha. Imprimir **no** confirma el pago.
- Fotos de cédula: se guardan hasta que la superadmin las borre (`BORRAR FOTOS`).
- Producción directa, sin entorno de ensayo: se ensaya en **modo prueba** y luego «Borrar datos de prueba y preparar para elección».

## 7. Pendiente

### De Pablo (insumos y decisiones)
1. **Excel nominativo de MJRV.** El 21-11 a las 09:02 de Madrid había 283 fichas reales activas con rótulo. Contrastar el padrón cargado con el Excel definitivo antes del lote. [Comprobación en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44882964931)
2. Decisión abierta **P-10**: ¿el traslado debe confirmarse cuando la persona llega físicamente? (hoy cuenta al aceptar).
3. Confirmar el **orden de cercanía de zonas** (hoy: deducido del plano) y la **distribución del QR de documentos** (hoy: cartel + enlace en el mensaje).

### Técnico (para la siguiente IA)
1. **Ensayo con dispositivos reales:** cámara y lector QR en el móvil del puesto, impresión a tamaño real de credenciales y recibo A4, y entrega de un mensaje controlado si se autoriza la prueba. Las verificaciones de esta entrega emplearon datos ficticios y cámara emulada.
2. **Vulnerabilidad alta** que reporta `npm audit` en una dependencia: revisar y corregir antes del 29-11 sin romper la compilación.
3. **Respaldo de «Preparar elección»** queda en `/tmp` del contenedor (se pierde al reiniciar); la copia válida es la que se descarga. Valorar montarlo en `/home/ubuntu/cne/backups`.
4. Copias externas: las diarias quedan solo en la VM; valorar copia cifrada fuera (R2 ya se usa en teinvito).
5. La noche del 28-11: comprobar que no queda actividad de prueba, ejecutar «Borrar datos de prueba y preparar para elección», descargar el respaldo y verificar el modo elección.

## 8. Documentos entregados a Pablo (no versionados, generados en la conversación)

- Memorando, ERS y descripción funcional del tablero DGSMH y portal consular (ya fuera de alcance).
- «Sistema operativo de Madrid» (4 páginas) e infografía **«Así funciona el sistema de Madrid»** (2 páginas, vigente): tres funciones principales, recorrido, tres cargos por junta, cómo se completa una junta, pago.

## 9. Traspaso a Codex (19-11-2026) — historial de la estética DEMP

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


## 10. Entrega de credenciales y pagos (19-11-2026)

- **Integrado en GitHub.** `main` incorporó `4e5a60b`, con los envíos, la impresión y el circuito de pagos en EUR. Pasaron 1.033 pruebas locales en Node 22, la comprobación de tipos, la compilación y el [CI de main](https://github.com/pabloun2025/CNE/actions/runs/44629945951).
- **Producción.** El [despliegue en Oracle del 20-11-2026](https://github.com/pabloun2025/CNE/actions/runs/44678378168) terminó correctamente para `0081339`, que incluye la entrega y el traspaso. El flujo pasó el CI y la verificación de salud de CNE desde la red compartida.
- **Comprobación pública posterior.** El 20-11-2026 volvieron a funcionar el acceso a GitHub Actions y las consultas a los sitios publicados. La comprobación pública más reciente confirmó la versión posterior `1e4dba0`.
- **Comprobaciones operativas.** En Superadministración → Envíos, vincular el teléfono de CNE a la instancia `cne-madrid` de Evolution y verificar el remitente de Brevo. En Credenciales, se puede enviar desde una ficha o por junta, zona, todas las fichas activas o selección manual, por uno o ambos canales. Probar una hoja A4 con hasta 10 tarjetas de 54 × 85,6 mm a tamaño real (100 %) y comprobar el corte y el QR. Las pruebas de la entrega usaron datos sintéticos y envíos simulados.
- **Finanzas.** La configuración y el acta emplean el importe fijo en EUR. Los informes indican cuántos pagos confirmados históricos carecen de importe EUR. El total suma los importes registrados.


## 11. Búsqueda de recibos y enlaces de estación (20-11-2026)

- En **Finanzas → Recibos**, las cuentas de financiero y cónsul pueden buscar por nombre, cédula o número y descargar el PDF aunque ya exista un pago confirmado. El estado de pago corresponde al acta asociada a la confirmación. Se mantiene el modo vigente y se registra la descarga en auditoría.
- Los recibos nuevos guardan cifrada la primera página, sin las fotografías del anexo. Las firmas antiguas pueden encontrarse por nombre, cédula o referencia `FIRMA-…`. Las actas antiguas sin PDF se descargan como copias reconstruidas y advierten que usan datos de identidad de la ficha actual.
- En **Operadores → Enlaces de estación**, el cónsul puede copiar el enlace activo o preparar el mensaje en WhatsApp y elegir allí el destinatario. El mensaje contiene el enlace de estación y la indicación de usar el PIN asignado.
- **Emitir en contingencia** permite elegir una ficha o un lote de hasta 100 por nombre o junta, sin aportar fotos ni pasar por validación de cédula. Se requiere el importe en EUR y el firmante configurados para emitir un recibo nuevo. La emisión y la reimpresión dejan intactos la validación y la confirmación del pago.
- Cada ficha tiene un recibo principal por modo. Reimprimir conserva el número y el importe original. Los documentos históricos conservan su número y se pueden consultar. Si hay varios, el principal es el asociado al pago o el primero con importe EUR registrado. Un recibo histórico sin importe y sin pago se puede completar con el EUR configurado, conservando su número.
- La primera parte de la entrega es `74f3653`. Pasaron 1.056 pruebas en Node 22, tipos y compilación. Se comprobaron a 375 px la descarga, la emisión en lote, la copia al portapapeles y el texto de WhatsApp.
- El [despliegue de `1e4dba0`](https://github.com/pabloun2025/CNE/actions/runs/44687366846) aplicó el archivo de recibos y la regla de numeración única. Si se revierte a una imagen anterior tras las migraciones, sus intentos de insertar otro recibo para la misma ficha quedan bloqueados por el índice.

## 12. Operación y entrega del 20-11-2026

- **Oracle.** El despliegue de `6f18158` terminó correctamente y el endpoint público `/api/salud` devolvió esa versión y `base: ok`. [Despliegue en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44692116977)
- **Evolution.** La comprobación desde el contenedor de CNE confirmó que usa la API real y que la consulta de `cne-madrid` devuelve 404. La instancia se crea al pulsar «Vincular teléfono». La inspección registra solo los códigos HTTP y el estado, y comprobó que hay una cuenta de superadministración activa. [Inspección de Oracle](https://github.com/pabloun2025/CNE/actions/runs/44690016520)
- **Vinculación.** En la versión desplegada, abra [Superadministración → Envíos](https://madrid.consulado.app/superadmin/envios#whatsapp) en una pantalla distinta del teléfono. Pulse «Vincular teléfono» y escanee el QR desde WhatsApp → Dispositivos vinculados → Vincular un dispositivo. Tras confirmar «Vinculada», la superadministración puede habilitar el envío real con la frase `ENVIO REAL` cuando corresponda.

### Entrega publicada en Oracle

- **Commit de código:** `d6e2e96` en `main`.
- **Configuración → Envío de credenciales.** El cónsul puede consultar Evolution, vincular el móvil mediante QR y desvincularlo desde su propia sesión. Superadministración gestiona la activación de los envíos reales y el remitente de Brevo. Los estados de la API, del móvil y del envío aparecen por separado.
- **Puerta.** Ingreso manual por cédula con teclado numérico. Si la credencial capturada carece de QR, se busca primero la cédula y después los nombres y apellidos cuando es necesario. El operador confirma la coincidencia única. Un caso ambiguo requiere comprobar la identidad. El modelo de reconocimiento en español va incluido en la aplicación.
- **Credenciales.** Una lista con selección individual, múltiple o todas las coincidencias permite enviar por correo, WhatsApp o ambos y descargar un PDF, un ZIP de PDF individuales o las planchas A4. El cónsul ajusta las medidas en Configuración. Con 54 × 85,6 mm caben 11 piezas por A4 apaisado. Las planchas comparan orientaciones y filas y muestran líneas de corte. Imprima al 100 %.
- **Correo institucional de credenciales (`2083d1c`).** Los envíos individuales y en lote por Brevo usan el asunto «Su credencial de MJRV», adjuntan el PDF y destacan que puede guardarse en el móvil para mostrar el QR en puerta. La plantilla ofrece HTML y texto plano y conserva el enlace al formulario de la cédula si está configurado. Pasaron 1.121 pruebas, TypeScript y la compilación. Se revisó el HTML en Chromium a 375 y 1024 px y se comprobó el contenido de la petición a Brevo con un proveedor simulado.
- **Recibos.** Finanzas y cónsul pueden buscar y descargar uno o todos los comprobantes seleccionados en PDF o ZIP. Las copias conservan el número, los valores registrados y los importes históricos ausentes. Si un acta histórica sin pago sigue pendiente de completar en EUR, el flujo de emisión ofrece una acción explícita que conserva el número. Finanzas configura EUR entregados y la referencia USD como valores independientes. Hasta que se configure USD, su referencia queda pendiente. El total pagado se calcula en EUR.
- **Centro de mando e informes.** Pantalla completa para 95 juntas y acceso al detalle desde cada junta. Los enlaces de estación usan botones de icono con etiquetas accesibles. El informe de cierre exporta en PDF o Excel las columnas elegidas por Finanzas y excluye fotos de cédula.
- **Validación.** Pasaron 1.119 pruebas en Node 22, TypeScript y la compilación de producción. ESLint registró cero errores y una advertencia preexistente en el script de Unslop. En Chromium a 375 px se probaron puerta con vídeo sintético, el QR de vinculación, la selección y las descargas de credenciales y recibos, los informes y la copia de enlaces. El centro de mando también se comprobó en horizontal y en pantalla completa nativa de escritorio.
- **Despliegue.** Oracle publicó `232b97b`; `/api/salud` devolvió la versión y `base: ok`. La prueba de migración conservó el importe EUR anterior. Quedan pendientes el escaneo con el móvil de WhatsApp, una prueba con la cámara física de puerta y una impresión a tamaño real. [Despliegue en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44760633108)

### Estado de los canales y revisión de captura (20-11-2026)

- **Brevo.** Se configuró el nombre visible «Consulado General del Ecuador en Madrid» sobre el remitente ya verificado. La comprobación del proveedor quedó en verde. El envío real sigue apagado. [Configuración en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44763512229)
- **WhatsApp.** Evolution responde. `cne-madrid` necesita vincular el teléfono mediante QR desde Configuración → WhatsApp. Una vez vinculada, Superadministración puede encender el envío real. La inspección registró cero mensajes reales en cola en ambos canales. [Inspección en Oracle](https://github.com/pabloun2025/CNE/actions/runs/44763260590)
- **Captura de cédula.** En Chromium con cámara emulada se reprodujo la pantalla negra al pulsar «Repetir». Se vuelve a crear el elemento de vídeo sin reasignarle el flujo. El paso directo de anverso a reverso en el formulario público sí se completó en esa prueba. Finanzas reutiliza el mismo componente al cambiar de cara. La simplificación del flujo está pendiente de las decisiones del usuario.

## 13. Circuito de los tres puestos de Madrid

- **Código.** `85d370b` en `main`.
- **Móvil.** Los enlaces activos de Puerta, Documentación y Escaneo de Finanzas abren directamente el puesto correspondiente. El escáner financiero envía la ficha a Revisión. Caja y los documentos financieros requieren una cuenta autorizada. Mando por enlace conserva su identificación.
- **Revisión y Caja.** En Finanzas → Revisar e imprimir se abre una ficha recibida desde el móvil o se busca por cédula. La captura manual conserva la señal después de «Repetir» y al pasar al reverso. El control de validación distingue prueba de elección y vuelve a pedir revisión si se sustituye una foto. En Caja se confirma cada desembolso después de la firma física y la entrega del efectivo. Los recibos de contingencia quedan pendientes hasta completar la documentación.
- **Recibo.** El formato FO-04 se imprime en una hoja A4 apaisada, con ambas caras de la cédula al pie. La primera emisión definitiva reserva un ordinal. Los números 1–190 llevan 58,82 EUR y los números 191–285 llevan 58,83 EUR, con referencia de 70,00 USD y cambio de 1,190. El total teórico es 16.764,65 EUR. Un impreso sin desembolso conserva el ordinal, el importe y el número. Las copias anteriores siguen consultables con sus referencias históricas.
- **Descargas.** Las listas de MJRV, credenciales y recibos permiten seleccionar una, varias o todas las coincidencias aptas. Las descargas individuales son PDF y las múltiples son ZIP con un PDF por persona. Las planchas permiten imprimir en conjunto. Los recibos nuevos pueden incluir las fotos vigentes al solicitar el anexo desde Finanzas.
- **Superadministración.** Gestiona cuentas, enlaces, firmante, medidas de credenciales, formulario de documentos y envíos. El cónsul puede distribuir enlaces existentes. Coordinación abre solo Mando.
- **Comprobaciones.** Pasaron 1.033 pruebas, TypeScript y la compilación. Chromium a 375 px comprobó el escaneo, la impresión A4, los ordinales 190 y 191, Caja con dos cuentas y la transición de la cámara al reverso. La migración sobre el esquema desplegado conservó los recibos históricos y la serie nueva empezó en cero.
- **Canales reales.** Oracle confirmó que WhatsApp ya está vinculado y activo y que Brevo ya está verificado y activo. La comprobación consultó los proveedores y el estado de los interruptores. [Verificación de canales](https://github.com/pabloun2025/CNE/actions/runs/44840955032)
- **Producción `4e73cb9`.** El despliegue pasó CI y aplicó las tres migraciones. El servicio publicó la versión esperada con base sana. El firmante estaba configurado y ambos canales siguieron activos después de migrar. El sitio compartido de Recordatorio respondió. [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44841286550) · [Comprobación pública](https://github.com/pabloun2025/CNE/actions/runs/44841704468) · [Comprobación de Oracle](https://github.com/pabloun2025/CNE/actions/runs/44841710769)
- **Puestos.** Se confirmaron los enlaces existentes de Puerta y Escaneo de Finanzas. Se creó y verificó el enlace de Documentación. El cónsul puede compartir los tres desde Operadores y enlaces. Las dos pantallas de escritorio están en Revisar e imprimir y Caja. [Verificación de Documentación](https://github.com/pabloun2025/CNE/actions/runs/44841835248)

## 14. Gestión de MJRV y acceso de superadministración (21-11-2026)

- **Selección y borrado.** La lista MJRV abre en «Todos los estados». Marque una ficha, varias o todas las coincidencias de los filtros. Para borrar el padrón cargado, quite los filtros, marque todas y confirme en «Borrar selección». Se detallan las fichas que conservan pagos, recibos emitidos, cargos en juntas constituidas u otra actividad que impide el borrado. El borrado conserva las revocaciones y el cómputo de la cola sin identificar a los destinatarios de los envíos eliminados.
- **Descarga y reenvío.** Una ficha activa con rótulo genera un PDF. Varias generan un ZIP con un PDF por ficha. Los nombres usan la junta de origen y la cédula con ceros iniciales, por ejemplo `H1-0000000901.pdf`. Seleccione WhatsApp, correo o ambos. Marque «Reenviar también las ya enviadas» para repetir el envío. La cola conserva el historial y evita encolar dos intentos por ficha y canal.
- **Impresión.** En «Imprimir planchas A4», seleccione las credenciales y abra las planchas. Imprima a tamaño real (100 %) y recorte por las guías punteadas. Las medidas se administran desde Superadministración. [Pantalla de impresión](https://madrid.consulado.app/admin/credenciales/imprimir)
- **Verificación.** Pasaron 1.048 pruebas, TypeScript y la compilación. ESLint registró cero errores y una advertencia preexistente en Unslop. En Chromium a 375 px se probaron la selección, el PDF, el ZIP, el reenvío simulado, el A4 y el borrado con fichas ficticias. El despliegue aplicó una migración y publicó `7251e36` con base sana. Las pruebas de borrado y envío se ejecutaron en local. [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44881590468) · [Comprobación pública](https://github.com/pabloun2025/CNE/actions/runs/44881833613)
- **Superadministración.** Se creó una segunda cuenta activa con cambio de contraseña obligatorio y se comprobó su estado tras el despliegue. Las acciones antiguas de recuperación y renombrado exigen una sola cuenta activa. Para intervenir a partir de ahora, identifique la cuenta concreta. [Diagnóstico posterior al despliegue](https://github.com/pabloun2025/CNE/actions/runs/44881833733)

## 15. Seguimiento de envíos, cadencia y lector de puerta (21-11-2026)

- **Estado por ficha.** En Credenciales → Seguimiento de envíos, el cónsul puede filtrar las fichas reales activas por canal, estado, nombre, cédula o junta. Se muestra el último intento real de cada canal. WhatsApp informa la aceptación de Evolution. Brevo informa aceptación, entrega, diferido, rebote o bloqueo. [Seguimiento de envíos](https://madrid.consulado.app/admin/credenciales/envios)
- **Brevo.** Está registrado el webhook transaccional de CNE con autenticación. El endpoint público responde 401 sin su credencial. Se recuperó el historial por el identificador de mensaje porque Brevo omitió los resultados al filtrar por etiqueta. La revisión de las 09:19 de Madrid encontró un correo entregado y un WhatsApp aceptado entre las fichas reales activas. En la instalación se consultó el historial existente y se comprobó el endpoint autenticado con una petición sin mensaje. La primera notificación automática de un envío posterior queda por verificar. [Registro y conciliación](https://github.com/pabloun2025/CNE/actions/runs/44884345350)
- **Cola.** Ambos canales pueden procesar envíos todo el día y sin cupo diario en CNE. La aplicación programa una espera aleatoria de 20 a 45 segundos para WhatsApp. El correo procesa su cola sin esa espera.
- **Puerta.** El lector se pausa al mostrar el resultado. Un QR que sigue visible se ignora hasta que salga del recuadro o aparezca otro. En Chromium a 375 px, con vídeo sintético, se confirmó una credencial sin QR por cédula, se mantuvo un QR fijo sin volver a registrar y se leyó el siguiente. La comprobación en el teléfono físico de puerta sigue pendiente.
- **Producción.** `d56246e` en Oracle. Pasaron 1.059 pruebas, TypeScript y compilación. ESLint registró cero errores y una advertencia previa de Unslop. [Despliegue](https://github.com/pabloun2025/CNE/actions/runs/44883891048) · [Comprobación pública](https://github.com/pabloun2025/CNE/actions/runs/44884174544)

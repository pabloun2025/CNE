# Especificación funcional — Proyecto CNE

Fecha de este texto: 17 de noviembre de 2026. Sirve para que otra IA siga la entrevista con Pablo Martínez y la definición funcional. No es código y no autoriza a construir.

Cada afirmación lleva una marca:

- **DECIDIDO.** Pablo lo cerró. No lo reabras.
- **ABIERTO.** No está cerrado. No lo conviertas en decisión, no lo rellenes y no lo presentes como opción ya elegida.

---

## Cómo continuar

**DECIDIDO.** Pablo Martínez habla español. Él enuncia las ideas. Tú respondes con una sola decisión por turno, en opciones con letra: A, B, C, o «otro» más la explicación que él escriba. En este chat no hay botones: él contesta con la letra. No escribas código de aplicación hasta que él lo pida de forma explícita. Cuando pida construir, el primer entregable es un handover completo para que Claude o Codex construyan.

**DECIDIDO.** Tras cada decisión que se cierre, actualiza el archivo de instrucciones del repositorio privado, rama `main`:

https://github.com/pabloun2025/CNE/blob/main/INSTRUCCIONES.md

**DECIDIDO.** La lista completa de recintos, consulados y países la dará Pablo más adelante. No la inventes, no la completes con fuentes públicas y no la des por cargada.

**DECIDIDO.** La pregunta vigente, la única que toca hacer ahora, es el desplegable de incidentes. La forma ya está cerrada (ver más abajo). Los ítems no. Hay un borrador más corto en `/cursor/stores/bc-acf7ef21-9c48-4731-8961-32ff7ce5360b/internal/incidentes.md`. Pablo no lo aceptó. No lo copies a esta especificación, no lo ofrezcas como lista cerrada y no lo trates como la respuesta.

**DECIDIDO.** El orden de la entrevista que sigue está en «Cola de preguntas abiertas». Una pregunta por turno. No adelantes la cola. No respondas tú las preguntas abiertas.

---

## Propósito

**DECIDIDO.** El Proyecto CNE apoya el seguimiento del proceso electoral del Ecuador del 29 de noviembre de 2026 en el exterior.

**DECIDIDO.** La audiencia del producto son todos los consulados ecuatorianos en el exterior, que entran y reportan el proceso, y la Dirección de Gestión de Servicios de Movilidad Humana (DGSMH), que los mira en un tablero aparte. Madrid usa ese mismo acceso de consulado y, además, un sistema interno propio. Son sistemas distintos.

**DECIDIDO.** El repositorio es privado: https://github.com/pabloun2025/CNE. No hay código de aplicación hasta que Pablo lo pida.

**ABIERTO.** El catálogo operativo de recintos, consulados y países. Las cifras públicas leídas (más abajo) no son ese catálogo.

---

## Tres sistemas

Son tres. No los mezcles en una sola pantalla ni en un solo modelo de usuario.

### 1. Reporte del consulado

**DECIDIDO.** Cada consulado, Madrid incluido, entra con usuario de consulado y carga el avance de su proceso: inicio, incidentes, votantes, cierre, inicio y fin de escrutinio, inicio y fin de escaneo, y cierre del proceso.

**DECIDIDO.** El consulado pequeño carga junta por junta. El consulado grande (Madrid, 95 juntas) tiene varias personas cargando la misma sección a la vez, con el mismo usuario de consulado, en varios teléfonos.

### 2. Tablero de la DGSMH

**DECIDIDO.** Es otro sistema, separado de las herramientas internas de Madrid. La DGSMH ve un mapa del mundo que se enciende y se apaga según la hora local de cada lugar, y el avance que los consulados van cargando.

**ABIERTO.** Todo lo demás del tablero, después del desplegable de incidentes: quién puede editar una fase cerrada, correcciones, fuente de los husos, y qué significa «cierre del proceso» frente a escrutinio y escaneo. Está en la cola. No lo resuelvas aquí.

### 3. Sistema interno de Madrid

**DECIDIDO.** Solo Madrid. Credenciales de los miembros de las juntas receptoras del voto (MJRV), puerta, fotos de la cédula, pago y constitución de juntas en vivo. Lo usa la misma cuenta de consulado con la que Madrid reporta. No es el tablero de la DGSMH.

**DECIDIDO.** El personal de puerta no tiene cuenta.

---

## Actores

| Actor | Cuenta | Dónde actúa | Estado |
| --- | --- | --- | --- |
| Consulado (cada oficina en el exterior, Madrid incluido) | Sí. Rol `consulado`. Correo y contraseña. | Reporte del proceso. Madrid, además, opera el sistema interno. | **DECIDIDO.** |
| Superadmin | Sí. Rol `superadmin`. | Sube el Excel de cuentas (usuario, email, contraseña inicial) y envía esas credenciales por fuera del sistema. | **DECIDIDO.** |
| DGSMH | No hay un tercer rol de cuenta descrito para el tablero. | Mira el tablero. Quién entra a ese tablero no está cerrado. | **ABIERTO.** No inventes un rol. |
| Funcionario de puerta en Madrid | No. | Abre el enlace de puerta. Se identifica con nombre, apellido y PIN. El administrador de Madrid los carga. El PIN lo identifica en todo punto del sistema que necesite saber quién actúa. | **DECIDIDO.** |
| MJRV | No. | Lleva la credencial. En la página de datos personales escribe su cédula. Puede tomarse la foto de la cédula, o la toma un funcionario. | **DECIDIDO.** |
| Coordinador del recinto de Madrid | No se le ha dado una cuenta distinta. | Tiene el visor de constitución y un radio. Acepta, pasa o descarta el movimiento que propone la IA. | **DECIDIDO.** el visor y el radio. **ABIERTO.** si ese coordinador es la misma cuenta `consulado` de Madrid o solo usa el visor. No abras esta pregunta antes de la cola. |
| Elector en el exterior | No. | Vota en la zona consular. No es usuario del sistema. | **DECIDIDO.** |

**DECIDIDO.** Solo hay dos roles de cuenta: `consulado` y `superadmin`. No hay rol de puerta, ni de funcionario, ni de cónsul, ni de centro de impresión.

---

## Calendario y proceso electoral

### Qué elección es

**DECIDIDO.** El domingo 29 de noviembre de 2026 se celebran las Elecciones Seccionales y la elección de consejeras y consejeros del Consejo de Participación Ciudadana y Control Social (CPCCS) 2027, periodo 2027–2031.

**DECIDIDO.** En el Ecuador se elige el conjunto de dignidades seccionales y los 7 miembros del CPCCS. En el exterior el voto es presencial y solo para esos 7 miembros del CPCCS, en las zonas consulares. Cada elector del exterior recibe tres papeletas.

**DECIDIDO.** Esas tres papeletas, según la convocatoria leída, son: tres candidatas de la lista de mujeres, tres candidatos de la lista de hombres, y una de pueblos y nacionalidades indígenas, afroecuatorianos o montubios y ecuatorianos en el exterior. No eligen prefectos, alcaldes ni juntas parroquiales.

**DECIDIDO.** Dirigen el CNE y, en el exterior, la Junta Especial del Exterior. La Cancillería apoya. Las Fuerzas Armadas custodian el material dentro del Ecuador. En el exterior las juntas no tienen las funciones de Fuerzas Armadas ni de Policía.

### Fases del CNE

**DECIDIDO.** El CNE nombra cuatro fases, en este orden: instalación, sufragio, escrutinio, embalaje.

**DECIDIDO.** Esas cuatro fases no son, por sí solas, la lista de marcas que el consulado carga en el reporte. El reporte tiene sus propios hitos (inicio, incidentes, votantes, cierre, escrutinio, escaneo, cierre del proceso). No los fusiones ni renombres.

### Horas

**DECIDIDO.** En el Ecuador: instalación a las 06:30, sufragio de 07:00 a 17:00.

**DECIDIDO.** En el exterior: instalación a las 08:30, sufragio de 09:00 a 19:00, hora local de cada lugar.

**DECIDIDO.** Quien está en la fila a la hora de cierre no vota.

**DECIDIDO.** En los manuales de juntas de género del consulado, el día se reparte así: instalación de 08:30 a 09:00, votación de 09:00 a 19:00, escrutinio desde las 19:00, y embalaje. Una junta de género tiene una urna y dos biombos. El cónsul sella el sobre amarillo T1 sobre el paquete y lo envía por valija diplomática.

**ABIERTO.** No está pedido un horario distinto por consulado. El reglamento permite al Pleno cambiar la hora de una junta del exterior por fuerza mayor; no se leyó una resolución de este proceso que lo haga. No lo conviertas en parámetro del sistema.

El instructivo del país describe un arreglo a las 07:30 si la junta nacional no quedó instalada a las 07:00. Pablo no lo incorporó. No es regla de este sistema.

### Días alrededor del 29

**DECIDIDO.**

| Actividad | Fecha |
| --- | --- |
| Voto de personas privadas de libertad (PPL) | jueves 26 de noviembre de 2026 |
| Voto en casa | viernes 27 de noviembre de 2026 |
| Silencio electoral | viernes 27 al domingo 29 de noviembre de 2026 |
| Sufragio general | domingo 29 de noviembre de 2026 |
| Escrutinio de las juntas provinciales electorales (JPE) y de la Junta Especial del Exterior | lunes 30 de noviembre al miércoles 9 de diciembre de 2026 |

**ABIERTO.** Hora de inicio y de cierre del voto PPL y del voto en casa: no están publicadas y Pablo no las fijó. El producto reporta la jornada del exterior, no esas dos modalidades.

### Contexto público que no es catálogo

Estas cifras se leyeron en notas del CNE. No son la lista que Pablo va a entregar. No las cargues como datos del sistema.

- Convocatoria: 13.827.643 electores en el conjunto del proceso.
- En el exterior: 486.414 habilitados de 496.308 inscritos, tras suspender Caracas, Valencia (Venezuela) y La Habana (Cuba).
- Recintos publicados: 4.399 en el país y 93 en el exterior.

**ABIERTO.** La lista real de recintos, consulados y países del sistema.

### Referencia de papel que no es alcance de software

El instructivo de juntas de género del Referéndum y Consulta Popular 2025 (ejemplos impresos del Consulado del Ecuador en Madrid, 16 de noviembre de 2025) describe el trabajo de mesa: armar la urna, dos biombos, sobres P1, P2, P3 y T1, actas, y el envío del T1 en valija. De ahí salen las horas, la urna, los dos biombos y el sello del T1, ya marcados como **DECIDIDO.**

La clasificación de papeletas de ese instructivo (blanco, nulo, SÍ, NO, plancha) es del referéndum de 2025. No define el escrutinio de las tres papeletas del CPCCS de 2026. El sistema no sustituye el acta electoral de papel. El acta formal que sí imprime el sistema interno de Madrid es el acta de pago, y su plantilla sigue **ABIERTA.**

El manual operativo de Madrid (Caja Mágica, 29 de noviembre de 2026) fija espacios, números y colores de las juntas. No define el movimiento de suplentes. También nombra coordinadores, mesas de información y turnos de comida. Eso no es requisito del sistema.

---

## Flujos decididos

### Acceso del consulado (Madrid incluido)

**DECIDIDO.** Correo y contraseña, la misma idea que la aplicación de consulares ya existente. El repositorio de consulares no se encuestó. No des por leídas sus pantallas, rutas ni reglas. «Como consulares» significa solo: entrar con correo y contraseña.

**DECIDIDO.** Dos roles de cuenta, y nada más: `consulado` y `superadmin`.

**DECIDIDO.** El superadmin sube un Excel con usuario, email y contraseña inicial, y envía esas credenciales por fuera del sistema. El primer ingreso obliga a cambiar la contraseña y, mientras no se cambie, no deja seguir.

**DECIDIDO.** El patrón de acceso que se reutiliza es el login de DEMP, no el producto DEMP. Hechos del patrón que sí se toman:

- Aplicación de personal (el acceso público de DEMP no forma parte de CNE).
- `POST /api/login`.
- Token bearer UUID guardado en `sessionStorage`.
- En la tabla de sesión se guarda el SHA-256 del token, no el token.
- Sesión absoluta de 12 horas: no se alarga por usar el sistema.
- El rol sale del tipo de cuenta. En CNE ese tipo es solo `consulado` o `superadmin`.
- Contraseña de 8 a 72 caracteres, con una mayúscula, un dígito y un símbolo.
- Límite de 30 intentos por IP cada 15 minutos.
- Bloqueo progresivo de 1, 5, 15 y 60 minutos al llegar a 5, 8, 11 y 14 fallos por el par correo+IP en una hora.
- El login no lleva Turnstile. En DEMP, Turnstile está en la consulta pública, el alta y el olvido, no en el login.

**DECIDIDO.** No se copia a ciegas el resto de DEMP. En particular no se copia:

- El alta pública ni la cola de cuentas `PENDING` pendientes de aprobación. En CNE la cuenta nace del Excel del superadmin.
- Los perfiles y roles de DEMP (`FUNCIONARIO`, `CONSUL`, `SUPERADMIN`, `CONSULATE`, `PRINT_CENTER`) y su lista de funciones por oficina.
- El segundo factor TOTP, obligatorio en DEMP para el superadministrador.
- Turnstile en el login.
- La recuperación de contraseña. En DEMP existe (enlace de un solo uso, 30 minutos). Aquí se ofreció y no se eligió: sigue **ABIERTA**, no está rechazada para siempre ni está construida.

### Reporte que carga el consulado

**DECIDIDO.** Cada lugar registra estos hitos: inicio, incidentes, votantes, cierre, inicio de escrutinio, fin de escrutinio, inicio de escaneo, fin de escaneo, y cierre del proceso.

**DECIDIDO.** En votantes, cada reporte elige una de dos vías: el conteo de firmas del padrón, o una estimación. No hay una tercera vía dicha.

**DECIDIDO.** Consulado pequeño: la carga es junta por junta. Consulado grande, con Madrid y sus 95 juntas como caso: varias personas cargan la misma sección a la vez, mismo usuario de consulado, varios teléfonos.

**DECIDIDO.** Incidentes: Pablo rechazó ítems vagos y rechazó «lluvia» y el clima. Quiere un desplegable corto por fase, con hechos concretos que detienen o dañan esa fase, más «otro» con texto libre.

**ABIERTO.** Los ítems de ese desplegable, y el reparto exacto de fases del desplegable. Es la pregunta vigente. No incluyas ninguna lista de incidentes como decidida.

**ABIERTO.** Quién puede corregir un hito ya cerrado, y el significado preciso de «cierre del proceso» frente al fin de escrutinio y al fin de escaneo. Van después en la cola.

### Tablero de la DGSMH

**DECIDIDO.** Mapa del mundo. Cada lugar se enciende y se apaga según su hora local.

**DECIDIDO.** Muestra el avance que cargan los consulados. No muestra la puerta, las credenciales, los pagos ni la constitución de juntas de Madrid.

**ABIERTO.** La fuente de los husos horarios. No elijas una zona IANA, un servicio ni una tabla a mano.

**ABIERTO.** Quién abre el tablero, quién edita una fase cerrada y cómo se corrige un dato. Cola, después del desplegable.

### Credenciales de Madrid

**DECIDIDO.** Se preparan antes del proceso, en parametrización. El soporte es una credencial CR80 de 85,6 × 54 mm, para bolsillo de plástico y cordón.

**DECIDIDO.** El alta es un Excel más alta, edición y baja de una persona. El Excel trae nombre, apellido, cédula, rol (presidente, secretario, vocal, y los demás que vengan en el archivo), junta (serie de hombres o de mujeres), email y teléfono de WhatsApp.

**DECIDIDO.** Hay una plantilla PDF con un espacio en blanco al centro para los datos y el QR. Esa plantilla la aporta el proceso; no la dibujes.

**DECIDIDO.** Salidas: PDF individual, descarga, collage en A4 para imprimir y recortar, y envío de una en una por WhatsApp con Evolution API, por el método de teinvito. Si hay que mirar un envío ya hecho, se mira teinvito, no DEMP.

**DECIDIDO.** El QR impreso en la credencial es solo la cédula. Es único y predecible. Pablo lo aceptó. La puerta lee ese QR.

**DECIDIDO.** La página de datos personales usa otro QR, distinto, igual para todo el mundo. Ahí el MJRV escribe la cédula. No es el QR de la credencial.

**ABIERTO.** Si ese QR compartido de datos va en un cartel o en un mensaje de WhatsApp.

**DECIDIDO.** La foto de la cédula no sale en esta credencial. Va al acta de pago, en el momento del proceso.

### Puerta de Madrid

**DECIDIDO.** El mecanismo de enlace es el de teinvito. Una persona ya autenticada crea un enlace de puerta. El token sigue activo hasta que se revoca. Quien está en la puerta abre ese enlace y no inicia sesión.

**DECIDIDO.** Diferencia con teinvito, que hay que conservar: en teinvito el nombre que escribe el funcionario no se contrasta con una lista y solo queda en el teléfono. En Madrid el nombre sí se comprueba. El funcionario tiene nombre, apellido y PIN, cargados por el administrador de Madrid. El PIN lo identifica donde el sistema necesite saber quién actúa.

**DECIDIDO.** La lectura en puerta es el QR de la cédula impreso en la credencial.

**DECIDIDO.** Resultado en pantalla y en sonido:

- Válida: verde, texto «Válida», un pitido agudo.
- Desconocida, ya usada o bloqueada: rojo, dos pitidos graves.

**ABIERTO.** La regla que clasifica a una persona como bloqueada, y si una segunda lectura el mismo día es siempre «usada». El aviso visual de esos tres casos negativos sí está cerrado. No copies de teinvito la reentrada, la tarjeta de invitado, las listas blanca, negra y gris, ni la búsqueda manual del invitado: el QR de Madrid es la cédula, no un pase aleatorio.

**ABIERTO.** La lista de pantallas, además de la puerta, que piden el PIN. La regla de identificación sí está cerrada.

### Foto de la cédula

**DECIDIDO.** Se toma durante el proceso. La toma el MJRV o un funcionario. Hay un recuadro de cámara. La meta es el disparo automático cuando la cédula queda alineada. Hay recorte automático. Anverso y reverso quedan como anexo.

**DECIDIDO.** La impresión del acta de pago permanece deshabilitada hasta que existan las dos fotos.

**DECIDIDO.** Si el recorrido de la credencial llega incompleto a la ventanilla, la ventanilla de pago toma las fotos antes de seguir.

### Pago a los MJRV

**DECIDIDO.** Hay un solo monto en dólares para todos los MJRV. Es un parámetro del sistema. Se paga en euros. El administrador escribe el tipo de cambio del día y el nombre fijo del consulado que firma como quien paga.

**DECIDIDO.** El recibo es un acta formal. Lleva los datos completos de la persona, quién paga, el monto recibido, el monto entregado y las dos firmas (quien paga y la persona). Las fotos de la cédula van en la página siguiente.

**ABIERTO.** La plantilla de esa acta. Llegará después. No la inventes, no bocetes campos de más y no fijes tipografía, sellos ni numeración.

**ABIERTO.** La fórmula que une el parámetro en dólares, el tipo de cambio, el monto recibido y el monto entregado. No la supongas. No es la siguiente pregunta.

### Constitución de la junta y movimiento

**DECIDIDO.** Cada junta tiene 3 titulares: presidente, secretario y vocal, más suplentes. El paquete electoral no se abre sin 3 MJRV.

**DECIDIDO.** Regla ya confirmada para 2026, tomada de la guía de coordinadores de 2019: el primer hueco se llena con un suplente que sobre en la misma zona de color, y el cambio queda registrado.

**ABIERTO.** La misma guía fue leída con tres conteos, en este orden: misma zona, luego con apoyo, luego voluntarios capacitados. Pablo no confirmó el segundo ni el tercero para 2026. No fijes cifras ni actives esos dos conteos. El manual operativo de 2027 no define el movimiento de suplentes.

**DECIDIDO.** El coordinador del recinto tiene el visor y un radio. La IA —la que ya está instalada en teinvito— propone un solo movimiento. Él puede:

- Aceptar. La junta pasa a verde con una marca de movimiento, y se actualizan la composición de la junta y los pagos.
- Siguiente. Salta esa propuesta.
- No se puede, con uno de tres motivos: no contesta, no quiere, ya no está. Esa persona no se vuelve a proponer para ese hueco.

**DECIDIDO.** La cercanía física se usa solo para decidir el movimiento. No se dibuja como plano ni como volumen.

---

## Mapa de juntas de Madrid

**DECIDIDO.** No es un plano de planta ni un cubo. Cada junta es una ficha: número, H o M, relleno del color de su zona, y un aro de alerta vivo.

- Verde: hay 3 presentes.
- Ámbar: falta gente.
- Rojo: no hay nadie.

**DECIDIDO.** Aceptar un movimiento deja la junta en verde y le añade la marca de movimiento. El verde de «3 presentes» y la marca de movimiento conviven: la marca dice que hubo traslado.

**DECIDIDO.** Las fichas van en filas por color, en el orden físico. La numeración de la ficha sale de las tablas del manual operativo de 2027, desde la página 9. Cada serie cuenta sola. Hombres y mujeres vuelven a empezar en 1. La serie única 1–95 del plano no se imprime en la ficha.

**DECIDIDO.** Numeración de las fichas.

| Serie en la ficha | Tramo | Color | Cuántas |
| --- | --- | --- | --- |
| Hombres | 1–21 | Amarillo | 21 |
| Hombres | 22–41 | Azul | 20 |
| Mujeres | 1–8 | Rojo | 8 |
| Mujeres | 9–29 | Celeste | 21 |
| Mujeres | 30–39 | Verde | 10 |
| Mujeres | 40–54 | Rosado | 15 |
| **Total** | | | **95** (41 hombres y 54 mujeres) |

**DECIDIDO.** Lugar: nivel −2 de Caja Mágica. En los niveles 0 y −1 no hay juntas.

**DECIDIDO.** Orden de los bloques:

- Vial este, de norte a sur: amarillo, azul, rojo, celeste. Cada color en dos filas.
- Vial norte, de este a oeste: verde y después rosado, separados por una entrada.

**ABIERTO.** El orden de los iconos dentro de cada fila. En el plano no se lee qué número está en cada extremo. No asignes el extremo norte ni el sur.

**Leído en el plano, no reconfirmado junta por junta.** Los rótulos de fila usan la serie 1–95 del plano. Sirven para saber qué bloque está junto a cuál. La equivalencia con la ficha es la de la tabla de arriba (hombres 1–41 coinciden con el plano; mujeres 1–54 del plano son las juntas 42–95). No imprimas el número del plano en la ficha.

| Color | Filas leídas en el plano (serie 1–95, solo ubicación) | Equivalente en la ficha |
| --- | --- | --- |
| Amarillo | Dos filas: 11–21 hacia el vial este (11 iconos) y 1–10 hacia el interior (10) | Hombres 11–21 y 1–10 |
| Azul | 32–41 hacia el vial este (10) y 22–31 hacia el interior (10) | Hombres 32–41 y 22–31 |
| Rojo | 46–49 hacia el vial este (4) y 42–45 hacia el interior (4) | Mujeres 5–8 y 1–4 |
| Celeste | 60–70 hacia el vial este (11) y 50–59 hacia el interior (10) | Mujeres 19–29 y 9–18 |
| Verde | Columna 71–74 junto al vial norte (4) y 75–80 hacia el interior (6), separada del rosado por una entrada | Mujeres 30–33 y 34–39 |
| Rosado | 81–84 junto al vial norte (4); 85–86 inmediata al sur (2); 90–95 (6); 87–89 hacia el vial oeste (3) | Mujeres 40–43, 44–45, 49–54 y 46–48 |

**ABIERTO.** Si las filas 87–89 y 90–95 del plano (mujeres 46–48 y 49–54 en la ficha) son vecinas o las separa el espacio rotulado «JUGADORES». No lo decidas. No es la siguiente pregunta.

La dirección leída en el manual (Calle Camino de Perales 23, 28041 Madrid) no está cargada como dato del sistema.

---

## Mapa de reutilización

| Recurso | Qué se hace con él | Estado |
| --- | --- | --- |
| DEMP (`pabloun2025/demp`, acceso en `funcionario.consulado.app`) | Solo patrón de login: SPA de personal, `POST /api/login`, bearer UUID en `sessionStorage`, SHA-256 del token, sesión absoluta de 12 h, rol según el tipo de cuenta, contraseña 8–72 con mayúscula, dígito y símbolo, 30 intentos por IP cada 15 min, bloqueo 1/5/15/60 min a los 5/8/11/14 fallos por correo+IP cada hora. El login no lleva Turnstile. | **DECIDIDO.** como patrón. El producto DEMP no se copia. |
| Puerta de teinvito (`pabloun2025/teinvito`) | Enlace creado por quien ya entró, token vivo hasta revocarlo, página pública sin login, lectura de QR, verde «Válida» con un pitido agudo, rojo con dos pitidos graves. | **DECIDIDO.** el mecanismo. **DECIDIDO.** el cambio: Madrid sí comprueba nombre, apellido y PIN. |
| WhatsApp de teinvito | Envío uno a uno de la credencial con Evolution API, por el método que ya usa teinvito. Se prefiere teinvito frente a DEMP. | **DECIDIDO.** el canal y la preferencia. Los endpoints no se reespecifican en este texto: se leen en teinvito cuando haya que construir. |
| IA local de teinvito | La que ya está instalada. Propone un solo movimiento de suplente. Quien coordina acepta, pasa a la siguiente o marca «No se puede». | **DECIDIDO.** ese comportamiento. El modelo, el prompt y el despliegue no se reespecifican. |
| Supabase | Nombrado como recurso que ya existe. DEMP lo usa para sesiones y contraseñas. | **ABIERTO.** No está dicho que CNE lo use, ni para qué. |
| Oracle | Nombrado como recurso que ya existe. | **ABIERTO.** No está especificado. |
| IA local (como recurso, aparte del uso ya descrito en la constitución) | Nombrada como recurso que ya existe. | **ABIERTO.** No está especificado más allá de la propuesta de un movimiento. |
| App de consulares | Misma idea de correo y contraseña. | **DECIDIDO.** solo esa idea. El repositorio no se encuestó. |

---

## Lo que no se hace

**DECIDIDO.** No hay código de aplicación, esquema, pantalla ni handover de construcción hasta que Pablo lo pida con palabras explícitas. El primer entregable de construcción, cuando llegue, es un handover completo para Claude o Codex.

**DECIDIDO.** No se inventa la lista de recintos, consulados ni países.

**DECIDIDO.** No se cierra el desplegable de incidentes con el borrador ya escrito, ni con «lluvia», ni con ítems vagos.

**DECIDIDO.** No se inventa la plantilla del acta de pago ni la plantilla PDF de la credencial.

**DECIDIDO.** No se abre el paquete con menos de 3 MJRV.

**DECIDIDO.** No se numeran las fichas con la serie única 1–95 del plano.

**DECIDIDO.** No se trata el tablero de la DGSMH como si fuera la puerta, el pago o el mapa de juntas de Madrid.

**DECIDIDO.** No se da cuenta al personal de puerta.

**DECIDIDO.** No se copia el alta pública de DEMP, su TOTP obligatorio, sus roles de oficina ni su Turnstile de login.

**DECIDIDO.** No se aplica al CPCCS 2026 la clasificación de papeletas SÍ/NO del instructivo de género de 2025.

---

## Cola de preguntas abiertas

Haz solo la primera que siga abierta. Opciones A, B, C, o «otro» más la explicación de Pablo. Cuando él cierre una, márcala **DECIDIDO.** en este documento y actualiza `INSTRUCCIONES.md` en `main`. No respondas ninguna por tu cuenta.

1. **Pregunta vigente. Incidentes.** Desplegable corto por fase, de hechos concretos que detienen o dañan esa fase, más «otro» con texto libre. La forma está **DECIDIDA.** Los ítems están **ABIERTOS.** Pablo rechazó lo vago y rechazó el clima. El borrador de `internal/incidentes.md` no está aceptado.
2. **Plantilla del acta de pago.** Aún no existe. No la inventes.
3. **Lista completa de recintos, consulados y países.** La traerá Pablo. No la armes.
4. **QR compartido de datos personales.** Si va en un cartel o en un mensaje de WhatsApp. El QR de la credencial ya está cerrado: es la cédula.
5. **Recuperación de contraseña.** Se ofreció y no se eligió. Sigue abierta. No la des por descartada ni por incluida.
6. **Tablero DGSMH, y solo después del desplegable.** Pregúntalo de una en una, en este orden, sin contestar:
   - Quién puede editar una fase ya cerrada.
   - Cómo se corrige un dato.
   - De dónde salen los husos horarios del mapa.
   - Qué significa «cierre del proceso» frente al fin del escrutinio y al fin del escaneo.
7. **Conteos de suplentes de la guía de 2019.** El primero está **DECIDIDO.**: suplente que sobre en la misma zona de color, y el cambio queda registrado. El segundo (con apoyo) y el tercero (voluntarios capacitados) se leyeron y Pablo no los confirmó para 2026.

### Abiertos que no adelantan la cola

No los preguntes antes de cerrar la cola de arriba. Quedan escritos para no perderlos.

- **ABIERTO.** Orden de cada ficha dentro de su fila en el nivel −2.
- **ABIERTO.** Si mujeres 46–48 y 49–54 quedan separadas por el espacio «JUGADORES».
- **ABIERTO.** Fórmula entre el monto en dólares, el tipo de cambio del día, el monto recibido y el monto entregado.
- **ABIERTO.** Regla que deja a una cédula en «bloqueada», y si una segunda lectura es siempre «usada».
- **ABIERTO.** Qué pantallas, además de la puerta, piden el PIN.
- **ABIERTO.** Si quien usa el visor de constitución entra con la cuenta `consulado` de Madrid.
- **ABIERTO.** Quién inicia sesión en el tablero de la DGSMH. No hay un tercer rol decidido.
- **ABIERTO.** Uso de Supabase, de Oracle y de la IA local, más allá de la propuesta de un movimiento que ya hace la IA instalada en teinvito.
- **ABIERTO.** Horas del voto PPL y del voto en casa, y cualquier horario de consulado distinto de 08:30 y de 09:00–19:00 hora local.

---

## Aclaraciones de diseño posteriores al documento base — 17/11/2026

- **DECIDIDO.** La carga de incidentes es **por excepción**, no una lista de comprobación para responder junta por junta. Un incidente podrá afectar un recinto completo, una o varias JRV. Si corresponde a una junta, el formulario pedirá identificar la(s) junta(s) afectada(s), por selección múltiple. Evitar cargas repetitivas para consulados grandes.
- **ACLARACIÓN.** Pablo seleccionó inicialmente la opción A de incidentes de instalación («junta no conformada», «material electoral faltante o incorrecto», «acta de instalación no suscrita»), pero después solicitó rediseñar el enfoque de **todo** el catálogo porque algunas categorías no respondían bien a los documentos operativos. La lista integral sigue **ABIERTA**, no aceptada.
- **DECIDIDO.** Las preguntas de la entrevista no se limitarán a ratificar solicitudes: deben aportar criterio funcional, mostrar alternativas y consecuencias, e identificar problemas de diseño a partir de los objetivos del proyecto. Se abordarán las decisiones desde los resultados que necesita lograr cada sistema.
- **DECIDIDO.** El usuario no quiere descargas periódicas. Guardar discretamente los avances en un archivo persistente durante las conversaciones; no prometer trabajo en segundo plano. Preservar decisiones cerradas y pendientes.
- **ABIERTO.** Objetivo prioritario y criterio operativo de éxito del tablero DGSMH, antes de cerrar la taxonomía de incidentes; preguntar sin convertir en decidida ninguna opción. La solicitud actual de Pablo autoriza tratar primero esta cuestión de finalidad del producto.

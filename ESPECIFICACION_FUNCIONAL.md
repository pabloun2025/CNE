# Especificación funcional — Proyecto CNE

**Estado:** versión consolidada, 17 de noviembre de 2026.  
**Repositorio:** pabloun2025/CNE, rama main.  
**Objeto:** elección del 29 de noviembre de 2026 en el exterior; primera versión con los tres componentes completos.

Esta especificación reúne el documento original y las decisiones posteriores de la entrevista. Cuando exista una diferencia entre una definición histórica y una decisión posterior documentada aquí, **prevalece la decisión posterior**. Los apartados se identifican como **DECIDIDO**, **ABIERTO** o **PROPUESTA NO APROBADA**; las propuestas técnicas no son instrucciones para construir. No escribir código ni iniciar despliegues hasta que Pablo lo solicite expresamente. Al comenzar la construcción se prepara una entrega integral de instrucciones para el agente programador.

## 1. Propósito y alcance

**DECIDIDO.** El sistema tiene tres ámbitos funcionales separados, dentro de una sola aplicación web con infraestructura común y acceso por portales independientes:

1. **Reporte electoral consular:** cada oficina del Ecuador en el exterior, incluido Madrid, reporta avance, hitos, incidencias y votantes por sus recintos y JRV.
2. **Tablero DGSMH en Quito:** visualización internacional de avances por hora local, supervisión de hitos, alertas, coordinación de apoyo y seguimiento de incidencias.
3. **Sistema operativo de Madrid:** gestiona exclusivamente miembros de las juntas receptoras del voto (MJRV), credenciales, ingreso en puerta, conformación de JRV, propuesta y autorización de movimientos, fotografías de documentos y pagos.

**DECIDIDO.** La gestión operativa de Madrid es autónoma de la información que Madrid, como consulado, remite a Quito. Aunque se use un catálogo común y una misma infraestructura, **los eventos de puerta, movimientos, constitución operativa y pagos no actualizan automáticamente los hitos del tablero nacional**. Madrid envía sus reportes mediante el portal consular, como todos los demás.

**DECIDIDO.** Los tres componentes completos deben estar operativos para el 29-11-2026. La plataforma se diseña **solo para esta jornada**, sin módulos para configurar futuras elecciones. La entrega completa es un objetivo de alcance; su viabilidad debe validarse con pruebas e insumos pendientes.

**DECIDIDO.** Se trata de una aplicación 100 % web, adaptable a ordenador, móvil y tableta, sin aplicación nativa ni instalación obligatoria.

## 2. Usuarios, separación de portales y acceso

**DECIDIDO.** Los tres ámbitos tienen entradas, permisos y vistas administrativas aislados por servidor, no solo por ocultar menús. Se utilizará el dominio consulares.app con **subdominios distintos**. Los nombres cne.consulares.app (reportes consulares), control.consulares.app (DGSMH) y madrid.consulares.app (Madrid) fueron **propuestos, no confirmados ni configurados**. Podrá haber enlaces especiales de operador bajo el dominio del proyecto, pero su ruta o subdominio concreto no está fijado.

### Reporte consular

**DECIDIDO.** Cada consulado dispone de **una cuenta institucional compartida** (correo y contraseña). Pablo facilitará un Excel de consulados, direcciones de correo y contraseñas temporales; se realiza su importación inicial durante el desarrollo. En el primer acceso se exige cambiar la contraseña. Múltiples funcionarios pueden usar la misma cuenta desde diferentes dispositivos; cada uno identifica **una sola vez su nombre de operador por sesión de trabajo**, sin crearle una cuenta personal. Desde esa cuenta se accede exclusivamente a los recintos asignados al consulado.

**DECIDIDO.** La contraseña convencional requiere **un mínimo de ocho caracteres**; no se exige doble factor ni una composición de mayúsculas, símbolos y números adicional a ese mínimo. La protección antiintentos automatizados permanece como requisito. Los tiempos y mecanismos precisos de recuperación y sesión deben ajustarse a la operación de jornada completa, sin imponer verificaciones repetidas.

### DGSMH

**DECIDIDO.** Los funcionarios autorizados de Quito disponen de cuentas individuales, sin permisos de administración general, para consultar mapa, atender solicitudes y gestionar incidencias. Sus intervenciones quedan atribuidas individualmente. No existe obligación de dividirlos en niveles distintos de solo lectura y edición.

### Administración y operadores de Madrid

**DECIDIDO.** Existe **una cuenta administrativa propia de Madrid**, con contraseña, distinta tanto de la cuenta consular de reporte como de la superadministración general. Madrid solo administra su operativo MJRV. El superadministrador general del proyecto tiene acceso de configuración separado.

**DECIDIDO.** El personal operativo de Madrid **no utiliza cuentas con correo**, contraseñas convencionales ni verificaciones por correo. El administrador de Madrid registra sus nombres, asigna un **PIN individual de cuatro dígitos** y habilita el enlace operativo correspondiente a cada función. Al abrir el enlace, el funcionario se identifica por nombre y PIN; el dispositivo conserva la identificación durante su jornada hasta cambio de operador o cierre de sesión. Su PIN no le permite entrar en administración ni acceder a funciones ajenas. Los permisos se validan en el servidor. Se aplican límites de intentos y posibilidad de revocar enlaces y PIN.

**DECIDIDO.** No se concede acceso al sistema a los coordinadores de **cada mesa**. La coordinación de movimientos se efectúa desde el **centro de mando**; no debe confundirse al coordinador responsable del centro de mando con cada coordinador de mesa. Los enlaces de puerta, documentación y finanzas conducen únicamente a las tareas específicas de la estación.

**DECIDIDO.** La parte financiera contará con acceso operativo restringido y podrá trabajar simultáneamente desde **dos o tres puestos**, sin requerir creación y validación por correo de cuentas tradicionales. Las confirmaciones de pago quedan atribuidas al operador identificado.

**ABIERTO.** Rutas exactas de los enlaces, política de cambio o recuperación de PIN, detalle definitivo de qué estaciones necesitan PIN y procedimiento alternativo cuando el administrador no está disponible. No confundir el PIN de operador con la cédula de los MJRV.

## 3. Datos maestros y puesta en marcha

**DECIDIDO.** Pablo proporcionará los archivos con consulados, recintos, juntas, electores y, para Madrid, nombres, cédulas, funciones, JRV asignada, correo y teléfono de contacto cuando consten. El asistente/agente de construcción debe **analizarlos, detectar inconsistencias y preparar su primera importación mediante el código o scripts de inicialización**, no exigir a Pablo una carga inicial desde el panel de superadministración.

**DECIDIDO.** Un superadministrador puede tener una herramienta de importación y corrección posterior, pero la primera carga se ejecuta como parte del desarrollo y despliegue. Los consulados y Quito no modifican el catálogo maestro de JRV, recintos y electores. Los cambios operativos de miembros de junta en Madrid se guardan como movimientos históricos propios, sin modificar el padrón electoral ni el catálogo maestro.

**ABIERTO.** Todavía no se han aportado y validado aquí los datos definitivos de consulados, recintos, electores y MJRV. No sustituirlos por cifras públicas o por información de otros procesos.

## 4. Infraestructura y reutilización

**DECIDIDO.** El código del proyecto permanece en el repositorio privado independiente pabloun2025/CNE, rama main. La infraestructura de referencia es la que **ya funciona** en los repositorios consulares y, tras revisión, temp. No se mezclan los códigos de esas aplicaciones ni se modifica sin necesidad lo que está en servicio.

**DECIDIDO.** Se utiliza la **única máquina virtual existente en Oracle Cloud**, ya empleada para Consulares. Se prioriza reutilizar servicios instalados y configurados, evitando duplicar infraestructura. La referencia verificada en consulares comprende Next.js/Node, Docker Compose, PostgreSQL, Cloudflare Tunnel y copias de seguridad. El proyecto CNE debe conservar permisos y datos segregados aunque comparta servicios.

**CRITERIO TÉCNICO.** Evitar instancias nuevas innecesarias de PostgreSQL, túneles, bases auxiliares o componentes de mensajería; reutilizar los servicios disponibles siempre que el aislamiento y la capacidad lo permitan. La integración concreta se define tras inspección de la máquina y de los repositorios consulares y temp. La capacidad de CPU/RAM/disco y el estado real de servicios compartidos deben comprobarse antes de desplegar; no se presume que hayan sido comprobados.

**DECIDIDO.** Para las credenciales, el método de envío WhatsApp se basará en el funcionamiento existente de teinvito con Evolution API. La IA de apoyo a los movimientos toma como referencia el recurso local ya utilizado en teinvito. No se duplican esos servicios por defecto ni se deduce que puedan consumirse sin modificaciones técnicas.

**ABIERTO.** Qué componentes exactos de temp y consulares se reutilizarán, límites de acceso a servicios existentes, base de datos separada o esquema aislado, configuración definitiva de subdominios, copias y capacidad disponible. No se crea una segunda máquina virtual.

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


## 5. Reporte electoral de los consulados

**DECIDIDO — corrección libre de reportes consulares.** Pablo eligió la opción **A**: el consulado puede **editar y volver a guardar libremente** cualquier información que haya enviado (incluidos datos de fases finalizadas), sin pedir autorización a Quito/superadministración y **sin obligación de justificar el cambio**. Las rectificaciones actualizan la información vigente del tablero de la DGSMH. Se mantiene la regla anterior de que prevalece el último reporte recibido correctamente por el servidor para la misma JRV/fase; y la atribución automática de operador y hora, con registro técnico de cambios para trazabilidad, **sin añadir campos ni pasos al funcionario**. La facultad de corregir información ya reportada no habilita introducir un hito futuro antes de las condiciones horarias y secuenciales aprobadas en modo elección.

**DECIDIDO — pantalla principal consular y secuencia temporal.** Se adopta un **panel combinado muy simple** (opción C matizada por Pablo): debe destacar el **estado y la acción principal de la fase actual**, reducir al mínimo la navegación y las alternativas visibles, y ofrecer acceso directo y discreto a reportar incidencias u otra información pertinente para esa fase. **No deben habilitarse funciones de fases futuras antes de tiempo**: en particular, no debe poder reportarse el inicio o avance del escrutinio antes de terminar la jornada de votación. Los controles deben tener validación en el servidor, no solo ocultarse visualmente. Se mantienen el recinto activo por sesión y los reportes por grupos con excepciones.

**DECIDIDO — habilitación de escrutinio y excepción de pruebas.** En **modo elección**, la interfaz consular habilita registrar el escrutinio por junta o grupo de juntas **únicamente después de las 19:00, hora local del recinto, y tras el cierre de votación reportado para las juntas correspondientes** (opción C). Las funciones de fases futuras se muestran deshabilitadas; el control se aplica en el servidor y en la interfaz, no basta con ocultar botones. En **modo prueba**, el superadministrador puede **desactivar temporalmente estas restricciones de horario y progresión**, para comprobar funciones sin esperar a las horas reales; el modo afecta a las validaciones del flujo de pruebas, no a los permisos de cada rol. No bloquear todas las juntas del recinto porque una tenga avance diferente.

**DECIDIDO.** La unidad de reporte es el **recinto**, no el consulado agregado: un consulado puede tener varios recintos. Cada recinto tiene JRV, avances, hitos e incidencias independientes. Quito también ve el consolidado del consulado, calculado sobre totales reales sin sumar porcentajes. El operador puede reportar desde el recinto o desde la oficina central; selecciona un **recinto activo por sesión**, siempre visible, que puede cambiar sin volver a iniciar sesión.

**DECIDIDO.** Los hitos reportados son: inicio, incidencias, votantes, cierre de votación, inicio y fin de escrutinio, inicio y fin de escaneo, y cierre del proceso. Son distintos de las cuatro fases formales del CNE (instalación, sufragio, escrutinio y embalaje). Los votantes se informan mediante conteo de firmas en padrón o estimación, identificando cuál se usó.

**DECIDIDO.** El avance de cada hito se muestra como número de JRV confirmadas respecto del total y porcentaje, p. ej. 76/95 y 80 %. Para cada JRV y fase se distinguen **completada**, **pendiente expresamente reportada** y **sin información**; no se atribuye un problema a una junta sin información. Los consulados grandes actualizan **grupos de JRV con excepciones**, sin confirmar juntas una a una; los pequeños pueden trabajar por junta. El sistema preserva identificadores y actualizaciones independientes para el trabajo concurrente.

**DECIDIDO.** Si existen dos reportes contradictorios de la **misma JRV y fase**, prevalece el **último recibido correctamente por el servidor**. No se obliga a confirmar conflictos. Debe guardarse quién declaró el dato y cuándo. Las actualizaciones de un grupo no sobrescriben otros grupos o recintos.

**DECIDIDO.** Si se pierde internet, los datos no enviados se guardan como **borradores en el dispositivo**; se revisan y envían manualmente al recuperar conexión, sin sincronización automática. Quito no ve borradores como reportes confirmados. La efectividad del almacenamiento local y de la carga de la interfaz offline debe probarse en navegadores reales.

**DECIDIDO.** Cada consulado indica un **teléfono operativo** previamente y lo confirma o actualiza al iniciar la jornada, visible para DGSMH. Al actualizar cada fase puede marcar **«Sin novedades»** en el ámbito del recinto, sin comprobar una a una todas las JRV; eso no equivale a completar un hito ni cierra incidencias.

**ABIERTO.** Significado exacto de «cierre del proceso», catálogo definitivo de tipos de incidencia, fuente de husos horarios y plazos de tolerancia para alertas por reportes ausentes. La opción inicial de instalación que se debatió fue luego sometida a revisión; no existe catálogo de incidencias definitivo.

## 6. Incidencias y seguimiento DGSMH

**DECIDIDO — mapa mundial por niveles y ciclo día/noche.** Se aprueba la **opción C** para la representación geográfica: vista global de **consulados agrupados**, y al acercar el mapa o seleccionar uno se despliegan sus **recintos electorales** con acceso al detalle de juntas. El mapa incorporará una **visualización profesional del ciclo solar**: zona del planeta iluminada y zona nocturna, con transición día/noche (terminador solar) actualizada conforme la fecha y hora real. La capa será sutil para no ocultar marcadores, colores de estado ni alertas; su objetivo es hacer evidente, de un vistazo, en qué partes del mundo es de día y en cuáles de noche. **La iluminación solar es geográfica y no equivale al huso horario oficial**: las horas locales de recintos siguen determinándose de forma independiente por el huso horario correspondiente. Es una funcionalidad de presentación del tablero DGSMH, no una fuente de hitos electorales.

**DECIDIDO — informes completos de la jornada.** Pablo aprobó la opción C: la DGSMH podrá generar un informe consolidado con avances de los recintos y JRV, participación reportada (indicando si procede de firmas o estimación), incidencias y su seguimiento/resolución, y horas relevantes de los hitos. Podrá consultarse detalle por consulado y recinto y exportarse a PDF y Excel. No mezclar en el informe nacional la información sensible interna de Madrid (credenciales, cédulas, ingresos o pagos); el informe se alimenta del módulo consular/DGSMH. Distinguir información confirmada, estimada, pendiente y sin reporte; el informe no contiene resultados de votos ni constituye documento oficial del CNE.

**DECIDIDO — pantalla principal DGSMH.** Se adopta la **opción C**: un tablero con el **mapa mundial como elemento visual dominante** y, simultáneamente, un panel lateral de **alertas urgentes, consulados con reportes pendientes e indicadores principales**. El usuario de Quito debe poder comprender la situación global y localizar lo que requiere atención **sin cambiar de pantalla**. Se respetan los estados de información disponible, pendientes expresamente reportados y ausencia de reporte, así como la diferenciación entre incidencias y alertas de seguimiento. La disposición deberá adaptarse a distintos tamaños de pantalla. El detalle de agrupación de marcadores para consulados con varios recintos todavía no está aprobado.

**DECIDIDO.** Los incidentes se reportan **por excepción**. El formulario propone un alcance según el tipo (recinto entero o una o varias JRV) y el consulado puede modificarlo. No debe preguntarse junta por junta ni exigirse confirmación de normalidad periódica. Cada fase tendrá un desplegable corto de hechos concretos que afecten su desarrollo y la opción «Otro» con texto libre. Sus ítems siguen **ABIERTOS** hasta revisión de manuales.

**DECIDIDO.** Cada incidencia tiene seguimiento propio y prioridad sugerida por su tipo, **modificable por el consulado**; normal, alta y crítica se plantearon como niveles, sin definir todavía la matriz por tipo. Una incidencia de prioridad alta o crítica no produce por sí sola una alarma sonora.

**DECIDIDO.** Todos los incidentes son visibles a Quito. Tanto el consulado puede **solicitar apoyo** como la DGSMH puede **marcar un asunto para seguimiento**. Se usa modelo mixto: las solicitudes y actuaciones relevantes quedan en el sistema, mientras que las urgencias se coordinan por teléfono o WhatsApp, sin chat interno obligatorio.

**DECIDIDO.** Una **solicitud urgente de apoyo** se destaca visualmente en Quito y da aviso sonoro mientras el tablero esté abierto, con posibilidad de silenciarlo. Quito marca «Recibido» para acusar la solicitud y silenciar ese aviso, pero la incidencia continúa pendiente hasta su resolución. No se aprueban correos ni SMS automáticos para cada solicitud. La interfaz no debe depender de que el navegador permita reproducir audio.

**DECIDIDO.** Consulado o DGSMH pueden cerrar una incidencia sin doble aprobación, con **explicación breve obligatoria**, registro de autor y hora. Para una incidencia que afecta a varias JRV se permite **resolución parcial** dentro del mismo registro, seleccionando las juntas solucionadas y dando una explicación por actuación; sigue abierta para las demás. Una incidencia cerrada por error o recurrente **se reabre en su registro original**, conservando las aperturas, cierres y explicaciones anteriores.

**DECIDIDO.** El tablero muestra por separado los hitos y estados de JRV, los incidentes, las solicitudes de apoyo y la falta de información. Una ausencia de reporte esperado según la hora local genera **alerta de seguimiento distinta de incidente electoral**, no prueba que el sufragio esté interrumpido.

**LÍMITE INSTITUCIONAL.** La DGSMH coordina seguimiento y apoyo consular. El sistema no le atribuye competencias de decisión electoral propias del CNE.

## 7. Operativo de Madrid: principio y recorrido del MJRV

**DECIDIDO.** El objetivo es **registrar la llegada de cada MJRV, identificar juntas que tienen integrantes insuficientes y suplentes disponibles, proponer redistribuciones para constituir las juntas, reunir documentación de identidad y controlar pagos físicos sin duplicidades**. No es una aplicación de gestión general de mesas ni un segundo sistema de reporte electoral a Quito.

### 7.1. Registro y credenciales

**DECIDIDO.** El administrador Madrid carga un Excel con nombre, apellidos, número de cédula, cargo en junta (presidente, secretario, vocal, suplentes u otros del archivo), serie H/M y junta asignada, más correo y teléfono si figuran. Puede dar altas, editar o dar bajas individuales. La plantilla PDF de credencial la aportará Pablo: tamaño CR80 85,6 × 54 mm, con datos del MJRV y **QR individual cuyo contenido es su número de cédula**.

**DECIDIDO.** Salidas: credencial PDF individual; hojas A4 **optimizadas para acomodar el máximo número de credenciales legibles sin recortarlas**, listas para imprimir, cortar y colocar en portaidentificaciones con cordón; envío individual por WhatsApp mediante teinvito/Evolution API y **por correo electrónico**. Plantilla gráfica y archivo fuente pendientes.

### 7.2. Control de ingreso

**DECIDIDO.** En puerta el operador utiliza un **enlace limitado, revocable**, creado por la administración; se identifica por nombre y PIN, no entra en el panel administrativo. Escanea el QR de la credencial; el sistema identifica al MJRV por cédula, registra ingreso y actualiza de inmediato el centro de mando.

**DECIDIDO.** Lectura válida: verde, aviso «Válida», pitido agudo. Desconocida, duplicada/ya usada o bloqueada: rojo, dos pitidos graves. **ABIERTO** el significado y tratamiento de bloqueado y reingreso; no copiar reglas ajenas de teinvito.

**DECIDIDO.** Una persona escaneada en puerta se considera **presente y disponible por defecto para estimaciones operativas**, sin requerir segunda confirmación por coordinador de mesa. La llegada **no demuestra** que su junta se haya instalado oficialmente. El centro de mando podrá registrar excepciones cuando tenga información de indisponibilidad.

### 7.3. Centro de mando: conformación y movimientos

**DECIDIDO — movimientos de suplentes entre zonas.** Pablo aprobó la opción **B**: el centro de mando busca primero suplentes sobrantes en la **misma zona de color**; cuando no los hay suficientes, puede proponer suplentes disponibles de **otras zonas**, priorizando cercanía y disponibilidad. Cada propuesta requiere aprobación expresa del coordinador del centro de mando; la IA nunca ejecuta movimientos automáticamente. El uso de voluntarios no forma parte de esta opción ni se presume habilitado. La asignación efectiva debe quedar registrada con sus cambios operativos.

**DECIDIDO.** Se visualizarán las **95 JRV de Madrid**, con series separadas H y M y sus colores de zona. El centro de mando debe identificar de inmediato juntas sin miembros, incompletas, próximas a estar completas y completas; además, dónde existen suplentes disponibles para cubrir faltantes. La información procede del control de puerta y de los movimientos autorizados.

**DECIDIDO.** Se prioriza una **visualización orientada a decisiones**, ordenada por problemas y posibilidades de solución, no un plano exacto de la Caja Mágica. La distancia y el color son criterios para recomendar desplazamientos, no para obligar a mostrar las fichas en una geometría física. Indicadores globales: ingresos, juntas con tres integrantes presentes, juntas incompletas y suplentes transferibles.

**DECIDIDO.** Cada junta requiere **tres integrantes** para abrir el paquete electoral; se incluyen titulares y suplentes conforme a las reglas procedentes. Para cubrir faltantes se priorizan suplentes que sobren en la **misma zona de color**; si son insuficientes, se proponen suplentes disponibles en **otras zonas**, priorizando las más cercanas. Los voluntarios capacitados no están incluidos en esta regla.

**DECIDIDO.** Un motor de apoyo basado en la IA local existente en teinvito puede proponer **un movimiento a la vez**, usando faltantes, disponibilidad y proximidad. El **coordinador del centro de mando**, no el coordinador de cada mesa ni la IA, decide: aceptar, pasar a la siguiente propuesta o señalar que no es viable por falta de respuesta, negativa o ausencia. El traslado aceptado actualiza asignación operativa, panel y consecuencias de pago, con trazabilidad. La IA **no mueve personas de oficio**.

### 7.4. Fotografía de la cédula

**DECIDIDO.** Un **segundo QR genérico**, independiente del QR de credencial, abre el formulario de documentación. El MJRV escribe su cédula, recupera la ficha correspondiente y fotografía anverso y reverso de su documento. Puede hacerlo personalmente o con ayuda de un funcionario. La interfaz propone un recuadro de alineación, **captura automática cuando está encuadrada** y recorte para conservar la imagen del documento. Las dos imágenes se asocian al MJRV y forman el **anexo en la segunda página del acta de pago**.

**DECIDIDO.** Si falta alguna imagen, el sistema de finanzas no permite completar la preparación/impresión del acta hasta incorporar ambas; el ayudante de finanzas puede capturarlas en el momento. **ABIERTO** si el QR genérico se distribuirá en cartel, WhatsApp o ambos. La calidad y capacidad de captura automática requieren pruebas en dispositivos reales.

### 7.5. Pago físico y control financiero

**DECIDIDO — control financiero e informe de cierre Madrid.** Pablo aprobó la opción **C**: el sistema de Madrid tendrá un **panel financiero en tiempo real** con consulta por MJRV de pago pendiente o confirmado, conteos de personas pagadas y pendientes, e **importe total entregado en EUR**. Permitirá generar un **informe de cierre descargable** con pagos efectuados y pendientes, importes y operadores responsables de cada desembolso, manteniendo trazabilidad de la confirmación efectiva del pago. El informe del módulo Madrid es distinto del informe electoral nacional de la DGSMH, que no contiene datos personales de pagos. El panel reflejará confirmaciones efectivas, **no** actas simplemente generadas o impresas.

**DECIDIDO — habilitación de pago directamente en finanzas.** Pablo eligió la opción **A**: el **operador financiero verifica directamente** que el MJRV ha cumplido sus funciones antes de tramitar su pago; **no se requiere autorización previa del centro de mando, por junta ni por persona**. El sistema registra quién realizó esa verificación, conserva las validaciones informáticas ya aprobadas —QR, identidad, fotografías de anverso y reverso, inexistencia de pago confirmado— y exige confirmación explícita del desembolso físico después de impresión y firma del acta y entrega del dinero. El acceso por QR y la presencia registrada en puerta **no acreditan por sí solos** el cumplimiento de las funciones. No inventar ni imponer criterios documentales de elegibilidad no aportados por Pablo.

**DECIDIDO.** Al terminar el trabajo de su junta, el MJRV pasa a finanzas con su **mismo QR individual de la credencial**. Dos o tres operadores financieros pueden usar simultáneamente puestos de lectura QR y ordenador con impresora. El sistema debe consultar el estado central: identidad válida, documentación de anverso/reverso completa y **ausencia de pago previamente confirmado**.

**DECIDIDO.** Si se cumplen las condiciones, se habilita la **visualización, generación e impresión del acta de pago y su anexo**, con los datos de la persona. Se entrega el dinero **físicamente**, y el acta recoge las firmas del pagador y del receptor conforme a la plantilla. **Después de la impresión, firma y entrega del dinero**, el operador registra en pantalla una **confirmación explícita del pago**. Imprimir no equivale a pagar. Una persona con pago confirmado no puede cobrar otra vez por la vía ordinaria.

**DECIDIDO.** Existe un monto general en USD para MJRV y el pago se efectúa en EUR; el administrador ingresa el tipo de cambio del día y los datos del pagador. La plantilla definitiva del acta y la fórmula exacta de conversión siguen **ABIERTAS**; no inventar importes, tipos de cambio ni campos de firma adicionales.

**REQUISITO DE CONTROL.** Para prevenir pagos duplicados con varias estaciones, la verificación y confirmación deben ser **atómicas en el servidor**. Se necesita conexión al servidor para confirmar desembolsos; no se permiten pagos marcados localmente sin verificar estado central. El sistema distingue al menos documentación incompleta, documentación lista para preparar/imprimir, pago en trámite y pago confirmado, con trazabilidad del operador y hora.

**PROPUESTA NO APROBADA COMO REGLA DEFINITIVA.** Reserva temporal de una ficha cuando un operador comienza el pago, para que otro puesto vea que está siendo atendida. Deben decidirse duración de la reserva, caducidad, recuperación por fallos de impresora y tratamiento de reimpresiones. No bloquear permanentemente un pago por abrir una ficha o imprimir.

## Mapa de juntas de Madrid

**DECIDIDO.** No es un plano de planta ni un cubo. Cada junta es una ficha: número, H o M, color de zona y señal visual de situación. Los indicadores globales deben hacer visibles los huecos a cubrir, suplentes libres, miembros ingresados y juntas con tres miembros disponibles. El diseño exacto se validará con datos reales; no se impone una réplica del plano.

- Verde: hay 3 presentes.
- Ámbar: falta gente.
- Rojo: no hay nadie.

**DECIDIDO.** Aceptar un movimiento deja la junta en verde y le añade la marca de movimiento. El verde de «3 presentes» y la marca de movimiento conviven: la marca dice que hubo traslado.

**DECIDIDO (criterio actualizado).** El tablero prioriza la lectura operativa de problemas, no la reproducción del plano físico. Debe poder ordenar, agrupar o filtrar juntas por faltantes, juntas próximas a completarse, juntas con tres miembros disponibles y juntas con suplentes transferibles. Se conservan el color de zona y la serie H/M de cada ficha, pero el orden visual puede diferir del plano. El orden físico solo se usa como referencia para la distancia y las sugerencias de movimiento. Los números visibles de las fichas proceden de las series separadas de hombres y mujeres, no de una numeración única de 1–95.

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

**NOTA DE FUENTE.** El orden de los iconos dentro de cada fila no se puede deducir del plano; no se asignan extremos físicos. Como se decidió priorizar una organización por problemas, no es requisito reproducirlos en su posición exacta.

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


## 8. Cuestiones abiertas e insumos pendientes

**DECIDIDO — despliegue directo en producción y pruebas controladas.** Pablo no dispone de tiempo para un ciclo de pruebas extenso ni quiere un entorno de pruebas independiente. Se desplegará la plataforma **directamente en producción** y se comprobarán sus funciones sobre esa misma instalación antes del 29 de noviembre de 2026. Justo antes de la jornada, el administrador deberá poder realizar una **limpieza manual y selectiva de los registros operativos de prueba** y comenzar la operación real con los datos de configuración ya preparados. No crear ni exigir un entorno de ensayo paralelo, ni programar un borrado automático por fecha.

**REQUISITO PARA EVITAR PÉRDIDAS.** La limpieza de pruebas debe preservar el catálogo de consulados/recintos/JRV y MJRV, cuentas, PIN, plantillas, parámetros y configuración. Debe separar claramente los registros de prueba de los definitivos, impedir un borrado indiscriminado de datos maestros y requerir confirmación del administrador; conservar un respaldo antes de limpiar. Las confirmaciones de pagos realizadas durante pruebas son **simuladas**, sin implicar entrega de dinero, y no deberán quedar como pagos reales ni bloquear cobros el día electoral. No incluir registros reales de pagos en el borrado ni dar por probado un pago efectivo con un clic. Determinar en implementación la técnica más simple, sin añadir complejidad funcional innecesaria.

**DECIDIDO — modo prueba controlado por superadministrador y preparación de elección.** Se utilizará una sola instalación directamente en producción, con un **interruptor visible solo para el superadministrador: «Modo prueba»**. Mientras esté activado, se pueden probar funciones de todos los portales sin esperar a los horarios ni los cierres de fase del flujo electoral; todos los usuarios verán una advertencia inequívoca de **MODO PRUEBA** y los registros generados se etiquetarán como prueba, sin confundirse con los definitivos. El superadministrador tendrá una acción explícita **«Borrar datos de prueba y preparar para elección»**. Esta acción hará respaldo previo, requerirá confirmación clara, borrará únicamente actividad de prueba (incluidas simulaciones de pagos, escaneos, movimientos e incidencias) y **conservará** usuarios, contraseñas/PIN, catálogos maestros, JRV y MJRV, plantillas y configuración. Después dejará el sistema en **modo elección**, con restricciones horarias y de fases activas. No ofrecer borrado automático, acceso a esta función a operadores ni la posibilidad de borrar actividad electoral real por esta vía.

**ABIERTO — insumos esenciales:** Excel de consulados, recintos, JRV y electores; Excel de MJRV de Madrid y sus funciones; plantilla PDF CR80 de credencial; plantilla oficial de acta de pago y anexo; importe y fórmula de conversión de USD a EUR. Los archivos aportados deberán ser revisados en contenido antes de cargarse.

**ABIERTO — operación electoral y DGSMH:** catálogo concreto de incidencias por fase (revisado contra manuales, no lista inventada); criterios de prioridad; significado de cierre total; fuente de husos horarios; tolerancias de alertas por falta de reporte; modalidad exacta de seguimiento de asuntos ya abiertos. No abrir preguntas minúsculas antes de cerrar los flujos principales.

**ABIERTO — Madrid:** criterio para segundo escaneo/reingreso en puerta, bloqueo de credencial; entrega de QR genérico; forma de solicitar confirmación física del traslado desde el centro de mando; funciones precisas de los operadores por estación; solución técnica para reserva temporal de pago; validación e impresión de actas; experiencia de cámara automática; reglas de protección y conservación de fotos de cédula.

**ABIERTO — implementación:** nomenclatura de subdominios, reutilización efectiva de servicios de consulares y temp, capacidad real de la VM única, aislamiento de datos, pruebas de carga, comportamiento con cortes de red y dispositivo de contingencia. No dar por desplegado nada de lo que aquí se diseña.

## 9. Reglas de continuidad del proyecto

- **DECIDIDO.** Hacer preguntas de alcance y flujos, **una decisión por turno**, con opciones A/B/C/Otro seleccionables; acompañarlas de recomendaciones y mejoras con fundamento operativo, no limitarse a ratificar pedidos. Evitar reiterar detalles que ya estén claros.
- **DECIDIDO.** Guardar avances periódicos y de manera silenciosa en GitHub; mantener actualizado este documento como especificación funcional canónica y usar INSTRUCCIONES.md como historial/guía. Las decisiones antiguas que hayan cambiado deben señalarse como sustituidas, no seguirse como órdenes vigentes.
- **DECIDIDO.** No construir código, diagramar pantallas definitivas ni desplegar hasta autorización expresa. Cuando la haya, entregar primero instrucciones completas para desarrollo con Claude/Codex y plan de validación.
- **DECIDIDO.** No confundir datos personales y pagos de Madrid con el seguimiento internacional DGSMH; nunca trasladarlos automáticamente al tablero de Quito.
- **DECIDIDO.** No asumir que tener tres MJRV presentes equivale a instalación electoral oficial. El sistema Madrid apoya decisiones de conformación; la comunicación formal a Quito se hace en su portal.
- **DECIDIDO.** Mantener la numeración H/M, zonas cromáticas y material operativo del proceso. No importar al CPCCS 2026 procedimientos de escrutinio específicos del referéndum de 2025.

## 10. Modelo funcional detallado y criterios transversales

### 10.1. Jerarquía de reglas y naturaleza de este desarrollo

Este apartado desarrolla, para ejecución técnica y validación, las decisiones de los apartados 1–9. Se distinguen tres clases de contenido:

- **DECISIÓN APROBADA:** requisito expresamente aceptado por Pablo; no cambiarlo por conveniencia técnica.
- **DISEÑO DERIVADO:** descripción de pantallas, controles, validaciones y comportamiento necesario para hacer operativa una decisión aprobada. Se podrá ajustar durante programación sin alterar los requisitos.
- **PENDIENTE DE INSUMO O VALIDACIÓN:** dato, plantilla, fórmula, criterio normativo o decisión que no consta; no sustituirlo por suposiciones. Si impide una función, dejarla preparada y señalar la dependencia.

La interfaz de cada portal debe cumplir una función concreta. **Consular:** informar lo ocurrido en recintos y JRV con la menor carga posible. **Quito:** observar el avance, detectar falta de información y coordinar apoyo. **Madrid:** ejecutar operaciones internas con seguridad e impedir pagos duplicados. No convertir el sistema en una aplicación electoral general, de resultados oficiales ni de administración de votantes.

### 10.2. Conceptos que nunca deben confundirse

| Concepto | Significado funcional | No equivale a |
| --- | --- | --- |
| Consulado | Oficina usuaria que administra uno o varios recintos | Recinto individual |
| Recinto | Lugar/ámbito operativo sobre el que se reportan JRV | Cuenta de usuario |
| JRV | Junta identificada dentro de un recinto | Miembro personal de esa junta |
| MJRV | Persona asignada a funciones en una junta; dato del módulo Madrid | Elector, voto emitido o junta instalada |
| Junta con 3 miembros presentes en Madrid | Condición operativa estimada según escaneos y movimientos | Instalación electoral formal reportada a Quito |
| Fase del CNE | Instalación, sufragio, escrutinio, embalaje | Cada hito que carga el consulado |
| Hito reportado | Evento/estado comunicado en una JRV o recinto | Resultado electoral oficial |
| Pendiente reportado | Una junta cuya fase sigue pendiente según aviso explícito | Ausencia de información |
| Sin información | No existe un reporte confirmado para esa junta/hito | Junta inactiva, incidente o retraso comprobado |
| Incidencia | Hecho concreto que afecta una operación, con seguimiento propio | Alerta informática por falta de reporte |
| Solicitud urgente de apoyo | Petición expresa del consulado que activa alerta en Quito | Toda incidencia de prioridad alta/crítica |
| Acta de pago impresa | Documento preparado para firma y desembolso físico | Pago confirmado |
| Modo prueba | Ejecución identificada como simulación en la misma instalación | Entorno paralelo, producción electoral real |

### 10.3. Datos maestros, asociación y cardinalidades

**DISEÑO DERIVADO.** Un consulado tiene cero, uno o varios recintos asignados, según el catálogo real. Un recinto tiene una o varias JRV; cada JRV se identifica con una clave interna estable y un rótulo legible. Los datos del avance se asocian a la **JRV y el hito**; los del contacto y «sin novedades» se asocian a consulado/recinto/fase según corresponda. Un mismo usuario consular no puede modificar recintos de otro consulado.

La información del sistema Madrid constituye un ámbito separado: MJRV, credenciales, acceso, asignación operativa actual, historial de movimientos, fotos de cédula y pagos. Puede compartir referencias al catálogo de recinto/JRV, pero **no** comparte sus campos personales con usuarios de Quito ni propaga automáticamente eventos de puerta, conformación o pagos al avance electoral.

Se requieren relaciones consistentes para que no existan JRV de un recinto inexistente, miembros vinculados a juntas equivocadas ni pagos sin ficha de MJRV. El catálogo definitivo procede de los Excel que se entregarán; la geometría y los números de Madrid ya definidos son referencias de diseño, **no sustituyen el Excel nominativo**.

### 10.4. Pantallas y permisos mínimos por portal

| Perfil / portal | Pantallas funcionales | Puede actuar sobre |
| --- | --- | --- |
| Consulado | Acceso; identificación de operador; elección de recinto; jornada/avance; incidencias; borradores y envíos | Sus recintos, JRV, votantes agregados, hitos, incidencias y teléfono operativo |
| DGSMH | Acceso; mapa y panel de alertas; ficha de consulado/recinto; detalle de incidencias; informes | Consulta global; acuse de urgencias; seguimiento, actuaciones y resolución de incidencias |
| Administrador Madrid | Acceso; tablero Madrid; MJRV y credenciales; operadores; movimientos; documentación; finanzas e informes | Solo los datos internos del operativo Madrid |
| Operador puerta Madrid | Enlace limitado con nombre y PIN; lector QR y resultado | Registro de ingreso a Madrid y consulta mínima para validar |
| Operador documentación Madrid | Enlace limitado; identificación de MJRV y captura de ambas caras | Documentos de identidad estrictamente necesarios |
| Operador finanzas Madrid | Enlace limitado; lector QR; preparación de acta; confirmación de pago | Verificación y desembolso por MJRV, sin administración general |
| Centro de mando Madrid | Vista de las 95 JRV, disponibilidad y propuestas de redistribución | Aceptación o rechazo de movimientos, anotación de excepciones operativas |
| Superadministrador | Acceso de configuración; usuarios/catálogos; modo prueba; preparación de elección | Configuración global e importaciones; acciones destructivas de pruebas exclusivamente |

**DISEÑO DERIVADO.** No debe haber navegación cruzada por cambiar manualmente la URL. Los permisos se aplican del lado del servidor a consultas, escrituras, archivos, exportaciones y enlaces especiales. Un recurso directo (por ejemplo, foto de cédula o PDF de acta) requiere la misma autorización que su pantalla.

### 10.5. Idioma, claridad visual y dispositivos

Los tres portales se presentan en español, con terminología institucional consistente. En el móvil, controles táctiles amplios; en escritorio, información de varias JRV y mapa de mayor densidad. La hora se muestra con zona local y fecha cuando pueda ser ambigua; los porcentajes llevan siempre numerador/denominador. Un color no será la única señal de estado: acompañarlo de texto e iconografía. Confirmar visualmente cuándo un envío fue recibido; **no** tratar como enviado lo que está en borrador o pendiente de red. Reducir al mínimo botones secundarios y formularios extensos, especialmente en el portal consular.

## 11. Portal consular: pantallas y recorrido completo

### 11.1. Primer acceso e inicio de turno

**DECIDIDO:** acceso institucional compartido por correo y contraseña, primer cambio de clave, nombre de operador una vez por sesión y recinto activo seleccionable. **DISEÑO DERIVADO:** tras autenticarse, si es el primer uso se pide nueva contraseña; luego se pide nombre del funcionario que está operando desde ese dispositivo. Al seleccionar un recinto de los autorizados, se abre la jornada. El encabezado muestra siempre nombre de consulado, **recinto activo**, fase vigente y nombre del operador, con acciones discretas «Cambiar recinto» y «Cambiar operador».

Si el consulado tiene un solo recinto, su selección puede simplificarse sin eliminar la comprobación de que las actuaciones se atribuyen al recinto correcto. Cambiar recinto no elimina un borrador; los borradores mantienen asociado su recinto de origen. No usar GPS para inferir el recinto. La cuenta institucional puede abrirse simultáneamente en varios dispositivos, con distintos nombres de operador declarados.

El teléfono operativo registrado antes de la jornada se presenta al inicio para **confirmarlo o actualizarlo**. Solo se exige a nivel de consulado, no de junta; queda visible para Quito. Evitar solicitarlo repetidamente a cada funcionario que abre la misma cuenta.

### 11.2. Pantalla principal de jornada: máximo enfoque

**DECIDIDO:** panel combinado, extremadamente sencillo, con acciones ajustadas al momento de la jornada. **DISEÑO DERIVADO:** en vez de una colección de menús, organizar la pantalla en cuatro áreas:

1. **Situación actual:** recinto seleccionado, hora local, etapa vigente, número de JRV y resumen del avance conocido.
2. **Acción principal:** botón grande y contextual para registrar el hito o actualización propia de la fase habilitada.
3. **Acciones siempre útiles:** «Reportar incidencia», «Solicitar apoyo a Quito» cuando proceda, «Actualizar votantes» durante su período pertinente y «Ver/rectificar reportes».
4. **Estado de conexión:** último envío confirmado y, si existen, borradores locales por enviar.

Las acciones futuras no deben activarse anticipadamente. Pueden verse atenuadas dentro de una secuencia que indique lo que sigue, sin permitir envíos. Las cifras y acciones de una fase ya registrada siguen siendo consultables y **corregibles** desde la vista de historial o detalle, aunque no aparezcan como acción principal. No exigir pasar por pantallas innecesarias para una operación frecuente.

**Secuencia visible orientativa:** instalación → sufragio → cierre de votación → escrutinio → escaneo → cierre del proceso. El embalaje es fase formal del CNE, no un nuevo hito automático sin autorización. La hora local se calcula según el lugar del recinto, no según el navegador del funcionario cuando reporte desde otra ciudad.

### 11.3. Avance por juntas: operaciones individuales y masivas

**DECIDIDO:** tres estados por JRV y fase, trabajo individual en recintos pequeños y por grupos con excepciones en grandes. **DISEÑO DERIVADO:** la pantalla de actualización muestra JRV del recinto y su fase/hito; en recintos grandes se elige un conjunto de juntas y se ejecuta «Marcar completadas», dejando como **pendientes expresamente informadas** las excepciones que el funcionario selecciona. No convertir automáticamente en «pendiente» ninguna JRV no incluida en el envío. En recintos pequeños se permite cambiar directamente el estado de una JRV.

Cada operación debe mostrar antes de guardar un resumen comprensible: recinto, fase, cantidad de JRV que pasarán a completadas, cantidad con pendiente declarado y cantidad **no tocada**. Al confirmar, el servidor actualiza solo las claves JRV/hito incluidas; no reemplaza el estado de todo el recinto por la fotografía de pantalla del dispositivo.

Los contadores deben diferenciar: total de JRV del recinto, completadas confirmadas, pendientes expresamente comunicadas y sin información. **Fórmula aprobada para avance:** completadas / total de JRV × 100, con denominador del catálogo. Un mismo dato no puede sumarse dos veces por recibir actualizaciones repetidas.

**Corrección libre aprobada:** desde el estado vigente se podrá editar una junta ya registrada, sin pedir autorización o texto de justificación. La última actualización **aceptada por el servidor** para la misma JRV/fase es la vigente, conservando un registro técnico con valor previo, nuevo, operador, recinto y hora. Corregir un dato previo no autoriza a crear anticipadamente hitos futuros.

### 11.4. Hitos, reloj y bloqueo de fases futuras

En modo elección, para registrar el inicio del escrutinio de una JRV deben cumplirse **conjuntamente**: (i) que sean las **19:00 o más en la zona horaria local** y (ii) que exista el **cierre de votación reportado** para esa misma junta. La comprobación corresponde al servidor y a la interfaz. En una operación masiva, separar las JRV habilitadas de las no habilitadas y no desbloquear automáticamente todo el recinto porque una junta esté cerrada. **No** esperar a que todas las juntas terminen para permitir a las que sí cumplieron continuar.

**DISEÑO DERIVADO:** el mensaje de una acción bloqueada debe explicar por qué no puede utilizarse: «Disponible desde las 19:00, hora local», «Falta confirmar el cierre de votación de esta junta», o ambas condiciones. El modo prueba controlado por superadministración omite estas restricciones temporales y secuenciales de simulación, pero no omite permisos.

Los hitos ya definidos —inicio, cierre de sufragio, inicio/fin de escrutinio, inicio/fin de escaneo y cierre total— deben conservarse como hechos distintos. Un hito no implica completar automáticamente los siguientes. No crear un resultado electoral ni pedir detalles de candidaturas, votos afirmativos, papeletas válidas o adjudicación. La definición operativa exacta de «cierre del proceso» queda pendiente.

### 11.5. Participación electoral y «sin novedades»

**DECIDIDO:** se puede informar el número de votantes a partir de conteo de firmas o estimación, con fuente distinguible. **DISEÑO DERIVADO:** al registrar participación, mostrar recinto, cifra, **método** («Firmas en padrón» / «Estimación»), operador y hora. Mostrar qué cifra está vigente y permitir corrección. Si el diseño agrega la cifra a nivel consulado, evitar duplicar una cifra de recinto cargada dos veces; la periodicidad de actualización no debe convertirse en obligación artificial.

Cuando se actualice una fase, ofrecer la confirmación **«Sin novedades» a nivel de recinto/fase**, sin exigirla como un nuevo reporte por cada JRV. No significa «todas las juntas completadas», no suma avances y no cierra ni descarta incidencias existentes. Su interpretación más segura como mensaje de interfaz es «Sin nuevas novedades que comunicar en esta actualización», sin afirmar que no existan incidencias abiertas; la redacción definitiva se validará sin sumar pasos obligatorios.

Los porcentajes de **participación** (si se presentan) no deben confundirse con porcentajes de **avance de juntas**. Solo se pueden calcular sobre número de electores del catálogo validado y deben indicar cuando el numerador es estimado; nunca asumir que una estimación es conteo definitivo.

### 11.6. Registrar una incidencia y pedir apoyo

**DECIDIDO:** registro por excepción, tipos concretos por fase, opción «Otro», alcance sugerido editable, prioridad sugerida editable, seguimiento y resolución. **DISEÑO DERIVADO:** desde la jornada el funcionario pulsa «Reportar incidencia» y encuentra, idealmente en una pantalla breve: fase actual, tipo de incidente, alcance (recinto completo o selección de JRV), prioridad sugerida y una descripción corta solo cuando sea necesaria para entender el hecho o cuando seleccione «Otro». Puede registrar la incidencia sin pedir apoyo a Quito, o marcar una petición de apoyo si precisa intervención.

La solicitud **urgente** de apoyo es una acción expresa y diferenciada. No producir alertas sonoras por el mero hecho de marcar una prioridad crítica. Al confirmar, mostrar identificador de la incidencia, su estado y, en caso de urgencia, el estado de la solicitud (emitida/recibida). Los tipos concretos, descripciones y prioridades iniciales se cerrarán tras cotejar los manuales, y **no** se debe utilizar como definitivo el listado histórico de INSTRUCCIONES.md.

La ficha del consulado debe permitir registrar una explicación breve al resolver, reabrir la misma incidencia si reaparece y, si afecta varias JRV, indicar cuáles se han solucionado, dejando las demás pendientes. Esas acciones no completan automáticamente ningún hito de votación.

### 11.7. Borradores locales, conectividad y resultado del envío

**DECIDIDO:** si hay interrupción de conexión, conservar borradores en el dispositivo y requerir **revisión/envío manual**. **DISEÑO DERIVADO:** distinguir tres situaciones visibles: «Guardado en este dispositivo, pendiente de envío», «Enviando» y «Confirmado por servidor». Una cola/lista pequeña permite revisar el recinto, fase, cambios y hora original de cada borrador y pulsar «Enviar» cuando vuelva la conexión. Nunca describir un borrador local como recibido en Quito.

Si se edita un borrador, mantener su ámbito de recinto y fase; si cambia el recinto activo, no reasignarlo. Enviar un borrador antiguo puede reemplazar un dato posterior porque rige la regla aprobada del último recibido por el servidor: mostrar su fecha original en revisión, **sin** añadir una exigencia de aprobación del conflicto. Evitar reenvíos duplicados por doble clic y hacer visibles errores de validación.

La página puede requerir caché de recursos para seguir funcionando tras perder internet aunque **no se instalará PWA**; la viabilidad real del modo sin conexión en los navegadores de destino debe comprobarse. En dispositivos compartidos, no dejar visibles borradores más allá del acceso de operadores autorizados sin necesidad.

## 12. Tablero DGSMH: control mundial, alertas y reportes

### 12.1. Composición de la pantalla principal

**DECIDIDO:** mapa mundial protagonista y panel lateral visibles simultáneamente. **DISEÑO DERIVADO:** cabecera con título de jornada, fecha/hora de referencia, estado global de conectividad/actualización y acceso a informes. Área central con mapa y leyenda compacta. Área lateral con tres bloques priorizados: (1) solicitudes urgentes por acusar/seguir, (2) consulados/recintos con informes esperados no recibidos, (3) resumen numérico de avance. En pantallas estrechas, el panel puede quedar en una pestaña o sección accesible sin perder la capacidad de atender una alerta.

Los cambios del mapa, del panel y de las fichas deben surgir de datos enviados y aceptados por el servidor; una pantalla que sigue abierta necesita actualizarse sin recarga manual constante. Conservar orden visual estable en lo posible para que los registros no salten innecesariamente.

### 12.2. Mapa por niveles y geografía temporal

**DECIDIDO:** mundo con marcadores agrupados por consulado; al seleccionar o ampliar, recintos y detalle de sus juntas; capa profesional día/noche con terminador solar. **DISEÑO DERIVADO:**

- Vista global: agrupaciones de consulados con resumen claro de avance y alertas; no crear un marcador por cada JRV visible desde el mundo.
- Acercamiento o selección: consulados individuales y sus recintos. La selección de un recinto permite entrar al detalle de JRV y hechos reportados sin abandonar innecesariamente la vista mundial.
- La capa solar presenta **posición del sol y transición entre zona diurna y nocturna** según la fecha y hora del mundo; debe ser sutil y no tapar marcadores, alertas ni rótulos.
- La **hora oficial local** de cada recinto y el régimen horario solar son variables distintas. La interfaz puede mostrar hora local junto al nombre del consulado/recinto. La fuente concreta de zona horaria y coordenadas procede del catálogo validado o de verificación posterior, nunca de una inferencia indiscriminada del país.
- Los estados no se codifican solo por colores. Dar texto para «sin información», «en progreso», «con incidencias» y solicitudes de apoyo; un color de agrupación **no** debe hacer pasar una ausencia de datos por normalidad.
- La capa de iluminación y el mapa no se usarán para deducir que una junta abrió o cerró: eso depende de reportes y reglas horarias.

No inventar localizaciones precisas de recintos no aportadas. Cuando el Excel solo contenga ciudad y no dirección/coordenadas, distinguir la ubicación aproximada del marcador del lugar exacto de votación; el mapa por consulado puede utilizar la localidad hasta contar con ubicaciones validadas.

### 12.3. Indicadores y cálculo de consolidados

**DECIDIDO:** por hito, número de JRV completadas / total y porcentaje; diferenciación de pendiente expresamente reportado y sin información. **DISEÑO DERIVADO:** la ficha de cada recinto incluye su total de JRV, completadas por fase/hito, pendientes declaradas, sin dato, última actividad confirmada y hora local. La ficha del consulado suma numeradores y denominadores reales de **todos sus recintos**; el consolidado mundial suma de igual manera. **No** se suman porcentajes ni se promedian porcentajes de recintos con tamaños diferentes.

Separar cifras de participación electoral de indicadores operativos de avance. Mostrar cuando una cifra de votantes es estimada y cuándo procede del padrón; no mezclar ambas como si fueran datos finales de igual calidad. No atribuir a una JRV un problema porque no informó; la falta de reporte es una alerta de seguimiento independiente.

### 12.4. Panel de alertas y seguimiento de Quito

**DECIDIDO:** todas las incidencias son visibles; solo la **petición urgente de apoyo** emite aviso visual y sonoro dentro del tablero abierto. «Recibido» silencia ese aviso, pero no cierra la incidencia. **DISEÑO DERIVADO:** separar filtros o secciones «Urgente sin acuse», «Recibido/en seguimiento», «Incidencias» y «Reportes esperados sin recibir». La atención de una urgencia debe estar disponible con un botón claro «Recibido» y acceso al teléfono operativo del consulado.

Al recibir, registrar persona DGSMH y fecha/hora; mostrar el asunto hasta que se resuelva. Las llamadas y WhatsApp reales se realizan fuera del sistema; dentro basta registrar actuaciones pertinentes y resultado, sin construir chat integrado ni generar supuestas conversaciones automáticas. Un funcionario DGSMH puede señalar para seguimiento una incidencia no urgida por el consulado. Una incidencia crítica, por sí misma, no genera pitidos.

Un aviso por reporte esperado ausente depende de la **hora local del recinto** y de un margen aún no definido. Mostrarlo como «Falta actualización esperada» y **no** como «junta sin instalar», «consulado sin votar» o «incidente comprobado». El sistema debe indicar último hito y momento de recepción. Evitar que el sonido repetido de la misma urgencia continúe tras el acuse.

### 12.5. Incidencias, cierres parciales y reaperturas

La ficha compartida entre consulado y Quito muestra identificador único, ámbito afectado, momento, tipo, prioridad, petición de apoyo si la hay, estado actual y actuaciones. La resolución requiere **una explicación corta obligatoria**. Si la incidencia afecta varias JRV, se permite registrar solución para una parte de ellas, conservar visibles las restantes y mantener abierta la incidencia. Cada acción parcial registra responsable y hora. Una reapertura **reutiliza el identificador de la incidencia original**, conservando todos los ciclos previos.

DGSMH puede cerrar una incidencia de acuerdo con lo informado por el consulado, pero ese cierre de seguimiento no constituye decisión electoral del CNE. El registro de resolución no altera automáticamente estados de instalación, votación o escrutinio.

### 12.6. Informes integrales y exportación

**DECIDIDO:** informes completos con exportación **PDF y Excel**, visión mundial y desglose por consulado y recinto. **DISEÑO DERIVADO:** cabecera con fecha de generación, fecha de jornada y ámbito del informe; resumen de JRV totales y avance por fase/hito; cifras de votantes y método de obtención; recintos sin información; incidencias por estado, prioridad y alcance; solicitudes urgentes, acuses y seguimiento; marcas horarias de hitos. El Excel debe contener datos tabulares reutilizables y el PDF una presentación legible con totales y detalle según ámbito seleccionado.

Todo informe debe conservar diferencias entre hechos confirmados, pendientes expresos, sin información y estimaciones. Debe señalar **fecha/hora de corte de la consulta** para no presentar como inmutables cifras que los consulados pueden corregir. Si se vuelve a generar después de una corrección, se obtiene el estado vigente; la trazabilidad histórica queda en el sistema. **Excluir** datos de miembros de junta de Madrid, cédulas, fotografías, movimientos y pagos. No presentar el informe como acta electoral, certificación de resultados ni declaración formal del CNE.


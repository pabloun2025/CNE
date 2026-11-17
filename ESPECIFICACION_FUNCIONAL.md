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

## 13. Madrid: detalle de pantallas, estaciones y estados

### 13.1. Objeto y distribución interna

**DECIDIDO.** Madrid dispone de un módulo autónomo que no reporta de oficio a Quito. La administración Madrid prepara fichas de MJRV y credenciales; la puerta registra llegadas; el centro de mando observa las 95 JRV y propone movimientos; la documentación obtiene ambas caras de la cédula; finanzas controla el pago físico. El estado operativo de «tres miembros presentes» es distinto del reporte oficial de instalación.

**DISEÑO DERIVADO:** desde la cuenta administrativa Madrid, la pantalla inicial puede resumir **credenciales preparadas / pendientes, MJRV ingresados, JRV con tres personas presentes, JRV incompletas, documentos completos y pagos confirmados**. Separar visualmente la operación de apertura de juntas de los desembolsos que suelen ocurrir después. La gestión de usuarios de estación, las credenciales, la configuración del pago y los informes quedan en navegación administrativa; el operador de puerta o finanzas no debe ver ese menú.

La interfaz de las estaciones debe ser **una sola tarea por pantalla**, compatible con móviles o tabletas para puerta y fotografía, y ordenadores con impresora para finanzas. Las pantallas administrativas pueden aprovechar tablas y filtros en escritorio.

### 13.2. Carga de MJRV y ficha individual

**DECIDIDO:** importar Excel con nombres, apellidos, cédula, función en junta, serie H/M, número de junta, y correo/teléfono cuando consten. El administrador puede crear, editar y dar de baja fichas particulares. **DISEÑO DERIVADO:**

- La importación inicial se prepara durante el desarrollo a partir del archivo real, tras detectar duplicados, campos ausentes, identificadores inconsistentes y asignaciones imposibles.
- La ficha individual muestra identidad, cargo/función según el Excel, JRV inicialmente asignada, asignación operativa vigente, información de contacto disponible, estado de credencial, llegada, fotografías, movimientos y pago, **según permisos**.
- Distinguir la **asignación de origen** importada del **destino operativo vigente** tras una redistribución. Ningún traslado debe borrar quién estaba originalmente asignado.
- La baja administrativa debe impedir nuevos usos operativos sin borrar historial necesario de ingresos, documentos o pagos; su significado exacto en credenciales ya impresas queda para implementación de la regla de bloqueo.
- La validación de duplicados de cédula es indispensable para no generar credenciales o pagos superpuestos; los casos conflictivos deben quedar identificados para corrección administrativa, no consolidarse automáticamente por similitud de nombres.

La cédula es un identificador personal y debe manejarse como dato protegido. El QR contiene el **número de cédula**, como está aprobado; por tanto, **es un identificador para búsqueda, no una prueba criptográfica de identidad**. Los controles de estación, la verificación del documento y las autorizaciones no pueden descansar solo en conocer o copiar ese QR.

### 13.3. Generación, impresión y distribución de credenciales

**DECIDIDO:** credencial de tamaño CR80 (85,6 × 54 mm), conforme a plantilla que entregará Pablo, con QR individual cuyo contenido es el número de cédula. Salidas: PDF individual, hojas A4 optimizadas para corte y portaidentificaciones, envío por WhatsApp con el servicio existente y por correo electrónico.

**DISEÑO DERIVADO:** las credenciales se generan a partir de la misma ficha validada. El administrador podrá seleccionar una o múltiples personas para producir un PDF individual o un documento A4 con tantas credenciales completas como permita la impresión legible; mantener proporción CR80, márgenes de corte prácticos y ningún elemento fuera de página. Cada credencial debe mostrar únicamente los campos indicados por la plantilla oficial y datos disponibles en la ficha. El código QR será legible por cámara de móvil y lector previsto; comprobar esa legibilidad con un dispositivo real antes de distribuir.

Al enviar credenciales, distinguir claramente **«preparada»**, **«enviada al servicio»**, **«falló envío»** y **«entrega confirmada»** solo si el proveedor realmente devuelve confirmación. No inventar estados «recibido» o «leído» si la integración no los proporciona. La conexión a Evolution API/teinvito debe reutilizarse **solo después de comprobar el mecanismo real y sus límites**; el correo electrónico requiere verificar el transporte disponible. No es necesario crear otro servicio de mensajería sin motivo.

### 13.4. Control de puerta: flujo del operador

**DECIDIDO:** enlace especial revocable, identificación del funcionario por nombre y PIN de cuatro dígitos, escaneo de QR, resultado inmediato en pantalla, sonido y actualización del centro de mando. **DISEÑO DERIVADO:**

1. El administrador habilita el enlace y permisos de la estación de puerta. El funcionario introduce su nombre/identificación de operador y PIN; no accede a la administración.
2. La pantalla queda lista para leer códigos sucesivos, con botón claro para activar cámara y, si el dispositivo lo requiere, alternativa de entrada manual controlada del identificador (esta alternativa es diseño técnico, no una decisión de acceso libre).
3. Al leer la cédula del QR, el servidor comprueba que corresponde a una ficha autorizada y el estado del ingreso.
4. Si la primera lectura es válida: mensaje **verde «Válida»**, pitido agudo, registro de ingreso con operador y hora; el tablero de Madrid se actualiza.
5. Si el código es desconocido, ya utilizado o está bloqueado: mensaje **rojo**, motivo comprensible y dos pitidos graves; no crear un segundo ingreso válido por una lectura duplicada.
6. La interfaz vuelve con rapidez al modo de lectura para evitar acumulación de personas.

**PENDIENTE:** definición exacta de «bloqueado», tratamiento de salida y reingreso físico y facultad administrativa de desbloqueo. La señal roja para duplicado debe respetarse mientras no haya norma funcional distinta; no suponer que una segunda lectura acredita una segunda llegada. La lectura válida establece **presencia operativa presunta**, no certifica que el MJRV esté ya en su mesa ni que su junta se haya instalado.

**DISEÑO DERIVADO:** la lectura debe ser idempotente en servidor para impedir que dos lecturas casi simultáneas dupliquen el mismo ingreso. La falta de permiso de cámara, QR ilegible o pérdida de conexión debe mostrarse como error de operación, no como identidad rechazada.

### 13.5. Centro de mando: lectura de las 95 juntas

**DECIDIDO:** visualizar 95 fichas, separadas en hombres **H1–H41** y mujeres **M1–M54**, agrupables por problemas, con identificación de zona cromática según distribución del apartado «Mapa de juntas de Madrid». **DISEÑO DERIVADO:**

- Cabecera con número de MJRV que llegaron; JRV con al menos tres integrantes operativamente disponibles; JRV a las que les faltan integrantes; y suplentes identificados como transferibles.
- Vista principal de fichas con **serie H/M + número**, color de **zona**, estado de dotación y, si corresponde, señal de que hubo movimiento.
- Colores de **estado**, distintos de colores de **zona**: verde para tres presentes; ámbar para junta incompleta; rojo si no ha llegado nadie. Mostrar también texto y conteo.
- Orden y filtros que pongan primero las juntas más próximas a quedar constituidas, las sin dotación y las que tienen suplentes transferibles. No forzar una geometría del nivel −2 ni dibujar incorrectamente los bloques.
- Ficha ampliada de junta con miembros originalmente asignados, marcados como llegados, reasignados, faltantes y personas disponibles para apoyar, sujeto a permisos.
- La disponibilidad basada en puerta es una **estimación de trabajo** y admite excepciones anotadas desde el centro de mando cuando una persona no está realmente disponible.

El centro de mando no transforma tres presencias en «instalada» en el módulo nacional, no cierra incidencias consulares y no puede utilizar sus datos internos para crear informes automáticos de Quito.

### 13.6. Motor de propuestas de redistribución y control humano

**DECIDIDO:** sugerir **un movimiento a la vez**, priorizando suplentes sobrantes en la misma zona; si no los hay, otras zonas, según cercanía y disponibilidad. El coordinador del centro de mando **acepta**, **pasa a otra propuesta** o **indica que no es viable**. Ninguna IA ejecuta cambios por su cuenta.

**DISEÑO DERIVADO:** una propuesta debe mostrar quién se trasladaría, función y JRV actual, zona de origen, junta de destino, razón del movimiento, número de integrantes que permanecerían en el origen y beneficio esperado en destino. **No ofrecer como transferible a una persona que deje su junta de origen sin el mínimo requerido**, salvo regla operativa expresa posteriormente validada. No crear dos movimientos pendientes simultáneos de la misma persona.

La preferencia debe ordenar primero **soluciones dentro de la misma zona**, luego en las otras zonas que resulten más cercanas, usando las relaciones espaciales realmente conocidas. No afirmar un cálculo de metros o minutos de desplazamiento basado en un plano incompleto. La distancia puede tratarse como prioridad relativa por zonas/adyacencia hasta contar con información más precisa.

Al aceptar, el servidor registra: persona, origen, destino, coordinador que autorizó, hora, asignación anterior y nueva. Se actualizan de inmediato las fichas y el cómputo de disponibles. Al pasar o rechazar por inviabilidad, guardar un motivo simple para no repetir sin criterio la misma sugerencia. Si el motor local de IA no está accesible, las funciones fundamentales de consulta y **movimiento manual autorizado por el centro de mando** deberían seguir siendo implementables; esta continuidad dentro del software es una propuesta de resiliencia, no autorización de traslados automáticos.

**PENDIENTE:** mecanismo exacto para que el coordinador conozca que el traslado físico se cumplió, porque aprobarlo en pantalla no garantiza que el suplente haya llegado a la junta de destino. No asignar por defecto confirmación formal a los coordinadores de mesa, que no tendrán cuentas del sistema.

### 13.7. Obtención de anverso y reverso de la cédula

**DECIDIDO:** QR **genérico** distinto del QR individual, formulario donde se escribe cédula, fotografía de anverso y reverso, ayuda opcional de funcionario, guía de encuadre, captura automática cuando esté correctamente alineada y recorte. Ambas imágenes sirven como anexo de la **segunda página del acta de pago**.

**DISEÑO DERIVADO:** el formulario confirma que existe una ficha para esa cédula, muestra el mínimo dato necesario para evitar subir imágenes a una persona equivocada y pide dos capturas diferenciadas. Se observa una previsualización para aceptar, repetir o corregir. No se debe considerar completo el expediente con dos fotos del mismo lado, archivos vacíos o imágenes ilegibles. La calidad y la captura automática requieren ensayo real con cámaras y navegadores; si el algoritmo de encuadre no es suficientemente fiable, conservar una forma controlada de captura manual y recorte sin bloquear el proceso.

Las fotografías deben almacenarse asociadas a la ficha MJRV, **nunca en archivos públicos por URL predecible**. El QR genérico no equivale a un enlace público para consultar fichas ajenas: validar acceso y limitar la información visible. Si la persona no consigue fotografiar su documento, un funcionario autorizado de documentación/finanzas puede completar ambas capturas. **PENDIENTE:** si el QR se entrega por cartel, WhatsApp o ambos, y la regla de conservación y retirada de imágenes sensibles.

### 13.8. Finanzas: flujo físico completo de atención y pago

**DECIDIDO:** dos o tres puestos simultáneos; lectura del **QR individual**; verificación directa por el operador de finanzas de que la persona cumplió sus funciones, **sin autorización previa** del centro de mando. Fotografías obligatorias de ambas caras. Impresión y firma del acta y entrega de efectivo **antes** de confirmar el pago en pantalla. **DISEÑO DERIVADO:**

1. El operador ingresa mediante su enlace especial, nombre y PIN, y abre la pantalla de lectura.
2. Escanea el QR individual. El sistema busca la ficha y comprueba identidad registral, estado de documentación y que **no exista pago confirmado**.
3. Se muestra la situación y, cuando corresponda, la ficha del MJRV y su junta de trabajo actual. El funcionario de finanzas verifica directamente el cumplimiento de funciones; el escaneo de entrada no prueba ese cumplimiento.
4. Si falta alguna fotografía, la pantalla ofrece completar el expediente en el puesto o derivarlo a la captura de documentación; **no** habilita imprimir el acta final incompleta.
5. El sistema presenta el monto en USD, tipo de cambio configurado por administración y monto resultante en EUR **con la fórmula que se aprobará**. No implementar una conversión supuesta sin parámetro válido.
6. El funcionario genera/previsualiza e imprime el **acta de pago y su anexo de fotografías**, conforme a plantilla aportada. El documento de papel recibe las firmas del pagador y receptor; el efectivo se entrega físicamente.
7. **Solo entonces** el operador pulsa «Confirmar pago», con identificación y hora. El servidor comprueba nuevamente que no existe confirmación previa y registra el desembolso de forma atómica.
8. Una consulta posterior muestra inequívocamente «Pagado», importe EUR, responsable y momento, y bloquea el segundo desembolso ordinario.

No confundir **acta generada**, **acta impresa**, **atención en curso** y **pago confirmado**. Un error de impresora, abandono del puesto o acta reimpresa **no** debe marcar a la persona como pagada. Si se intenta leer un QR cuyo pago ya está confirmado, mostrar aviso claro y los datos mínimos del pago anterior para que no vuelva a pagarse.

**PENDIENTE DE DECISIÓN TÉCNICA/OPERATIVA:** reserva temporal mientras un puesto prepara pago, duración y recuperación si falla impresión o se cierra sesión. Es razonable usar reserva corta, visible y recuperable para evitar que dos puestos preparen simultáneamente el mismo expediente, **pero no constituye una decisión aprobada**. Lo imprescindible ya aprobado es que dos confirmaciones concurrentes **no** puedan generar dos pagos.

**PENDIENTE DE INSUMO:** plantilla oficial definitiva, cantidad USD, tipo de cambio de jornada y regla precisa de conversión/decimales. No incorporar tasas de cambio de internet ni redondeos inventados. Una anomalía en el sistema o un pago controvertido debe resolverse por personal autorizado, sin crear un segundo pago automático.

### 13.9. Panel financiero e informes de cierre Madrid

**DECIDIDO:** control individual y resumen en tiempo real de **pagados, pendientes, total entregado en euros**, con informe descargable de pagos, importes y operadores responsables. **DISEÑO DERIVADO:** distinguir al menos (a) documentación incompleta, (b) documentación lista y pago no confirmado, (c) atención o acta en preparación, cuando haya registro fiable de ese estado, y (d) pago confirmado. No elevar todas las fichas con documentación completa a «pagadas».

El informe PDF/Excel de Madrid debe poder presentar: identidad y referencia de MJRV, serie/junta operativa, monto USD de referencia y monto EUR **cuando sea aplicable**, condición pendiente o confirmada, momento, operador pagador y total en euros. El total entregado se calcula solo con confirmaciones de desembolsos, no con documentos preparados. No incorporar fotografías de cédulas a un listado financiero general por defecto: las imágenes están en el anexo del acta individual, sujeto a permisos. Las cifras se recalculan tras cada confirmación atómica.

### 13.10. Operadores de estación y experiencia de trabajo

Los enlaces de **puerta**, **documentación**, **finanzas** y, si procede técnicamente, centro de mando son funciones delimitadas por rol y estación. Cada operador se autentica con su **PIN de cuatro cifras** y nombre/cuenta previamente habilitados por la administración de Madrid. Se conserva la identificación durante la jornada en ese dispositivo hasta salir o cambiar de operador. Intentos fallidos se limitan, enlaces y PIN pueden revocarse y no dan acceso a la administración.

**DISEÑO DERIVADO:** cada pantalla operativa debe ofrecer un encabezado discreto con función y operador actual, estado de conexión y una acción visible de «Cambiar operador» o «Cerrar sesión». El lector de puerta debe permitir procesar rápidamente personas sucesivas; finanzas necesita controles grandes para distinguir «Imprimir acta» de «Confirmar pago»; documentación tiene dos pasos visuales claros «Anverso» y «Reverso». No usar menús genéricos que permitan a un operador saltar a funciones sin autorización.

## 14. Superadministración y preparación de la elección

### 14.1. Alcance de la superadministración

**DECIDIDO:** existe superadministrador separado de DGSMH y de administrador Madrid, con herramientas de configuración y puesta en marcha. **DISEÑO DERIVADO:** deberá poder ver la configuración general; consultar e importar catálogos corregidos; administrar cuentas institucionales consulares, cuentas DGSMH y el acceso de administración Madrid; verificar existencia de recintos/JRV y parámetros de zona horaria; gestionar las opciones **«Modo prueba»** y **«Borrar datos de prueba y preparar para elección»**. No es una cuarta pantalla de operación consular ni un panel para modificar indiscriminadamente datos reales del día electoral.

La administración Madrid mantiene su ámbito de MJRV, credenciales, operadores, documentación y pagos; esa administración no permite ver o modificar los reportes de otros consulados. El superadministrador solo accede a datos sensibles de Madrid cuando sea estrictamente necesario para un cometido de configuración autorizado; la existencia de un rol global no debe provocar exposición indiscriminada de fotos.

### 14.2. Modo prueba: comportamiento visible y límites

**DECIDIDO:** se prueba **en la propia instalación de producción**, sin entorno paralelo. Solo superadministración enciende/apaga el **modo prueba**; mientras esté activo se pueden recorrer las fases sin esperar horas reales ni cierres previos. **DISEÑO DERIVADO:** indicar **«MODO PRUEBA»** de forma notoria en los tres portales y etiquetar cada nuevo evento como dato simulado. Las interfaces mantienen permisos y controles de identidad; lo que se omite son las restricciones de reloj/secuencia que impedirían demostrar las funciones antes de la elección.

En ese modo se pueden simular reportes, alertas, estados de JRV, llegadas por puerta, traslados, capturas de prueba y trámites de pagos **sin que la mera confirmación informática suponga entrega de dinero real**. Las pruebas de impresión no equivalen a actas definitivas y deberían llevar señalización inequívoca para que nadie las utilice por error como comprobantes reales. Los tableros deben indicar que las cifras y estados son simulados.

### 14.3. «Borrar datos de prueba y preparar para elección»

**DECIDIDO:** botón exclusivo de superadministración que restablece los registros operativos simulados, **conserva todos los datos maestros y configuraciones** y deja activas las reglas de operación real. **DISEÑO DERIVADO del procedimiento:**

1. El sistema muestra resumen de qué categorías se limpiarán: reportes/hitos de prueba, incidencias/urgencias, estados transitorios, ingresos, movimientos, capturas de documento de ensayo y confirmaciones de pago simuladas.
2. Avisa explícitamente qué se conserva: cuentas y contraseñas, operadores/PIN habilitados, consulados, recintos, JRV, electores, MJRV, plantillas de credencial y pago, configuración de moneda/tipo de cambio y parámetros legítimos.
3. Exige confirmación administrativa clara y realiza **respaldo** previo comprobable. Si el respaldo falla, no debe seguir un borrado destructivo.
4. Ejecuta limpieza **selectiva de registros marcados como prueba**, y no un vaciado indiscriminado de las tablas. Evita que datos de pruebas permanezcan como pagos confirmados o afecten el conteo de presencia el día electoral.
5. Verifica que los informes y tableros de operación electoral comiencen sin actividad de prueba y que los catálogos sigan disponibles.
6. Establece **modo elección** con las restricciones de hora local y secuencia restauradas, y muestra un resultado de la preparación.

La función **no debe borrar actividad electoral real** ni quedar disponible a operadores de estaciones. Si se acciona de forma repetida, no debe destruir información que no esté etiquetada como ensayo. Las credenciales y archivos nominativos que deban utilizarse el día de la jornada se conservan; las fotos capturadas durante una simulación se tratan como prueba salvo decisión diferente basada en necesidad real.

**DISEÑO DERIVADO DE SEGURIDAD:** separar lógica y datos de ensayo mediante un identificador/indicador inequívoco desde el primer registro, en lugar de intentar reconocer «a ojo» qué es prueba el día 29. Un respaldo previo protege de errores, pero no es licencia para mezclar datos reales y ficticios. No habilitar un reinicio general de producción con el pretexto de simplificar la limpieza.

### 14.4. Parámetros que el superadministrador debe poder verificar

Datos por consulado y recinto, fuente/identificador de huso horario, totales de JRV, asignaciones, cuentas y estado de acceso. Para Madrid: referencia a plantilla vigente, datos de funcionarios de estación, importe USD y tipo de cambio manual cuando se hayan aprobado, sin accesos que permitan a Quito consultar expedientes personales. Para el seguimiento: márgenes de «reporte esperado ausente», aún **pendientes** de definición; no fijar minutos arbitrarios. No añadir un editor de nuevas elecciones, porque el producto se utiliza solo para la jornada de 2026.

## 15. Modelo de información, operaciones y trazabilidad

### 15.1. Entidades funcionales principales

La siguiente tabla describe **datos lógicos**; no prescribe un esquema SQL, nombres de tablas ni decisiones de implementación irrevocables.

| Entidad | Datos y referencias mínimos | Ámbito / regla |
| --- | --- | --- |
| Consulado | Identificador, denominación, cuenta institucional, teléfono operativo | Solo sus recintos; Quito consulta contacto operativo |
| Recinto | Identificador, consulado responsable, nombre, localidad, huso horario, JRV asociadas | Unidad central de reporte |
| JRV | Identificador estable, recinto, serie/número si corresponde, total de electores cuando figure | El avance se almacena por JRV/hito |
| Operador consular | Nombre declarado en sesión, cuenta institucional, sesión/dispositivo de actuación | No requiere cuenta personal |
| Reporte de hito | JRV o ámbito pertinente, hito, estado, datos y hora declarada si existe, hora de recepción, operador | Último reporte recibido para misma JRV/fase prevalece |
| Reporte de participación | Recinto/ámbito definido, cifra, fuente firmas/estimación, hora, operador | No confundir con avance por JRV |
| Confirmación sin novedades | Recinto, fase, hora, operador | No modifica estados de juntas |
| Incidencia | Identificador, recinto, JRV afectadas o ámbito general, fase, tipo, prioridad, situación | Independiente del avance |
| Actuación de incidencia | Incidencia, actor, fecha/hora, texto de resolución, subconjunto JRV resuelto si corresponde | Historial inalterado de eventos |
| Solicitud de apoyo | Incidencia/origen, urgencia, fecha, acuse DGSMH, estado | Urgencia sonora solo con solicitud expresa |
| Alerta por falta de reporte | Recinto/hito esperado, regla temporal, última actualización, situación | No constituye incidencia electoral |
| MJRV Madrid | Identidad, cédula, JRV inicial, cargo, contactos opcionales, estado operativo | Datos de acceso restringido |
| Credencial MJRV | Referencia MJRV, plantilla/versiones y dato QR (cédula) | Identificador, no autenticación suficiente |
| Ingreso Madrid | MJRV, puerta/operador, hora, resultado | Evitar duplicaciones |
| Movimiento Madrid | MJRV, origen/destino, aprobador, hora, motivo/estado | Historial de reasignaciones |
| Documento MJRV | MJRV, imagen anverso, imagen reverso, estado de captura | Datos sensibles y acceso restringido |
| Trámite de pago | MJRV, estado de preparación, importes y tipo de cambio, operador de estación | No equivale por sí mismo a pago |
| Confirmación de pago | MJRV, euros efectivamente entregados, confirmante, momento | Única e indivisible por MJRV |
| Registro de prueba | Identificador de sesión/ciclo o bandera de simulación, tipo y referencia del evento | Selección segura para limpieza de pruebas |

**PENDIENTE:** nombres reales de campos de Excel, campos del modelo de acta y política de conservación documental. No mostrar como obligatorio un dato que el archivo fuente no contiene, salvo que resulte imprescindible por regla aprobada.

### 15.2. Reglas de consistencia y concurrencia

- Un operador consular solo escribe sobre JRV del recinto autorizado por su cuenta; todas las escrituras llevan identificación operativa y momento de recepción del servidor.
- Dos acciones sobre **JRV distintas** no se sobreescriben entre sí. Dos actualizaciones sobre la misma JRV y fase dejan vigente la última aceptada por el servidor, sin bloquear con confirmaciones de conflicto no aprobadas.
- El envío no produce «éxito» hasta que el servidor lo confirma. Un clic duplicado o reintento de red no debe crear dos incidencias idénticas por accidente ni dos confirmaciones de pago.
- Para una **incidencia**, el estado y las resoluciones parciales deben poder coexistir con eventos posteriores y con reaperturas. La explicación breve es obligatoria **al resolver**, no al corregir libremente un reporte de hito.
- El pago **confirmado** de un MJRV no admite una segunda confirmación ordinaria, incluso cuando dos puestos de finanzas actúen casi simultáneamente; se requiere comprobación atómica de servidor.
- Una JRV con tres llegadas operativas en Madrid puede seguir «sin información» en instalación consular: no existe sincronización automática entre esos dos hechos.
- La limpieza de pruebas no modifica cuentas, catálogos ni pagos reales, y no puede ejecutarse como operación de caja normal.

### 15.3. Distinción entre estado actual e historial

El sistema necesita **estado actual legible para operaciones** e **historial de eventos suficiente para auditar cambios**, aunque el funcionario no vea una pantalla compleja de auditoría. En reportes, conservar la última versión vigente y trazabilidad técnica de cambios con operador, fecha y valor anterior; no pedir justificación. En incidencias, conservar apertura, cambios de alcance/prioridad, solicitudes de apoyo, acuses, resoluciones parciales, cierres y reaperturas. En Madrid, mantener asignación inicial y movimientos; diferenciar impresiones de actas de confirmaciones de desembolso.

Los informes de cierre son **fotografías del estado de los datos al momento de generarlos**, por lo que deben identificar su hora de corte. Si un consulado corrige después, el informe regenerado puede diferir; no etiquetar ambos como idénticos ni modificar silenciosamente un archivo PDF ya emitido. La política de archivo y eliminación definitiva posterior a la elección está pendiente.

### 15.4. Estados funcionales mínimos por subsistema

| Subsistema | Estados que debe distinguir |
| --- | --- |
| JRV por fase/hito | Completada; pendiente expresamente reportada; sin información |
| Reporte local | Borrador en dispositivo; enviando; aceptado por servidor; error de envío |
| Incidencia | Abierta; parcialmente resuelta si procede; cerrada; reabierta sobre la misma incidencia |
| Solicitud urgente | Emitida sin acuse; recibida por DGSMH/en seguimiento; resuelta |
| Alerta de reporte ausente | Ausencia detectada; actualizada/regularizada o sin actualizar, sin equipararla a incidencia |
| Llegada Madrid | No registrada; ingreso válido; intento de segundo escaneo/rechazo, según regla aún abierta |
| Junta Madrid | Sin nadie; incompleta; al menos tres presentes/disponibles; con marca de movimiento si corresponde |
| Documento MJRV | Falta anverso y/o reverso; completo; requiere repetición por imagen inservible |
| Pago MJRV | Documentación incompleta; listo para preparar; trámite/acta preparada; pago físico confirmado |
| Sistema global | Modo prueba; modo elección |

Estas etiquetas expresan diferencias lógicas. No obligan a crear una pantalla nueva por cada estado ni definen si se implementarán como enumeraciones, eventos o columnas.

### 15.5. Matriz de acciones que exigen confirmación

| Acción | Interacción mínima |
| --- | --- |
| Registrar o corregir un reporte consular | Guardar/enviar y mostrar resultado; **sin motivo obligatorio** |
| Registrar incidencia | Confirmar tipo, ámbito y datos, sin formulario extensivo |
| Registrar resolución parcial o total | Elegir JRV cuando corresponda y **explicación breve obligatoria** |
| Acusar urgencia DGSMH | «Recibido»; conserva incidencia abierta |
| Autorizar un traslado Madrid | Aprobación expresa del centro de mando; nunca automática |
| Tomar imagen de documento | Revisar imagen capturada y permitir repetir |
| Generar/imprimir acta | Acción distinta del pago; no cambiar a «pagado» |
| Confirmar pago | Acción explícita del operador financiero **tras efectivo y firmas** |
| Pasar a modo prueba | Acción exclusiva superadmin, con señal visible del estado |
| Borrar pruebas y preparar elección | Respaldo, alcance explícito, confirmación y validación posterior |

### 15.6. Fórmulas e indicadores ya definidos

- **Avance de hito por recinto (%) = JRV con hito completado / total de JRV del recinto × 100.**
- **Avance por consulado (%) = suma de JRV con hito completado de sus recintos / suma de JRV totales de esos recintos × 100.**
- **Avance mundial (%) = suma de JRV con hito completado / suma de JRV totales del catálogo pertinente × 100.**
- **Votantes:** conservar cantidad informada, fuente y alcance. Una tasa de participación solo se calcula cuando existen numerador de alcance comparable y electores habilitados validados; si la cantidad fue estimada, identificarlo.
- **Total EUR efectivamente entregado en Madrid = suma de importes EUR de pagos confirmados**, sin contar preparaciones o impresiones.
- **Importe EUR individual:** pendiente de la fórmula, tasa manual y regla de redondeo aprobadas. No introducir coeficiente ni tipo de cambio por suposición.

Una cifra «0» expresamente confirmada no es lo mismo que «sin información»; una JRV «pendiente» no cuenta como «completada». La hora real de cada hito reportado puede diferir de su hora de recepción en el servidor: conservar ambos valores si el flujo y la fuente los proporcionan, sin hacer obligatorio un campo histórico que Pablo no ha solicitado.

## 16. Seguridad, integridad y tratamiento de datos

### 16.1. Identidad, autenticación y límites reales de cada credencial

**DECIDIDO:** cuentas consulares institucionales compartidas; cuentas individuales DGSMH; cuenta administrativa independiente de Madrid; cuenta superadministradora; estaciones de Madrid con nombre y PIN personal de cuatro dígitos. **DISEÑO DERIVADO:** la autenticación y la autorización deben comprobarse en el servidor para cada solicitud. No basta con ocultar botones o pantallas.

- La contraseña de cuentas convencionales tiene un mínimo de ocho caracteres. No agregar por defecto MFA ni reglas de composición que no han sido aprobadas. Limitar intentos y gestionar sesiones sin interrumpir innecesariamente la jornada.
- Un consulado puede usar varios dispositivos. El nombre declarado de operador permite atribución operativa de sus actos, **no** constituye verificación legal de la identidad de la persona.
- Cada funcionario DGSMH actúa con su propia cuenta y no administra claves consulares, MJRV o pagos.
- Los PIN de cuatro dígitos solo se aceptan junto al operador/enlace habilitado; requieren límites de intentos y revocación. No guardarlos ni exponerlos como texto plano en interfaces o exportaciones. La definición de recuperación/cambio sigue pendiente.
- La cédula contenida en el QR individual de Madrid no debe considerarse un secreto. El QR permite localizar una ficha, pero la operación depende de controles humanos y de permisos de estación.
- Las URLs de documentos PDF y fotografías deben comprobar permisos por servidor; no usar rutas de acceso público que se puedan adivinar.
- Mantener sesiones, operaciones y controles de acceso de Madrid separados de la cuenta de reportes consulares, aunque la aplicación comparta infraestructura.

### 16.2. Privacidad de la información de Madrid

**DISEÑO DERIVADO:** aplicar minimización. Un operador de puerta necesita saber si el QR es válido y los datos mínimos para identificar a la persona; no necesita ver fotografías del documento, pagos ni la lista completa de MJRV. Un operador de documentación necesita consultar la ficha necesaria para asociar imágenes. Finanzas accede a ficha, documentos y pagos necesarios para la actuación; Quito no accede a esos datos internos en ninguna pantalla ni exportación.

Fotografías de cédulas: proteger en tránsito y en almacenamiento, no dejar expuestos originales por rutas de servidor ni incluirlos automáticamente en informes globales. No imprimir fotos de documentos fuera de su anexo individual autorizado. **PENDIENTE DE DEFINICIÓN INSTITUCIONAL:** plazo de conservación, destrucción posterior, información a interesados, fundamento del tratamiento y acceso al archivo documental. No inventar reglas españolas o ecuatorianas para suplir esa revisión.

El acceso público o semipúblico al QR genérico de subida requiere limitar intentos, consultar el mínimo indispensable y evitar que alguien pruebe cédulas en masa para descubrir datos personales. La identificación escrita en ese formulario no prueba por sí sola ser titular del documento.

### 16.3. Registro técnico y observabilidad

Sin cargar de campos al usuario, registrar errores de servidor, autenticaciones fallidas, intentos de uso de enlaces revocados, cambios de catálogo, reportes corregidos, acuses de urgencia, resoluciones, movimientos de MJRV, generación/reimpresión de actas y confirmaciones de pago. No registrar en logs públicos imágenes, contraseñas, PIN, documentos completos ni datos personales innecesarios. Los logs técnicos no sustituyen los eventos funcionales que necesitan ver los administradores.

**DISEÑO DERIVADO:** fechas/horas de persistencia coherentes, con conversión a zonas locales en presentación; conservar la hora de recepción del servidor para la regla de último reporte vigente. Si la hora del dispositivo no es fiable, no usarla como criterio de resolución de conflictos ni de vencimientos oficiales.

### 16.4. Continuidad de sesión, red y servidores

La solución utiliza la VM Oracle Cloud existente y se apoya en Next.js/Node, PostgreSQL, Docker Compose y Cloudflare Tunnel como referencias verificadas, **sin presuponer que se ha desplegado ya el CNE**. Antes de construir será necesario comprobar recursos, servicios compartidos, red, rutas, aislamiento y respaldo. No crear infraestructura adicional por costumbre ni alterar aplicaciones existentes sin necesidad.

El funcionamiento web debe ser adecuado en móvil con HTTPS y permisos de cámara. Las pruebas mínimas deben comprobar cámara, lectura QR, fotografía, impresión A4, generación PDF y envío con los proveedores realmente existentes. Los borradores offline están aprobados, pero no se puede prometer ejecución completa sin red sin verificar que la interfaz cargue desde caché. **La política externa de contingencia ante indisponibilidad total sigue pospuesta por instrucción de Pablo**; no convertirla en otra ronda de preguntas.

### 16.5. Calidad de información y reglas de error

Errores deben indicar lo que ocurrió y cómo corregirlo, sin adjudicar falsamente incidentes electorales. Casos distintos: credenciales incorrectas, acceso no autorizado, recinto equivocado, cifra de votantes inválida, documento sin reverso, QR no reconocido, segundo ingreso, falta de conectividad, archivo de Excel inconsistente, impresora sin respuesta y segunda confirmación de pago denegada.

**DISEÑO DERIVADO:** ante un envío duplicado de reporte, prevenir duplicaciones de efecto; ante fallo parcial de una operación masiva, mostrar exactamente qué JRV se actualizaron y cuáles no, o garantizar atomicidad del grupo. No mostrar «Guardado» si el servidor devolvió error. Evitar borrar texto ya introducido ante un error recuperable. Comprobar formatos de números, cédulas y montos según las fuentes y los requisitos del proceso, sin inventar validadores que rechacen datos reales del archivo aportado.

## 17. Criterios de aceptación funcional y comprobaciones previas a la jornada

Las pruebas siguientes constituyen una **lista de comprobación del software, no un compromiso de montar un laboratorio paralelo**. Se realizarán sobre la instalación prevista, con **modo prueba**, siguiendo la decisión de Pablo. Los casos se agrupan para que pueda verificarse rápidamente lo esencial. Los parámetros dependientes de insumos reales se completarán cuando estén disponibles.

### 17.1. Portal consular

| ID | Escenario | Resultado esperado |
| --- | --- | --- |
| C-01 | Primer inicio de sesión con contraseña temporal | Solicita cambiarla; no permite continuar con la inicial sin completar el cambio |
| C-02 | Dos dispositivos usan cuenta del mismo consulado | Cada dispositivo identifica operador distinto; cada envío conserva el nombre declarado |
| C-03 | Consulado con varios recintos cambia recinto activo | El encabezado cambia, los reportes van al recinto elegido y no se trasladan borradores de otro |
| C-04 | Intento de acceder a recinto de otra oficina | El servidor rechaza consulta y escritura |
| C-05 | Actualización individual de una JRV | Solo cambia esa JRV/hito; las demás conservan su estado |
| C-06 | Marcar grupo completado con excepciones pendientes | El numerador incluye solo completadas; las excepciones son pendientes expresas y las no tocadas siguen sin información |
| C-07 | Actualizaciones simultáneas de JRV diferentes | Ninguna pisa el estado de la otra |
| C-08 | Actualizaciones contradictorias misma JRV/fase | Prevalece la última aceptada por el servidor, con atribución automática |
| C-09 | Corrección de fase ya reportada | El consulado corrige sin permiso de Quito ni justificación obligatoria; Quito ve nuevo valor |
| C-10 | Intentar reportar escrutinio antes de 19:00 local | En modo elección está deshabilitado, aun cuando el reloj del dispositivo esté alterado |
| C-11 | Son más de las 19:00 pero una JRV no tiene cierre reportado | Escrutinio bloqueado solo para esa JRV; otras cerradas pueden avanzar |
| C-12 | Alternar modo prueba | Se pueden recorrer fases sin las restricciones de tiempo/secuencia y se ven distintivos de prueba |
| C-13 | Reportar cifra de votantes | Guarda cantidad y tipo de fuente; no la convierte en avance de JRV |
| C-14 | Marcar «Sin novedades» | No cambia juntas a completadas ni cierra incidencias |
| C-15 | Perder conexión tras introducir cambios | Quedan como borradores locales, no figuran enviados; se revisan y transmiten manualmente |
| C-16 | Reintentar un envío después de error | Muestra aceptación real del servidor y evita efectos duplicados |
| C-17 | Solicitar apoyo urgente desde incidencia | Se crea solicitud específica sin convertir todas las incidencias en urgentes |

### 17.2. Tablero DGSMH

| ID | Escenario | Resultado esperado |
| --- | --- | --- |
| Q-01 | Ingresar con cuenta DGSMH | Muestra mapa y seguimiento, no panel superadmin ni datos personales de Madrid |
| Q-02 | Abrir el mapa mundial | Se ven consulados agrupados y un panel lateral de alertas e indicadores |
| Q-03 | Acercar/seleccionar un consulado | Se abren sus recintos y detalle de JRV sin mezclar ubicaciones |
| Q-04 | Avanzar el tiempo de simulación visual | Cambia la zona solar día/noche, pero no modifica hitos reportados |
| Q-05 | Consultar hora local de recinto | Usa la zona local del lugar; no la hora del navegador remoto |
| Q-06 | Consolidar dos recintos de tamaños distintos | Suma juntas y obtiene porcentaje ponderado por juntas, nunca media simple de porcentajes |
| Q-07 | Recinto aún sin reportes | Muestra «sin información» y no acusa interrupción electoral como hecho |
| Q-08 | Falta de hito tras margen esperado configurado | Se muestra alerta informativa diferenciada de incidencia; no genera incidente automático |
| Q-09 | Incidencia alta/crítica sin solicitud urgente | Se visualiza para seguimiento, sin alarma sonora solo por su prioridad |
| Q-10 | Solicitud urgente del consulado | Aviso visual y, cuando navegador lo permita, sonido; permanece si el audio está bloqueado |
| Q-11 | Pulsar «Recibido» en Quito | Registra acuse, silencia esa urgencia y conserva incidencia pendiente |
| Q-12 | Resolver parcialmente incidencia de varias JRV | Quedan visibles las juntas afectadas restantes y explicación de la resolución |
| Q-13 | Reabrir la misma incidencia | Conserva identificador y los ciclos históricos |
| Q-14 | Emitir informe mundial PDF/Excel | Refleja avances, participación, incidencias, ausencias y hora de corte; excluye datos internos Madrid |
| Q-15 | Consulado corrige dato después del informe | La vista vigente se actualiza y el informe nuevo muestra su propia hora de corte |

### 17.3. Madrid: credenciales, acceso y conformación

| ID | Escenario | Resultado esperado |
| --- | --- | --- |
| M-01 | Cargar archivo de MJRV con inconsistencias | Se detectan duplicados/campos conflictivos; no se generan fichas erróneas en silencio |
| M-02 | Generar credencial individual | Respeta plantilla CR80; QR codifica cédula de la ficha correspondiente |
| M-03 | Generar hoja de impresión | A4 con credenciales completas, legibles, proporción y sin recortes |
| M-04 | Envío por WhatsApp o correo falla | Se indica fallo sin afirmar que la credencial llegó |
| M-05 | Operador puerta abre enlace sin PIN válido | No puede registrar ingresos ni acceder a otras funciones |
| M-06 | Primera lectura válida | Verde, «Válida», pitido agudo, un ingreso y actualización del centro de mando |
| M-07 | QR inexistente o duplicado | Rojo, dos pitidos graves, sin segundo ingreso válido |
| M-08 | Consulta tablero 95 JRV | Aparecen H1–H41 y M1–M54, zonas cromáticas y estados de dotación |
| M-09 | Solo dos miembros presentes en una junta | La ficha sigue incompleta, sin reportar instalación oficial a Quito |
| M-10 | Suplente sobrante en misma zona | Se propone preferentemente para una junta que lo necesita |
| M-11 | No hay suplente sobrante en misma zona | Se propone otra zona, priorizando cercanía sin movimientos automáticos |
| M-12 | Coordinador rechaza o pasa sugerencia | No cambia asignaciones de nadie |
| M-13 | Coordinador acepta movimiento | Se registra origen/destino/autor y se actualizan dotaciones operativas |
| M-14 | MJRV carga dos caras de cédula | Se asocian a la ficha correcta; ambas pueden visualizarse en su anexo autorizado |
| M-15 | Solo una cara o imagen incompleta | No se permite finalizar el acta individual hasta completar ambas |

### 17.4. Madrid: pagos y preparación de elección

| ID | Escenario | Resultado esperado |
| --- | --- | --- |
| F-01 | Dos o tres operadores entran a finanzas | Cada uno tiene sesión atribuida, permisos limitados y puede atender independientemente |
| F-02 | MJRV se presenta con QR válido, sin documentos completos | El sistema exige completar fotos antes de imprimir acta final |
| F-03 | Acta impresa pero todavía sin entrega de dinero | La persona **no** figura como pagada |
| F-04 | Verificación directa del trabajo en finanzas | No exige autorización del centro de mando ni por junta ni por individuo |
| F-05 | Pago físico entregado, acta firmada y confirmación | Registra una sola confirmación, momento, operador y euros efectivamente entregados |
| F-06 | Dos puestos confirman simultáneamente el mismo MJRV | El servidor acepta a lo sumo **una** confirmación válida |
| F-07 | QR de MJRV ya pagado | Informa el pago previo y bloquea un segundo desembolso ordinario |
| F-08 | Consultar panel e informe financiero | Pagados, pendientes, total EUR y responsables coinciden con confirmaciones, no impresiones |
| F-09 | Falta monto USD, tasa o fórmula aprobada | No inventa conversión para generar un acta financiera definitiva |
| S-01 | Activar modo prueba desde superadmin | Todos los portales lo indican; permite ensayar horarios sin mezclar cifras reales |
| S-02 | Generar incidencias, llegadas y pagos simulados | Todos quedan identificados como registros de prueba |
| S-03 | Preparar elección con borrado | Pide confirmación, verifica respaldo, elimina solo actividad de prueba y mantiene catálogos, credenciales y usuarios |
| S-04 | Entrar después de preparar elección | No quedan avances, ingresos ni pagos simulados como reales; restricciones horarias activas |
| S-05 | Intentar limpiar datos desde rol no superadmin | Acceso denegado |
| S-06 | Repetir accidentalmente limpieza o acceder a datos reales | No borra pagos ni reportes reales |

### 17.5. Pruebas de integraciones y equipos reales

Antes del uso, comprobar al menos una vez la cámara de móvil para QR, lectura con el dispositivo previsto en puerta, captura de anverso y reverso, impresión de credencial A4, impresión del acta y su anexo, exportación de PDF/Excel, conectividad de la VM y visualización simultánea en más de una sesión. Verificar entrega de mensajes solo cuando las credenciales del servicio WhatsApp/correo estén disponibles. No declarar «listo» un flujo si únicamente se ha probado con datos ficticios y falta el modelo oficial que determina su salida.

No extender estas comprobaciones a un programa indefinido de pruebas que retrase el objetivo del usuario. Priorizar las que evitan **pérdida de datos, confusión de fases, exposición de cédulas y pagos duplicados**.

## 18. Dependencias y pendientes ordenados por impacto

Este inventario **no es un cuestionario para Pablo**. Agrupa información que hará falta cuando se programe; si falta una respuesta menor, el desarrollador debe utilizar el criterio más sencillo compatible con lo aprobado y documentarlo, sin bloquear el trabajo ni inventar instrucciones oficiales.

### 18.1. Insumos documentales que no deben fabricarse

| Insumo | Necesario para | Regla mientras no se aporte |
| --- | --- | --- |
| Excel definitivo consulados, recintos y JRV/electores | Permisos, totales, porcentajes, hora local y mapa | Estructura preparada, sin inventar catálogo ni totales |
| Excel nominativo MJRV Madrid | Credenciales, puerta, centro de mando, identificación y pagos | No suponer nombres, cédulas o cargos |
| PDF/archivo fuente de credencial CR80 | Generación e impresión final | Probar estructura, no afirmar fidelidad a plantilla no vista |
| Modelo oficial de acta de pago y anexo | PDF de cobro, firmas, documentación | No inventar campos oficiales, logos ni cláusulas |
| Monto USD y regla de conversión EUR | Cálculo y emisión financiera | Mantener pendiente el cálculo definitivo |
| Manuales/criterios operativos sobre incidencias | Catálogo definitivo por fase, prioridades sugeridas | No asumir aprobada lista histórica de 2025 |
| Relación real de ciudades/zonas horarias/coordenadas | Hora oficial de recintos, alertas, marcadores | No calcular la hora por zona solar ni asumir un huso para todo el país |

### 18.2. Reglas abiertas que no deben cambiar silenciosamente las decisiones

- **Cierre total del proceso:** determinar exactamente qué hecho comunica el último hito y cómo convive con escaneo, embalaje y finalización del recinto; no declararlo automáticamente a las 19:00.
- **Catálogo de incidencias:** comprobar tipos y prioridades según material operativo, con opción «Otro» y alcance editable. Las sugerencias de prioridad no son decisiones electorales.
- **Alertas por reporte ausente:** especificar márgenes de tolerancia razonables cuando exista criterio operativo. No presentar un minuto arbitrario como exigencia del CNE.
- **Reingreso y bloqueo de MJRV:** mantener primera validación, resultado rojo de duplicado y prevención de nuevos ingresos; concretar excepción de reentrada si fuera necesaria sin inventar permisos.
- **Traslado físicamente realizado:** separar propuesta aprobada de confirmación de traslado cuando resulte necesario para que el tablero no presuponga disponibilidad inexistente; no conceder acceso a coordinadores de mesa por defecto.
- **Reserva temporal de finanzas y reimpresiones:** resolver técnicamente sin impedir recuperación tras fallo de impresora ni permitir doble pago.
- **Distribución del QR genérico de documentos:** cartel, comunicación o ambos todavía sin decisión; el formulario y sus restricciones sí están aprobados.
- **Conservación/retirada de fotografías y registros:** requiere criterio institucional y técnico verificable; la aplicación no debe borrar documentos sensibles de forma arbitraria.
- **Subdominios:** están propuestos cne.consulares.app, control.consulares.app y madrid.consulares.app; confirmar rutas reales en despliegue, sin afirmar que existen.
- **Servicios compartidos:** comprobar repositorios y servicios existentes antes de reutilizarlos; no asumir integraciones operativas por simple mención de teinvito, temp o Consulares.
- **Distancia física exacta en plano de Madrid:** respetar las zonas y equivalencias aprobadas; no deducir posiciones físicas individuales donde el plano no las permite.

### 18.3. Criterios para resolver aspectos menores sin nuevas entrevistas

**DISEÑO DERIVADO:** el desarrollador puede seleccionar denominaciones de botones, distribución responsiva, paginación, mensajes de validación, iconos, estados de carga, manejo de doble clic, almacenamiento técnico, orden de filtros, tamaños de fuente, rutas internas y estructura de tablas, siempre que conserve la funcionalidad y los permisos ya decididos. También puede elegir mecanismos habituales de confirmación de acciones destructivas y control de errores sin abrir una pregunta por cada uno.

**No debe decidir por su cuenta** importes, tipos de cambio, contenido de modelos oficiales, catálogo nominativo, horarios electorales alternativos, criterios de elegibilidad electoral, derechos de personas sobre sus datos, atribuciones del CNE o facultades nuevas a Quito. Si alguno de estos temas afecta el software, registrar la dependencia e implementar solo lo que pueda basarse en fuentes o decisiones verificadas.

## 19. Guía de implementación posterior a la autorización

**ESTADO ACTUAL:** documento de diseño funcional, **no código ni autorización de despliegue**. La construcción comenzará solo con instrucción expresa de Pablo. Esta guía indica cómo convertir la especificación en trabajo de desarrollo sin reabrir decisiones cerradas.

### 19.1. Orden lógico de construcción

1. **Fundación compartida:** inspeccionar servicios disponibles de la VM y de los proyectos de referencia; definir aislamiento, catálogo y permisos por portal; establecer modos prueba/elección desde el inicio para que no se mezclen datos.
2. **Portal consular y datos electorales:** importación y validación del catálogo; inicio de sesión, operador y recinto; hitos por JRV, grupos/excepciones, cifras de votantes, incidencias, corrección libre y borradores locales.
3. **DGSMH:** consolidación real de JRV, panel mundial de mapa/solar, fichas y horas locales, alertas, seguimiento/resolución de incidencias, informes PDF/Excel.
4. **Madrid — preparación:** carga nominativa, credenciales PDF/QR, operadores, envío, control de puerta y tablero de 95 JRV.
5. **Madrid — operación y finanzas:** propuestas de redistribución con aprobación humana, fotografía de ambas caras, plantillas de actas, concurrencia de cobros, informes y seguridad de datos.
6. **Cierre de integración y preparación:** verificar permisos entre módulos, comprobar equipos reales, limpiar pruebas con respaldo y activar modo elección.

Este orden **no autoriza a aplazar ninguno de los tres componentes** de la primera entrega; identifica dependencias para evitar que una pantalla se construya sin los datos o el control de acceso que requiere.

### 19.2. Definición funcional de «terminado»

No es suficiente que aparezca una pantalla o un mapa atractivo. Una función está completa si su usuario autorizado puede realizar el recorrido, el servidor aplica correctamente permisos y validaciones, los registros persisten con atribución, la vista correspondiente refleja el cambio, los errores no corrompen información y los documentos generados respetan las plantillas aplicables. Para operaciones concurrentes de pagos, la **ausencia de duplicidad** es requisito crítico. Para el reporte nacional, lo crítico es distinguir dato recibido, dato pendiente, dato ausente y dato estimado.

### 19.3. Documentación técnica que se preparará al iniciar programación

El agente desarrollador deberá producir, a partir de esta especificación y de la inspección real de infraestructura: inventario de servicios compartidos y aislamiento, mapa de permisos, diseño de datos, contratos de intercambios por portal, lista de pantallas, estrategia de importación de Excel, plan de pruebas mínimas y pasos seguros de despliegue/retorno. Las decisiones técnicas deberán documentarse y ser coherentes con el repositorio independiente CNE. **No editar sistemas existentes ni conectar servicios de mensajería reales sin verificar credenciales y efectos de la operación.**

### 19.4. Últimas decisiones consolidadas de la entrevista

Para evitar que el historial INSTRUCCIONES.md se interprete erróneamente, son **definitivas** estas decisiones posteriores: portal consular **simple**, panel combinado con acciones de fase; pantalla Quito con **mapa mundial + panel lateral**; mapa por niveles consulado → recinto con **capa día/noche solar**; informes integrales PDF/Excel para Quito; un **panel financiero completo** e informe PDF/Excel para Madrid; verificación de cumplimiento **directamente por finanzas**, sin aprobación del centro de mando; movimientos de suplentes primero en su zona y después entre zonas, con aprobación humana; escrutinio solo desde **19:00 local + cierre de votación reportado**; superadmin con **modo prueba** que permite ignorar estas restricciones y botón **«Borrar datos de prueba y preparar para elección»**; y **corrección libre de reportes consulares**, incluso de fases finalizadas, sin motivo obligatorio.

**Instrucción final de continuidad:** respetar el alcance integral para el 29 de noviembre de 2026, no repetir preguntas resueltas, no presentar propuestas como aprobaciones, no inventar datos oficiales y **no programar hasta orden expresa de Pablo**.


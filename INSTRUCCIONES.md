# CNE: instrucciones para continuar

Fuente para que otra IA siga. Sin código hasta que Pablo lo pida.

## Incidentes (propuesto, sin cerrar)

Solo lo que para o daña la fase. Siempre “otro” con texto.

- Instalación: la junta no abre, falta el paquete, acta sin firmas.
- Sufragio: proselitismo en el recinto, el voto deja de ser secreto, la firma se toma antes de depositar.
- Cierre: a la hora, quien sigue en fila no vota.
- Escrutinio: el conteo se corta, no cuadra papeletas con firmas, faltan firmas.
- Escaneo: el acta no entra a resultados, el sobre amarillo no sale, el centro del exterior no procesa.

## Fases

Consulado: instalación 08:30, voto 09:00–19:00, escrutinio, embalaje. País: instalación 06:30, voto 07:00–17:00.

## Tablero, login, Madrid

Mapa por hora local. Votantes: firmas o estimación. Grandes: varios móviles, mismo usuario. Login por correo, Excel del superadmin, primer cambio obligatorio. Madrid es la gestión interna, ya descrita.

## Pregunta abierta

¿Esta lista? A) Sí. B) Otro.

## Decisiones de seguimiento DGSMH (17-11-2026)

- **DECIDIDO.** La DGSMH no solo visualiza el mapa en tiempo real: debe poder **monitorear, dar seguimiento y coordinar soluciones** de incidentes reportados por los consulados. Es el objetivo operativo aprobado por Pablo (opción C de la entrevista).
- **DECIDIDO.** El sistema debe permitir identificar qué incidencia ocurrió, dónde, cuándo, qué recinto/JRV afecta, si sigue activa o resuelta y mantener trazabilidad de solicitudes y actuaciones para su seguimiento; sin imponer una revisión junta por junta ni reportes repetitivos en ausencia de novedades. Esta es la orientación funcional acordada, no una definición de pantallas o esquema.
- **CRITERIO DE DISEÑO.** La DGSMH puede coordinar apoyo consular y solicitar información, pero la herramienta no debe atribuirle decisiones electorales propias del CNE.
- **ABIERTO.** Medio de interacción entre Quito y los consulados (mensajes dentro del sistema, canales externos con registro, o modelo mixto). Se pregunta a continuación; no se asumirá la respuesta.
- **ABIERTO.** Quién inicia sesión en el tablero DGSMH, sus permisos concretos, reglas de correcciones y cierres. La opción C no crea por sí sola un tercer rol de cuenta.
- **ABIERTO.** Los ítems definitivos del desplegable de incidentes. Las opciones de este documento siguen siendo propuestas de trabajo, no un catálogo ratificado. Cada incidente puede afectar a todo un recinto o a una o varias JRV; las juntas se seleccionan solo cuando exista incidencia, sin exigir reportar junta por junta.


## Coordinación de incidentes Quito–consulados (decisión 17-11-2026)

- **DECIDIDO.** Se adopta el modelo mixto (opción C) para atender incidencias: la DGSMH registra dentro del sistema solicitudes de seguimiento; las situaciones urgentes se coordinan por teléfono o WhatsApp; el consulado confirma en la plataforma las actuaciones y la resolución.
- **ALCANCE.** No se está aprobando un chat interno ni la integración con servicios de telefonía/WhatsApp. Se requiere conservar el registro operativo mínimo de solicitud, seguimiento y resultado, sin duplicar la conversación externa.
- **ABIERTO.** Cuáles incidentes deben llegar a Quito como asuntos que precisan intervención y cuáles serán solo informativos. Pregunta estratégica siguiente: distinguir selección por consulado, elevación por Quito o ambos.
- **ABIERTO.** Quién puede cambiar estados y resolver un incidente; permisos del tablero, notificaciones, destinatarios y reglas de escalamiento siguen pendientes.


## Alertas y contacto operativo (decisiones 17-11-2026)

- **DECIDIDO.** Todos los incidentes de los consulados son visibles en el mapa y seguimiento de la DGSMH. Se adopta el modelo combinado (opción C): el consulado puede solicitar apoyo explícito de Quito y, de manera independiente, la DGSMH puede marcar para seguimiento un incidente que considere relevante. Registrar quién solicitó o marcó el seguimiento y su evolución, sin dar por aprobadas reglas de prioridad automática, notificaciones o cierre.
- **DECIDIDO.** Cada consulado debe introducir un **teléfono de contacto operativo** para la jornada, disponible para consulta de la DGSMH desde Quito. Es un contacto del consulado o de la operación, no de cada junta. No se confunde con los teléfonos de electores ni de miembros de juntas. Su modalidad de captura, confirmación y actualización será objeto de la siguiente pregunta.
- **CONSECUENCIA FUNCIONAL.** El contacto operativo facilita llamadas ante incidencias urgentes y evita añadir un chat interno; la trazabilidad de solicitudes y resoluciones permanece en el sistema. No se ha aprobado uso público del teléfono ni integración telefónica.
- **ABIERTO.** Cuándo debe ingresar/confirmar el consulado su teléfono operativo: al configurar, al iniciar la jornada o configuración previa y confirmación el día electoral. Esta es la siguiente decisión.

## Confirmación del teléfono operativo (decisión 17-11-2026)

- **DECIDIDO.** Opción C: cada consulado registra previamente un teléfono de contacto operativo y, al iniciar la jornada electoral, confirma que sigue siendo válido o lo actualiza. El teléfono está disponible para la DGSMH en el tablero, como dato de contacto de la operación consular; no se solicita por cada JRV.
- **ABIERTO.** Política para identificar y gestionar consulados que no reportan un hito esperado: visualización simple, aviso por falta de reporte, u otro mecanismo. Ninguna ausencia de reporte equivale automáticamente a un incidente electoral.

## Control de reportes ausentes (decisión 17-11-2026)

- **DECIDIDO.** Opción C: el tablero DGSMH mostrará permanentemente el último hito/reportado de cada consulado y su hora. Cuando no se registre un hito esperado dentro de un margen razonable, aparecerá una **alerta de seguimiento por falta de reporte**, diferenciada expresamente de los incidentes electorales. Esta alerta no presume que haya una interrupción real del sufragio.
- **DECIDIDO.** La evaluación de hitos esperados se hará respecto de la hora **local** del lugar. No se han definido minutos de tolerancia ni la fuente concreta del huso horario.
- **ABIERTO.** Plazos de tolerancia exactos, escalamiento y notificaciones; no inventarlos.
- **ABIERTO.** ¿Qué forma de visualización de avances debe priorizar el tablero DGSMH para consulados de muy distinto tamaño: porcentaje de JRV por hito, número absoluto de JRV y total, o ambos? La respuesta no debe contradecir el reporte junta por junta para consulados pequeños y el reporte concurrente por sección para consulados grandes ya decididos.

## Indicadores de avance por consulado (decisión 17-11-2026)

- **DECIDIDO.** Se adopta la opción C de visualización para DGSMH: por hito, mostrar simultáneamente el número de juntas reportadas respecto del total y su porcentaje (ej.: 76 de 95 — 80 %). Cuando la información disponible lo permita, podrá consultarse qué juntas siguen pendientes. El total real por recinto provendrá del catálogo que Pablo entregará; no se debe inventar.
- **PRECISIÓN FUNCIONAL.** El porcentaje se calcula sobre juntas, no sobre personas votantes. Un porcentaje de avance no implica que haya concluido toda la elección ni equivale al porcentaje de participación.
- **ABIERTO.** Cómo producir un conteo por JRV fiable y con mínima carga en consulados grandes: actualizaciones individuales, marcado masivo por zona/grupo con excepciones, o modelo híbrido. No asumir alimentación automática desde el módulo interno de Madrid ni imponer revisión junta por junta.

## Avance por grupos y excepciones (decisión 17-11-2026)

- **DECIDIDO.** Pablo aprobó la opción B para consulados grandes: reportar avance por **grupos de juntas**, con operación «Todas completadas» o señalando únicamente las JRV excepcionales/pendientes. Debe evitarse la obligación de editar 95 JRV una por una. El avance del tablero se calculará sobre juntas efectivamente confirmadas, con número absoluto y porcentaje.
- **CRITERIO DE DISEÑO.** La operación de confirmación de grupo y sus excepciones deberá preservar la identidad de las juntas y del hito reportado. La agrupación deberá conciliarse con el catálogo/Excel de recintos y JRV que Pablo proporcionará; no dar por definitivos los grupos de color de Madrid para todos los consulados.
- **RIESGO.** Si varios dispositivos del consulado reportan simultáneamente, deben prevenirse sobrescrituras accidentales y discrepancias sobre JRV pendientes/completadas; el mecanismo exacto sigue ABIERTO.
- **ABIERTO; PREGUNTA SIGUIENTE.** Distinguir en el tablero y en el formulario el estado de una JRV «confirmada completada», «pendiente o impedida expresamente informada» y «sin información», en lugar de considerar automáticamente como pendiente toda junta que no figure como completada. No se debe asumir decisión hasta que Pablo elija.

## Estados de avance por JRV y fase (decisión 17-11-2026)

- **DECIDIDO.** Pablo aprobó la opción C: cada JRV, para cada fase, tendrá tres estados distinguibles en el tablero DGSMH: **completada**, **pendiente expresamente reportada** y **sin información**. No se debe interpretar la falta de datos como retraso confirmado ni como incidente electoral.
- **REGLA FUNCIONAL.** Al confirmar un grupo de JRV, las juntas completadas se marcan como tales y las excepciones expresamente señaladas como pendientes. Las juntas aún no cubiertas por ningún reporte permanecen «sin información». El porcentaje de avance confirmado se calcula solo sobre las JRV «completadas» respecto del total de JRV del recinto, y se muestra también el conteo absoluto; las no informadas no pasan a pendientes automáticamente.
- **DISTINCIÓN.** El estado «pendiente» significa que una fase no se ha completado según reporte, pero no implica automáticamente un incidente; los incidentes y sus estados de seguimiento se registran por separado.
- **ABIERTO.** Cómo resolver entradas simultáneas o contradictorias sobre la misma JRV/fase desde varios dispositivos con el mismo usuario de consulado. Plantear una elección entre sobrescritura, bloqueo o aviso de conflicto con confirmación e historial. Mantener la decisión independiente de la política posterior de corrección de hitos cerrados.

## Conflictos de reportes simultáneos (decisión 17-11-2026)

- **DECIDIDO.** Pablo eligió la **opción A**, incluso después de plantearse el riesgo de sobrescritura: ante dos reportes contradictorios sobre la **misma junta y fase**, **prevalece el último reporte guardado correctamente por el servidor**. No se exige confirmación de conflicto ni se bloquea la modificación por defecto. Los reportes sobre distintas juntas no deben interferirse. Las actualizaciones por JRV/fase no deben reemplazar indiscriminadamente el estado completo de una zona o recinto.
- **IMPLICACIÓN.** El dato visible de esa JRV/fase pasa a ser el del último reporte recibido, que puede corregir un error o reemplazar accidentalmente un dato válido. No presumir que el último reporte corresponde necesariamente al hecho más reciente en el terreno. Se distingue la hora de recepción de la eventual hora declarada del evento, sin alterar la regla aprobada.
- **ABIERTO.** Atribución de cada reporte al funcionario o dispositivo, pues el consulado comparte una misma cuenta. No se ha elegido identificación por reporte, identificación al iniciar una sesión de operación o falta de identificación individual.

## Operador por sesión en cuenta consular compartida (decisión 17-11-2026)

- **DECIDIDO.** Opción C: cuando un funcionario inicia trabajo en un dispositivo utilizando la cuenta compartida del consulado, registra **una vez su nombre como operador de esa sesión de trabajo**. Las actuaciones posteriores del dispositivo quedan atribuidas automáticamente a ese nombre sin crear cuentas personales ni repetir la identificación por cada reporte. Otros dispositivos pueden identificar un operador diferente usando las mismas credenciales consulares.
- **IMPLICACIONES.** Separar explícitamente la **autenticación** institucional del consulado de la **identificación declarada** del operador. No confundir nombre introducido con identidad legalmente verificada. Conservar en cada actuación el consulado, operador declarado, fecha/hora y los datos reportados; el último reporte sigue prevaleciendo como ya se decidió. Si cambia el operador del mismo dispositivo, deberá poder cambiarse la identificación antes de seguir reportando; el mecanismo detallado continúa abierto.
- **ABIERTO / SIGUIENTE PREGUNTA.** Unidad geográfica-operativa del reporte consular: ¿separar recintos bajo un mismo consulado desde el principio, o permitir un resumen global con desglose opcional? No presuponer que cada consulado tiene exactamente un recinto.

## Varios recintos por consulado (decisión de entrevista)

- **DECIDIDO.** Pablo aprueba la opción B: si un consulado tiene más de un recinto electoral, **cada recinto se gestiona y reporta por separado** con sus propias juntas, hitos, estados e incidencias. El mismo usuario institucional del consulado accede a todos sus recintos. El tablero DGSMH ofrece detalle por recinto y total consolidado por consulado; el consolidado debe distinguir datos reportados y no reportados y no sumar porcentajes directamente.
- **FUENTE DE DATOS.** La asignación consulado–recintos–juntas y sus totales provendrá del archivo que Pablo aportará; no presumir que cada consulado tiene un solo recinto ni inventar catálogo.
- **NO DECIDIDO.** La modalidad concreta para cargar reportes de múltiples recintos desde el mismo consulado: funcionarios que reportan directamente desde cada recinto, un responsable central que recopila y registra, o ambos. Esta es la siguiente pregunta estratégica. No crear cuentas nuevas por recinto sin decisión expresa.

## Reporte flexible desde recintos o consulado central (decisión de entrevista)

- **DECIDIDO.** Pablo elige la opción C: en un consulado con varios recintos, los funcionarios autorizados pueden registrar informes de cada recinto directamente desde ese recinto o desde el consulado central. No se impone modalidad centralizada o descentralizada; el **recinto al que se refiere el reporte debe identificarse explícitamente** con independencia de la ubicación física del operador. Se mantiene una misma cuenta institucional por consulado y la declaración de nombre del operador una vez por sesión.
- **IMPLICACIONES DE DISEÑO.** No inferir automáticamente el recinto a partir de la ubicación del dispositivo, del funcionario o del consulado. El registro debe asociar consulado, recinto, junta o grupo (cuando corresponda), fase, nombre declarado del operador y momento de envío. El reporte remoto y presencial deben producir el mismo dato y el mismo tablero DGSMH consolidado. Se admiten actualizaciones concurrentes sobre recintos distintos, sin conflicto.
- **ABIERTO.** Cómo seleccionar en la interfaz el recinto de trabajo sin confundir reportes de distintos lugares: selección por cada reporte, recinto activo por sesión con cambio visible o navegación a la ficha del recinto. Siguiente pregunta estratégica.

## Recinto activo por sesión (decisión de entrevista)

- **DECIDIDO.** Pablo elige opción B: el operador selecciona **un recinto activo al comenzar la sesión de trabajo** con la cuenta institucional del consulado; el nombre del recinto permanece claramente visible en la interfaz y puede cambiarse en cualquier momento sin cerrar sesión ni volver a autenticarse. Los reportes se asignan al recinto activo en el momento en que se realizan. El sistema debe evitar confundir recintos cuando hay varios asignados a un consulado.
- **COHERENCIA.** Convive con el nombre del operador declarado una vez por sesión, el modelo de reportes directos desde recintos o desde el consulado y el último reporte prevalente por junta/fase. Los detalles de navegación y de validación de cambios se definirán durante diseño.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Comportamiento de los reportes en caso de pérdida de conexión en recintos: solo envío online; borradores locales con reenvío manual; o cola con sincronización automática. No asumir autorización para envío de información no confirmada. Considerar riesgo de sobrescribir un reporte más reciente si se envía uno antiguo tras recuperar la conexión.

## Borradores sin conexión y envío manual (decisión de entrevista)

- **DECIDIDO.** Para pérdida de internet en el módulo de reportes consulares se aprueba la **opción B**: el trabajo introducido sin conexión queda como **borrador en el dispositivo** y, una vez restablecida la conectividad, el operador **revisa y envía manualmente** los reportes pendientes. No hay sincronización automática.
- **CONSECUENCIAS.** Distinguir claramente borradores locales de reportes recibidos por el servidor; Quito solo puede considerar confirmados los segundos. La interfaz debe mostrar qué borradores faltan por transmitir y si el envío fue aceptado. El dispositivo y el navegador que contienen el borrador son relevantes; no presumir que queda disponible en otros equipos. Evitar que el borrador se pierda al cambiar temporalmente de pantalla, en la medida técnicamente viable.
- **COHERENCIA CON DECISIÓN PREVIA.** Para reportes contradictorios de misma JRV/fase se mantiene la regla de que **prevalece el último recibido por el servidor**. El control manual reduce pero no elimina la posible sobrescritura de información nueva al enviar un borrador antiguo. No añadir confirmaciones obligatorias de conflicto sin aprobarlas.
- **ABIERTO.** Política concreta para la recuperación de borradores ante cierre de pestaña, caducidad de sesión o cambio de recinto, y eventual tratamiento de datos personales en almacenamiento local.
- **PREGUNTA ESTRATÉGICA SIGUIENTE.** Diferenciar cuándo un consulado confirma que una fase se desarrolla sin novedades de cuándo simplemente no ha enviado información; minimizar carga de reportes y falsas alertas. Evaluar confirmación «sin novedades» opcional, por hito, o en respuesta a solicitudes de Quito sin imponer verificaciones por JRV.

## Confirmación de normalidad por fase (decisión de entrevista)

- **DECIDIDO.** Pablo seleccionó opción B: el operador del consulado podrá marcar **«Sin novedades»** al actualizar cada fase del **recinto**. Es una **confirmación sencilla por fase/recinto**; no se solicita confirmación de normalidad JRV por JRV, ni se exige un reporte periódico de normalidad. Cuando haya incidencias, se registran en el módulo correspondiente.
- **CRITERIO FUNCIONAL.** La confirmación «Sin novedades» es distinta de que todas las juntas hayan completado la fase. No aumenta el numerador de JRV completadas, no modifica los tres estados de cada JRV y no sustituye el registro de hitos ni las incidencias.
- **ABIERTO.** Significado preciso cuando existen incidencias ya abiertas: «sin nuevos incidentes» frente a «no hay incidentes activos» y cómo reflejarlo. No interpretar que la confirmación por sí sola resuelve o cierra incidentes.
- **ABIERTO / SIGUIENTE PREGUNTA ESTRATÉGICA.** Qué debe ocurrir cuando un consulado solicita apoyo urgente a Quito: solo indicador dentro del tablero, aviso destacado/sonoro en tablero, o notificaciones también fuera del sistema. No asumir integración externa de notificaciones.

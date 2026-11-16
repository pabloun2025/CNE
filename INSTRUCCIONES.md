# CNE: instrucciones para continuar

Este archivo es la fuente para que otra IA siga el trabajo si esta conversación se corta. Actualizarlo cada vez que Pablo cierre una decisión. No escribir código de la aplicación hasta que él lo pida. Cuando lo pida, el primer entregable es un handover completo para que Claude o Codex construyan.

Cómo preguntar: una decisión por mensaje, opciones A, B, C y “otro”. Este chat no tiene botones; Pablo responde con la letra.

Repo: https://github.com/pabloun2025/CNE (privado, cuenta pabloun2025).

## Qué es

Sistema de monitoreo del proceso electoral de Ecuador del 29 de noviembre de 2026.

Dos piezas distintas. No mezclarlas.

- Madrid, ahora: credenciales, puerta, fotos, pagos y el análisis de cómo constituir las mesas.
- Después: login de todos los consulados (copiar DEMP) y el tablero de la DGSMH. Ese tablero es otro sistema.

## Recinto (manual operativo seccionales y CPCCS 2027, v2)

Caja Mágica, Madrid, votación en nivel −2. 95 juntas: masculinas 1–41 y femeninas 1–54, en una sola corrida 1–95. Personal a las 08:00. Voto 09:00–19:00 del domingo 29 de noviembre. El manual no define presidente, secretario, vocal, suplentes ni cómo mover gente. Eso lo define Pablo: cada mesa tiene 3 titulares y sus suplentes.

## Madrid: credenciales MJRV (decidido)

En parametrización, antes del proceso.

- Excel: nombre, apellido, cédula, rol, junta, email y teléfono WhatsApp.
- Alta, edición y baja individual.
- PDF plantilla con espacio en blanco al centro para datos y QR.
- Salidas: PDF individual, collage A4, o WhatsApp uno a uno con Evolution API como en teinvito.
- Tamaño: 85,6 × 54 mm. El QR es solo la cédula.

## Cuentas (decidido)

Solo el consulado y el superadmin tienen cuenta y contraseña.

## Puerta (decidido)

Enlace `{APP}/puerta/{token}` como teinvito, activo hasta revocarlo, se copia o se manda por WhatsApp. Sin login. Válido: verde y un pitido. Negativo: rojo y dos pitidos. Autorización: nombre, apellido y PIN, cargados por el administrador de Madrid.

## Análisis de Madrid (decidido, no es el tablero DGSMH)

Análisis en tiempo real de qué hacer y a quién mover: suplente de una mesa ya completa (3) hacia una incompleta, por proximidad. Usar la IA ya instalada en teinvito.

## Foto de la cédula y pago (decidido)

Durante el proceso, la toma el MJRV o un funcionario. Recuadro, disparo al encajar si se puede, recorte automático. Anverso y reverso en la página siguiente del registro. Sin las dos fotos no se habilita imprimir el pago.

## Pregunta abierta

¿Qué debe decir el análisis?

A) Una lista concreta: mueve a esta persona de la mesa X a la mesa Y
B) Solo señala mesas completas y mesas a las que les falta gente
C) Otro

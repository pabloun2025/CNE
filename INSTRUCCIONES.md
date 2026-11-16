# CNE: instrucciones para continuar

Este archivo es la fuente para que otra IA siga el trabajo si esta conversación se corta. Actualizarlo cada vez que Pablo cierre una decisión. No escribir código de la aplicación hasta que él lo pida. Cuando lo pida, el primer entregable es un handover completo para que Claude o Codex construyan.

Cómo preguntar: una decisión por mensaje, opciones A, B, C y “otro”. Este chat no tiene botones; Pablo responde con la letra.

Repo: https://github.com/pabloun2025/CNE (privado, cuenta pabloun2025).

## Qué es

Sistema de monitoreo del proceso electoral de Ecuador del 29 de noviembre de 2026.

Dos piezas distintas. No mezclarlas.

- Madrid, ahora: credenciales, puerta, fotos, pagos y el análisis de cómo constituir las mesas.
- Después: login de todos los consulados (copiar DEMP) y el tablero de la DGSMH. Ese tablero es otro sistema.

## Madrid: credenciales MJRV (decidido)

En parametrización, antes del proceso.

- Excel: nombre, apellido, cédula, rol (presidente, secretario, vocal, etc.), junta (1 Masculina, xx Femenina, etc.), email y teléfono WhatsApp.
- Alta, edición y baja individual.
- PDF plantilla con un espacio en blanco al centro para los datos y el QR.
- Salidas: PDF individual, collage A4, o WhatsApp uno a uno con Evolution API como en teinvito.
- Tamaño: 85,6 × 54 mm.
- El QR es solo la cédula.

## Cuentas (decidido)

Solo el consulado y el superadmin tienen cuenta y contraseña.

## Puerta (decidido)

Enlace `{APP}/puerta/{token}` como teinvito, activo hasta revocarlo, se copia o se manda por WhatsApp. Sin login. Válido: verde y un pitido. Negativo: rojo y dos pitidos.

El administrador de Madrid carga nombre, apellido y PIN. El PIN identifica al funcionario donde haga falta, sin cuenta.

Cada mesa tiene 3 titulares (presidente, secretario, vocal) y sus suplentes. El escaneo dice, en tiempo real, quién ya está y qué mesa se puede constituir.

## Análisis de Madrid (decidido, no es el tablero DGSMH)

No es un tablero de monitoreo. Es un análisis en tiempo real de qué hacer y a quién mover: si una mesa ya tiene 3 y otra no, proponer pasar un suplente de la completa a la incompleta, por proximidad, para dejar las mesas en 3. Usar la IA ya instalada en teinvito.

## Foto de la cédula y pago (decidido)

Durante el proceso, la toma el MJRV o un funcionario. Recuadro, disparo al encajar si se puede, recorte automático. Anverso y reverso van en la página siguiente del registro. Sin las dos fotos no se habilita imprimir el pago: la ventanilla las toma y un QR incompleto obliga a completarlas.

## Aún por cerrar

- Cómo se muestra el análisis (lista de movimientos, o solo el hueco).
- Contenido del recibo.
- Login de consulados y tablero DGSMH, después.

## Pregunta abierta

¿Qué debe decir el análisis?

A) Una lista concreta: mueve a esta persona de la mesa X a la mesa Y
B) Solo señala mesas completas y mesas a las que les falta gente
C) Otro

# Puerta, credenciales y cierre de jornada de Madrid

## Puerta

Mostrar un botón «Ingreso manual por cédula» accesible desde el lector. El operador escribe el número con teclado numérico y la aplicación verifica la ficha en la base de MJRV. Una cédula no reconocida da un resultado explícito y permite corregir el número.

Si la cámara no encuentra QR, leer la credencial y verificar primero el número de cédula. Si el número resulta ilegible o no coincide, buscar por nombres y apellidos. Una coincidencia única se muestra para que el operador la confirme. Si hay varias, mantener el ingreso pendiente hasta que la persona pueda identificarse inequívocamente. La confirmación usa las mismas comprobaciones de ficha activa, revocaciones y duplicados que el lector.

## Credenciales y comprobantes

Usar una lista con casillas para seleccionar una ficha, varias o todas las fichas que coincidan con el filtro. En credenciales, la misma selección permite poner en cola el envío por correo, WhatsApp o ambos, descargar un PDF individual o un ZIP con un PDF por persona y descargar las planchas A4 en PDF. La selección y los recuentos deben coincidir con el alcance que llega al servidor.

En comprobantes, la lista permite descargar los recibos emitidos como PDF individual o un ZIP con un PDF por cada recibo seleccionado. La emisión de contingencia se mantiene en su propia acción. La descarga conserva la numeración y la separación entre prueba y elección.

Configurar ancho y alto de cada credencial en milímetros. Conservar 54 × 85,6 mm como valor inicial. El PDF individual conserva el tamaño elegido. Las planchas evalúan las orientaciones de impresión y escogen cuántas piezas completas caben en la zona imprimible, sin encogerlas. Mantener guías de corte alrededor de las piezas efectivamente impresas y explicar el ajuste de impresión al 100 %.

## Importes del recibo

En Finanzas → Configuración, introducir dos importes por separado: el valor de referencia en USD y el importe que se entrega en EUR. El recibo muestra ambas cifras tal como se guardaron, sin conversión. Cada emisión conserva sus valores al descargar o reimprimir el recibo. Los importes ausentes en recibos históricos se dejan sin completar en las copias.

## Enlaces y centro de mando

En Operadores, representar copiar y compartir por WhatsApp mediante iconos con etiquetas accesibles. Mostrar confirmación al copiar y abrir WhatsApp para que el cónsul elija destinatario.

En el centro de mando, añadir un modo de pantalla completa que encaje los indicadores y las 95 juntas en una sola vista. Abrir el detalle de una junta al pulsarla para que el tablero principal se mantenga en pantalla. Probar el encaje y la salida de pantalla completa con teclado y en un móvil.

## Informe de cierre

Permitir que Finanzas elija columnas de pagos y operación para cada exportación en PDF o Excel. Ofrecer identidad, junta, zona, cargo, ingreso, validación, estado del pago, importe entregado en EUR, fecha y operador según existan en la ficha. El total desembolsado suma los importes en EUR de los pagos confirmados. Los informes omiten imágenes de cédulas.

## Enfoque de implementación

Reutilizar el lector, la cola de envíos, el archivo de recibos y los generadores PDF y Excel. Una pantalla de exportación independiente exigiría repetir selecciones y permisos. Dar prioridad al ingreso en puerta y a las descargas PDF/ZIP. Verificar los controles de acceso, la conservación de la numeración, el orden cédula antes de nombre, el recuento exacto de archivos y que todas las piezas entren completas en una hoja.

// Provisional (T02): el bucle de trabajos llega en T20. Se queda vivo para que Compose no lo reinicie sin parar.
console.log("cne-worker: sin trabajos todavía.");
setInterval(() => undefined, 60_000);

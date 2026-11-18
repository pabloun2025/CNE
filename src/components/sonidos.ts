// Sonido y vibración de la puerta (de teinvito). El navegador solo deja sonar el audio tras un toque,
// así que un único AudioContext se desbloquea con el primer toque y se reutiliza.
let context: AudioContext | null = null;

export function unlockAudio(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
  } catch { /* sin audio */ }
}

function tone(frequency: number, start: number, length: number): void {
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(context.destination);
  gain.gain.value = 0.2;
  oscillator.start(context.currentTime + start);
  oscillator.stop(context.currentTime + start + length);
}

function vibrate(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* iPhone no vibra */ }
}

// Válida: pitido agudo corto. Reingreso (amarillo): un pitido medio. Rechazada: dos tonos graves.
export function feedback(tipo: "valido" | "reingreso" | "rechazo"): void {
  unlockAudio();
  if (tipo === "valido") { tone(880, 0, 0.14); vibrate(120); }
  else if (tipo === "reingreso") { tone(520, 0, 0.3); vibrate(250); }
  else { tone(300, 0, 0.18); tone(220, 0.22, 0.25); vibrate([200, 100, 200]); }
}

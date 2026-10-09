// Lógica pura (sem DOM nem Bluetooth): fácil de testar com `node --test`.
// RSSI e distância são ESTIMATIVAS: paredes, corpo e interferência alteram a leitura.

export const RSSI_MIN = -95;      // sinal fraco: tratado como "muito longe"
export const RSSI_MAX = -35;      // sinal forte: tratado como "está aqui"
export const STALE_MS = 6000;     // sem anúncio por este tempo = sinal perdido
export const HISTORY_SIZE = 60;   // leituras guardadas no gráfico

const TX_POWER = -59;             // RSSI esperado a 1 m (valor típico, não calibrado)
const PATH_LOSS = 2.2;            // expoente de perda em ambiente interno
const ALPHA = 0.4;                // peso da leitura nova na média móvel

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export const smoothRssi = (previous, rssi) =>
  previous === null || previous === undefined ? rssi : previous * (1 - ALPHA) + rssi * ALPHA;

export const proximity = rssi => clamp((rssi - RSSI_MIN) / (RSSI_MAX - RSSI_MIN), 0, 1);

export function proximityLabel(p) {
  if (p > 0.85) return 'Está aqui!';
  if (p > 0.65) return 'Muito perto';
  if (p > 0.45) return 'Perto';
  if (p > 0.25) return 'Longe';
  return 'Muito longe';
}

export const estimateMeters = rssi => 10 ** ((TX_POWER - rssi) / (10 * PATH_LOSS));

export const formatDistance = meters =>
  meters < 1 ? 'menos de 1 m (estimativa)' : `≈ ${Math.round(meters)} m (estimativa)`;

export const beepInterval = p => Math.round(1300 - clamp(p, 0, 1) * 1150);
export const beepFrequency = p => Math.round(500 + clamp(p, 0, 1) * 700);

// `namePrefix` do Web Bluetooth diferencia maiúsculas de minúsculas: gera variações comuns.
export function namePrefixFilters(text) {
  const out = new Set();
  String(text).split(',').map(s => s.trim()).filter(Boolean).forEach(name => {
    const lower = name.toLowerCase();
    const sentence = lower[0].toUpperCase() + lower.slice(1);
    const title = lower.replace(/(^|\s)\S/g, c => c.toUpperCase());
    [name, lower, name.toUpperCase(), sentence, title].forEach(v => out.add(v));
  });
  return [...out].map(namePrefix => ({ namePrefix }));
}

export function sparklinePoints(history, width = 120, height = 30, size = HISTORY_SIZE) {
  return history
    .map((rssi, i) => {
      const x = (i / (size - 1)) * width;
      const y = height - 1 - clamp((rssi + 100) / 70, 0, 1) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

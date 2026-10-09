import test from 'node:test';
import assert from 'node:assert/strict';
import {
  smoothRssi, proximity, proximityLabel, estimateMeters, formatDistance,
  beepInterval, namePrefixFilters, sparklinePoints, HISTORY_SIZE,
} from '../src/signal.js';

test('smoothRssi começa na primeira leitura e depois faz média móvel', () => {
  assert.equal(smoothRssi(null, -70), -70);
  assert.equal(smoothRssi(-70, -50), -62);
});

test('proximity fica entre 0 e 1', () => {
  assert.equal(proximity(-120), 0);
  assert.equal(proximity(-10), 1);
  assert.ok(proximity(-65) > 0 && proximity(-65) < 1);
});

test('proximityLabel cobre toda a faixa', () => {
  assert.equal(proximityLabel(0), 'Muito longe');
  assert.equal(proximityLabel(0.3), 'Longe');
  assert.equal(proximityLabel(0.5), 'Perto');
  assert.equal(proximityLabel(0.7), 'Muito perto');
  assert.equal(proximityLabel(0.9), 'Está aqui!');
});

test('distância estimada cresce quando o sinal enfraquece e é sempre rotulada como estimativa', () => {
  assert.ok(estimateMeters(-80) > estimateMeters(-60));
  assert.match(formatDistance(0.4), /menos de 1 m \(estimativa\)/);
  assert.match(formatDistance(3.2), /≈ 3 m \(estimativa\)/);
});

test('beepInterval diminui quando chega perto', () => {
  assert.ok(beepInterval(1) < beepInterval(0));
  assert.equal(beepInterval(5), beepInterval(1));
});

test('namePrefixFilters gera variações sem duplicar e ignora vazio', () => {
  assert.deepEqual(namePrefixFilters('  , '), []);
  const names = namePrefixFilters('GM2, Fone foda').map(f => f.namePrefix);
  for (const n of ['GM2', 'gm2', 'Gm2', 'Fone foda', 'fone foda', 'Fone Foda', 'FONE FODA']) assert.ok(names.includes(n), n);
  assert.equal(names.length, new Set(names).size);
});

test('sparklinePoints mantém pontos dentro da área', () => {
  const pts = sparklinePoints(Array(HISTORY_SIZE).fill(-60)).split(' ');
  assert.equal(pts.length, HISTORY_SIZE);
  for (const p of pts) {
    const [x, y] = p.split(',').map(Number);
    assert.ok(x >= 0 && x <= 120 && y >= 0 && y <= 30);
  }
  assert.equal(sparklinePoints([]), '');
});

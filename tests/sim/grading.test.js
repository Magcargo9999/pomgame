import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradePig, grade1, grade2 } from '../../src/sim/grading.js';

const good = { carcassKg: 88, backfat: 21, imf: 3.2, meatColor: 4, fatColor: 2, bellyScore: 0.8, PSE: false, DFD: false };

test('grade1 boundaries (GDD 1.1 table, lower bound inclusive, upper exclusive)', () => {
  assert.equal(grade1(83, 17), 3); assert.equal(grade1(92.9, 24.9), 3);
  assert.equal(grade1(93, 21), 2); assert.equal(grade1(88, 25), 2); assert.equal(grade1(82.9, 21), 2);
  assert.equal(grade1(80, 15), 2); assert.equal(grade1(97.9, 27.9), 2);
  assert.equal(grade1(98, 21), 1); assert.equal(grade1(79.9, 21), 1); assert.equal(grade1(88, 14.9), 1); assert.equal(grade1(88, 28), 1);
});

test('grade2 points: 11+ = 1+, 8+ = 1, else 2', () => {
  assert.equal(grade2(good), 3);
  assert.equal(grade2({ ...good, imf: 2.5 }), 3);             // 2+3+3+3 = 11
  assert.equal(grade2({ ...good, imf: 2.5, fatColor: 3 }), 2); // 2+3+2+3 = 10
  assert.equal(grade2({ ...good, imf: 1, meatColor: 1, fatColor: 7 }), 1); // 1+1+1+3 = 6
  assert.equal(grade2({ ...good, meatColor: 6 }), 3);          // 3+2+3+3 = 11
});

test('final grade is the lower of the two', () => {
  assert.equal(gradePig(good).grade, '1+');
  assert.equal(gradePig({ ...good, carcassKg: 95 }).grade, '1');
  assert.equal(gradePig({ ...good, carcassKg: 100 }).grade, '2');
  assert.equal(gradePig({ ...good, imf: 1, fatColor: 5 }).grade, '1');
});

test('PSE/DFD drop two steps, a defect one', () => {
  assert.equal(gradePig({ ...good, PSE: true }).grade, '2');
  assert.equal(gradePig({ ...good, carcassKg: 95, DFD: true }).grade, 'out');
  assert.equal(gradePig({ ...good, defect: true }).grade, '1');
});

test('brand cert sits above 1+ and needs IMF and white fat', () => {
  const top = { ...good, imf: 4.0, fatColor: 1 };
  assert.equal(gradePig(top).grade, 'brand');
  assert.equal(gradePig({ ...top, imf: 3.99 }).grade, '1+');
  assert.equal(gradePig({ ...top, fatColor: 2 }).grade, '1+');
  assert.equal(gradePig({ ...top, carcassKg: 94 }).grade, '1');
  assert.equal(gradePig({ ...top, PSE: true }).grade, '2');
  const r = gradePig(top); assert.equal(r.grade1, '1+'); assert.equal(r.grade2, '1+');
});

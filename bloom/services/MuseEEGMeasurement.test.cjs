const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the pure TS helpers without importing React Native's native bridge.
const source = fs.readFileSync(path.join(__dirname, 'MuseEEGMeasurement.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports);
const { keepFiniteSamples } = loaded.exports;

test('passes fully valid batches through unchanged', () => {
  const channels = { TP9: [1, 2], AF7: [3, 4], AF8: [5, 6], TP10: [7, 8] };
  assert.deepEqual(keepFiniteSamples(channels), channels);
});

test('drops a NaN-filled dropped packet from every channel', () => {
  const channels = {
    TP9: [1, NaN, 3],
    AF7: [4, NaN, 6],
    AF8: [7, NaN, 9],
    TP10: [10, NaN, 12],
  };
  assert.deepEqual(keepFiniteSamples(channels), {
    TP9: [1, 3],
    AF7: [4, 6],
    AF8: [7, 9],
    TP10: [10, 12],
  });
});

test('keeps channels aligned when only one channel has a bad sample', () => {
  const result = keepFiniteSamples({
    TP9: [1, 2, 3],
    AF7: [4, Infinity, 6],
    AF8: [7, 8, 9],
    TP10: [10, 11, NaN],
  });
  assert.deepEqual(result, { TP9: [1], AF7: [4], AF8: [7], TP10: [10] });
});

test('returns empty channels for an all-NaN batch, which the service skips', () => {
  const result = keepFiniteSamples({ TP9: [NaN], AF7: [NaN], AF8: [NaN], TP10: [NaN] });
  assert.deepEqual(result, { TP9: [], AF7: [], AF8: [], TP10: [] });
});

test('ignores missing channels and never serializes a null sample', () => {
  const result = keepFiniteSamples({ TP9: [1, NaN], AF8: [2, 3], TP10: [] });
  assert.deepEqual(result, { TP9: [1], AF8: [2] });
  assert.ok(!JSON.stringify(result).includes('null'));
});

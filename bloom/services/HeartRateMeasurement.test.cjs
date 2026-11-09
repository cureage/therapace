const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Load the pure TS decoder without importing React Native's native bridge.
const source = fs.readFileSync(path.join(__dirname, 'HeartRateMeasurement.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports);
const { decodeHeartRate } = loaded.exports;
const packet = (...bytes) => Buffer.from(bytes).toString('base64');

test('decodes 8-bit BPM and ignores optional trailing fields', () => {
  assert.equal(decodeHeartRate(packet(0, 72)), 72);
  assert.equal(decodeHeartRate(packet(0x18, 85, 0, 0, 0, 4)), 85);
});
test('decodes little-endian 16-bit BPM', () => {
  assert.equal(decodeHeartRate(packet(1, 44, 1)), 300);
});
test('suppresses zero BPM and missing contact, accepts supported contact', () => {
  assert.equal(decodeHeartRate(packet(0, 0)), null);
  assert.equal(decodeHeartRate(packet(4, 80)), null);
  assert.equal(decodeHeartRate(packet(6, 80)), 80);
});
test('rejects truncated and invalid base64 payloads', () => {
  assert.throws(() => decodeHeartRate(''));
  assert.throws(() => decodeHeartRate(packet(0)));
  assert.throws(() => decodeHeartRate(packet(1, 72)));
  assert.throws(() => decodeHeartRate('not base64'));
});

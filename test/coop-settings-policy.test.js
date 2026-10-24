import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [html, script] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('script.js', root), 'utf8')
]);

test('Free For All exposes a zero-AI option for player 1 versus player 2', () => {
  assert.match(html, /name="ai-count" value="0"/);
  assert.match(script, /radio\.disabled = isZeroAI && gameSettings\.gameMode !== 'ffa'/);
  assert.match(script, /gameSettings\.gameMode !== 'ffa' && Number\(gameSettings\.aiCount\) < 1/);
});

test('co-op guest settings are limited to local presentation and controls', () => {
  assert.match(script, /control\.id === 'bgm-mute-checkbox'/);
  assert.match(script, /control\.name === 'killcam-mode' \|\| control\.name === 'auto-aim'/);
  assert.match(script, /gameSettings\.autoAim = localAutoAim/);
  assert.match(script, /gameSettings\.bgmMute = localBgmMute/);
  assert.match(script, /gameSettings\.buttonPositions = localButtonPositions/);
});

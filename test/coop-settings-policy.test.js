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

test('co-op FFA assigns both player projectiles and resolves PvP before the floor', () => {
  assert.match(script, /getLocalPlayerProjectileSource\(\), projectileSpeed \* 2, true, WEAPON_SR, player/);
  assert.match(script, /getLocalPlayerProjectileSource\(\), projectileSpeed, false, WEAPON_SG, player/);
  assert.match(script, /function getCoopPvpShooterRole\(projectile\)/);
  assert.match(script, /if \(isCoopRemoteCombatant\(projectile\.shooter\)\) return 'guest'/);
  assert.match(script, /if \(projectile\.shooter === player \|\| !projectile\.shooter\) return 'host'/);
  assert.match(script, /const direction = requestedDirection\.clone\(\)/);

  const pvpIndex = script.indexOf('const coopPvpHit = resolveCoopPvpProjectileHit');
  const floorIndex = script.indexOf("p.source !== 'ai' && new THREE.Box3().setFromObject(floor)");
  assert.ok(pvpIndex >= 0 && floorIndex >= 0 && pvpIndex < floorIndex);
  assert.match(script, /gameSettings\.gameMode !== 'ffa'/);
  assert.match(script, /damageCoopRemotePlayer\(/);
  assert.match(script, /damageCoopHostPlayer\(/);
});

test('guest fire preserves a validated muzzle origin and reports host hit feedback', () => {
  assert.match(script, /broadcastCoopPlayerFire\(baseDirection, currentWeapon, safeFire\.startPosition\)/);
  assert.match(script, /origin: validOrigin \? \[origin\.x, origin\.y, origin\.z\] : null/);
  assert.match(script, /requestedOrigin\.distanceTo\(reportedPlayerTop\) <= 4/);
  assert.match(script, /createProjectile\(projectileOrigin, direction/);
  assert.match(script, /new CustomEvent\('gfa:host-player-hit'/);
  assert.match(script, /showRemotePlayerHit: showCoopRemotePlayerHit/);
});

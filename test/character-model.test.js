import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadCharacterModels() {
  const context = vm.createContext({ console });
  context.window = context;
  context.self = context;
  vm.runInContext(await readFile('vendor/three-r128.min.js', 'utf8'), context);
  vm.runInContext(await readFile('character-models.js', 'utf8'), context);
  return { models: context.GFACharacterModels, THREE: context.THREE };
}

test('modern character torso mesh follows the dedicated chest pivot', async () => {
  const { models, THREE } = await loadCharacterModels();
  const actor = models.create('#2586c9', {});
  const parts = actor.userData.parts;

  assert.equal(parts.modernRig, true);
  assert.equal(parts.body.parent, parts.torso);
  assert.equal(parts.aimGroup.parent, parts.torso);
  assert.equal(parts.head.parent, parts.aimGroup);

  parts.torso.rotation.x = 0.6;
  actor.updateMatrixWorld(true);
  const torsoQuaternion = parts.torso.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(Math.abs(torsoQuaternion.x) > 0.1);
});

test('modern character leg joints change throughout a run cycle', async () => {
  const { models } = await loadCharacterModels();
  const actor = models.create('#2586c9', {});
  const parts = actor.userData.parts;
  const sample = () => [
    parts.leftHip.quaternion.x,
    parts.leftKnee.quaternion.x,
    parts.rightHip.quaternion.x,
    parts.rightKnee.quaternion.x
  ];

  models.pose(parts, false, 0.05, true, 0);
  const first = sample();
  models.pose(parts, false, 0.2, true, 0);
  const second = sample();

  assert.notDeepEqual(first, second);
});

test('attached upper body aims the barrel exactly at an arbitrary world direction', async () => {
  const { models, THREE } = await loadCharacterModels();
  const actor = models.create('#2586c9', {});
  const parts = actor.userData.parts;
  actor.rotation.y = 0.72;
  models.pose(parts, false, 0.4, false, 0);

  const requested = new THREE.Vector3(-0.55, 0.38, 0.74).normalize();
  models.aim(parts, requested);
  const actual = models.muzzle(parts).direction.normalize();

  assert.ok(actual.angleTo(requested) < 1e-6);
  assert.equal(parts.head.parent, parts.aimGroup);
  assert.equal(parts.aimGroup.parent, parts.torso);
  assert.ok(parts.aimGroup.quaternion.angleTo(new THREE.Quaternion()) < 1e-8);
});

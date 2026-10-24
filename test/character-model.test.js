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

test('modern character hit boxes reach the rendered head instead of ending at camera height', async () => {
  const { models, THREE } = await loadCharacterModels();
  const actor = models.create('#2586c9', { headwearType: 'helmet' });
  const parts = actor.userData.parts;
  actor.updateMatrixWorld(true);

  const bodyBox = models.bodyBox(parts);
  const visibleHeadBox = new THREE.Box3().setFromObject(parts.head);
  assert.ok(bodyBox.max.y > 2.7);
  assert.ok(visibleHeadBox.max.y > 2.7);
});

test('remote visual scale survives pose updates', async () => {
  const { models, THREE } = await loadCharacterModels();
  const actor = models.create('#2586c9', {});
  const parts = actor.userData.parts;
  const visualScale = 2.2 / 2.8065;
  actor.userData.gfaPoseScaleY = visualScale;
  actor.scale.setScalar(visualScale);

  models.pose(parts, false, 0.2, false, 0);
  assert.ok(Math.abs(actor.scale.y - visualScale) < 1e-9);
  const headCenter = parts.head.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(headCenter.y - 2.2) < 0.03);
});

test('wall retraction pulls the weapon and both hands toward the body', async () => {
  const { models, THREE } = await loadCharacterModels();
  const actor = models.create('#2586c9', {});
  const parts = actor.userData.parts;

  models.pose(parts, false, 0.2, false, 0);
  actor.updateMatrixWorld(true);
  const muzzleBefore = models.muzzle(parts).position.clone();
  const rightHandBefore = parts.rightHand.getWorldPosition(new THREE.Vector3());
  const leftHandBefore = parts.leftHand.getWorldPosition(new THREE.Vector3());

  models.setWeaponRetraction(parts, 0.65);
  models.pose(parts, false, 0.2, false, 0);
  actor.updateMatrixWorld(true);
  const muzzleAfter = models.muzzle(parts).position.clone();
  const rightHandAfter = parts.rightHand.getWorldPosition(new THREE.Vector3());
  const leftHandAfter = parts.leftHand.getWorldPosition(new THREE.Vector3());

  assert.ok(muzzleAfter.z < muzzleBefore.z - 0.6);
  assert.ok(rightHandAfter.z < rightHandBefore.z - 0.5);
  assert.ok(leftHandAfter.z < leftHandBefore.z - 0.5);
});

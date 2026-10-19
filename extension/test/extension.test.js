const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifestPath = path.join(__dirname, '../manifest.json');

test('Extension manifest exists and is valid JSON', () => {
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw), 'manifest.json must be valid JSON');
});

test('Extension manifest adheres to Manifest V3 specification', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  assert.equal(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.ok(manifest.name, 'Extension must have a name');
  assert.ok(manifest.version, 'Extension must have a version string');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'Version must follow semver format');
  assert.ok(manifest.background?.service_worker, 'Must declare a background service worker');
  assert.ok(Array.isArray(manifest.permissions), 'Must define permissions array');
  assert.ok(Array.isArray(manifest.host_permissions), 'Must define host_permissions array');
  assert.ok(manifest.permissions.includes('storage'), 'Must request storage permission');
  assert.ok(manifest.permissions.includes('activeTab'), 'Must request activeTab permission');
});

test('Extension referenced files exist on disk', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const extRoot = path.join(__dirname, '..');

  // Background worker
  assert.ok(fs.existsSync(path.join(extRoot, manifest.background.service_worker)));

  // Content scripts
  for (const cs of manifest.content_scripts || []) {
    for (const js of cs.js || []) {
      assert.ok(fs.existsSync(path.join(extRoot, js)), `Content script ${js} must exist`);
    }
    for (const css of cs.css || []) {
      assert.ok(fs.existsSync(path.join(extRoot, css)), `Content stylesheet ${css} must exist`);
    }
  }

  // Popup
  if (manifest.action?.default_popup) {
    assert.ok(fs.existsSync(path.join(extRoot, manifest.action.default_popup)));
  }
});

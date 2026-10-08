const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

// Setup mock environment
const documentMock = {
  querySelector: () => ({
    getAttribute: () => 'M0,0',
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: { setProperty: () => {}, removeProperty: () => {} },
    setAttribute: () => {},
    replaceChildren: () => {},
    append: () => {},
    replaceChild: () => {},
    hidden: false,
    dataset: {}
  }),
  querySelectorAll: () => [],
  createElementNS: (ns, name) => {
    return {
      ns,
      name,
      attributes: {},
      dataset: {},
      children: [],
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      setAttribute(key, val) { this.attributes[key] = val; },
      setAttributeNS(ns, key, val) { this.attributes[`${ns}:${key}`] = val; },
      append(child) {
        this.children.push(child);
      },
      querySelector: () => ({})
    };
  },
  createElement: () => ({
    append: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    dataset: {}
  }),
  body: { classList: { toggle: () => {}, remove: () => {}, contains: () => false } },
  createTextNode: () => ({})
};

const context = {
  document: documentMock,
  requestAnimationFrame: () => {},
  setTimeout: () => {},
  clearTimeout: () => {},
  OFFICIAL_F1_CIRCUITS: [],
  OFFICIAL_CIRCUIT_ROUTES: {},
  module: { exports: {} }
};

const scriptCode = fs.readFileSync('./script.js', 'utf8');
vm.createContext(context);
vm.runInContext(scriptCode + '\nmodule.exports = { createCarMotion };', context);

const { createCarMotion } = context.module.exports;

test('createCarMotion', async (t) => {
  await t.test('creates an animateMotion element with correct namespace', () => {
    const driver = { position: 1, lapSeconds: 90 };
    const motion = createCarMotion(driver);
    assert.strictEqual(motion.ns, 'http://www.w3.org/2000/svg');
    assert.strictEqual(motion.name, 'animateMotion');
  });

  await t.test('sets the correct duration based on lapSeconds', () => {
    const driver = { position: 1, lapSeconds: 90 };
    const motion = createCarMotion(driver);
    assert.strictEqual(motion.attributes.dur, '30s');
  });

  await t.test('calculates correct begin time based on position', () => {
    const driver = { position: 4, lapSeconds: 120 };
    // phase = ((0.37 - (4 - 4) * 0.05) % 1 + 1) % 1 = 0.37
    // begin = -(0.37 * (120/3)).toFixed(2) = -14.80s
    const motion = createCarMotion(driver);
    assert.strictEqual(motion.attributes.begin, '-14.80s');
  });

  await t.test('calculates correct begin time for different position', () => {
    const driver = { position: 1, lapSeconds: 120 };
    // phase = ((0.37 - (1 - 4) * 0.05) % 1 + 1) % 1 = (0.37 - (-0.15)) % 1 = 0.52
    // begin = -(0.52 * 40).toFixed(2) = -20.80s
    const motion = createCarMotion(driver);
    assert.strictEqual(motion.attributes.begin, '-20.80s');
  });

  await t.test('appends an mpath element with correct attributes', () => {
    const driver = { position: 1, lapSeconds: 90 };
    const motion = createCarMotion(driver);
    const mpath = motion.children[0];
    assert.strictEqual(mpath.name, 'mpath');
    assert.strictEqual(mpath.attributes.href, '#circuitMotionPath');
    assert.strictEqual(mpath.attributes['http://www.w3.org/1999/xlink:xlink:href'], '#circuitMotionPath');
  });
});

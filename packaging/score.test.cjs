const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const storage = new Map([['2048-best-score', '1000']]);
const elements = new Map();
let pending = [];
let reducedMotion = true;
function element() {
  return {
    children: [], style: {}, open: false,
    classList: { add() {}, remove() {} },
    setAttribute() {}, removeAttribute() {}, addEventListener() {},
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    cloneNode() { return element(); },
    close() { this.open = false; },
    offsetLeft: 0, offsetTop: 0, offsetWidth: 88, offsetHeight: 88,
    animate() {
      let resolve;
      const finished = new Promise(done => { resolve = done; });
      pending.push(resolve);
      return { finished, cancel: resolve };
    }
  };
}
const context = vm.createContext({
  window: { matchMedia: () => ({ matches: reducedMotion }) },
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    },
    createElement: element, addEventListener() {}
  },
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value)
  }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), context);
const run = code => vm.runInContext(code, context);
function setup(value) {
  run(`board = [[${value},${value},0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; render();`);
}

(async () => {
  assert.equal(run('score'), 0);
  assert.equal(run('best'), 1000);
  for (let i = 0; i < 3; i++) {
    run('restart()');
    setup(2);
    await run("move('left')");
    assert.equal(run('score'), 4);
    assert.equal(run('best'), 1000);
    assert.equal(storage.get('2048-best-score'), '1000');
  }
  run('restart()');
  setup(512);
  await run("move('left')");
  assert.equal(run('score'), 1024);
  assert.equal(run('best'), 1024);
  assert.equal(storage.get('2048-best-score'), '1024');
  run('restart()');
  setup(2);
  await run("move('left')");
  assert.equal(run('score'), 4);
  assert.equal(run('best'), 1024);

  // 旧移动尚未完成时重开，不能保留该移动得分或执行旧排队输入。
  reducedMotion = false;
  run('restart()');
  setup(1024);
  const oldMove = run("move('left')");
  await run("move('right')");
  assert.equal(run('score'), 0);
  assert.equal(run('best'), 1024);
  run('restart()');
  await oldMove;
  pending.forEach(resolve => resolve());
  pending = [];
  assert.equal(run('score'), 0);
  assert.equal(run('best'), 1024);
  assert.equal(run('queuedDirection'), null);
  assert.equal(run('animating'), false);
  assert.equal(storage.get('2048-best-score'), '1024');

  // 完成的动画正常计分。
  setup(2);
  const completedMove = run("move('left')");
  pending.forEach(resolve => resolve());
  await completedMove;
  assert.equal(run('score'), 4);
  assert.equal(run('best'), 1024);
  console.log('PASS: per-game scoring, historical maximum, persistence, restart during animation, canceled queued input, completed animation scoring');
})().catch(error => { console.error(error); process.exitCode = 1; });

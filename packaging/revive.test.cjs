const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const codes = ['cr是区'];
// 早期版本公开过的口令，现已全部失效。
const retiredCodes = ['我叫徐支行', '徐支行', '支行', '子涵', '徐子涵'];
const storageKey = '2048-revive-usage';
const storage = new Map();
let writesBlocked = false;
function session() {
  const nodes = new Map();
  function node() {
    return {
      children: [], listeners: {}, value: '', open: false,
      classList: { add() {}, remove() {} },
      setAttribute() {}, removeAttribute() {}, focus() {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      close() { this.open = false; }, showModal() { this.open = true; }
    };
  }
  const context = vm.createContext({
    window: { matchMedia: () => ({ matches: true }) },
    document: {
      getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); },
      createElement: node, addEventListener() {}
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem(key, value) { if (writesBlocked) throw Error('Storage unavailable'); storage.set(key, value); }
    }
  });
  vm.runInContext(source, context);
  const run = code => vm.runInContext(code, context);
  return {
    run,
    dead() {
      run('board=[[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]];gameOver=true;score=200;best=1000;won=true;render()');
    },
    submit(code) { nodes.get('revive-code').value = code; nodes.get('revive-form').listeners.submit({ preventDefault() {} }); },
    error() { return nodes.get('revive-error').textContent; }
  };
}

let game = session();
game.dead();
game.submit('错误');
assert.equal(game.run('gameOver'), true);
assert.equal(storage.has(storageKey), false);
game.run('openReviveDialog(); reviveDialog.close()');
assert.equal(storage.has(storageKey), false);

// 已废弃的五个口令不能再复活，也不能扣减次数。
for (const retired of retiredCodes) {
  game.dead();
  game.submit(retired);
  assert.equal(game.run('gameOver'), true);
  assert.equal(storage.has(storageKey), false);
}

for (const code of codes) {
  for (let i = 1; i <= 5; i++) {
    game.dead();
    game.submit(` ${code} `);
    assert.equal(game.run('gameOver'), false);
    assert.equal(game.run('board.flat().filter(v => v === 0).length'), 2);
    assert.equal(game.run('score'), 200);
    assert.equal(game.run('best'), 1000);
    assert.equal(game.run('won'), true);
    assert.equal(JSON.parse(storage.get(storageKey))[code], i);
    // 重复提交不扣次数；新局、重新载入均不能恢复额度。
    game.submit(code);
    assert.equal(JSON.parse(storage.get(storageKey))[code], i);
    game.run('restart()');
    game = session();
  }
  game.dead();
  const before = game.run('JSON.stringify(board)');
  game.submit(code);
  assert.equal(game.run('gameOver'), true);
  assert.equal(game.run('JSON.stringify(board)'), before);
  assert.equal(JSON.parse(storage.get(storageKey))[code], 5);
  assert.match(game.error(), /5 次/);
}
assert.equal(Object.values(JSON.parse(storage.get(storageKey))).reduce((a, b) => a + b), 5);

// 保存失败时不允许复活，避免正常重启后丢失额度限制。
storage.clear();
game = session(); game.dead();
writesBlocked = true;
game.submit(codes[0]);
assert.equal(game.run('gameOver'), true);
assert.equal(game.run('reviveUsage[REVIVE_CODES[0]]'), 0);
assert.match(game.error(), /无法保存/);
writesBlocked = false;
game.submit(codes[0]);
assert.equal(game.run('gameOver'), false);
assert.equal(JSON.parse(storage.get(storageKey))[codes[0]], 1);

// 已打开的其他窗口读取最新次数，不覆盖为较低计数。
const second = session();
for (let i = 0; i < 4; i++) { game.dead(); game.submit(codes[0]); }
second.dead(); second.submit(codes[0]);
assert.equal(second.run('gameOver'), true);
assert.equal(JSON.parse(storage.get(storageKey))[codes[0]], 5);
console.log('PASS: single revive code, five uses, sixth rejected, retired codes rejected, reload/restart persistence, wrong/canceled/duplicate attempts, score preservation, storage failure, stale window');

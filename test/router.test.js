// T2-1 Hash 路由测试（NAV-02）
const test = require('node:test');
const assert = require('node:assert/strict');
const Router = require('../client/router.js');

/** mock window：hash、hashchange 事件、定时器记录 */
function makeWin(initialHash) {
  const listeners = {};
  const win = {
    location: { hash: initialHash || '' },
    calls: { setTimeout: [], setInterval: [], clearTimeout: [], clearInterval: [] },
    setTimeout(fn, ms) {
      win.calls.setTimeout.push(ms);
      return 'to' + win.calls.setTimeout.length;
    },
    setInterval(fn, ms) {
      win.calls.setInterval.push(ms);
      return 'iv' + win.calls.setInterval.length;
    },
    clearTimeout(id) { win.calls.clearTimeout.push(id); },
    clearInterval(id) { win.calls.clearInterval.push(id); },
    addEventListener(type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    removeEventListener() {},
    emit(type) { (listeners[type] || []).forEach((fn) => fn()); },
    setHash(hash) { win.location.hash = hash; win.emit('hashchange'); },
  };
  return win;
}

/** 记录 mount/unmount 调用的视图 */
function makeView(log, name, mountRet) {
  return {
    mount(ctx) {
      log.push('mount:' + name);
      if (ctx) {
        ctx.setTimeout(() => {}, 100);
        ctx.setInterval(() => {}, 200);
        ctx.onCleanup(() => log.push('cleanup:' + name));
      }
      return mountRet;
    },
    unmount() { log.push('unmount:' + name); },
  };
}

// ---------- parseHash ----------

test('parseHash 解析各种形式', () => {
  assert.equal(Router.parseHash(''), null);
  assert.equal(Router.parseHash('#/'), null);
  assert.equal(Router.parseHash(undefined), null);
  assert.equal(Router.parseHash('#/home'), 'home');
  assert.equal(Router.parseHash('home'), 'home');
  assert.equal(Router.parseHash('#/profile?x=1'), 'profile');
  assert.equal(Router.parseHash('#/game/'), 'game');
});

// ---------- 启动与五路由 ----------

test('空 hash 启动定位 #/home 并挂载首页', () => {
  const win = makeWin('');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.start();
  assert.equal(win.location.hash, '#/home');
  assert.equal(r.currentName(), 'home');
  assert.deepEqual(log, ['mount:home']);
});

test('五个路由 #/home|profile|ai|match|game 均可挂载', () => {
  const win = makeWin('#/home');
  const log = [];
  const r = Router.create(win);
  ['home', 'profile', 'ai', 'match', 'game'].forEach((n) => r.register(n, makeView(log, n)));
  r.start();
  for (const name of ['profile', 'ai', 'match', 'game', 'home']) {
    win.setHash('#/' + name);
    assert.equal(r.currentName(), name);
    assert.ok(log.includes('mount:' + name), name + ' 应挂载');
  }
});

// ---------- 未知路由 ----------

test('未知路由回首页且地址栏修正为 #/home', () => {
  const win = makeWin('#/xxx');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.start();
  assert.equal(r.currentName(), 'home');
  assert.equal(win.location.hash, '#/home');
  assert.deepEqual(log.filter((s) => s.startsWith('mount')), ['mount:home']);
});

test('未注册路由（如 ai 尚未实现）回首页', () => {
  const win = makeWin('#/home');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.register('profile', makeView(log, 'profile'));
  r.start();
  win.setHash('#/ai');
  assert.equal(r.currentName(), 'home');
  assert.equal(win.location.hash, '#/home');
});

// ---------- 卸载与资源清理 ----------

test('切换视图调用旧视图 unmount，并清理其定时器与清理回调', () => {
  const win = makeWin('#/home');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.register('profile', makeView(log, 'profile'));
  r.start();
  win.setHash('#/profile');
  assert.ok(log.includes('unmount:home'));
  assert.ok(log.includes('cleanup:home'));
  assert.deepEqual(win.calls.clearTimeout, ['to1']);
  assert.deepEqual(win.calls.clearInterval, ['iv1']);
  win.setHash('#/home');
  assert.deepEqual(win.calls.clearTimeout, ['to1', 'to2']);
  assert.deepEqual(win.calls.clearInterval, ['iv1', 'iv2']);
});

test('重复进入同一路由不重复挂载/卸载', () => {
  const win = makeWin('#/home');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.start();
  win.setHash('#/home');
  r.resolve();
  assert.deepEqual(log, ['mount:home']);
});

test('无 mount/unmount 的简视图也能注册切换', () => {
  const win = makeWin('#/home');
  const r = Router.create(win);
  r.register('home', {});
  r.register('profile', {});
  r.start();
  win.setHash('#/profile');
  assert.equal(r.currentName(), 'profile');
});

// ---------- 拒绝进入（#/game 无可恢复对局） ----------

test('mount 返回 false 时重定向首页（模拟 #/game 无可恢复对局）', () => {
  const win = makeWin('#/game');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.register('game', makeView(log, 'game', false));
  r.start();
  assert.equal(r.currentName(), 'home');
  assert.equal(win.location.hash, '#/home');
  assert.ok(log.includes('mount:game'));
  assert.ok(log.includes('mount:home'));
});

test('首页自身 mount 返回 false 不会无限递归', () => {
  const win = makeWin('#/home');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home', false));
  r.start();
  assert.equal(r.currentName(), null);
  assert.equal(log.filter((s) => s === 'mount:home').length, 1);
});

// ---------- 对局离开守卫（NAV-03） ----------

test('离开守卫取消时恢复原 hash，不卸载当前视图或清理资源', () => {
  const win = makeWin('#/match');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.register('match', makeView(log, 'match'));
  r.start();

  let calls = 0;
  r.setLeaveGuard((transition) => {
    calls += 1;
    assert.deepEqual(transition, { from: 'match', to: 'home' });
    return false;
  });
  win.setHash('#/home'); // 与浏览器后退触发的 hashchange 相同

  assert.equal(calls, 1);
  assert.equal(r.currentName(), 'match');
  assert.equal(win.location.hash, '#/match');
  assert.deepEqual(log, ['mount:match']);
  assert.deepEqual(win.calls.clearTimeout, []);
  assert.deepEqual(win.calls.clearInterval, []);
});

test('离开守卫确认后继续切换；守卫自行清除后不拦截后续导航', () => {
  const win = makeWin('#/match');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.register('match', makeView(log, 'match'));
  r.start();

  r.setLeaveGuard(() => {
    r.setLeaveGuard(null); // 模拟确认退出后终结对局状态
    return true;
  });
  win.setHash('#/home');
  assert.equal(r.currentName(), 'home');
  assert.ok(log.includes('unmount:match'));
  assert.ok(log.includes('cleanup:match'));

  win.setHash('#/match');
  assert.equal(r.currentName(), 'match');
});

test('navigate() 修改 hash 并触发路由', () => {
  const win = makeWin('#/home');
  const log = [];
  const r = Router.create(win);
  r.register('home', makeView(log, 'home'));
  r.register('profile', makeView(log, 'profile'));
  r.start();
  r.navigate('profile');
  win.emit('hashchange'); // 浏览器行为：hash 变化触发事件
  assert.equal(r.currentName(), 'profile');
});

// T4-7 匹配视图（PVP-01/02/07）：等待时长格式、60 秒软提示、状态文案与转义。
const test = require('node:test');
const assert = require('node:assert/strict');
const MatchView = require('../client/match-view.js');

test('等待时长格式化为 mm:ss', () => {
  assert.equal(MatchView.formatElapsed(0), '00:00');
  assert.equal(MatchView.formatElapsed(12_000), '00:12');
  assert.equal(MatchView.formatElapsed(61_000), '01:01');
  assert.equal(MatchView.formatElapsed(3_600_000), '60:00');
  assert.equal(MatchView.formatElapsed(-5000), '00:00');
});

test('60 秒后切换软提示但不中止匹配（spec 5.5）', () => {
  assert.equal(MatchView.WAIT_SOFT_LIMIT_MS, 60_000);
  assert.equal(MatchView.waitHint(0), '两个终端同时匹配即可开局');
  assert.equal(MatchView.waitHint(59_999), '两个终端同时匹配即可开局');
  assert.equal(MatchView.waitHint(60_000), '暂时没有对手，可稍后再试');
  assert.equal(MatchView.waitHint(90_000), '暂时没有对手，可稍后再试');
});

test('失败提示对服务端文案做 HTML 转义', () => {
  assert.equal(
    MatchView.escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
  );
  assert.equal(MatchView.escapeHtml("a&b'c"), 'a&amp;b&#39;c');
});

test('create 暴露所需状态方法', () => {
  assert.equal(typeof MatchView.create, 'function');
  const view = MatchView.create({
    root: { hidden: true, dataset: {}, innerHTML: '', querySelector: () => null },
  });
  for (const method of ['showConnecting', 'showReady', 'showWaiting', 'showCancelling', 'showFound', 'showFailed', 'hide', 'getState']) {
    assert.equal(typeof view[method], 'function', method);
  }
  assert.equal(view.getState(), 'idle');
  view.hide();
  assert.equal(view.getState(), 'idle');
});

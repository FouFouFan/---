// T3-5 人机设置页（AI-01）：难度分段、执子选择、偏好记忆文案与映射。
const test = require('node:test');
const assert = require('node:assert/strict');
const AiView = require('../client/ai-view.js');

const SETTINGS = { aiDifficulty: 'medium', preferredColor: 'black' };

test('难度与引擎名称映射：medium → normal，其余保持不变', () => {
  assert.equal(AiView.toEngineDifficulty('easy'), 'easy');
  assert.equal(AiView.toEngineDifficulty('medium'), 'normal');
  assert.equal(AiView.toEngineDifficulty('hard'), 'hard');
});

test('设置页包含三档难度与三种执子（AI-01）', () => {
  const html = AiView.html(SETTINGS);
  for (const id of ['easy', 'medium', 'hard']) {
    assert.ok(html.includes('data-difficulty="' + id + '"'));
  }
  for (const id of ['black', 'white', 'auto']) {
    assert.ok(html.includes('data-color="' + id + '"'));
  }
  assert.ok(html.includes('id="ai-start"'));
  assert.ok(html.includes('开始对局'));
});

test('当前偏好渲染为选中态，其余为未选中（记忆偏好回显）', () => {
  const html = AiView.html(SETTINGS);
  assert.ok(html.includes('data-difficulty="medium" aria-pressed="true"'));
  assert.ok(html.includes('data-difficulty="easy" aria-pressed="false"'));
  assert.ok(html.includes('data-color="black" aria-pressed="true"'));
  assert.ok(html.includes('data-color="auto" aria-pressed="false"'));
});

test('规则说明与每档行为说明完整（AI-01）', () => {
  const html = AiView.html(SETTINGS);
  assert.ok(html.includes(AiView.RULE_TEXT));
  assert.ok(html.includes('15×15'));
  assert.ok(html.includes('无禁手'));
  assert.ok(html.includes('不计时判负'));
  for (const item of AiView.DIFFICULTIES) assert.ok(html.includes(item.desc));
});

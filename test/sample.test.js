// T0-4 示例测试：验证 node:test 脚手架可用，且客户端纯逻辑模块支持 module.exports
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// 1) 脚手架本身可用
test('node:test 运行时正常', () => {
  assert.equal(1 + 1, 2);
});

// 2) 客户端纯逻辑模块可被 Node require（双环境模式）
const SampleLogic = require(path.join(__dirname, 'fixtures', 'sample-logic.js'));

test('客户端纯逻辑模块支持 module.exports', () => {
  assert.equal(typeof SampleLogic.isValidCell, 'function');
});

test('isValidCell 边界校验', () => {
  assert.equal(SampleLogic.isValidCell(0, 0), true);
  assert.equal(SampleLogic.isValidCell(14, 14), true);
  assert.equal(SampleLogic.isValidCell(-1, 0), false);
  assert.equal(SampleLogic.isValidCell(0, 15), false);
  assert.equal(SampleLogic.isValidCell(7.5, 7), false);
  assert.equal(SampleLogic.isValidCell('7', 7), false);
});

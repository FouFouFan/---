'use strict';

// T4-1 服务端档案裁剪（PVP-09 / spec 7.7）：playerId 白名单、昵称裁剪、头像白名单、
// 默认匿名、拒绝并丢弃自定义头像与未知字段。
const test = require('node:test');
const assert = require('node:assert/strict');
const Profile = require('../server/profile.js');

test('合法档案原样保留三个字段', () => {
  const result = Profile.sanitizeProfile({
    playerId: 'gm_k3f9a2x7q1z0',
    nickname: '竹影',
    avatarId: 'bamboo',
  });
  assert.deepEqual(result, { playerId: 'gm_k3f9a2x7q1z0', nickname: '竹影', avatarId: 'bamboo' });
});

test('playerId 非法或缺失视为匿名（null）', () => {
  const cases = [
    'gm_A1B2C3',            // 含大写
    'gm_abc',               // 少于 6 位
    'gm_' + 'a'.repeat(21), // 超过 20 位
    'xx_k3f9a2x7q1z0',      // 前缀错误
    '', 42, null, undefined, ['gm_abcdef'],
  ];
  for (const value of cases) {
    assert.equal(Profile.sanitizePlayerId(value), null, String(value));
  }
  assert.equal(Profile.sanitizePlayerId('gm_abcdef'), 'gm_abcdef'); // 6 位边界
  assert.equal(Profile.sanitizePlayerId('gm_' + 'z'.repeat(20)), 'gm_' + 'z'.repeat(20)); // 20 位边界
});

test('昵称截断到 24 个 UTF-16 单元', () => {
  const long = '枫'.repeat(30);
  const result = Profile.sanitizeNickname(long);
  assert.equal(result.length, 24);
  assert.equal(result, '枫'.repeat(24));
  // 恰好 24 单元不截断
  assert.equal(Profile.sanitizeNickname('a'.repeat(24)), 'a'.repeat(24));
});

test('昵称去除控制字符与首尾空白', () => {
  assert.equal(Profile.sanitizeNickname(' \u0000竹\u001f影\u007f\t '), '竹影');
  assert.equal(Profile.sanitizeNickname('竹\n影'), '竹影');
});

test('空昵称、纯空白、非字符串回退「棋客」', () => {
  for (const value of ['', '   ', '\u0000\u0001', null, undefined, 123, {}, []]) {
    assert.equal(Profile.sanitizeNickname(value), Profile.DEFAULT_NICKNAME);
  }
  assert.equal(Profile.DEFAULT_NICKNAME, '棋客');
});

test('头像仅接受 8 个预设值，其余回退 maple', () => {
  for (const id of Profile.AVATAR_IDS) {
    assert.equal(Profile.sanitizeAvatarId(id), id);
  }
  for (const value of ['unknown', 'MAPLE', '', null, 0, {}, 'data:image/png;base64,AAA']) {
    assert.equal(Profile.sanitizeAvatarId(value), 'maple');
  }
  assert.deepEqual(Profile.AVATAR_IDS, [
    'maple', 'bamboo', 'plum', 'pine', 'crane', 'moon', 'mountain', 'stream',
  ]);
});

test('丢弃 avatarDataUrl 与所有未知字段，只输出白名单三键', () => {
  const result = Profile.sanitizeProfile({
    playerId: 'gm_abcdef123456',
    nickname: '竹影',
    avatarId: 'bamboo',
    avatarDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(40000),
    isAdmin: true,
    __proto__: { polluted: true },
    extra: { nested: 'x' },
  });
  assert.deepEqual(Object.keys(result).sort(), ['avatarId', 'nickname', 'playerId']);
  assert.equal(result.avatarId, 'bamboo');
  assert.equal(JSON.stringify(result).includes('avatarDataUrl'), false);
  assert.equal(JSON.stringify(result).includes('polluted'), false);
});

test('非对象输入降级为匿名默认档案，且不抛错', () => {
  const expected = { playerId: null, nickname: '棋客', avatarId: 'maple' };
  for (const value of [null, undefined, 'gm_abcdef', 42, true, [], ['gm_abcdef']]) {
    assert.deepEqual(Profile.sanitizeProfile(value), expected, String(value));
  }
});

test('代理对截断不产生孤立代理（emoji 昵称）', () => {
  const emoji = '\u{1F343}'; // 枫叶，占 2 个 UTF-16 单元
  const result = Profile.sanitizeNickname(emoji.repeat(13)); // 26 单元
  assert.equal(result.length, 24);
  assert.equal(result, emoji.repeat(12));
  assert.doesNotThrow(() => encodeURIComponent(result));
});

test('超长昵称与非法头部组合后仍安全（综合场景）', () => {
  const result = Profile.sanitizeProfile({
    playerId: 'BAD-ID',
    nickname: '\u0000' + '枫'.repeat(40),
    avatarId: 'custom-upload',
  });
  assert.equal(result.playerId, null);
  assert.equal(result.nickname.length, 24);
  assert.equal(result.avatarId, 'maple');
});

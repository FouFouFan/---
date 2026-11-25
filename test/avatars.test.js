// T1-7 预设头像资源测试（PROF-05）
const test = require('node:test');
const assert = require('node:assert/strict');
const Avatars = require('../client/assets/avatars.js');

test('提供 8 款预设头像，ID 与 ProfileStore 白名单一致', () => {
  const ProfileStore = require('../client/profile-store.js');
  assert.equal(Avatars.IDS.length, 8);
  assert.deepEqual([...Avatars.IDS].sort(), [...ProfileStore.AVATAR_IDS].sort());
});

test('每款头像均为内联 SVG，无 http(s) 外链、无 base64 二进制', () => {
  for (const id of Avatars.IDS) {
    const svg = Avatars.svg(id, 40);
    assert.ok(svg.startsWith('<svg'), `${id} 应为 svg`);
    assert.ok(svg.endsWith('</svg>'), `${id} 应闭合`);
    assert.ok(!/https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg', '')),
      `${id} 不应含外链`);
    assert.ok(!/base64/.test(svg), `${id} 不应含 base64`);
    assert.ok(!/<img|<image/.test(svg), `${id} 不应引用外部图片`);
  }
});

test('40px / 96px 两档尺寸正确输出，viewBox 固定 64 保证缩放清晰', () => {
  for (const size of [40, 96]) {
    const svg = Avatars.svg('maple', size);
    assert.ok(svg.includes(`width="${size}"`), `width 应为 ${size}`);
    assert.ok(svg.includes(`height="${size}"`), `height 应为 ${size}`);
    assert.ok(svg.includes('viewBox="0 0 64 64"'));
  }
});

test('非法 id 回退 maple，非法尺寸回退 64', () => {
  assert.equal(Avatars.svg('not-exist', 40), Avatars.svg('maple', 40));
  assert.ok(Avatars.svg('maple').includes('width="64"'));
  assert.ok(Avatars.svg('maple', -5).includes('width="64"'));
  assert.ok(Avatars.svg('maple', 'big').includes('width="64"'));
});

test('name() 返回中文名，未知 id 回退「枫」', () => {
  assert.equal(Avatars.name('bamboo'), '竹');
  assert.equal(Avatars.name('not-exist'), '枫');
  assert.ok(Avatars.svg('stream', 40).includes('aria-label="水"'));
});

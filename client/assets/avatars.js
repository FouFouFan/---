// 8 款预设头像资源（PROF-05 / T1-7）
// 内联 SVG：无外链、无二进制；viewBox 统一 64，矢量渲染，40px/96px 均清晰。
// 双环境：Node require（测试）+ 浏览器 window.Gomoku.Avatars。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.Avatars = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAMES = {
    maple: '枫', bamboo: '竹', plum: '梅', pine: '松',
    crane: '鹤', moon: '月', mountain: '山', stream: '水',
  };

  // 圆形底色 + 图形，图形与底色对比度足够，圆描边保证深/浅背景上都可辨识
  var DEFS = {
    maple: {
      bg: '#b03a2c',
      art: '<path d="M32 9l4 12 10-4-4 10 12 3-11 6 6 10-12-3 2 12-7-8-7 8 2-12-12 3 6-10-11-6 12-3-4-10 10 4z" fill="#f9e2ae"/>' +
        '<path d="M32 45v9" stroke="#f9e2ae" stroke-width="3" stroke-linecap="round"/>',
    },
    bamboo: {
      bg: '#2f6b4f',
      art: '<rect x="23" y="12" width="7" height="40" rx="3" fill="#cfe6b8"/>' +
        '<rect x="36" y="18" width="7" height="34" rx="3" fill="#cfe6b8"/>' +
        '<path d="M23 24h7M23 36h7M36 30h7M36 42h7" stroke="#2f6b4f" stroke-width="2"/>' +
        '<path d="M40 14c6-5 11-3 13 0-4 4-9 5-13 0z" fill="#cfe6b8"/>',
    },
    plum: {
      bg: '#f6e3dc',
      art: '<g fill="#c2526f">' +
        '<circle cx="32" cy="19" r="7"/><circle cx="44" cy="28" r="7"/>' +
        '<circle cx="40" cy="42" r="7"/><circle cx="24" cy="42" r="7"/>' +
        '<circle cx="20" cy="28" r="7"/></g>' +
        '<circle cx="32" cy="31" r="4.5" fill="#f3c34d"/>',
    },
    pine: {
      bg: '#274b3a',
      art: '<path d="M32 9l12 16h-8l10 12h-9l9 12H18l9-12h-9l10-12h-8z" fill="#a9c8a0"/>' +
        '<rect x="29" y="46" width="6" height="8" fill="#7a5a34"/>',
    },
    crane: {
      bg: '#e9e2d2',
      art: '<path d="M20 35l-9-7 11 1z" fill="#3f3a33"/>' +
        '<ellipse cx="30" cy="40" rx="12" ry="8" fill="#3f3a33"/>' +
        '<path d="M38 36c2-8-2-12 2-18 2-3 6-3 8 0" fill="none" stroke="#3f3a33" stroke-width="5" stroke-linecap="round"/>' +
        '<circle cx="47" cy="18" r="4" fill="#3f3a33"/>' +
        '<circle cx="46" cy="14" r="1.8" fill="#b03a2c"/>' +
        '<path d="M50 17l8 2-8 2z" fill="#c4572e"/>' +
        '<path d="M25 47l-2 7M33 47l1 7" stroke="#3f3a33" stroke-width="2.5" stroke-linecap="round"/>',
    },
    moon: {
      bg: '#2b3a55',
      art: '<circle cx="33" cy="30" r="14" fill="#f2d98c"/>' +
        '<circle cx="40" cy="25" r="12" fill="#2b3a55"/>' +
        '<path d="M19 17l1.5 3.5L24 22l-3.5 1.5L19 27l-1.5-3.5L14 22l3.5-1.5z" fill="#f2d98c"/>' +
        '<circle cx="20" cy="44" r="1.6" fill="#f2d98c"/>' +
        '<circle cx="46" cy="45" r="1.2" fill="#f2d98c"/>',
    },
    mountain: {
      bg: '#6d7d6a',
      art: '<circle cx="43" cy="19" r="6" fill="#e8b34d"/>' +
        '<path d="M8 48l14-24 10 16 6-10 14 18z" fill="#e8e4d4"/>',
    },
    stream: {
      bg: '#2f5f7a',
      art: '<g fill="none" stroke="#bcdcec" stroke-width="4" stroke-linecap="round">' +
        '<path d="M12 23c6-6 10 6 16 0s10 6 16 0 8 0 8 0"/>' +
        '<path d="M12 35c6-6 10 6 16 0s10 6 16 0 8 0 8 0"/>' +
        '<path d="M16 47c6-6 10 6 16 0s10 6 16 0"/></g>',
    },
  };

  var IDS = Object.keys(DEFS);

  /**
   * 返回指定头像的内联 SVG 字符串。
   * id 非法时回退 maple；size 非法时回退 64。
   */
  function svg(id, size) {
    var def = DEFS[id] || DEFS.maple;
    var s = typeof size === 'number' && size > 0 ? size : 64;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s +
      '" viewBox="0 0 64 64" role="img" aria-label="' + (NAMES[id] || NAMES.maple) + '">' +
      '<circle cx="32" cy="32" r="30" fill="' + def.bg +
      '" stroke="rgba(74,47,20,0.28)" stroke-width="2"/>' +
      def.art + '</svg>';
  }

  /** 头像中文名（用于 title / aria-label） */
  function name(id) {
    return NAMES[id] || NAMES.maple;
  }

  return { IDS: IDS, NAMES: NAMES, svg: svg, name: name };
});

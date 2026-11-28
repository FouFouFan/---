'use strict';

/**
 * 服务端档案校验（T4-1 / PVP-09、spec 7.7）。
 * 档案仅用于展示，不作为鉴权依据；所有字段白名单输出，
 * avatarDataUrl 与任何未知字段都会被丢弃、不转发。
 */

const AVATAR_IDS = [
  'maple', 'bamboo', 'plum', 'pine',
  'crane', 'moon', 'mountain', 'stream',
];

const DEFAULT_NICKNAME = '棋客';
const DEFAULT_AVATAR_ID = 'maple';
const MAX_NICKNAME_UNITS = 24;
const PLAYER_ID_PATTERN = /^gm_[a-z0-9]{6,20}$/;
// C0/C1 控制字符；换行、制表等同样去除
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** 按 UTF-16 单元截断，避免把代理对切成孤立代理 */
function truncateUnits(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastCode = cut.charCodeAt(cut.length - 1);
  const isLoneHighSurrogate = lastCode >= 0xd800 && lastCode <= 0xdbff;
  return isLoneHighSurrogate ? cut.slice(0, -1) : cut;
}

/** 昵称：字符串 → 去控制字符 → 去首尾空白 → 截断 24 单元 → 空则「棋客」 */
function sanitizeNickname(value) {
  if (typeof value !== 'string') return DEFAULT_NICKNAME;
  const cleaned = value.replace(CONTROL_CHARS, '').trim();
  if (!cleaned) return DEFAULT_NICKNAME;
  return truncateUnits(cleaned, MAX_NICKNAME_UNITS);
}

/** playerId 不合法视为匿名（null），不生成替代 ID */
function sanitizePlayerId(value) {
  return typeof value === 'string' && PLAYER_ID_PATTERN.test(value) ? value : null;
}

function sanitizeAvatarId(value) {
  return AVATAR_IDS.includes(value) ? value : DEFAULT_AVATAR_ID;
}

/**
 * 校验并裁剪客户端上报的档案。
 * @param {unknown} raw match_request.profile
 * @returns {{playerId: string|null, nickname: string, avatarId: string}}
 */
function sanitizeProfile(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    playerId: sanitizePlayerId(source.playerId),
    nickname: sanitizeNickname(source.nickname),
    avatarId: sanitizeAvatarId(source.avatarId),
  };
}

module.exports = {
  AVATAR_IDS,
  DEFAULT_NICKNAME,
  DEFAULT_AVATAR_ID,
  MAX_NICKNAME_UNITS,
  PLAYER_ID_PATTERN,
  sanitizeNickname,
  sanitizePlayerId,
  sanitizeAvatarId,
  sanitizeProfile,
};

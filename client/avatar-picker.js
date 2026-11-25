// 头像选择器（PROF-05 预设 + PROF-06 自定义上传，T1-8）
// 自定义头像：本地选图 → 居中裁剪 128×128 → JPEG 0.8 → dataURL ≤32KB；仅本地展示。
// 依赖：window.Gomoku.Avatars / window.Gomoku.ProfileView.showToast
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.AvatarPicker = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_FILE_BYTES = 2 * 1024 * 1024;   // 原图 ≤2MB
  var MAX_DATAURL_LEN = 32 * 1024;        // dataURL ≤32KB
  var OUTPUT_SIZE = 128;                  // 输出 128×128
  var JPEG_QUALITY = 0.8;
  var DATAURL_PREFIX = 'data:image/jpeg;base64,';

  function toast(msg) {
    if (typeof window !== 'undefined' && window.Gomoku && window.Gomoku.ProfileView) {
      window.Gomoku.ProfileView.showToast(msg);
    }
  }

  /** 预览 HTML：自定义头像优先，否则预设 SVG */
  function previewHtml(state) {
    if (state.avatarDataUrl) {
      return '<img class="pf-avatar-img" src="' + state.avatarDataUrl + '" alt="头像预览">';
    }
    return window.Gomoku.Avatars.svg(state.avatarId, 64);
  }

  /** 选择器 HTML：预览 + 8 款预设网格 + 上传入口 */
  function html() {
    var Avatars = window.Gomoku.Avatars;
    var options = Avatars.IDS.map(function (id) {
      return '<button type="button" class="pf-avatar-option" data-avatar="' + id +
        '" title="' + Avatars.name(id) + '" aria-label="' + Avatars.name(id) +
        '" aria-pressed="false">' + Avatars.svg(id, 40) + '</button>';
    }).join('');

    return '<div class="pf-avatar-preview" id="pf-avatar-preview"></div>' +
      '<div class="pf-avatar-grid" id="pf-avatar-grid">' + options + '</div>' +
      '<div class="pf-avatar-upload-row">' +
        '<button type="button" class="pf-upload-btn" id="pf-upload-btn">上传自定义头像</button>' +
        '<span class="pf-upload-hint">仅本地显示 · 裁剪 128×128 · ≤2MB</span>' +
      '</div>' +
      '<input type="file" id="pf-avatar-file" accept="image/*" hidden>';
  }

  /** 居中裁剪为正方形并缩放到 128×128，导出 JPEG dataURL */
  function cropToDataUrl(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error('empty image');
    var side = Math.min(w, h);
    var canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    canvas.getContext('2d').drawImage(
      img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE
    );
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  }

  /** 读取文件 → Image → 裁剪；任何失败都 reject */
  function readAndCrop(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          try { resolve(cropToDataUrl(img)); } catch (e) { reject(e); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * 绑定选择器事件。
   * state：编辑草稿对象，就地修改 avatarId / avatarDataUrl。
   * onChange：每次变更后回调（用于刷新保存按钮禁用态）。
   */
  function bind(rootEl, state, onChange) {
    var grid = rootEl.querySelector('#pf-avatar-grid');
    var preview = rootEl.querySelector('#pf-avatar-preview');
    var uploadBtn = rootEl.querySelector('#pf-upload-btn');
    var fileInput = rootEl.querySelector('#pf-avatar-file');
    if (!grid || !preview || !uploadBtn || !fileInput) return;

    function refresh() {
      preview.innerHTML = previewHtml(state);
      var opts = grid.querySelectorAll('.pf-avatar-option');
      for (var i = 0; i < opts.length; i++) {
        // 自定义头像生效时不高亮任何预设
        var on = !state.avatarDataUrl && opts[i].getAttribute('data-avatar') === state.avatarId;
        opts[i].classList.toggle('is-selected', on);
        opts[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      if (typeof onChange === 'function') onChange();
    }

    grid.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.pf-avatar-option') : null;
      if (!btn) return;
      state.avatarId = btn.getAttribute('data-avatar');
      state.avatarDataUrl = null; // 选预设即清除自定义头像
      refresh();
    });

    uploadBtn.addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      fileInput.value = ''; // 允许重复选同一文件
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
        toast('图片过大，请选择 2MB 以内的图片');
        return;
      }
      uploadBtn.disabled = true;
      readAndCrop(file).then(function (dataUrl) {
        uploadBtn.disabled = false;
        if (dataUrl.indexOf(DATAURL_PREFIX) !== 0 || dataUrl.length > MAX_DATAURL_LEN) {
          toast('图片细节过多，请换一张更简单的图片');
          return;
        }
        state.avatarDataUrl = dataUrl;
        refresh();
        toast('头像已裁剪，点击保存生效');
      }).catch(function () {
        uploadBtn.disabled = false;
        toast('图片读取失败，请换一张图片');
      });
    });

    refresh();
  }

  return {
    html: html,
    bind: bind,
    previewHtml: previewHtml,
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    MAX_DATAURL_LEN: MAX_DATAURL_LEN,
    OUTPUT_SIZE: OUTPUT_SIZE,
  };
});

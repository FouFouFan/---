// 棋盘视图（T2-7）：负责棋盘/棋子绘制、悬停预览、落子动画与点击上报。
// 不持有棋局规则与状态，由 app.js 通过 setBoard / setInteractive / onMove 驱动。
// 双环境：Node require + 浏览器 window.Gomoku.BoardView。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.BoardView = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LOGICAL_SIZE = 600; // 画布逻辑尺寸，CSS 负责缩放显示
  var PADDING = 20; // 棋盘最外线到画布边缘的留白
  var DEFAULT_DROP_DURATION = 300; // 落子动画时长（毫秒）
  var BOARD_TOP_COLOR = '#e7c88e';
  var BOARD_MID_COLOR = '#dbb675';
  var BOARD_BOTTOM_COLOR = '#cda463';
  var LINE_COLOR = 'rgba(88, 58, 28, 0.62)';
  var STAR_RADIUS = 3;
  var LAST_MOVE_RING_COLOR = '#c0392b';
  var STAR_POINTS = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];

  /** 缓动：二次减速 */
  function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  /** 缓动：带回弹的减速（用于弹性缩放） */
  function easeOutBack(t) {
    var c1 = 1.70158;
    var c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  /** 创建棋盘视图；options 支持 size 与 dropDuration */
  function create(canvas, options) {
    var opts = options || {};
    var size = opts.size || 15;
    var cell = (LOGICAL_SIZE - PADDING * 2) / (size - 1);
    var stoneRadius = cell * 0.44;
    var ctx = canvas.getContext('2d');
    var hoverMedia =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(hover: hover) and (pointer: fine)')
        : { matches: false };

    var boardRef = null; // 由 app.js 注入的二维数组（null/black/white）
    var interactive = false; // 是否允许点击上报
    var hoverEnabled = false; // 是否允许悬停预览
    var hoverColor = null; // 预览棋子颜色（己方颜色）
    var lastMove = null; // 最近一手 {row, col}
    var hoverCell = null; // 当前悬停交叉点
    var animating = []; // 正在下落的棋子 [{row, col, color, startTime}]
    var animFrameId = null;
    var dropDuration =
      typeof opts.dropDuration === 'number' ? opts.dropDuration : DEFAULT_DROP_DURATION;
    var moveHandler = null;
    var hoverScheduled = false;
    var pendingHoverEvent = null;

    var gridX = function (col) {
      return PADDING + col * cell;
    };
    var gridY = function (row) {
      return PADDING + row * cell;
    };

    /** 按设备像素比初始化画布，保证高分屏下网格清晰 */
    function setupCanvas() {
      var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      canvas.width = Math.round(LOGICAL_SIZE * dpr);
      canvas.height = Math.round(LOGICAL_SIZE * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0.5, 0.5);
    }

    /** 叠加木面纹理：细密竖向木纹 + 少量深色长纹，模拟实木格面 */
    function drawWoodGrain() {
      ctx.save();
      for (var i = 0; i < 48; i++) {
        var x = ((i + 0.5) / 48) * LOGICAL_SIZE + Math.sin(i * 1.7) * 3;
        ctx.strokeStyle = 'rgba(140, 96, 48, ' + (0.028 + (i % 4) * 0.011) + ')';
        ctx.lineWidth = i % 6 === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 5, 200, x - 5, 400, x + Math.sin(i) * 4, LOGICAL_SIZE);
        ctx.stroke();
      }
      ctx.restore();
    }

    /** 绘制木面底色、木纹、柔和光影、15x15 细网格与星位 */
    function drawBoard() {
      ctx.clearRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      var bg = ctx.createLinearGradient(0, 0, 0, LOGICAL_SIZE);
      bg.addColorStop(0, BOARD_TOP_COLOR);
      bg.addColorStop(0.55, BOARD_MID_COLOR);
      bg.addColorStop(1, BOARD_BOTTOM_COLOR);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      drawWoodGrain();

      // 中心柔光，模拟灯下光泽
      var glow = ctx.createRadialGradient(300, 250, 40, 300, 300, 430);
      glow.addColorStop(0, 'rgba(255, 240, 200, 0.22)');
      glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      // 四周轻微暗角，突出木面层次
      var vignette = ctx.createRadialGradient(300, 300, 230, 300, 300, 440);
      vignette.addColorStop(0, 'rgba(116, 76, 36, 0)');
      vignette.addColorStop(1, 'rgba(116, 76, 36, 0.2)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE);

      ctx.strokeStyle = LINE_COLOR;
      ctx.lineWidth = 1;

      for (var i = 0; i < size; i++) {
        ctx.beginPath();
        ctx.moveTo(gridX(0), gridY(i));
        ctx.lineTo(gridX(size - 1), gridY(i));
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(gridX(i), gridY(0));
        ctx.lineTo(gridX(i), gridY(size - 1));
        ctx.stroke();
      }

      // 网格外侧一道浅描边，与木框自然衔接
      var span = gridX(size - 1) - gridX(0);
      ctx.strokeStyle = 'rgba(92, 62, 32, 0.3)';
      ctx.strokeRect(gridX(0) - 8, gridY(0) - 8, span + 16, span + 16);

      // 星位：深棕小圆点
      ctx.fillStyle = 'rgba(74, 48, 22, 0.85)';
      for (var k = 0; k < STAR_POINTS.length; k++) {
        var point = STAR_POINTS[k];
        ctx.beginPath();
        ctx.arc(gridX(point[1]), gridY(point[0]), STAR_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /** 在交叉点绘制棋子，支持缩放与垂直位移（用于落子动画） */
    function drawStoneAt(row, col, color, scale, yOffset) {
      var cx = gridX(col);
      var cy = gridY(row) - yOffset;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      var gradient = ctx.createRadialGradient(
        cx - stoneRadius / 3,
        cy - stoneRadius / 3,
        stoneRadius / 6,
        cx,
        cy,
        stoneRadius
      );
      if (color === 'black') {
        gradient.addColorStop(0, '#57504a');
        gradient.addColorStop(0.45, '#26221f');
        gradient.addColorStop(1, '#080706');
      } else {
        gradient.addColorStop(0, '#fffdf6');
        gradient.addColorStop(0.5, '#f4ead6');
        gradient.addColorStop(1, '#d6c7ac');
      }

      ctx.fillStyle = gradient;
      ctx.shadowColor = 'rgba(70, 40, 15, 0.3)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;

      ctx.beginPath();
      ctx.arc(cx, cy, stoneRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = 'rgba(0, 0, 0, 0)';
      ctx.strokeStyle = color === 'black' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(120, 96, 60, 0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    /** 在交叉点绘制一枚标准棋子（缩放 1、无位移） */
    function drawStone(row, col, color) {
      drawStoneAt(row, col, color, 1, 0);
    }

    /** 绘制落子动画中的棋子：从上方落下并弹性缩放 */
    function drawAnimatedStone(stone, now) {
      var t = Math.min(1, (now - stone.startTime) / dropDuration);
      var yOffset = (1 - easeOutQuad(t)) * 80;
      var scale = 1 + 0.2 * (1 - easeOutBack(t));
      drawStoneAt(stone.row, stone.col, stone.color, scale, yOffset);
    }

    /** 动画主循环：还有动画中的棋子时持续重绘 */
    function renderTick() {
      animFrameId = null;
      var now = performance.now();
      animating = animating.filter(function (stone) {
        return now - stone.startTime < dropDuration;
      });
      render();
      if (animating.length > 0) scheduleRender();
    }

    function scheduleRender() {
      if (animFrameId) return;
      animFrameId = requestAnimationFrame(renderTick);
    }

    /** 停止动画帧并清空待播放列表 */
    function stopAnimation() {
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      animating = [];
    }

    /** 绘制注意：仅负责画面，不读取棋局规则 */
    function render() {
      drawBoard();
      var now = performance.now();
      var animatingSet = {};
      animating.forEach(function (stone) {
        animatingSet[stone.row + ',' + stone.col] = true;
      });

      if (boardRef) {
        for (var row = 0; row < size; row++) {
          for (var col = 0; col < size; col++) {
            var color = boardRef[row][col];
            if (color && !animatingSet[row + ',' + col]) drawStone(row, col, color);
          }
        }
      }

      animating.forEach(function (stone) {
        drawAnimatedStone(stone, now);
      });

      // 最近一手：红色标记圈（落子动画播放完毕后再出现）
      if (lastMove && !animatingSet[lastMove.row + ',' + lastMove.col]) {
        ctx.save();
        ctx.strokeStyle = LAST_MOVE_RING_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gridX(lastMove.col), gridY(lastMove.row), stoneRadius + 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 悬停预览：仅启用且落在空位时显示半透明棋子
      if (
        hoverEnabled && hoverMedia.matches && hoverCell && hoverColor && boardRef &&
        boardRef[hoverCell.row][hoverCell.col] === null
      ) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        drawStone(hoverCell.row, hoverCell.col, hoverColor);
        ctx.restore();
      }
    }

    /** 清空悬停预览（不重绘） */
    function clearHover() {
      if (!hoverCell) return;
      hoverCell = null;
      render();
    }

    /** 把指针事件换算成最近的交叉点；画布可能被 CSS 缩放 */
    function pointToCell(event) {
      var rect = canvas.getBoundingClientRect();
      var x = (event.clientX - rect.left) * (LOGICAL_SIZE / rect.width);
      var y = (event.clientY - rect.top) * (LOGICAL_SIZE / rect.height);
      return {
        row: Math.round((y - PADDING) / cell),
        col: Math.round((x - PADDING) / cell),
      };
    }

    function isPlayableCell(row, col) {
      return row >= 0 && row < size && col >= 0 && col < size &&
        boardRef !== null && boardRef[row][col] === null;
    }

    /** 点击：仅交互开启且落在空位时回调 onMove */
    function handleClick(event) {
      if (!interactive) return;
      var cellPoint = pointToCell(event);
      if (!isPlayableCell(cellPoint.row, cellPoint.col)) return;
      hoverCell = null;
      if (moveHandler) moveHandler(cellPoint);
    }

    /** 根据指针位置更新悬停预览，并按需重绘 */
    function updateHover(event) {
      if (!hoverEnabled || !hoverMedia.matches) {
        clearHover();
        return;
      }

      var cellPoint = pointToCell(event);
      if (!isPlayableCell(cellPoint.row, cellPoint.col)) {
        clearHover();
        return;
      }

      if (!hoverCell || hoverCell.row !== cellPoint.row || hoverCell.col !== cellPoint.col) {
        hoverCell = cellPoint;
        render();
      }
    }

    /** pointermove：仅鼠标可预览，并用 requestAnimationFrame 节流 */
    function handlePointerMove(event) {
      if (event.pointerType !== 'mouse' || !hoverMedia.matches) {
        pendingHoverEvent = null;
        clearHover();
        return;
      }

      pendingHoverEvent = event;
      if (hoverScheduled) return;
      hoverScheduled = true;
      requestAnimationFrame(function () {
        hoverScheduled = false;
        if (pendingHoverEvent) {
          updateHover(pendingHoverEvent);
          pendingHoverEvent = null;
        }
      });
    }

    setupCanvas();
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerleave', clearHover);

    return {
      setBoard: function (nextBoard) {
        boardRef = nextBoard || null;
      },
      reset: function () {
        hoverCell = null;
        lastMove = null;
        stopAnimation();
        render();
      },
      clearMotion: function () {
        hoverCell = null;
        stopAnimation();
        render();
      },
      render: render,
      setInteractive: function (flag) {
        interactive = !!flag;
      },
      setHoverEnabled: function (flag) {
        hoverEnabled = !!flag;
        if (!hoverEnabled) clearHover();
      },
      setHoverColor: function (color) {
        hoverColor = color || null;
      },
      setLastMove: function (cellPoint) {
        lastMove = cellPoint || null;
      },
      setDropDuration: function (ms) {
        dropDuration = typeof ms === 'number' && ms > 0 ? ms : 0;
        if (dropDuration === 0) stopAnimation();
      },
      animateMove: function (row, col, color) {
        if (dropDuration > 0) {
          animating.push({ row: row, col: col, color: color, startTime: performance.now() });
          scheduleRender();
        } else render();
      },
      onMove: function (handler) {
        moveHandler = typeof handler === 'function' ? handler : null;
      },
    };
  }

  return { create: create, LOGICAL_SIZE: LOGICAL_SIZE };
});

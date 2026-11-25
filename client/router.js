// Hash 路由（NAV-02）：#/home|profile|ai|match|game
// - 未知/未注册路由回首页；空 hash 启动时定位 #/home
// - 视图卸载时调用 unmount() 并自动清理经 ctx 注册的定时器与清理回调
// - mount 返回 false 表示拒绝进入（如 #/game 无可恢复对局），重定向首页
// 双环境：Node require（注入 mock window 测试）+ 浏览器 window.Gomoku.Router。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.Router = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_ROUTE = 'home';

  /** 解析 hash 为路由名：'#/profile?x=1' → 'profile'；空/无效返回 null */
  function parseHash(hash) {
    if (typeof hash !== 'string') return null;
    var h = hash.replace(/^#/, '');
    if (h.charAt(0) === '/') h = h.slice(1);
    var q = h.indexOf('?');
    if (q !== -1) h = h.slice(0, q);
    h = h.replace(/\/+$/, '');
    return h || null;
  }

  /**
   * 创建路由实例。win 为 window 或 mock（需 location/addEventListener/定时器）。
   */
  function create(win) {
    var routes = {};
    var current = null;
    var currentView = null;
    var timers = [];
    var cleanups = [];
    var started = false;

    function clearViewResources() {
      for (var i = 0; i < timers.length; i++) {
        if (timers[i].type === 'interval') win.clearInterval(timers[i].id);
        else win.clearTimeout(timers[i].id);
      }
      timers = [];
      for (var j = 0; j < cleanups.length; j++) {
        try { cleanups[j](); } catch (e) { /* 清理异常不阻断切换 */ }
      }
      cleanups = [];
    }

    function register(name, view) {
      routes[name] = view || {};
    }

    function navigate(name) {
      win.location.hash = '#/' + name;
    }

    function resolve() {
      var name = parseHash(win.location.hash);
      if (!name || !routes[name]) {
        if (name) navigate(DEFAULT_ROUTE); // 修正地址栏
        name = DEFAULT_ROUTE;
      }
      if (!routes[name] || current === name) return;

      if (currentView && typeof currentView.unmount === 'function') {
        try { currentView.unmount(); } catch (e) { /* 卸载异常不阻断 */ }
      }
      clearViewResources();

      current = name;
      currentView = routes[name];
      var ctx = {
        name: name,
        navigate: navigate,
        setTimeout: function (fn, ms) {
          var id = win.setTimeout(fn, ms);
          timers.push({ type: 'timeout', id: id });
          return id;
        },
        setInterval: function (fn, ms) {
          var id = win.setInterval(fn, ms);
          timers.push({ type: 'interval', id: id });
          return id;
        },
        onCleanup: function (fn) {
          if (typeof fn === 'function') cleanups.push(fn);
        },
      };
      if (currentView && typeof currentView.mount === 'function') {
        var ret = currentView.mount(ctx);
        if (ret === false) {
          current = null;
          currentView = null;
          if (name !== DEFAULT_ROUTE) { // 防止首页自身拒绝时无限递归
            navigate(DEFAULT_ROUTE);
            resolve();
          }
        }
      }
    }

    function start() {
      if (started) return;
      started = true;
      if (!win.location.hash) win.location.hash = '#/' + DEFAULT_ROUTE;
      win.addEventListener('hashchange', resolve);
      resolve();
    }

    return {
      register: register,
      start: start,
      navigate: navigate,
      resolve: resolve,
      currentName: function () { return current; },
    };
  }

  return { create: create, parseHash: parseHash, DEFAULT_ROUTE: DEFAULT_ROUTE };
});

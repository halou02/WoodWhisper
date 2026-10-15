/* ============================================================
 * js/avatar-2d.js - WoodWhisper 单图伪 Live2D 数字人（WoodWhisperLive2D 门面）
 * ------------------------------------------------------------
 * 背景：真·Live2D 模型（花小刻分层 PSD + Cubism 绑定）尚未制作。本模块用现有
 *   花小刻正视图单张 PNG 实现「伪 Live2D」：
 *     呼吸微缩放 / 思考后缩低垂 / 说话弹跳轻晃 / 鼠标指针 3D 跟随，
 *   让舞台上先站着花小刻本人；真模型就绪后把 WOODWHISPER_AVATAR_MODE 切回
 *   'live2d' 即可，本模块自动退场，页面接线（setBusy 等）零改动。
 *
 * 与 js/live2d-stage.js 的关系：
 *   二者暴露同名全局 window.WoodWhisperLive2D（同一套 API 门面）。
 *   ai.html 中本脚本在 live2d-stage.js 之前引入：
 *     - 模式 '2d'（当前默认）：本脚本立即注册门面 → live2d-stage.js 检测到
 *       同名全局直接 return（其 IIFE 自带防重复），互不冲突；
 *     - 模式 'live2d'：本脚本不注册、不初始化，live2d-stage.js 正常接管。
 *
 * 单图伪 Live2D 的能力边界（诚实说明）：
 *   能做：整体呼吸/姿态/跟随、说话时身体弹跳节奏；
 *   不能做：真眨眼、真口型（单张平面图层无法局部分离）。
 *
 * 降级：
 *   - prefers-reduced-motion: reduce → 不初始化（CSS 同步隐藏舞台、露出静态圆头像）；
 *   - 图片加载失败 → 不加 .is-live2d，保留圆头像，不白屏、不抛异常；
 *   - 动画用 requestAnimationFrame，页面切后台时浏览器自动暂停（零耗电）。
 *
 * 对外 API（与 live2d-stage.js 对齐）：
 *   init() / setBusy(on) / setState(s) / setMouth(v) / attachAudioSource(el)
 *   isActive() / getMouth() / getHead() / destroy()
 * ============================================================ */
(function (win, doc) {
  'use strict';

  // 模式由页面全局开关决定；缺省 '2d'（当前花小刻只有单图）。
  // 真模型就绪后：在引入本脚本之前设置 window.WOODWHISPER_AVATAR_MODE = 'live2d'。
  var MODE = (win.WOODWHISPER_AVATAR_MODE === 'live2d') ? 'live2d' : '2d';
  if (MODE !== '2d') { return; }                 // 真模型模式：整个模块退场
  if (win.WoodWhisperLive2D) { return; }         // 门面已被占用（防重复引入）
  if (!win || !doc || typeof doc.createElement !== 'function') { return; }

  /* ------------------------------------------------------------
   * 常量（想调"活泼程度"改这里即可）
   * ---------------------------------------------------------- */
  var IMAGE_SRC = (typeof win.WOODWHISPER_AVATAR_2D_IMAGE === 'string' && win.WOODWHISPER_AVATAR_2D_IMAGE)
    || 'assets/images/ai/数字IP正视图.png';

  var CONTAINER_ID = 'live2dStage';
  var STAGE_CLASS = '.ai-stage';
  var ACTIVE_CLASS = 'is-live2d';

  var PRESENT_MS = 1800;        // "说话"状态总时长，与真 Live2D 版一致
  var POINTER_LERP = 0.08;      // 跟随指数趋近系数（每 1/60s 帧）
  var POINTER_YAW = 6;          // 左右 → rotateY 最大角度（单图易穿帮，宁小）
  var POINTER_PITCH = 4;        // 上下 → rotateX 最大角度
  var POINTER_SHIFT = 3;        // 左右跟随的水平位移（px）

  // 取景（原图为白底正方形，花小刻在图中约 x:0.28~0.74 / y:0.04~0.97）：
  var IMG_SCALE_H = 1.42;       // 图片显示尺寸 = 舞台高 × 此值（>1 放大取头肩，脚被 overflow 裁掉）
  var HEAD_TOP = 0.05;          // 原图人物冠顶位置 → 对齐到舞台顶下方 HEAD_GAP
  var HEAD_GAP = 10;            // 冠顶距舞台顶 px（说话放大时也不被裁）
  var BODY_CX = 0.5;            // 人物水平中心在原图中的比例
  var ORIGIN_Y = '78%';         // 变换原点（脚附近，摆动/呼吸更自然）

  /* ------------------------------------------------------------
   * 内部状态
   * ---------------------------------------------------------- */
  var stageEl = null;
  var imgEl = null;
  var rafId = 0;
  var active = false;
  var initPromise = null;
  var resizeObserver = null;
  var pointerMoveHandler = null;
  var pointerLeaveHandler = null;

  var state = 'idle';           // 'idle' | 'thinking' | 'presenting'
  var presentingStart = 0;
  var mouthActivity = 0;        // 当前"说话活跃度"0~1（= 真模型版的口型值，驱动弹跳幅度）
  var mouthOverride = false;
  var userMouth = 0;
  var lastHead = { x: 0, y: 0, z: 0 };

  var pointerTargetX = 0, pointerTargetY = 0;
  var pointerSmoothX = 0, pointerSmoothY = 0;

  var pendingBusy = null;       // init 完成前到达的 setBusy，完成后补应用

  /* ------------------------------------------------------------
   * 小工具
   * ---------------------------------------------------------- */
  function warn(msg) {
    try { console.warn('[Avatar2D] ' + msg); } catch (e) { /* 忽略 */ }
  }
  function nowMs() {
    try {
      if (win.performance && typeof win.performance.now === 'function') { return win.performance.now(); }
    } catch (e) { /* 忽略 */ }
    return Date.now();
  }
  function clamp01(v) {
    var n = Number(v);
    if (isNaN(n)) { return 0; }
    return n < 0 ? 0 : (n > 1 ? 1 : n);
  }
  function prefersReducedMotion() {
    try { return !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  function markActive(on) {
    try {
      var stage = doc.querySelector(STAGE_CLASS);
      if (stage && stage.classList) { stage.classList.toggle(ACTIVE_CLASS, !!on); }
    } catch (e) { /* 忽略 */ }
  }

  /* ------------------------------------------------------------
   * 取景布局：只改 left/top/width/height；每帧动效只写 transform
   * ---------------------------------------------------------- */
  function layout() {
    if (!imgEl || !stageEl) { return; }
    var w = stageEl.clientWidth || 0;
    var h = stageEl.clientHeight || 0;
    if (w <= 0 || h <= 0) { return; }
    var size = Math.round(h * IMG_SCALE_H);
    imgEl.style.width = size + 'px';
    imgEl.style.height = size + 'px';
    imgEl.style.left = Math.round(w / 2 - size * BODY_CX) + 'px';
    imgEl.style.top = Math.round(HEAD_GAP - size * HEAD_TOP) + 'px';
  }

  /* ------------------------------------------------------------
   * 说话包络（节奏与真模型版一致：淡入 15% / 淡出 25%，音节 5.2Hz）
   * ---------------------------------------------------------- */
  function envelope(p) {
    var a = 0.15, b = 0.25, v;
    if (p < a) { v = p / a; }
    else if (p > 1 - b) { v = (1 - p) / b; }
    else { v = 1; }
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  /* ------------------------------------------------------------
   * 每帧：计算姿态并写 transform
   * ---------------------------------------------------------- */
  function frame(now) {
    rafId = win.requestAnimationFrame(frame);
    if (!imgEl) { return; }
    var t = now / 1000;

    if (state === 'presenting' && (now - presentingStart) >= PRESENT_MS + 200) {
      state = 'idle';
    }

    // 说话活跃度：外部接管 > 程序化音节包络 > 0
    var act;
    if (mouthOverride) {
      act = clamp01(userMouth);
    } else if (state === 'presenting') {
      var p = (now - presentingStart) / PRESENT_MS;
      act = p >= 1 ? 0 : envelope(p) * Math.abs(Math.sin(t * 2 * Math.PI * 5.2));
    } else {
      act = 0;
    }
    mouthActivity = act;

    // 状态姿态
    var breath = Math.sin(t * 2 * Math.PI / 3.8);
    var scale, ty, rz, rx0;
    if (state === 'thinking') {
      // 想事情：身体微缩、略沉、慢速小摆
      scale = 0.985 + 0.005 * Math.sin(t * 2 * Math.PI / 4);
      ty = 2 + 0.6 * Math.sin(t * 2 * Math.PI / 4);
      rz = 1.2 * Math.sin(t * 2 * Math.PI / 5.2);
      rx0 = 2; // 轻微"低头"
    } else if (state === 'presenting') {
      // 说话：随音节上弹、轻晃、微前倾
      var env = state === 'presenting' ? envelope(Math.min(1, (now - presentingStart) / PRESENT_MS)) : 0;
      scale = 1 + 0.018 * act + 0.006 * breath;
      ty = -4 * act - 1.2 * breath;
      rz = 1.1 * env * Math.sin(t * 2 * Math.PI / 1.5) + 0.3 * breath;
      rx0 = -1;
    } else {
      // 待机：呼吸微缩放 + 极缓左右摆
      scale = 1 + 0.012 * breath;
      ty = -1.5 * breath;
      rz = 0.8 * Math.sin(t * 2 * Math.PI / 7);
      rx0 = 0;
    }

    // 指针跟随（帧无关平滑）
    var dt = 1 / 60;
    var k = 1 - Math.pow(1 - POINTER_LERP, dt * 60);
    pointerSmoothX += (pointerTargetX - pointerSmoothX) * k;
    pointerSmoothY += (pointerTargetY - pointerSmoothY) * k;
    if (Math.abs(pointerTargetX - pointerSmoothX) < 0.002) { pointerSmoothX = pointerTargetX; }
    if (Math.abs(pointerTargetY - pointerSmoothY) < 0.002) { pointerSmoothY = pointerTargetY; }

    var ry = pointerSmoothX * POINTER_YAW;
    var rx = rx0 - pointerSmoothY * POINTER_PITCH;
    var tx = pointerSmoothX * POINTER_SHIFT;
    lastHead = { x: +rx.toFixed(2), y: +ry.toFixed(2), z: +rz.toFixed(2) };

    imgEl.style.transform =
      'translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0)' +
      ' perspective(480px)' +
      ' rotateY(' + ry.toFixed(2) + 'deg)' +
      ' rotateX(' + rx.toFixed(2) + 'deg)' +
      ' rotateZ(' + rz.toFixed(2) + 'deg)' +
      ' scale(' + scale.toFixed(4) + ')';
  }

  /* ------------------------------------------------------------
   * 指针跟随（触摸让位页面滚动，同真模型版策略）
   * ---------------------------------------------------------- */
  function bindPointer() {
    if (!stageEl) { return; }
    pointerMoveHandler = function (e) {
      if (e.pointerType === 'touch') { return; }
      var r = stageEl.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) { return; }
      var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      var ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      pointerTargetX = nx < -1 ? -1 : (nx > 1 ? 1 : nx);
      pointerTargetY = ny < -1 ? -1 : (ny > 1 ? 1 : ny);
    };
    pointerLeaveHandler = function () { pointerTargetX = 0; pointerTargetY = 0; };
    stageEl.addEventListener('pointermove', pointerMoveHandler);
    stageEl.addEventListener('pointerleave', pointerLeaveHandler);
  }

  function bindResize() {
    try {
      if (typeof win.ResizeObserver === 'function') {
        resizeObserver = new win.ResizeObserver(function () { layout(); });
        resizeObserver.observe(stageEl);
        return;
      }
    } catch (e) { /* 退回 resize 事件 */ }
    win.addEventListener('resize', layout);
  }

  /* ------------------------------------------------------------
   * 初始化（幂等）
   * ---------------------------------------------------------- */
  function doInit() {
    return new Promise(function (resolve) {
      if (prefersReducedMotion()) {
        warn('系统偏好减少动效，跳过 2D 数字人，使用静态圆头像。');
        resolve(false);
        return;
      }
      var el = doc.getElementById(CONTAINER_ID);
      if (!el) { resolve(false); return; }
      stageEl = el;

      imgEl = doc.createElement('img');
      imgEl.className = 'avatar-2d__img';
      imgEl.alt = '';
      imgEl.setAttribute('aria-hidden', 'true');
      imgEl.style.transformOrigin = '50% ' + ORIGIN_Y;

      imgEl.onload = function () {
        markActive(true);
        layout();
        bindResize();
        bindPointer();
        active = true;
        if (pendingBusy !== null) { setBusy(pendingBusy); pendingBusy = null; }
        rafId = win.requestAnimationFrame(frame);
        resolve(true);
      };
      imgEl.onerror = function () {
        warn('花小刻图片加载失败，保留静态圆头像：' + IMAGE_SRC);
        if (imgEl && imgEl.parentNode) { imgEl.parentNode.removeChild(imgEl); }
        imgEl = null;
        stageEl = null;
        resolve(false);
      };
      imgEl.src = IMAGE_SRC;
      stageEl.appendChild(imgEl);
    });
  }

  function init() {
    if (active) { return Promise.resolve(true); }
    if (initPromise) { return initPromise; }
    initPromise = doInit();
    return initPromise;
  }

  /* ------------------------------------------------------------
   * 状态机（API 与 live2d-stage.js 完全对齐）
   * ---------------------------------------------------------- */
  function setBusy(on) {
    on = !!on;
    if (!active) { pendingBusy = on; return on; } // init 前暂存
    mouthOverride = false;
    if (on) { state = 'thinking'; }
    else { state = 'presenting'; presentingStart = nowMs(); }
    return on;
  }
  function setState(next) {
    if (next !== 'idle' && next !== 'thinking' && next !== 'presenting') { return false; }
    state = next;
    mouthOverride = false;
    if (next === 'presenting') { presentingStart = nowMs(); }
    return true;
  }
  function setMouth(v) {
    var n = Number(v);
    if (isNaN(n)) { return false; }
    mouthOverride = true;
    userMouth = clamp01(n);
    return true;
  }
  // 2D 版不做音频分析（单图无口型）；保留 API 形状，接入时明确告知
  function attachAudioSource() {
    warn('2D 单图模式不支持音频驱动；真 Live2D 模型就绪后由 live2d-stage.js 提供。');
    return false;
  }

  function destroy() {
    active = false;
    state = 'idle';
    mouthActivity = 0;
    mouthOverride = false;
    if (rafId) { try { win.cancelAnimationFrame(rafId); } catch (e) { /* 忽略 */ } rafId = 0; }
    if (resizeObserver) { try { resizeObserver.disconnect(); } catch (e) { /* 忽略 */ } resizeObserver = null; }
    if (stageEl && pointerMoveHandler) { stageEl.removeEventListener('pointermove', pointerMoveHandler); pointerMoveHandler = null; }
    if (stageEl && pointerLeaveHandler) { stageEl.removeEventListener('pointerleave', pointerLeaveHandler); pointerLeaveHandler = null; }
    if (imgEl && imgEl.parentNode) { imgEl.parentNode.removeChild(imgEl); }
    imgEl = null;
    stageEl = null;
    initPromise = null;
    pointerTargetX = pointerTargetY = pointerSmoothX = pointerSmoothY = 0;
    lastHead = { x: 0, y: 0, z: 0 };
    markActive(false);
    return true;
  }

  var api = {
    init: init,
    setBusy: setBusy,
    setState: setState,
    setMouth: setMouth,
    attachAudioSource: attachAudioSource,
    isActive: function () { return active; },
    getState: function () { return state; },          // 'idle' | 'thinking' | 'presenting'
    getMouth: function () { return mouthActivity; },
    getHead: function () { return { x: lastHead.x, y: lastHead.y, z: lastHead.z }; },
    destroy: destroy
  };

  // 立即占位门面：必须在随后加载的 live2d-stage.js 执行前注册，
  // 后者 IIFE 顶部检测到 window.WoodWhisperLive2D 已存在会自动退出。
  win.WoodWhisperLive2D = api;

  // 自动初始化
  function autoInit() { init(); }
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})(window, document);

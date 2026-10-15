/* ============================================================
 * js/live2d-stage.js - WoodWhisper Live2D 数字人舞台运行时（WoodWhisperLive2D）
 * ------------------------------------------------------------
 * 背景：AI 页（ai.html）原本用一张静态圆形 PNG 头像。本模块把它升级为 Live2D
 *   数字人：在 #live2dStage 容器内创建 PIXI 舞台、加载 .model3.json 模型，
 *   并通过逐帧参数（口型 / 头部角度）表现「思考 / 说话 / 待机」。
 *
 * 渲染栈（全部自托管，运行时用相对路径动态注入，禁止任何第三方 CDN 外链）：
 *   1) Live2D 官方 Cubism Core：assets/vendor/live2d/live2dcubismcore.min.js（全局 Live2DCubismCore）
 *   2) pixi.js@6.5.10 UMD      ：assets/vendor/live2d/pixi.min.js（全局 PIXI）
 *   3) pixi-live2d-display@0.4.0 cubism4 构建 UMD：assets/vendor/live2d/cubism4.min.js（挂到 PIXI.live2d）
 *   三个脚本按序注入，任一失败即回退静态头像，绝不白屏、绝不抛未捕获异常。
 *
 * 参数驱动原理（已实测 cubism4.min.js 源码）：
 *   InternalModel.update(dt, now) 的执行顺序是
 *     super.update → motionManager.update(coreModel, now)  ← 写参数
 *     → expression / eyeBlink / focus / breath / physics / pose
 *     → coreModel.update()   ← 把参数真正应用到模型 → loadParameters()
 *   因此自定义参数必须落在 coreModel.update() 之前。做法是包一层
 *   motionManager.update：先调原方法，再写 ParamMouthOpenY / ParamAngleX|Y|Z。
 *   注意必须把原方法的返回值透传回去（内部用它的真假值决定是否跳过 eyeBlink）。
 *
 * 眨眼：Hiyori.model3.json 已声明 Groups「EyeBlink = ParamEyeLOpen/ParamEyeROpen」，
 *   库内的 eyeBlink 会在每帧自动驱动（motionManager 未占用眼睛参数时生效），无需手动。
 *   呼吸：交给模型默认的 Idle 动作（world/呼吸参数）。
 *
 * 降级策略：
 *   - prefers-reduced-motion: reduce → 完全不初始化 Live2D，直接用静态头像；
 *   - 无 WebGL → 不创建任何画布，返回 false 走静态头像；
 *   - 脚本注入 / 模型加载 / 渲染任一步异常 → 不加 .is-live2d，静态头像兜底；
 *   - document.visibilityState === 'hidden' 时停 ticker，可见时恢复；
 *   - app.ticker.maxFPS = 30 限帧省电。
 *
 * 依赖：无（原生浏览器 API + 上述自托管 UMD）。不 import/require、不使用 ES module。
 * 引入方式：<script src="js/live2d-stage.js"></script>（AI 页内联脚本之前）。
 * 自动初始化：DOMContentLoaded（若已就绪则立即执行）时若存在 #live2dStage 则自动 init，
 *   页面无需再写初始化调用。
 *
 * 对外公开方法速览：
 *   WoodWhisperLive2D.init(opts)          → Promise<boolean>；opts { container, modelPath }
 *   WoodWhisperLive2D.setBusy(on)         → 布尔；true=思考/忙碌，false=复位（播一段"说完话"包络）
 *   WoodWhisperLive2D.setState(state)     → 'idle' | 'thinking' | 'presenting'
 *   WoodWhisperLive2D.setMouth(v)         → 直接写口型 0~1（覆盖自动包络，供外部接管）
 *   WoodWhisperLive2D.attachAudioSource(el)→ 接入真实音频分析（口型改由真实音量驱动）
 *   WoodWhisperLive2D.isActive()          → 是否已成功渲染 Live2D
 *   WoodWhisperLive2D.getHead()           → 最近一帧头部角度 {x,y,z}（自测用）
 *   WoodWhisperLive2D.destroy()           → 停 ticker、销毁 PIXI 应用、移除监听
 * ============================================================ */
(function (win, doc) {
  'use strict';

  // 已在页面中实例化则直接返回（防止重复引入）
  if (win && win.WoodWhisperLive2D) { return; }
  // 非浏览器环境（如 node --check 仅做语法检查）安全退出
  if (!win || !doc || typeof doc.createElement !== 'function') { return; }

  /* ------------------------------------------------------------
   * 常量
   * ---------------------------------------------------------- */
  // 默认模型：Hiyori 官方免费示例模型，仅用于管线验证的临时占位。
  // ★ 花小刻模型就绪后，把下面这行改成（并删除注释星号）：
  //   'assets/models/huaxiaoke/huaxiaoke.model3.json'
  var DEFAULT_MODEL_PATH = 'assets/models/demo/Hiyori.model3.json';

  // 自托管渲染栈（相对路径，禁止外链）
  var VENDOR_CORE = 'assets/vendor/live2d/live2dcubismcore.min.js';
  var VENDOR_PIXI = 'assets/vendor/live2d/pixi.min.js';
  var VENDOR_CUBISM4 = 'assets/vendor/live2d/cubism4.min.js';

  // 参数名（Hiyori.model3.json 已声明：LipSync=ParamMouthOpenY，EyeBlink=ParamEyeLOpen/ROpen）
  var PARAM_MOUTH = 'ParamMouthOpenY';
  var PARAM_ANGLE_X = 'ParamAngleX';
  var PARAM_ANGLE_Y = 'ParamAngleY';
  var PARAM_ANGLE_Z = 'ParamAngleZ';

  var TICKER_MAX_FPS = 30;      // 限帧（省电）
  var PRESENT_MS = 1800;        // presenting("说话")包络总时长
  var MOUTH_SMOOTH = 0.25;      // 口型指数平滑系数（每 1/60s 帧）
  var MOUTH_EPS = 0.008;        // 口型归零阈值（≤300ms 内收敛到此值并强制置 0）
  var AUDIO_BIN_FROM = 10;      // 音频分析取用 bin 范围（约 10~100 号）
  var AUDIO_BIN_TO = 100;
  var AUDIO_GAIN = 1.5;         // 音量→口型增益（byte 0~255 归一化后放大再裁剪）

  var POINTER_LERP = 0.08;      // 视线跟随指数趋近系数（每 1/60s 帧；越小越缓）
  var POINTER_YAW = 9;          // 指针左右 → 转头最大角度（ParamAngleY，度）
  var POINTER_PITCH = 5;        // 指针上下 → 俯仰最大角度（ParamAngleX，度）

  var CONTAINER_ID = 'live2dStage';   // 自动初始化时查找的容器 id
  var STAGE_CLASS = '.ai-stage';      // 激活类名挂到该舞台元素上

  /* ------------------------------------------------------------
   * 内部状态
   * ---------------------------------------------------------- */
  var stageEl = null;        // 容器元素
  var canvas = null;         // 我们创建的 <canvas class="live2d-stage__canvas">
  var app = null;            // PIXI.Application
  var model = null;          // PIXI.live2d.Live2DModel
  var active = false;        // 是否已成功渲染 Live2D
  var initPromise = null;    // 进行中的初始化 Promise（幂等）
  var resizeObserver = null; // ResizeObserver 实例
  var visibilityHandler = null;
  var resizeHandler = null;
  var pointerMoveHandler = null;   // 视线跟随：指针移动
  var pointerLeaveHandler = null;  // 视线跟随：指针离开舞台 → 回正

  // 视线跟随状态（归一化 -1~1；target 为指针瞬时位置，smooth 已平滑）
  var pointerTargetX = 0, pointerTargetY = 0;
  var pointerSmoothX = 0, pointerSmoothY = 0;
  var lastAngleX = 0, lastAngleY = 0, lastAngleZ = 0; // 最近一帧实际写入的头部角度（自测用）

  var state = 'idle';        // 'idle' | 'thinking' | 'presenting'
  var busy = false;
  var presentingStart = 0;   // presenting 起始时间戳(ms)
  var mouthCurrent = 0;      // 平滑后的口型 0~1
  var mouthOverride = false; // setMouth 外部接管标记
  var userMouth = 0;         // setMouth 写入的口型值
  var lastParamTime = 0;     // 上一帧参数时间(ms)，用于帧无关的平滑

  // 音频分析（attachAudioSource）
  var audioCtx = null;
  var analyser = null;
  var audioData = null;
  var audioSources = [];     // [{el, node}]，同一元素只创建一次 MediaElementSource

  /* ------------------------------------------------------------
   * 小工具
   * ---------------------------------------------------------- */
  function warn(msg) {
    try { console.warn('[Live2D] ' + msg); } catch (e) { /* 忽略 */ }
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
    try {
      return !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  // WebGL 能力探测：失败则完全不创建画布
  function supportsWebGL() {
    try {
      var c = doc.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  }

  function resolveModelPath(p) {
    if (typeof p === 'string' && p.trim()) { return p.trim(); }
    try {
      if (typeof win.WOODWHISPER_LIVE2D_MODEL === 'string' && win.WOODWHISPER_LIVE2D_MODEL.trim()) {
        return win.WOODWHISPER_LIVE2D_MODEL.trim();
      }
    } catch (e) { /* 忽略 */ }
    return DEFAULT_MODEL_PATH;
  }

  // 给 .ai-stage 加/去 .is-live2d 类名（CSS 据此展示画布、隐藏静态头像）
  function markActive(on) {
    try {
      var stage = doc.querySelector(STAGE_CLASS);
      if (stage && stage.classList) { stage.classList.toggle('is-live2d', !!on); }
    } catch (e) { /* 忽略 */ }
  }

  /* ------------------------------------------------------------
   * 脚本动态注入（已存在则跳过；每个用 onload/onerror 包 Promise）
   * ---------------------------------------------------------- */
  function injectScript(src, checkFn) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof checkFn === 'function' && checkFn()) { resolve(true); return; }
      } catch (e) { /* 探测异常按未加载处理 */ }

      var el = doc.querySelector('script[data-ww-live2d="' + src + '"]');
      if (el) {
        // 已在加载中：直接等它
        el.addEventListener('load', function () { resolve(true); });
        el.addEventListener('error', function () { reject(new Error('脚本加载失败：' + src)); });
        return;
      }

      el = doc.createElement('script');
      el.src = src;
      el.async = false; // 顺序注入，保证依赖就绪
      el.setAttribute('data-ww-live2d', src);
      el.onload = function () { resolve(true); };
      el.onerror = function () { reject(new Error('脚本加载失败：' + src)); };
      (doc.head || doc.documentElement).appendChild(el);
    });
  }

  // 顺序注入三件套：core → pixi → cubism4
  function loadVendors() {
    return injectScript(VENDOR_CORE, function () { return !!win.Live2DCubismCore; })
      .then(function () {
        return injectScript(VENDOR_PIXI, function () { return !!win.PIXI; });
      })
      .then(function () {
        return injectScript(VENDOR_CUBISM4, function () {
          return !!(win.PIXI && win.PIXI.live2d && win.PIXI.live2d.Live2DModel);
        });
      });
  }

  /* ------------------------------------------------------------
   * 逐帧参数注入：包一层 motionManager.update
   *   ——已实测源码：InternalModel.update 先调 motionManager.update 写参数，
   *     随后 coreModel.update() 才把参数应用到模型，因此必须包这一层。
   * ---------------------------------------------------------- */
  function installParamInjector(m) {
    try {
      var im = m && m.internalModel;
      var mm = im && im.motionManager;
      if (!mm || typeof mm.update !== 'function') {
        warn('未找到 motionManager.update，自定义参数可能不生效（模型仍可呼吸/眨眼）。');
        return;
      }
      var orig = mm.update.bind(mm);
      mm.update = function (coreModel, now) {
        var r = orig(coreModel, now);         // 先让动作/表情正常写参数
        try { applyCustomParams(coreModel); } catch (e) { /* 单帧异常不影响整体 */ }
        return r;                             // ★ 必须透传原返回值（内部用它决定是否跳过 eyeBlink）
      };
    } catch (e) {
      warn('参数注入安装失败：' + (e && e.message || e));
    }
  }

  function setParam(coreModel, id, value) {
    try {
      if (coreModel && typeof coreModel.setParameterValueById === 'function') {
        coreModel.setParameterValueById(id, value);
      }
    } catch (e) { /* 参数名不存在时忽略 */ }
  }

  /* ------------------------------------------------------------
   * 口型包络：6.5Hz「音节」振荡 × 淡入淡出 × 轻微随机抖动
   *   （当前页面无任何音频，完全程序化生成）
   * ---------------------------------------------------------- */
  function envelope(p) {
    var a = 0.15, b = 0.25; // 淡入 15% / 淡出 25%
    var v;
    if (p < a) { v = p / a; }
    else if (p > 1 - b) { v = (1 - p) / b; }
    else { v = 1; }
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function presentingMouth(elapsedMs) {
    if (elapsedMs >= PRESENT_MS) { return 0; }
    var t = elapsedMs / 1000;
    var env = envelope(elapsedMs / PRESENT_MS);
    var syll = 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 6.5); // 6.5Hz 音节开合
    var jitter = 1 + (Math.random() - 0.5) * 0.3;           // 轻微随机抖动
    return clamp01(env * syll * jitter);
  }

  // 音频分析是否就绪（接了真实音频源）
  function audioReady() {
    return !!(analyser && audioData);
  }

  function readAudioLevel() {
    if (!audioReady()) { return 0; }
    try {
      analyser.getByteFrequencyData(audioData);
      var sum = 0, n = 0;
      var to = Math.min(AUDIO_BIN_TO, audioData.length - 1);
      for (var i = AUDIO_BIN_FROM; i <= to; i++) { sum += audioData[i]; n++; }
      if (!n) { return 0; }
      return clamp01((sum / n) / 255 * AUDIO_GAIN);
    } catch (e) { return 0; }
  }

  // 口型目标值：外部接管 > 真实音频 > 程序化包络（presenting）> 0
  function mouthTarget(elapsedFromPresent) {
    if (mouthOverride) { return clamp01(userMouth); }
    if (audioReady()) { return readAudioLevel(); }
    if (state === 'presenting') { return presentingMouth(elapsedFromPresent); }
    return 0;
  }

  /* ------------------------------------------------------------
   * 头部角度：idle 极缓正弦游走 / thinking 下沉微动 / presenting 回升点头
   * ---------------------------------------------------------- */
  function headParams(tSec) {
    if (state === 'thinking') {
      // 想事情：头略低 + 轻微左右微动
      return {
        x: Math.sin(tSec * 1.1) * 2.0,
        y: -5 + Math.sin(tSec * 0.7) * 1.2,
        z: 2 + Math.sin(tSec * 0.9) * 0.8
      };
    }
    if (state === 'presenting') {
      // 说话：抬头回升 + 轻微点头
      var el = (nowMs() - presentingStart) / 1000;
      var rise = Math.min(1, el / 0.4);
      var nod = Math.sin(el * 2 * Math.PI * 1.2) * 1.2;
      return {
        x: Math.sin(tSec * 1.4) * 1.5,
        y: rise * (1 + nod),
        z: rise * 0.6
      };
    }
    // idle：头部极缓游走，周期 6~8 秒，幅度 X±3° / Y±2°
    return {
      x: Math.sin(tSec * 2 * Math.PI / 7.0) * 3,
      y: Math.sin(tSec * 2 * Math.PI / 6.5) * 2,
      z: Math.sin(tSec * 2 * Math.PI / 8.0) * 1
    };
  }

  /* ------------------------------------------------------------
   * 每帧写参数（在 coreModel.update 之前调用）
   * ---------------------------------------------------------- */
  function applyCustomParams(coreModel) {
    var now = nowMs();
    var dt = (now - lastParamTime) / 1000;
    if (!(dt > 0) || dt > 0.5) { dt = 1 / 60; } // 首帧或长时间挂起时按 60fps 兜底
    lastParamTime = now;

    // presenting 到点自动回 idle
    if (state === 'presenting' && (now - presentingStart) >= PRESENT_MS + 200) {
      state = 'idle';
    }

    /* ---- 口型 ---- */
    var target;
    if (mouthOverride) {
      target = clamp01(userMouth);
      mouthCurrent = target; // 外部接管时直接写（不再平滑）
    } else {
      target = mouthTarget(now - presentingStart);
      // 指数平滑（帧率无关：60fps 时系数 0.25），保证开口自然、结束 ≤300ms 归零
      var k = 1 - Math.pow(1 - MOUTH_SMOOTH, Math.max(dt, 1 / 120) * 60);
      mouthCurrent += (target - mouthCurrent) * k;
      if (mouthCurrent < MOUTH_EPS && target === 0) { mouthCurrent = 0; }
    }

    /* ---- 头部角度 ---- */
    var head = headParams(now / 1000);

    // 视线跟随：帧无关指数趋近（60fps 时每帧走 POINTER_LERP），避免头部突变
    var pk = 1 - Math.pow(1 - POINTER_LERP, Math.max(dt, 1 / 120) * 60);
    pointerSmoothX += (pointerTargetX - pointerSmoothX) * pk;
    pointerSmoothY += (pointerTargetY - pointerSmoothY) * pk;
    if (Math.abs(pointerTargetX - pointerSmoothX) < 0.002) { pointerSmoothX = pointerTargetX; }
    if (Math.abs(pointerTargetY - pointerSmoothY) < 0.002) { pointerSmoothY = pointerTargetY; }

    // 跟随角叠加在状态动作（思考/说话/待机）之上；
    // 符号沿用 pixi-live2d-display 官方 autoInteract 约定：AngleX=-y、AngleY=+x
    var angleX = head.x - pointerSmoothY * POINTER_PITCH;
    var angleY = head.y + pointerSmoothX * POINTER_YAW;

    setParam(coreModel, PARAM_ANGLE_X, angleX);
    setParam(coreModel, PARAM_ANGLE_Y, angleY);
    setParam(coreModel, PARAM_ANGLE_Z, head.z);
    lastAngleX = angleX;
    lastAngleY = angleY;
    lastAngleZ = head.z;
  }

  /* ------------------------------------------------------------
   * 取景参数（占位模型 Hiyori 为全身立绘，moc3 画布两侧留白多；
   *   我们要的是"头肩半身像"：放大上半身、脚部交给 overflow:hidden 裁掉。
   *   将来换花小刻模型只需微调这几个比值，不必改算法）
   * ---------------------------------------------------------- */
  var MEASURE_SCALE = 0.25;    // 测量渲染缩放比（离屏低分辨率读 alpha，一次性）
  var FRAME_VIS_RATIO = 0.55;  // 舞台高度 ↔ 人物可见高度占比（越小越像"大头"，0.55≈头到腰/裙摆）
  var FRAME_FOCUS = 0.46;      // 人物对焦点落在舞台高度的比例（<0.5 偏上，给头顶留白）
  var FOCUS_IN_BODY = 0.26;    // 对焦点位于可见包围盒高度的 26% 处（约脖颈/领口）
  var WIDTH_CAP = 1.10;        // 肩宽两侧各留 5% 余量再限制最大缩放，避免横向溢出

  // 一次性测量：把模型以 MEASURE_SCALE 渲染到临时画布，扫描不透明像素得到
  // 人物在 moc3 本地坐标系中的真实包围盒（排除画布留白）。失败返回 null（退回 contain）。
  function measureCharacter(mw, mh) {
    try {
      var rw = Math.max(1, Math.round(mw * MEASURE_SCALE));
      var rh = Math.max(1, Math.round(mh * MEASURE_SCALE));

      // 暂存当前变换，测量后恢复（layout 紧随其后会写正式值）
      var saved = {
        ax: model.anchor.x, ay: model.anchor.y,
        sx: model.scale.x, sy: model.scale.y,
        px: model.position.x, py: model.position.y
      };
      model.anchor.set(0, 0);
      model.scale.set(MEASURE_SCALE);
      model.position.set(0, 0);

      app.renderer.resize(rw, rh);
      app.renderer.render(app.stage);
      var cnv = app.renderer.extract.canvas(app.stage);
      var ctx = cnv.getContext('2d');
      var data = ctx.getImageData(0, 0, cnv.width, cnv.height).data;

      var x0 = rw, y0 = rh, x1 = -1, y1 = -1;
      for (var y = 0; y < rh; y++) {
        for (var x = 0; x < rw; x++) {
          if (data[(y * rw + x) * 4 + 3] > 8) {
            if (x < x0) { x0 = x; }
            if (x > x1) { x1 = x; }
            if (y < y0) { y0 = y; }
            if (y > y1) { y1 = y; }
          }
        }
      }

      model.anchor.set(saved.ax, saved.ay);
      model.scale.set(saved.sx, saved.sy);
      model.position.set(saved.px, saved.py);

      if (x1 < 0) { return null; } // 全透明：测不到，退回 contain
      // 像素坐标 → 模型本地坐标；内缩 1px(测量尺度) 抗锯齿，避免贴边
      var pad = 1 / MEASURE_SCALE;
      return {
        x: x0 / MEASURE_SCALE + pad,
        y: y0 / MEASURE_SCALE + pad,
        w: (x1 - x0) / MEASURE_SCALE - pad * 2,
        h: (y1 - y0) / MEASURE_SCALE - pad * 2
      };
    } catch (e) {
      warn('人物包围盒测量失败，改用整画布 contain：' + (e && e.message || e));
      return null;
    }
  }

  /* ------------------------------------------------------------
   * 尺寸自适应：按人物真实包围盒做头肩取景
   * ---------------------------------------------------------- */
  var charBox = null;       // 测量结果（模型本地坐标），null=尚未测/失败
  var measureTried = false;

  function layout() {
    if (!app || !model || !stageEl) { return; }
    var w = stageEl.clientWidth || 0;
    var h = stageEl.clientHeight || 0;
    if (w <= 0 || h <= 0) { return; } // 容器尚不可见（如 display:none），跳过本帧
    try { app.renderer.resize(w, h); } catch (e) { /* 忽略 */ }

    // ★ 尺寸必须取自 internalModel（moc3 画布尺寸，init 时算好后恒定不变），
    //   不能用 model.width/height：PIXI 里它们等于 scale × localBounds，
    //   会被上一次 layout 写入的 scale 反向影响，首帧还可能读到 0。
    var im = model.internalModel;
    var mw = (im && im.width) || 0;
    var mh = (im && im.height) || 0;
    if (!(mw > 0) || !(mh > 0)) { mw = model.width || 1; mh = model.height || 1; } // 兜底

    // 首帧一次性测量人物包围盒（必须在正式布局前，此时模型已在舞台上）
    if (!measureTried) {
      measureTried = true;
      charBox = measureCharacter(mw, mh);
      try { app.renderer.resize(w, h); } catch (e) { /* 测量改过 renderer 尺寸，恢复 */ }
    }

    // anchor(0.5,0.5) → pivot=(mw/2, mh/2)；本地点 (lx,ly) 的屏幕坐标 =
    //   (position.x + (lx-mw/2)*scale, position.y + (ly-mh/2)*scale)
    model.anchor.set(0.5, 0.5);

    var posX, posY, fit;
    if (charBox && charBox.w > 0 && charBox.h > 0) {
      // 高度优先撑满（取头肩/上半身），同时用肩宽封顶防横向溢出
      var byH = h / (charBox.h * FRAME_VIS_RATIO);
      var byW = w / (charBox.w * WIDTH_CAP);
      fit = Math.min(byH, byW);
      // 水平：以人物包围盒中心居中（而非留白严重的画布中心）
      var bodyCx = charBox.x + charBox.w / 2;
      // 垂直：把人物 FOCUS_IN_BODY 处（约脖颈）对准舞台 FRAME_FOCUS 高度
      var focusY = charBox.y + charBox.h * FOCUS_IN_BODY;
      posX = w / 2 - (bodyCx - mw / 2) * fit;
      posY = h * FRAME_FOCUS - (focusY - mh / 2) * fit;
    } else {
      // 兜底：整画布 contain 居中
      fit = Math.min(w / mw, h / mh);
      posX = w / 2;
      posY = h / 2;
    }
    if (!(fit > 0) || !isFinite(fit)) { fit = 1; }

    model.scale.set(fit);
    model.position.set(posX, posY);
  }

  function onWindowResize() { layout(); }

  function bindResize() {
    if (!stageEl) { return; }
    try {
      if (typeof win.ResizeObserver === 'function') {
        resizeObserver = new win.ResizeObserver(function () { layout(); });
        resizeObserver.observe(stageEl);
        return;
      }
    } catch (e) { /* ResizeObserver 不可用则退回 resize 事件 */ }
    resizeHandler = onWindowResize;
    win.addEventListener('resize', resizeHandler);
  }

  function bindVisibility() {
    visibilityHandler = function () {
      if (!app) { return; }
      try {
        if (doc.visibilityState === 'hidden') { app.ticker.stop(); }
        else { app.ticker.start(); }
      } catch (e) { /* 忽略 */ }
    };
    doc.addEventListener('visibilitychange', visibilityHandler);
  }

  /* ------------------------------------------------------------
   * 视线跟随：鼠标/触控笔在舞台内移动 → 归一化坐标驱动转头。
   *   触摸（touch）刻意不跟随，避免与页面纵向滚动抢手势（spec Task5 Notes）；
   *   离开舞台即回正。监听挂在容器上，canvas 事件会冒泡上来。
   * ---------------------------------------------------------- */
  function bindPointer() {
    if (!stageEl) { return; }
    pointerMoveHandler = function (e) {
      if (e.pointerType === 'touch') { return; } // 触摸让位给滚动
      var r = stageEl.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) { return; }
      var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      var ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      pointerTargetX = nx < -1 ? -1 : (nx > 1 ? 1 : nx);
      pointerTargetY = ny < -1 ? -1 : (ny > 1 ? 1 : ny);
    };
    pointerLeaveHandler = function () {
      pointerTargetX = 0;
      pointerTargetY = 0;
    };
    stageEl.addEventListener('pointermove', pointerMoveHandler);
    stageEl.addEventListener('pointerleave', pointerLeaveHandler);
  }

  /* ------------------------------------------------------------
   * 创建舞台 + 加载模型
   * ---------------------------------------------------------- */
  function createStage(modelPath) {
    var PIXI = win.PIXI;
    var Live2DModel = PIXI.live2d.Live2DModel;

    // 若 UMD 未自动注册 ticker 则显式注册（实测该构建 autoUpdate 会回退 window.PIXI.Ticker，
    // 显式调用更稳；PIXI.Ticker.shared 的 autoStart=!0，会自动驱动 model.onTickerUpdate）
    try {
      if (typeof Live2DModel.registerTicker === 'function') { Live2DModel.registerTicker(PIXI.Ticker); }
    } catch (e) { warn('registerTicker 调用失败（不影响 autoUpdate 回退路径）。'); }

    // 容器先变可见，才能量到真实尺寸
    stageEl.innerHTML = '';
    markActive(true);

    canvas = doc.createElement('canvas');
    canvas.className = 'live2d-stage__canvas';
    stageEl.appendChild(canvas);

    app = new PIXI.Application({
      view: canvas,
      backgroundAlpha: 0,                                   // 透明底，露出舞台宣纸背景
      antialias: true,
      autoStart: true,
      resolution: Math.min(win.devicePixelRatio || 1, 2),   // 高清屏适配（上限 2x）
      autoDensity: true
    });
    app.ticker.maxFPS = TICKER_MAX_FPS;                     // 限帧

    return Live2DModel.from(modelPath, { autoInteract: false }).then(function (m) {
      model = m;
      model.anchor.set(0.5, 0.5);
      app.stage.addChild(model);

      installParamInjector(model);
      lastParamTime = nowMs();
      active = true;

      layout();          // 此刻容器已可见，能算对缩放/居中
      bindResize();
      bindVisibility();
      bindPointer();
      return true;
    });
  }

  /* ------------------------------------------------------------
   * 初始化（幂等；任何失败都回退静态头像，不抛未捕获异常）
   * ---------------------------------------------------------- */
  function doInit(opts) {
    opts = opts || {};

    if (prefersReducedMotion()) {
      warn('系统偏好减少动效（prefers-reduced-motion: reduce），跳过 Live2D 初始化，使用静态头像。');
      return Promise.resolve(false);
    }

    var el = opts.container || doc.getElementById(CONTAINER_ID);
    if (!el || el.nodeType !== 1) {
      warn('未找到 Live2D 容器（#' + CONTAINER_ID + '），跳过初始化。');
      return Promise.resolve(false);
    }
    stageEl = el;

    if (!supportsWebGL()) {
      warn('当前浏览器/设备不支持 WebGL，跳过 Live2D 初始化，使用静态头像。');
      stageEl = null;
      return Promise.resolve(false);
    }

    var modelPath = resolveModelPath(opts.modelPath);
    return loadVendors()
      .then(function () { return createStage(modelPath); })
      .then(function () { return true; });
  }

  function init(opts) {
    if (active) { return Promise.resolve(true); }
    if (initPromise) { return initPromise; }
    initPromise = doInit(opts).catch(function (err) {
      warn('初始化失败，回退静态头像：' + (err && err.message || err));
      // 释放失败前可能已创建的 PIXI 应用与画布，避免残留 ticker 空转耗电
      // （destroy 内部已负责 active=false / markActive(false) / initPromise=null）
      destroy();
      return false;
    });
    return initPromise;
  }

  /* ------------------------------------------------------------
   * 状态机：setBusy / setState
   *   true  → 'thinking'（AI 正在输出，低头思考状）
   *   false → 'presenting'（"说完话"呈现包络，约 1800ms 后自动回 idle）
   * ---------------------------------------------------------- */
  function setBusy(on) {
    on = !!on;
    busy = on;
    mouthOverride = false;      // 回到自动化口型
    if (on) {
      state = 'thinking';
    } else {
      state = 'presenting';
      presentingStart = nowMs();
    }
    return busy;
  }

  function setState(next) {
    if (next !== 'idle' && next !== 'thinking' && next !== 'presenting') { return false; }
    state = next;
    mouthOverride = false;
    if (next === 'presenting') { presentingStart = nowMs(); }
    return true;
  }

  // 直接写口型（覆盖自动包络，供外部接管）
  function setMouth(v) {
    var n = Number(v);
    if (isNaN(n)) { return false; }
    mouthOverride = true;
    userMouth = clamp01(n);
    return true;
  }

  /* ------------------------------------------------------------
   * 真实音频分析（可选扩展点）
   *   createMediaElementSource 对同一元素只能创建一次 → 缓存并忽略 InvalidStateError；
   *   source 必须 connect 到 destination，否则原音频会变哑。
   * ---------------------------------------------------------- */
  function findAudioSource(el) {
    for (var i = 0; i < audioSources.length; i++) {
      if (audioSources[i].el === el) { return audioSources[i].node; }
    }
    return null;
  }

  function attachAudioSource(audioEl) {
    if (!audioEl || typeof audioEl !== 'object') { return false; }
    var AC = win.AudioContext || win.webkitAudioContext;
    if (!AC) { warn('当前浏览器不支持 AudioContext，无法接入真实音频分析。'); return false; }
    try {
      if (!audioCtx) { audioCtx = new AC(); }
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        try { audioCtx.resume(); } catch (e) { /* 需用户手势，忽略 */ }
      }
      if (!analyser) {
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        audioData = new Uint8Array(analyser.frequencyBinCount);
      }

      var node = findAudioSource(audioEl);
      if (!node) {
        try {
          node = audioCtx.createMediaElementSource(audioEl);
          audioSources.push({ el: audioEl, node: node });
        } catch (err) {
          if (err && err.name === 'InvalidStateError') {
            warn('该音频元素已创建过 MediaElementSource（InvalidStateError），跳过重复创建。');
            return false;
          }
          throw err;
        }
      }
      node.connect(analyser);
      analyser.connect(audioCtx.destination); // 保证原音频仍能出声
      return true;
    } catch (e) {
      warn('接入音频分析失败：' + (e && e.message || e));
      return false;
    }
  }

  /* ------------------------------------------------------------
   * 销毁：停 ticker、销毁 PIXI 应用、移除监听
   * ---------------------------------------------------------- */
  function destroy() {
    try {
      active = false;
      busy = false;
      state = 'idle';
      mouthCurrent = 0;
      mouthOverride = false;

      if (resizeObserver) {
        try { resizeObserver.disconnect(); } catch (e) { /* 忽略 */ }
        resizeObserver = null;
      }
      if (resizeHandler) { win.removeEventListener('resize', resizeHandler); resizeHandler = null; }
      if (visibilityHandler) { doc.removeEventListener('visibilitychange', visibilityHandler); visibilityHandler = null; }
      if (stageEl && pointerMoveHandler) { stageEl.removeEventListener('pointermove', pointerMoveHandler); pointerMoveHandler = null; }
      if (stageEl && pointerLeaveHandler) { stageEl.removeEventListener('pointerleave', pointerLeaveHandler); pointerLeaveHandler = null; }
      pointerTargetX = pointerTargetY = pointerSmoothX = pointerSmoothY = 0;
      lastAngleX = lastAngleY = lastAngleZ = 0;

      if (app) {
        try { app.ticker.stop(); } catch (e) { /* 忽略 */ }
        try { app.destroy(true, { children: true }); }
        catch (e) { try { app.destroy(true); } catch (e2) { /* 忽略 */ } }
        app = null;
      }
      if (model) {
        try { model.destroy(); } catch (e) { /* 忽略 */ }
        model = null;
      }
      if (canvas && canvas.parentNode) { canvas.parentNode.removeChild(canvas); }
      canvas = null;
      stageEl = null;
      initPromise = null;

      markActive(false);
    } catch (e) {
      warn('销毁过程出现异常（已尽力清理）：' + (e && e.message || e));
    }
    return true;
  }

  /* ------------------------------------------------------------
   * 组装并暴露全局单例
   * ---------------------------------------------------------- */
  var api = {
    init: init,
    setBusy: setBusy,
    setState: setState,
    setMouth: setMouth,
    attachAudioSource: attachAudioSource,
    isActive: function () { return active; },
    getMouth: function () { return mouthCurrent; },   // 当前口型（0~1），供自测/外部联调
    getState: function () { return state; },          // 'idle' | 'thinking' | 'presenting'
    getHead: function () { return { x: +lastAngleX.toFixed(2), y: +lastAngleY.toFixed(2), z: +lastAngleZ.toFixed(2) }; },
    destroy: destroy
  };
  win.WoodWhisperLive2D = api;

  /* ------------------------------------------------------------
   * 自动初始化：DOMContentLoaded（若已就绪则立即执行）时若存在 #live2dStage 则 init
   * ---------------------------------------------------------- */
  function autoInit() {
    try {
      if (!doc.getElementById(CONTAINER_ID)) { return; }
      init({});
    } catch (e) {
      warn('自动初始化异常：' + (e && e.message || e));
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
})(typeof window !== 'undefined' ? window : null,
   typeof document !== 'undefined' ? document : null);

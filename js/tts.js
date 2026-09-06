/* ============================================================
 * js/tts.js - WoodWhisper 全站统一朗读运行时（WoodWhisperTTS）
 * ------------------------------------------------------------
 * 背景：仓库正文富含可听内容（AI 回复、大师故事、历史朝代文案、匠语语录、
 *   祝福语、首页引言）。朗读能力此前散落在 ai.html / history.html 各自内联的
 *   speechSynthesis 实现中，无公共模块、无音色优选、无逐句高亮跟随。
 *   本文件提供唯一公共运行时，页面一律通过 window.WoodWhisperTTS 调用，
 *   禁止页面再直接调用 speechSynthesis（见 spec REQ-TTS-1）。
 *
 * 引擎选择与降级（REQ-TTS-1 / REQ-TTS-5）：
 *   static-audio（固定文案）→ edge-tts（动态文本，晓晓同音色）→ native（动态/兜底）→ local（预留）。
 *   1) static-audio：固定文案的「温柔女声」——由 scripts/gen-tts-audio.mjs
 *      用 Edge-tts zh-CN-XiaoxiaoNeural 预合成 assets/audio 目录下的逐句 mp3，
 *      运行时用单个隐藏 <audio> 按 assets/audio/manifest.json 逐句播放，
 *      句间停顿 120ms，精确驱动逐句高亮。
 *   2) edge-tts（动态文本主引擎）：POST 侧端合成接口（resolveTtsUrl() 得到的
 *      后端 /api/tts，Vercel 函数 api/tts.js），复用与静态音频相同的
 *      zh-CN-XiaoxiaoNeural（晓晓）音色，使 AI 页动态语音与静态语音同音色。
 *      返回逐句 mp3（audioBase64，24kHz 单声道 32kbps）经 base64→Blob→blob URL，
 *      用单个隐藏 <audio> 逐句播放、句间停顿 120ms、逐句派发事件；支持停止。
 *      任一步失败（fetch 失败/超时/空句子/无音频）自动回退原生，保证能出声。
 *   3) native：浏览器原生 speechSynthesis 兜底，动态文本下 edge-tts 不可用或
 *      合成句缺失/截断时逐句 utterance，自动挑选系统中文语音（zh-CN 优先）。
 *   4) local（REQ-TTS-5 预留适配位，本期 SHALL NOT 实装）：
 *      - local：本地模型 TTS（如 kokoro-js / WebGPU / ONNX 类）。
 *        本期不接入的原因（项目调研结论）：模型需 ONNX 兼容且体积需评估；
 *        手机端 WebGPU 覆盖不足、iOS 26 才开始放开 WebGPU；
 *        开源中文模型音质仍需评估，暂时达不到「温柔女声」基线；
 *        在静态音频 + 原生兜底已覆盖全部固定/动态文案的前提下收益有限。
 *      （REQ-TTS-5 原「remote」适配位已由 edge-tts 实装：本项目自有 /api/tts
 *        侧端合成即云端/自托管 TTS 形态，engine.id 记为 'edge-tts'。）
 *      local 在 engines 注册表中占位（supported() 恒为 false），
 *      满足条件后按同一驱动接口实现即可热插拔。
 *
 * 逐句高亮（REQ-TTS-2）：正文按句包 <span class="tts-s" data-i>，
 *   朗读到第 i 句时加 .tts-s--active；找不到对应句时以整块 .tts-active 退化。
 *
 * 全局事件（document 上派发 CustomEvent）：
 *   tts:speakingstart / tts:speakingend / tts:speakingcancel
 *   （detail: { token, engine, contentId?, reason? }），供 ai/history 页动画使用。
 *
 * 依赖：无（原生浏览器 API），不 import/require、无第三方库。
 * 引入方式：<script src="js/tts.js"></script>（放在其他页面脚本之前）。
 * ES2017+：使用 const/let、箭头函数、模板字符串；不使用 import/require。
 *
 * 对外公开方法速览：
 *   WoodWhisperTTS.manifest          只读 getter：manifest 缓存（undefined=未加载/null=失败/object=成功）
 *   WoodWhisperTTS.loadManifest()    手动预取 manifest，返回 Promise<object|null>
 *   WoodWhisperTTS.supportsNative()  检测浏览器原生 speechSynthesis
 *   WoodWhisperTTS.split(text)       拆句（返回 trim 后非空句子数组）
 *   WoodWhisperTTS.speakContent(contentId, opts?)  静态音频逐句朗读；缺失项/缺文件回退文本朗读
 *   WoodWhisperTTS.speakText(text, opts?)          edge-tts → 原生兜底逐句朗读
 *   WoodWhisperTTS.stop()            停止当前朗读（若在朗读则派发 speakingcancel）
 *   WoodWhisperTTS.isSpeaking()      是否有朗读进行中（含 manifest 加载挂起）
 *   WoodWhisperTTS.toggle(cfg?)      简易开关：正在读则停止，否则按 cfg 朗读
 *   WoodWhisperTTS.createReadButton(cfg)  渲染小喇叭按钮（返回 button 或 false）
 *   WoodWhisperTTS.prepareHighlight(elOrArray)  按句包 span.tts-s[data-i]
 *   WoodWhisperTTS.setHighlight(i) / clearHighlight()
 *   WoodWhisperTTS.resetHighlight(elOrArray?)   还原 DOM（移除 span、还原文本原样）
 *   WoodWhisperTTS.bindAutoStop()    绑定 visibilitychange/pagehide 自动停止（模块初始化即自动绑定一次）
 *   WoodWhisperTTS.engines           引擎注册表（含 static-audio/edge-tts/native/local）
 *
 * 典型用法：
 *   var btn = WoodWhisperTTS.createReadButton({
 *     container: document.querySelector('.master-bio'),
 *     contentId: 'master-3',
 *     fallbackText: '……正文全文……'
 *     // 可选 onUnavailable(msg)：本模块不可用时按钮自动禁用并弹一次 toast
 *   });
 *   说明：按钮点击自动处理「朗读/停止」切换与 aria-label；页面通常在打开弹窗时先调用
 *   WoodWhisperTTS.prepareHighlight(正文元素) 按句包 span，再在朗读回调里驱动高亮，例如：
 *   WoodWhisperTTS.speakText('你好。这是一句测试。', {
 *     onSentence: function (i, total) { WoodWhisperTTS.setHighlight(i); }
 *   });
 * ============================================================ */
(function (win, doc) {
  'use strict';

  // 已在页面中实例化则跳过（防止重复引入产生双引擎）
  if (win && win.WoodWhisperTTS) { return; }
  // 非浏览器环境（如 node --check 仅做语法检查）直接安全退出
  if (!win || !doc || typeof doc.createElement !== 'function') { return; }

  /* ------------------------------------------------------------
   * 常量与内部状态
   * ---------------------------------------------------------- */
  var MANIFEST_URL = 'assets/audio/manifest.json';
  var GAP_MS = 120;                 // 静态音频句间停顿
  var NATIVE_STEP_MS = 8;           // 原生语音句间回调间隔（避开浏览器事件栈）
  var EDGE_TIMEOUT_MS = 12000;      // edge-tts 侧端合成请求整体前端超时（AbortController）

  var manifest;          // undefined=尚未加载；null=加载失败已缓存；object=成功
  var manifestPromise;   // 进行中的 fetch Promise
  var tokenSeq = 0;      // 会话 token 序号（按钮/事件区分会话用）
  var gen = 0;           // 世代号：任何 stop / 新朗读都会 +1，用于废弃异步续延
  var current = null;    // 当前会话 {token,kind,opts,sentences,index,...}
  var pending = null;    // speakContent 等待 manifest 期间的挂起记录 {token,opts,contentId,g}

  var audioEl = null;    // 复用的单个隐藏 <audio>
  var preloadEl = null;  // 辅助预载下一句（不参与播放）
  var zhVoices = [];     // 已缓存的中文语音候选
  var autoStopBound = false;
  var hlScopes = [];     // 高亮作用域 [{el, spans}]

  // TreeWalker 常量兜底（老浏览器无 NodeFilter 时用数值）
  var SHOW_TEXT = 4, ACCEPT = 1;

  var ICON_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M11 5 6 9H2v6h4l5 4V5z"></path>' +
    '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>' +
    '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';

  var TTS_CSS = [
    /* 朗读小喇叭按钮：金色描边、图标居中、最小 44x44 热区 */
    '.tts-read-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;' +
      'min-width:44px;min-height:44px;margin:0;padding:8px;border:1px solid #C9A227;border-radius:12px;' +
      'background:rgba(201,162,39,.06);color:#C9A227;cursor:pointer;vertical-align:middle;line-height:1;' +
      'text-align:center;font:inherit;-webkit-appearance:none;appearance:none;' +
      '-webkit-tap-highlight-color:transparent;user-select:none;' +
      'transition:background-color .25s ease,color .25s ease,box-shadow .25s ease}',
    '.tts-read-btn svg{display:block;pointer-events:none;transition:transform .3s ease}',
    '.tts-read-btn:hover{background:rgba(201,162,39,.16)}',
    /* 朗读中（=点击停止）状态：高亮 + 喇叭图标旋转 90 度示意“停止” */
    '.tts-read-btn--active{background:rgba(201,162,39,.28);color:#f0d488;' +
      'box-shadow:0 0 0 1px rgba(201,162,39,.6) inset,0 2px 10px rgba(201,162,39,.22)}',
    '.tts-read-btn--active svg{transform:rotate(90deg)}',
    '.tts-read-btn:disabled,.tts-read-btn--unavailable{opacity:.45;cursor:not-allowed}',
    /* 逐句高亮：浅金底 + 描边，保持继承行高（用 box-shadow 描边避免撑破布局） */
    '.tts-s{background:transparent;box-shadow:none;transition:background-color .2s ease,box-shadow .2s ease}',
    '.tts-s--active{background:rgba(212,175,55,.22);box-shadow:0 0 0 1px rgba(212,175,55,.5)}',
    /* 整块退化高亮（找不到对应句 span 时） */
    '.tts-active{background:rgba(212,175,55,.22);box-shadow:0 0 0 1px rgba(212,175,55,.35)}',
    /* 一次性 toast（引擎不可用提示） */
    '.tts-toast{position:fixed;left:50%;bottom:64px;z-index:99999;transform:translate(-50%,16px);' +
      'max-width:82vw;box-sizing:border-box;padding:10px 18px;border:1px solid rgba(201,162,39,.5);' +
      'border-radius:10px;background:rgba(30,20,8,.94);color:#f6e3b0;font-size:14px;line-height:1.6;' +
      'opacity:0;visibility:hidden;pointer-events:none;' +
      'transition:opacity .25s ease,transform .25s ease,visibility .25s ease}',
    '.tts-toast--show{opacity:1;visibility:visible;transform:translate(-50%,0)}'
  ].join('\n');

  var toastEl = null;
  var toastTimer = null;

  /* ------------------------------------------------------------
   * 小工具：安全调用 / 事件派发 / console 提示 / toast
   * ---------------------------------------------------------- */
  function safeCall(fn, args) {
    if (typeof fn !== 'function') { return; }
    try { fn.apply(null, args || []); } catch (err) { console.warn('[TTS] 回调执行出错：', err); }
  }

  function dispatch(type, detail) {
    try {
      var ev;
      if (typeof CustomEvent === 'function') {
        ev = new CustomEvent('tts:' + type, { detail: detail || {} });
      } else {
        ev = doc.createEvent('CustomEvent');
        ev.initCustomEvent('tts:' + type, false, false, detail || {});
      }
      doc.dispatchEvent(ev);
    } catch (err) { /* 事件派发失败不影响朗读主流程 */ }
  }

  function showToast(msg) {
    if (!toastEl) {
      toastEl = doc.createElement('div');
      toastEl.className = 'tts-toast';
      toastEl.setAttribute('role', 'status');
      (doc.body || doc.documentElement).appendChild(toastEl);
    }
    toastEl.textContent = msg || '当前浏览器不支持语音朗读';
    toastEl.classList.add('tts-toast--show');
    if (toastTimer) { clearTimeout(toastTimer); }
    toastTimer = setTimeout(function () {
      if (toastEl) { toastEl.classList.remove('tts-toast--show'); }
    }, 2600);
  }

  /* ------------------------------------------------------------
   * 拆句（公开 split 与内部碎片化共用同一套句界规则）
   * ---------------------------------------------------------- */
  function splitToFragments(text) {
    var out = [];
    var last = 0;
    var re = /([。！？!?…]+|[\r\n]+)/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      out.push(text.slice(last, m.index + m[0].length));
      last = m.index + m[0].length;
    }
    if (last < text.length) { out.push(text.slice(last)); }
    return out;
  }

  function split(text) {
    if (text === null || text === undefined) { return []; }
    return splitToFragments(String(text))
      .map(function (p) { return p.trim(); })
      .filter(Boolean);
  }

  /* ------------------------------------------------------------
   * 能力探测与引擎注册表（REQ-TTS-5：local 占位说明见文件头，remote 由 edge-tts 实装）
   * ---------------------------------------------------------- */
  function supportsNative() {
    try {
      return !!(win.speechSynthesis && typeof win.SpeechSynthesisUtterance === 'function');
    } catch (err) { return false; }
  }

  function supportsStaticAudio() {
    try {
      return typeof doc.createElement === 'function' &&
        typeof doc.createElement('audio').play === 'function';
    } catch (err) { return false; }
  }

  /* ------------------------------------------------------------
   * edge-tts 侧端接口 URL 解析与能力探测（见文件头 REQ-TTS-5）
   * ---------------------------------------------------------- */
  function resolveTtsUrl() {
    try {
      var u = win && win.WOODWHISPER_TTS_URL;
      if (typeof u === 'string' && u.trim() !== '') { return u; }
    } catch (err) { /* 回退默认 */ }
    return '/api/tts';
  }

  function supportsEdgeTTS() {
    try {
      if (typeof win.fetch !== 'function') { return false; }
      if (!resolveTtsUrl()) { return false; }
      // 播放链路所需：Blob URL + base64 解码
      if (typeof win.atob !== 'function') { return false; }
      if (typeof Blob !== 'function' || !URL || typeof URL.createObjectURL !== 'function') {
        return false;
      }
      return true;
    } catch (err) { return false; }
  }

  var engines = {};
  (function defineEngines() {
    engines['static-audio'] = {
      id: 'static-audio',
      label: '静态音频（Edge-tts 晓晓预合成 mp3，逐句播放）',
      supported: supportsStaticAudio,
      note: '主引擎：固定文案按 assets/audio/manifest.json 用单个 <audio> 逐句播放。'
    };
    engines.native = {
      id: 'native',
      label: '浏览器原生语音合成 speechSynthesis',
      supported: supportsNative,
      note: '兜底引擎：动态文本/静态缺失时逐句 utterance，自动挑选 zh-CN 语音。'
    };
    engines['edge-tts'] = {
      id: 'edge-tts',
      label: 'Edge TTS 侧端（晓晓同音色）',
      supported: supportsEdgeTTS,
      note: '动态文本主引擎：POST 后端 /api/tts 侧端合成 zh-CN-XiaoxiaoNeural（晓晓），' +
        '与静态音频同音色；逐句 mp3(base64)→blob URL→单个 <audio> 播放，失败回退原生。'
      // REQ-TTS-5 原 remote 预留位已由本引擎实装（见文件头）。
    };
    engines.local = {
      id: 'local',
      label: '本地模型 TTS（kokoro-js / WebGPU / ONNX，预留）',
      supported: function () { return false; },
      reserved: true,
      note: 'REQ-TTS-5 预留接口，本期不实装。接入条件：模型 ONNX 兼容且体积可接受、' +
        '手机端 WebGPU 普及（iOS 26 起放开）、中文音质达到温柔女声基线。'
    };
  })();

  /* ------------------------------------------------------------
   * 中文语音挑选（含 'zh-CN' 或 'zh' 且不含 'en-'；zh-CN 优先）
   * ---------------------------------------------------------- */
  function voiceRank(v) {
    var lang = String(v.lang || '').toLowerCase();
    if (lang.indexOf('zh-cn') === 0) { return 3; }
    if (lang.indexOf('zh') === 0) { return 2; }
    return 1;
  }

  function refreshVoices() {
    try {
      if (!supportsNative()) { zhVoices = []; return; }
      var list = win.speechSynthesis.getVoices() || [];
      zhVoices = list.filter(function (v) {
        if (!v || !v.lang) { return false; }
        var lang = String(v.lang).toLowerCase();
        var name = String(v.name || '').toLowerCase();
        if (lang.indexOf('en-') !== -1 || name.indexOf('en-') !== -1) { return false; }
        return lang.indexOf('zh-cn') !== -1 || lang.indexOf('zh') !== -1;
      }).sort(function (a, b) { return voiceRank(b) - voiceRank(a); });
    } catch (err) { zhVoices = []; }
  }

  function pickZhVoice() {
    return zhVoices.length ? zhVoices[0] : null;
  }

  if (supportsNative()) {
    refreshVoices();
    try {
      if (typeof win.speechSynthesis.addEventListener === 'function') {
        win.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
      }
    } catch (err) { /* 忽略 */ }
  }

  /* ------------------------------------------------------------
   * manifest 懒加载（首用 speakContent 时 fetch；失败缓存 null 不重试）
   * ---------------------------------------------------------- */
  function loadManifest() {
    if (manifest !== undefined) { return Promise.resolve(manifest); }
    if (manifestPromise) { return manifestPromise; }
    if (typeof fetch !== 'function') {
      manifest = null;
      console.warn('[TTS] 当前环境无 fetch，静态音频清单视为不可用（已缓存）。');
      return Promise.resolve(null);
    }
    manifestPromise = fetch(MANIFEST_URL, { method: 'GET', credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        manifestPromise = null;
        manifest = (data && typeof data === 'object') ? data : null;
        if (!manifest) { console.warn('[TTS] manifest.json 内容为空，静态音频不可用。'); }
        return manifest;
      })
      .catch(function (err) {
        manifestPromise = null;
        manifest = null; // 失败即缓存 null，后续不再重复 fetch
        console.warn('[TTS] 静态音频清单加载失败(' + MANIFEST_URL + ')：' +
          (err && err.message || err) + '。本次回退文本朗读。');
        return null;
      });
    return manifestPromise;
  }

  function findEntry(m, contentId) {
    if (!m) { return null; }
    var hit = m[contentId];
    if (hit && typeof hit === 'object' && Array.isArray(hit.sentences)) { return hit; }
    // 兼容「manifest 按类目再嵌套一层」的结构：遍历一级类目找 contentId
    for (var key in m) {
      if (!Object.prototype.hasOwnProperty.call(m, key)) { continue; }
      var v = m[key];
      if (v && typeof v === 'object' && v[contentId] && Array.isArray(v[contentId].sentences)) {
        return v[contentId];
      }
    }
    return null;
  }

  function entryIsUsable(entry) {
    if (!entry || !Array.isArray(entry.sentences)) { return false; }
    return entry.sentences.some(function (s) { return s && String(s).trim(); });
  }

  /* ------------------------------------------------------------
   * 音频 URL 解析（manifest 项可能带 files 数组或仅 sentences）
   * ---------------------------------------------------------- */
  function resolveAudioUrl(contentId, entry, index) {
    var files = entry && Array.isArray(entry.files) ? entry.files : [];
    var raw = (index < files.length && files[index] != null) ? String(files[index]).trim() : '';
    if (!raw) { raw = 's' + (index + 1) + '.mp3'; }
    if (/^https?:/i.test(raw) || raw.charAt(0) === '/' ||
        raw.indexOf('assets/') === 0 || raw.indexOf('audio/') === 0) {
      return raw;
    }
    var cat = (entry && entry.category) ? entry.category : String(contentId).split('/')[0];
    return 'assets/audio/' + cat + '/' + contentId + '/' + raw;
  }

  /* ------------------------------------------------------------
   * 单个隐藏 <audio> 的管理 + 下一句预载
   * ---------------------------------------------------------- */
  function ensureAudioEl() {
    if (audioEl) { return audioEl; }
    var host = doc.body || doc.documentElement;
    if (!host) { return null; }
    try {
      audioEl = doc.createElement('audio');
      audioEl.preload = 'auto';
      audioEl.setAttribute('aria-hidden', 'true');
      // display:none 会导致部分浏览器无法出声；用移出可视区的方式隐藏
      audioEl.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;' +
        'opacity:.01;pointer-events:none;';
      host.appendChild(audioEl);
    } catch (err) {
      audioEl = null;
    }
    return audioEl;
  }

  function preloadNext(contentId, entry, index) {
    if (index >= (entry && entry.sentences ? entry.sentences.length : 0)) { return; }
    try {
      if (!preloadEl) { preloadEl = new Audio(); preloadEl.preload = 'auto'; }
      preloadEl.src = resolveAudioUrl(contentId, entry, index);
    } catch (err) { /* 预载失败静默，播放时再处理 */ }
  }

  function clearBlobUrls(c) {
    if (!c || !c.blobUrls || !c.blobUrls.length) { return; }
    for (var i = 0; i < c.blobUrls.length; i++) {
      try { URL.revokeObjectURL(c.blobUrls[i]); } catch (err) { /* 忽略 */ }
    }
    c.blobUrls = [];
  }

  function teardownMedia(c) {
    if (!c) { return; }
    if (c.timer) { clearTimeout(c.timer); c.timer = null; }
    if (c.signalTimer) { clearTimeout(c.signalTimer); c.signalTimer = null; }
    if (c.controller) {
      try { if (typeof c.controller.abort === 'function') { c.controller.abort(); } } catch (err) { /* 忽略 */ }
      c.controller = null;
    }
    clearBlobUrls(c); // 释放 edge-tts 会话的 blob URL 内存
    if (audioEl) {
      audioEl.onended = null;
      audioEl.onerror = null;
      try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch (err) { /* 忽略 */ }
    }
  }

  function teardownAll(c) {
    teardownMedia(c);
    if (supportsNative()) {
      try { win.speechSynthesis.cancel(); } catch (err) { /* 忽略 */ }
    }
  }

  function sessionAlive(c) {
    return !!(c && current === c && c.g === gen);
  }

  /* ------------------------------------------------------------
   * 会话生命周期：开始 / 结束 / 停止 / 事件派发
   * ---------------------------------------------------------- */
  function clearHighlight() {
    hlScopes.forEach(function (scope) {
      if (!scope || !scope.el) { return; }
      if (scope.el.classList) { scope.el.classList.remove('tts-active'); }
      scope.spans.forEach(function (sp) {
        if (sp && sp.classList) { sp.classList.remove('tts-s--active'); }
      });
    });
  }

  function beginSession(c) {
    c.started = true;
    dispatch('speakingstart', { token: c.token, engine: c.kind, contentId: c.contentId || null });
    safeCall(c.opts.onStart);
  }

  function finishSession(c) {
    if (!sessionAlive(c)) { return; } // 已被新会话取代或已被 stop，避免重复收尾
    current = null;
    teardownAll(c);
    clearHighlight();
    dispatch('speakingend', { token: c.token, engine: c.kind, contentId: c.contentId || null });
    safeCall(c.opts.onEnd);
  }

  // 停止一切（含挂起的 manifest 作业），并视情况派发 speakingcancel + 回调 onCancel
  function stopAndNotify(reason) {
    var had = false;
    gen++; // 使所有旧异步续延/旧会话失效
    var c = current;
    var p = pending;
    current = null;
    pending = null;
    if (c) {
      had = true;
      teardownAll(c);
      clearHighlight();
      if (c.started) {
        dispatch('speakingcancel', {
          token: c.token, engine: c.kind, contentId: c.contentId || null, reason: reason || 'stopped'
        });
        safeCall(c.opts.onCancel);
      }
    }
    if (p) { had = true; } // 挂起中的朗读被打断（从未开始，不派发 cancel）
    return had;
  }

  /* ------------------------------------------------------------
   * 静态音频引擎：逐句 <audio> 播放（句间 120ms）
   * ---------------------------------------------------------- */
  function handleStaticError(c, index) {
    if (!sessionAlive(c) || c.fallbackStarted) { return; }
    c.fallbackStarted = true;
    var entry = c.entry || {};
    var fallback = (c.opts && typeof c.opts.fallbackText === 'string' && c.opts.fallbackText.trim())
      ? c.opts.fallbackText
      : (entry.sentences || []).join('');
    console.warn('[TTS] 静态音频「' + c.contentId + '」第 ' + (index + 1) +
      ' 句播放失败/文件缺失，回退为文本朗读。');
    teardownMedia(c);
    if (!fallback || !fallback.trim()) {
      finishSession(c);
      return;
    }
    if (!supportsNative()) {
      safeCall(c.opts.onUnavailable, '当前浏览器不支持语音朗读');
      finishSession(c);
      return;
    }
    // 同一会话内无声切换引擎继续：不重复派发 start / onStart
    c.kind = 'native';
    c.sentences = split(fallback);
    c.index = 0;
    c.fallbackStarted = false;
    if (!c.sentences.length) { finishSession(c); return; }
    nativeSpeakNext(c);
  }

  function staticSpeakNext(c) {
    if (!sessionAlive(c)) { return; }
    var i = c.index;
    var total = c.sentences.length;
    if (i >= total) { finishSession(c); return; }
    var a = ensureAudioEl();
    if (!a) { finishSession(c); return; }

    safeCall(c.opts.onSentence, [i, total]); // 播放前回调，驱动逐句高亮

    var done = false;
    function onFail() {
      if (done || !sessionAlive(c)) { return; }
      done = true;
      handleStaticError(c, i);
    }
    function onEnded() {
      if (done || !sessionAlive(c)) { return; }
      done = true;
      c.timer = setTimeout(function () {
        if (!sessionAlive(c)) { return; }
        c.index = i + 1;
        staticSpeakNext(c);
      }, GAP_MS); // 句间 120ms
    }
    a.onended = onEnded;
    a.onerror = onFail;

    var url;
    try {
      url = resolveAudioUrl(c.contentId, c.entry, i);
      a.src = url;
      preloadNext(c.contentId, c.entry, i + 1); // 预载下一句
    } catch (err) {
      onFail();
      return;
    }
    var pp;
    try { pp = a.play(); } catch (err) { onFail(); return; }
    if (pp && typeof pp.catch === 'function') { pp.catch(onFail); }
  }

  function startStatic(contentId, entry, opts, token) {
    var sentences = (entry.sentences || []).map(function (s) { return String(s).trim(); })
      .filter(Boolean);
    if (!sentences.length) {
      fallbackToText(contentId, opts);
      return;
    }
    var c = {
      token: token, g: gen, kind: 'static', contentId: contentId,
      opts: opts || {}, entry: entry, sentences: sentences, index: 0,
      timer: null, fallbackStarted: false, started: false
    };
    current = c;
    beginSession(c);
    staticSpeakNext(c);
  }

  /* ------------------------------------------------------------
   * 原生语音引擎：逐句 utterance（zh 语音优选、rate=1、pitch=1）
   * ---------------------------------------------------------- */
  function nativeSpeakNext(c) {
    if (!sessionAlive(c)) { return; }
    var i = c.index;
    var total = c.sentences.length;
    if (i >= total) { finishSession(c); return; }

    safeCall(c.opts.onSentence, [i, total]); // 每句播前回调

    var u;
    try { u = new SpeechSynthesisUtterance(c.sentences[i]); } catch (err) {
      console.warn('[TTS] 创建 SpeechSynthesisUtterance 失败，跳过第 ' + (i + 1) + ' 句。');
      c.index = i + 1;
      nativeSpeakNext(c);
      return;
    }
    u.lang = 'zh-CN';
    u.rate = 1;
    u.pitch = 1;
    var v = pickZhVoice();
    if (v) { try { u.voice = v; } catch (err) { /* 忽略 */ } }

    var done = false;
    function advance() {
      if (done || !sessionAlive(c)) { return; }
      done = true;
      c.timer = setTimeout(function () {
        if (!sessionAlive(c)) { return; }
        c.index = i + 1;
        nativeSpeakNext(c);
      }, NATIVE_STEP_MS);
    }
    u.onend = advance;
    u.onerror = function (e) {
      if (done || !sessionAlive(c)) { return; }
      var code = (e && e.error) || '';
      if (code === 'interrupted' || code === 'canceled') { return; } // 主动取消，会话已死
      console.warn('[TTS] 原生语音第 ' + (i + 1) + ' 句出错(' + code + ')，自动跳过。');
      advance();
    };
    try { win.speechSynthesis.speak(u); } catch (err) {
      console.warn('[TTS] speechSynthesis.speak 抛错：' + (err && err.message || err));
      advance();
    }
  }

  function startNative(text, opts, token) {
    var sentences = split(text);
    if (!sentences.length) { return false; }
    var c = {
      token: token, g: gen, kind: 'native', contentId: null,
      opts: opts || {}, sentences: sentences, index: 0,
      timer: null, started: false
    };
    current = c;
    beginSession(c);
    nativeSpeakNext(c);
    return true;
  }

  function fallbackToText(contentId, opts) {
    var fb = (opts && typeof opts.fallbackText === 'string') ? opts.fallbackText.trim() : '';
    if (fb) {
      speakText(fb, opts);
    } else {
      console.warn('[TTS] manifest 中无「' + contentId + '」且未提供 fallbackText，无法朗读。');
    }
  }

  /* ------------------------------------------------------------
   * Edge-tts 侧端引擎（动态文本主路径，晓晓同音色）
   *   fetch /api/tts → 逐句 mp3(base64) → Blob → blob URL → 单个 <audio> 逐句播放
   *   任一步失败静默回退原生，保证浏览器能力不受损，且不漏句、不重叠。
   * ---------------------------------------------------------- */
  function base64ToUint8(b64) {
    var bin = win.atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) { bytes[i] = bin.charCodeAt(i); }
    return bytes;
  }

  // 与本地 split(text) 按顺序对齐：返回句 text 一致则用其 audioBase64，否则该句走原生。
  // truncated 时返回值少于本地句数，剩余句天然落为 native 兜底。
  function buildEdgePlan(c, local, data) {
    var returned = (data && Array.isArray(data.sentences)) ? data.sentences : [];
    var n = local.length;
    var k = returned.length;
    var plan = [];
    for (var idx = 0; idx < n; idx++) {
      var localText = local[idx];
      var r = (idx < k) ? returned[idx] : null;
      var entry = { mode: 'native', text: localText, blob: null };
      if (r && typeof r === 'object' &&
          typeof r.audioBase64 === 'string' && r.audioBase64.length &&
          String(r.text || '').trim() === localText) {
        try {
          var bytes = base64ToUint8(r.audioBase64);
          var blob = new Blob([bytes], { type: 'audio/mpeg' });
          var url = URL.createObjectURL(blob);
          entry.mode = 'edge';
          entry.blob = url;
          c.blobUrls.push(url); // 记账以便统一释放
        } catch (err) {
          entry.mode = 'native'; entry.blob = null; // 单句解码出错：该句走原生
        }
      }
      plan.push(entry);
    }
    return plan;
  }

  // edge 路径静默回退原生：同一会话内无声切换引擎（start/end 事件只派发一次）
  function edgeFallback(c, text, opts, localSentences) {
    if (!sessionAlive(c) || c.fallbackStarted) { return; }
    c.fallbackStarted = true;
    clearBlobUrls(c);
    c.kind = 'native';
    var s = split(text);
    c.sentences = s.length ? s : localSentences;
    c.index = 0;
    if (!c.sentences.length) { finishSession(c); return; }
    nativeSpeakNext(c);
  }

  function edgeSpeakNext(c) {
    if (!sessionAlive(c)) { return; }
    var i = c.index;
    var total = c.sentences.length;
    if (i >= total) { finishSession(c); return; }

    safeCall(c.opts.onSentence, [i, total]); // 每句播前回调，驱动逐句高亮

    var s = c.sentences[i];

    // 原生兜底句（合成缺漏/失配/截断）：用 speechSynthesis 读这一句
    if (s.mode === 'native') {
      var u;
      try { u = new SpeechSynthesisUtterance(s.text); } catch (err) {
        c.index = i + 1;
        edgeSpeakNext(c);
        return;
      }
      u.lang = 'zh-CN'; u.rate = 1; u.pitch = 1;
      var v = pickZhVoice();
      if (v) { try { u.voice = v; } catch (err) { /* 忽略 */ } }
      var dn = false;
      function advN() {
        if (dn || !sessionAlive(c)) { return; }
        dn = true;
        c.timer = setTimeout(function () {
          if (!sessionAlive(c)) { return; }
          c.index = i + 1;
          edgeSpeakNext(c);
        }, GAP_MS);
      }
      u.onend = advN;
      u.onerror = function (e) {
        if (dn || !sessionAlive(c)) { return; }
        var code = (e && e.error) || '';
        if (code === 'interrupted' || code === 'canceled') { return; } // 主动取消
        console.warn('[TTS] edge 路径原生句第 ' + (i + 1) + ' 句出错(' + code + ')，跳过。');
        advN();
      };
      try { win.speechSynthesis.speak(u); } catch (err) { advN(); }
      return;
    }

    // edge 句：单个隐藏 <audio> 播放 blob URL（复用静态同款机制）
    var a = ensureAudioEl();
    if (!a) { finishSession(c); return; }
    var de = false;
    function onEdgeEnded() {
      if (de || !sessionAlive(c)) { return; }
      de = true;
      c.timer = setTimeout(function () {
        if (!sessionAlive(c)) { return; }
        c.index = i + 1;
        edgeSpeakNext(c);
      }, GAP_MS); // 句间 120ms，与静态一致
    }
    function onEdgeFail() {
      if (de || !sessionAlive(c)) { return; }
      de = true;
      console.warn('[TTS] edge-tts 第 ' + (i + 1) + ' 句音频播放失败，该句改走原生。');
      s.mode = 'native'; // 仅该句回退，保句序不重叠
      s.blob = null;
      edgeSpeakNext(c);
    }
    a.onended = onEdgeEnded;
    a.onerror = onEdgeFail;
    try {
      a.src = s.blob;
      var pp = a.play();
      if (pp && typeof pp.catch === 'function') { pp.catch(onEdgeFail); }
    } catch (err) {
      onEdgeFail();
    }
  }

  function speakTextEdge(text, opts, token) {
    opts = opts || {};
    var localSentences = split(text);
    var c = {
      token: token, g: gen, kind: 'edge', contentId: null,
      opts: opts, sentences: [], index: 0,
      timer: null, started: false,
      controller: null, blobUrls: [], fallbackStarted: false, signalTimer: null
    };
    current = c;
    beginSession(c); // 先派发 speakingstart，异步拉取期间 isSpeaking() 即返回真

    var controller = null;
    if (typeof AbortController === 'function') {
      try { controller = new AbortController(); } catch (err) { controller = null; }
    }
    c.controller = controller;
    c.signalTimer = setTimeout(function () {
      if (c.controller) { try { c.controller.abort(); } catch (err) { /* 忽略 */ } }
    }, EDGE_TIMEOUT_MS); // 整体前端超时

    var fetchPromise;
    try {
      fetchPromise = fetch(resolveTtsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text }),
        signal: c.controller ? c.controller.signal : undefined
      });
    } catch (err) {
      if (sessionAlive(c)) { edgeFallback(c, text, opts, localSentences); }
      return;
    }

    fetchPromise
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (data) {
        if (!sessionAlive(c)) { return; } // 播前已被 stop/替换 → 直接放弃（teardown 已清 blob）
        var plan = buildEdgePlan(c, localSentences, data);
        var hasSound = plan.some(function (p) { return p.mode === 'edge'; });
        if (!hasSound || !c.blobUrls.length) { throw new Error('无可用 edge 音频'); }
        c.sentences = plan;
        c.index = 0;
        edgeSpeakNext(c);
      })
      .catch(function (err) {
        // 失败/超时/解析失败/无音频：静默回退原生，绝不让未捕获 Promise 污染 console
        if (sessionAlive(c)) {
          console.warn('[TTS] edge-tts 侧端合成失败/超时（' + (err && err.message || err) + '），回退原生朗读。');
          edgeFallback(c, text, opts, localSentences);
        }
      });
  }

  /* ------------------------------------------------------------
   * 公开朗读入口 speakText / speakContent（全局只允许一路，新播放先停旧的）
   * ---------------------------------------------------------- */
  function speakText(text, opts) {
    opts = opts || {};
    if (typeof text !== 'string' || !text.trim()) { return false; }
    stopAndNotify('replaced'); // 先停旧的
    if (!supportsNative()) {
      console.warn('[TTS] 当前浏览器不支持原生语音朗读（speechSynthesis 不可用）。');
      safeCall(opts.onUnavailable, '当前浏览器不支持语音朗读');
      return false;
    }
    if (!split(text).length) { return false; }
    var token = ++tokenSeq;
    if (engines['edge-tts'].supported()) {
      speakTextEdge(text, opts, token); // 异步推进会话；内部已做好回退原生
    } else {
      startNative(text, opts, token);
    }
    return token;
  }

  function speakContent(contentId, opts) {
    opts = opts || {};
    if (!contentId) { return false; }
    stopAndNotify('replaced'); // 先停旧的（含挂起）
    var rec = { token: ++tokenSeq, contentId: String(contentId), opts: opts, g: gen };
    pending = rec;

    loadManifest().then(function (m) {
      if (pending !== rec || rec.g !== gen) { return; } // 已被更新的朗读/stop 取代
      pending = null;
      var entry = findEntry(m, rec.contentId);
      if (entryIsUsable(entry)) {
        startStatic(rec.contentId, entry, rec.opts, rec.token);
      } else {
        // 缺失项：回退文本朗读（fallbackText 或入口存在时由播放失败路径 join 句子）
        fallbackToText(rec.contentId, rec.opts);
      }
    }).catch(function (err) {
      if (pending === rec) { pending = null; }
      console.warn('[TTS] speakContent 处理中断：', err);
    });
    return rec.token;
  }

  function stop() {
    return stopAndNotify('user');
  }

  function isSpeaking() {
    return !!(current || pending);
  }

  function activeToken() {
    if (current) { return current.token; }
    if (pending) { return pending.token; }
    return 0;
  }

  function toggle(cfg) {
    cfg = cfg || {};
    if (isSpeaking()) { return stop(); }
    if (cfg.contentId) { return speakContent(cfg.contentId, cfg); }
    if (typeof cfg.text === 'string' && cfg.text.trim()) { return speakText(cfg.text, cfg); }
    return false;
  }

  /* ------------------------------------------------------------
   * 样式注入（只注入一次，不侵入页面其它样式）
   * ---------------------------------------------------------- */
  function ensureStyle() {
    if (doc.getElementById('ww-tts-style')) { return; }
    var st = doc.createElement('style');
    st.id = 'ww-tts-style';
    st.textContent = TTS_CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ------------------------------------------------------------
   * 朗读按钮（createReadButton）
   * ---------------------------------------------------------- */
  function setBtnActive(btn, data, active) {
    data.active = !!active;
    btn.classList.toggle('tts-read-btn--active', !!active);
    btn.setAttribute('aria-label', active ? '停止' : '朗读');
  }

  function markUnavailable(btn, data, cfg, msg) {
    if (data.unavailableShown) { return; }
    data.unavailableShown = true;
    setBtnActive(btn, data, false);
    btn.disabled = true;
    btn.classList.add('tts-read-btn--unavailable');
    btn.setAttribute('aria-disabled', 'true');
    showToast(msg || '当前浏览器不支持语音朗读');
    safeCall(cfg.onUnavailable, [msg || '当前浏览器不支持语音朗读']);
  }

  function createReadButton(cfg) {
    cfg = cfg || {};
    var container = cfg.container;
    if (!container || !container.nodeType || container.nodeType !== 1 ||
        typeof container.appendChild !== 'function') {
      return false; // container 为 null 或不可用：自动放弃（页面可自行隐藏占位）
    }
    var contentId = cfg.contentId ? String(cfg.contentId) : '';
    var text = (typeof cfg.text === 'string') ? cfg.text : '';
    var fallbackText = (typeof cfg.fallbackText === 'string' && cfg.fallbackText.trim())
      ? cfg.fallbackText
      : text;

    ensureStyle();

    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'tts-read-btn';
    btn.setAttribute('aria-label', '朗读');
    btn.innerHTML = ICON_SVG;

    var data = { active: false, token: 0, unavailableShown: false };

    btn.addEventListener('click', function () {
      // 本按钮正在朗读（或挂起）→ 点击即停止；否则启动/切换到本按钮内容
      if (data.token && data.token === activeToken() && isSpeaking()) {
        stop();
        return;
      }
      var opts = {
        fallbackText: fallbackText,
        onStart: function () { setBtnActive(btn, data, true); },
        onEnd: function () { setBtnActive(btn, data, false); },
        onCancel: function () { setBtnActive(btn, data, false); },
        onUnavailable: function (msg) { markUnavailable(btn, data, cfg, msg); }
      };
      var t;
      if (contentId) {
        t = speakContent(contentId, opts);
      } else if (text && text.trim()) {
        t = speakText(text, opts);
      } else {
        console.warn('[TTS] createReadButton：cfg 未提供 contentId 或 text，按钮无内容可读。');
        return;
      }
      if (t) { data.token = t; }
    });

    if (cfg.insertEl && container.contains && container.contains(cfg.insertEl)) {
      container.insertBefore(btn, cfg.insertEl);
    } else {
      container.appendChild(btn);
    }
    return btn;
  }

  /* ------------------------------------------------------------
   * 逐句高亮工具（prepareHighlight / setHighlight / clearHighlight / resetHighlight）
   * ---------------------------------------------------------- */
  function scopeOf(el) {
    for (var i = 0; i < hlScopes.length; i++) {
      if (hlScopes[i] && hlScopes[i].el === el) { return hlScopes[i]; }
    }
    return null;
  }

  function removeScope(scope) {
    var idx = hlScopes.indexOf(scope);
    if (idx !== -1) { hlScopes.splice(idx, 1); }
  }

  function unwrapElement(el) {
    var spans;
    try { spans = Array.prototype.slice.call(el.querySelectorAll('.tts-s')); }
    catch (err) { spans = []; }
    spans.forEach(function (sp) {
      if (!sp.parentNode) { return; }
      while (sp.firstChild) { sp.parentNode.insertBefore(sp.firstChild, sp); }
      sp.parentNode.removeChild(sp);
    });
    el.removeAttribute('data-tts-prepared');
  }

  function prepareHighlight(elOrArray) {
    if (!doc || !elOrArray) { return []; }
    var list = (Array.isArray(elOrArray) || (elOrArray.length !== undefined && elOrArray.nodeType === undefined))
      ? Array.prototype.slice.call(elOrArray)
      : [elOrArray];
    var allSpans = [];
    var idx = 0;

    function wrapOne(el) {
      if (!el || el.nodeType !== 1) { return; }
      // 已被重新渲染（旧的 span 不在了）→ 先清掉旧标记再重包
      if (el.getAttribute('data-tts-prepared') === '1') {
        if (el.querySelector('.tts-s')) { return; } // 已包好，幂等跳过
        var old = scopeOf(el);
        if (old) { removeScope(old); }
        el.removeAttribute('data-tts-prepared');
      }
      var walker;
      try {
        walker = doc.createTreeWalker(el, SHOW_TEXT, {
          acceptNode: function () { return ACCEPT; }
        });
      } catch (err) {
        console.warn('[TTS] 当前浏览器不支持 TreeWalker，跳过高亮包装。');
        return;
      }
      var nodes = [];
      var n;
      while ((n = walker.nextNode()) !== null) { nodes.push(n); }

      var spans = [];
      nodes.forEach(function (tn) {
        var text = tn.nodeValue || '';
        if (!text.trim()) { return; } // 纯空白节点保持原样（不占 data-i）
        var pieces = splitToFragments(text);
        var parent = tn.parentNode;
        if (!parent) { return; }
        if (pieces.length === 1) {
          var s1 = doc.createElement('span');
          s1.className = 'tts-s';
          s1.setAttribute('data-i', String(idx++));
          s1.appendChild(doc.createTextNode(pieces[0]));
          parent.replaceChild(s1, tn);
          spans.push(s1);
          return;
        }
        var frag = doc.createDocumentFragment();
        pieces.forEach(function (piece) {
          if (!piece.trim()) {
            frag.appendChild(doc.createTextNode(piece)); // 纯空白原样保留
            return;
          }
          var sp = doc.createElement('span');
          sp.className = 'tts-s';
          sp.setAttribute('data-i', String(idx++));
          sp.appendChild(doc.createTextNode(piece));
          frag.appendChild(sp);
          spans.push(sp);
        });
        parent.replaceChild(frag, tn);
      });

      el.setAttribute('data-tts-prepared', '1');
      var scope = { el: el, spans: spans };
      hlScopes.push(scope);
      allSpans.push.apply(allSpans, spans);
    }

    list.forEach(wrapOne);
    return allSpans;
  }

  function setHighlight(i) {
    if (!hlScopes.length) { return false; }
    var idx = (typeof i === 'number') ? i : parseInt(i, 10);
    if (isNaN(idx)) { return false; }

    // 先清掉上一句高亮
    hlScopes.forEach(function (scope) {
      if (!scope || !scope.el) { return; }
      if (scope.el.classList) { scope.el.classList.remove('tts-active'); }
      scope.spans.forEach(function (sp) {
        if (sp && sp.classList) { sp.classList.remove('tts-s--active'); }
      });
    });

    // 找到 data-i 对应句 span
    var hit = null;
    hlScopes.forEach(function (scope) {
      if (hit) { return; }
      scope.spans.forEach(function (sp) {
        if (hit || !sp) { return; }
        if (Number(sp.getAttribute('data-i')) === idx) { hit = sp; }
      });
    });
    if (hit) { hit.classList.add('tts-s--active'); return true; }

    // tolerant 退化：找不到对应句 → 整块加 .tts-active
    hlScopes.forEach(function (scope) {
      if (scope && scope.el && scope.el.classList) { scope.el.classList.add('tts-active'); }
    });
    return false;
  }

  function clearHighlightAPI() {
    clearHighlight();
    return true;
  }

  function resetHighlight(elOrArray) {
    var scopes;
    if (elOrArray) {
      var list = (Array.isArray(elOrArray) || (elOrArray.length !== undefined && elOrArray.nodeType === undefined))
        ? Array.prototype.slice.call(elOrArray)
        : [elOrArray];
      scopes = [];
      list.forEach(function (el) {
        var sc = scopeOf(el);
        if (sc) { scopes.push(sc); }
        else if (el && el.nodeType === 1) {
          // 未登记但可能仍残留 span 的容器
          var s = { el: el, spans: [] };
          scopes.push(s);
        }
      });
    } else {
      scopes = hlScopes.slice();
    }
    scopes.forEach(function (scope) {
      if (!scope) { return; }
      unwrapElement(scope.el); // 移除 span，文本节点按原顺序还原
      removeScope(scope);
    });
    return true;
  }

  /* ------------------------------------------------------------
   * 自动停止：切后台 / 关闭页面 → stop（stop 内部会派发 speakingcancel）
   * ---------------------------------------------------------- */
  function bindAutoStop() {
    if (autoStopBound) { return; }
    autoStopBound = true;
    function onHidden() {
      if (doc.hidden) { stop(); }
    }
    function onUnload() { stop(); }
    doc.addEventListener('visibilitychange', onHidden);
    if (win.addEventListener) {
      win.addEventListener('pagehide', onUnload);
      win.addEventListener('beforeunload', onUnload);
    }
  }

  /* ------------------------------------------------------------
   * 组装并暴露全局单例
   * ---------------------------------------------------------- */
  var api = {
    loadManifest: loadManifest,
    supportsNative: supportsNative,
    split: split,
    speakContent: speakContent,
    speakText: speakText,
    stop: stop,
    isSpeaking: isSpeaking,
    toggle: toggle,
    createReadButton: createReadButton,
    prepareHighlight: prepareHighlight,
    setHighlight: setHighlight,
    clearHighlight: clearHighlightAPI,
    resetHighlight: resetHighlight,
    bindAutoStop: bindAutoStop,
    engines: engines
  };
  Object.defineProperty(api, 'manifest', {
    enumerable: true,
    configurable: false,
    get: function () { return manifest; } // undefined=未加载 / null=加载失败 / object=成功
  });
  // 只读快照，避免页面误改注册表
  if (typeof Object.freeze === 'function') { Object.freeze(api); }

  win.WoodWhisperTTS = api;

  // 默认绑定一次页面生命周期自动停止（stop 幂等，重复调用无副作用）
  bindAutoStop();

  console.log('[TTS] WoodWhisperTTS 公共朗读运行时已就绪（static-audio → edge-tts → native → local 预留）。');
})(typeof window !== 'undefined' ? window : null,
   typeof document !== 'undefined' ? document : null);

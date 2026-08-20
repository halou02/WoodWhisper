/* 传承页交互逻辑：卡片、弹窗、年轮、粒子与匠语互动。 */

    /* ============================================================
     * 传承页 · 交互逻辑
     * 分层解耦：数据层 / 渲染层 / 交互层 分离
     * ============================================================ */

    // 大师资料已拆至 js/inherit-data.js，便于独立维护。

    // ===== 【状态层】 =====
    var isDarkMode = true; // 默认夜间模式
    var longPressTimer = null;
    var particleCount = 0;
    var MAX_PARTICLES = 30; // 木屑粒子上限
    var featuredTicking = false; // rAF 节流标记：防止同一帧内多次计算焦点卡片
    var parallaxTicking = false; // rAF 节流标记：视差滚动
    var lastScrollY = 0;
    var particleSpawnAccumulator = 0;
    var lastJiangyuTrigger = null;

    // ===== 【DOM 引用】预先抓取，避免重复查询 =====
    var page = document.getElementById('inheritPage');
    var cardsScroll = document.getElementById('cardsScroll');
    var cardsSection = document.getElementById('cardsSection');
    var masterModal = document.getElementById('masterModal');
    var modalClose = document.getElementById('modalClose');
    var modalAvatarWrap = document.getElementById('modalAvatarWrap');
    var modalName = document.getElementById('modalName');
    var modalLevel = document.getElementById('modalLevel');
    var modalStory = document.getElementById('modalStory');
    var triviaBubble = document.getElementById('triviaBubble');
    var particlesContainer = document.getElementById('particlesContainer');
    var parallaxOverlay = document.getElementById('parallaxOverlay');
    var darkModeBtn = document.getElementById('darkModeBtn');
    var btnViewMasters = document.getElementById('btnViewMasters');
    var btnMyPersistence = document.getElementById('btnMyPersistence');

    // ===== 【年轮弹窗 v3 DOM引用】所有新弹窗元素 =====
    // 人话讲：一次性把所有要用的DOM元素都取出来存变量里，避免每次操作都querySelector
    var ringModal = document.getElementById('ringModal');
    var ringOverlay = document.getElementById('ringOverlay');
    var ringPanel = document.getElementById('ringPanel');
    var ringClose = document.getElementById('ringClose');
    var ringBoard = document.getElementById('ringBoard');
    var ringSvg = document.getElementById('ringSvg');
    var ringInput = document.getElementById('ringInput');
    var ringResult = document.getElementById('ringResult');
    var ringCenterSeal = document.getElementById('ringCenterSeal');
    var ringParticles = document.getElementById('ringParticles');
    var ringHint = document.getElementById('ringHint');
    var ringActionsStart = document.getElementById('ringActionsStart');
    var ringActionsFinish = document.getElementById('ringActionsFinish');
    var btnAutoCarve = document.getElementById('btnAutoCarve');
    var btnManualCarve = document.getElementById('btnManualCarve');
    var btnSaveImage = document.getElementById('btnSaveImage');
    var btnCopyText = document.getElementById('btnCopyText');
    var btnBackToPage = document.getElementById('btnBackToPage');
    var ringSaveOverlay = document.getElementById('ringSaveOverlay');
    var ringSaveImg = document.getElementById('ringSaveImg');
    var btnCloseSave = document.getElementById('btnCloseSave');
    var ringToast = document.getElementById('ringToast');
    // 用户手动绘制轨迹：3条线，每条对应一个金线path和阴影path
    var userTracePaths = [
      document.getElementById('ringUserTrace1'),
      document.getElementById('ringUserTrace2'),
      document.getElementById('ringUserTrace3')
    ];
    var userTraceShadows = [
      document.getElementById('ringUserTraceShadow1'),
      document.getElementById('ringUserTraceShadow2'),
      document.getElementById('ringUserTraceShadow3')
    ];
    var ringTracesGold = ringSvg.querySelectorAll('.ring-trace--gold');
    var ringTracesShadow = ringSvg.querySelectorAll('.ring-trace--shadow');
    var ringDots = ringSvg.querySelectorAll('.ring-dot');

    // ===== 【年轮弹窗状态变量】=====
    // 在干什么：记录弹窗当前状态，避免重复操作/动画冲突
    var isRingModalOpen = false;     // 弹窗是否打开
    var isCarving = false;           // 是否正在镌刻动画中（防止重复点击）
    var manualDrawing = false;       // 手动镌刻模式：是否正在画线
    var manualPathPoints = [];       // 手动镌刻：当前正在画的这一条线的触摸点数组
    var manualLinesCount = 0;        // 手动镌刻：已经画完的线条数（0/1/2/3）
    var manualAllPaths = [];         // 手动镌刻：存储所有已画完的线的点数组，用于保存图片
    var currentTraceIndex = 0;       // 手动镌刻：当前正在画第几条线（0=第一条, 1=第二条, 2=第三条）
    var ringParticleCount = 0;       // 当前木板区木屑粒子数量
    var MAX_RING_PARTICLES = 20;     // 木板区粒子上限
    var ringAnimFrameId = null;      // requestAnimationFrame ID，用于取消动画
    var wasInFinishState = false;    // 关闭前是否处于完成态（决定是否触发卡片柔光）
    var lastMasterTrigger = null;    // 关闭人物详情后恢复焦点
    var lastRingTrigger = null;      // 关闭年轮互动后恢复焦点

    // ===== 【渲染层】渲染匠人卡片 =====
    // 在干什么：遍历 MASTERS 数组，每张卡片生成 HTML 拼进滚动容器。
    // 数据从哪来：MASTERS 数组。
    // 数据去哪：变成 DOM 显示在 .inherit-cards-scroll 里。
    //
    // 新手易错点：
    //   - 图片用 loading="lazy" 懒加载，非首屏卡片不急于加载。
    //   - onerror 处理图片加载失败：用 div + 首字占位，不显示裂图。
    //   验证：断网刷新页面，应看到首字占位而不是裂图。
    function renderCards() {
      var html = '';
      MASTERS.forEach(function(m, index) {
        var tagClass = 'inherit-card__tag';
        if (m.level === 'national') tagClass += ' inherit-card__tag--national';
        else if (m.level === 'provincial') tagClass += ' inherit-card__tag--provincial';
        else if (m.level === 'folk') tagClass += ' inherit-card__tag--folk';

        html += ''
          + '<div class="inherit-card" data-index="' + index + '" role="button" tabindex="0" aria-label="查看' + escapeHtml(m.name) + '的传承故事">'
          +   '<div class="inherit-card__img-wrap">'
          +     (m.portrait === false
                ? '<div class="inherit-card__placeholder" aria-label="' + escapeHtml(m.name) + '暂无公开肖像">' + escapeHtml(m.initial) + '</div>'
                : '<img class="inherit-card__img" src="' + escapeHtml(m.img) + '" alt="' + escapeHtml(m.name) + '" loading="lazy">')
          +     '<div class="inherit-card__seal" aria-label="长按查看' + escapeHtml(m.name) + '小故事">' + escapeHtml(m.initial) + '</div>'
          +   '</div>'
          +   '<div class="inherit-card__info">'
          +     '<h3 class="inherit-card__name">' + escapeHtml(m.name) + '</h3>'
          +     '<span class="' + tagClass + '">'
          +       '<span class="inherit-card__tag-line">潮州木雕</span>'
          +       '<span class="inherit-card__tag-line">传承人</span>'
          +     '</span>'
          +   '</div>'
          + '</div>';
      });
      cardsScroll.innerHTML = html;

      // 给每张图片绑定回退，占位符只在图片确实加载失败时出现。
      var allImgs = cardsScroll.querySelectorAll('.inherit-card__img');
      allImgs.forEach(function(img) {
        img.onerror = function() {
          var card = this.closest('.inherit-card');
          var idx = parseInt(card.getAttribute('data-index'), 10);
          if (isNaN(idx) || !MASTERS[idx]) return;
          var placeholder = document.createElement('div');
          placeholder.className = 'inherit-card__placeholder';
          placeholder.textContent = MASTERS[idx].initial;
          this.replaceWith(placeholder);
        };
      });

      // 初始默认居中卡片：动态查找 defaultCenter 标记的匠人（辜柳希，index=1）
      // 人话讲：这里必须用"双重 requestAnimationFrame"来延时，不能立即执行。
      //   浏览器会把 innerHTML、scrollIntoView、classList 修改全部攒在一起批量处理，
      //   如果在同一个渲染帧内既创建元素又添加 featured 类，浏览器会认为 featured 状态
      //   就是"初始状态"，不会触发过渡动画，甚至可能因渲染优化导致样式不生效。
      //   双重 rAF 确保：第一帧浏览器完成布局和首次绘制（卡片先以非焦点态渲染出来），
      //   第二帧再滚动到默认卡片并添加焦点类，此时浏览器能看到"从无到有"的变化，
      //   过渡动画正常触发、样式正确应用。
      // 新手易错点：
      //   - 不要用 setTimeout 0 代替 rAF，setTimeout 在事件循环中的时机不确定；
      //   - 单个 rAF 可能还在同一批渲染中，双重 rAF 才能确保至少一帧已绘制；
      //   - scrollIntoView 会触发 scroll 事件，scroll 事件里也会调用 updateFeaturedCard，
      //     所以最终效果是：先滚动到位，然后焦点类正确添加并播放过渡动画。
      //   验证：页面加载后，辜柳希卡片应在正中央，比其他卡片大且亮，过渡动画自然完成。
      var defaultIndex = MASTERS.findIndex(function(m) { return m.defaultCenter; });
      if (defaultIndex === -1) defaultIndex = 1;

      // 人话讲：用 setTimeout 100ms 而非 requestAnimationFrame，确保：
      //   1) 浏览器完成 DOM 布局和首次绘制（卡片先以非焦点态显示）
      //   2) scrollIntoView 的滚动定位生效
      //   3) updateFeaturedCard 基于最终布局位置计算焦点卡片
      //   4) 最后移除 init 类启用过渡动画
      // 初始化阶段卡片容器带 .inherit-cards-scroll--init 类（transition:none），
      // 所以焦点状态的应用是瞬间跳变，不会出现动画卡死问题。
      setTimeout(function() {
        // 找真实区（非克隆）的默认卡片，避免 querySelector 选到前缀克隆里的同名卡片
        var defaultCard = cardsScroll.querySelector('.inherit-card[data-index="' + defaultIndex + '"]');
        if (defaultCard) {
          // 不用 scrollIntoView（会被 scroll-snap 干扰跳错位置），
          // 直接精确计算 scrollLeft = 卡片左偏移 - (容器宽 - 卡片宽)/2，使卡片居中
          var targetScrollLeft = defaultCard.offsetLeft - (cardsScroll.clientWidth - defaultCard.offsetWidth) / 2;
          cardsScroll.scrollLeft = targetScrollLeft;
          updateFeaturedCard();
          setTimeout(function() {
            cardsScroll.classList.remove('inherit-cards-scroll--init');
          }, 50);
        }
      }, 300);

    }

    // ===== 【交互层】卡片焦点态自动切换（v2 新增核心功能）=====
    // 在干什么：监听卡片容器的横向滚动事件，用 requestAnimationFrame 节流，
    //   计算每张卡片的中心点相对于容器可视区域中心的距离，
    //   距离最近的那张添加 .inherit-card--featured 类（放大突出），其余移除。
    //   实现"滑动时中间卡片自动放大"的错落焦点效果。
    //
    // 新手易错点：
    //   - scroll 事件触发频率极高（每秒几十次），必须用 rAF (requestAnimationFrame) 节流，
    //     否则会导致滚动卡顿。ticking 标记确保同一帧内只执行一次计算。
    //   - 计算距离时用 offsetLeft（布局坐标）获取卡片在滚动容器中的位置，
    //     再和容器的中心点比较，差值的绝对值越小说明越接近中心。
    //   - 用 offsetLeft + offsetWidth/2 计算卡片布局中心，不受 CSS transform 缩放影响；
    //     scroll-snap 对齐的也是布局位置，所以这种方式最准确。
    //   验证方法：左右滑动卡片，居中的那张应自动放大、加阴影、下沉；
    //             滑动过程流畅不卡顿；快速滑动时不会出现两张卡片同时放大的 bug。
    var currentFeaturedCard = null;

    function updateFeaturedCard() {
      var cards = cardsScroll.querySelectorAll('.inherit-card');
      if (cards.length === 0) {
        featuredTicking = false;
        return;
      }

      // 用布局坐标（offsetLeft/scrollLeft）计算中心点，而非 getBoundingClientRect 视觉坐标
      // 人话讲：getBoundingClientRect 会返回 CSS transform 缩放后的视觉位置，
      //   卡片放大缩小时视觉中心会"漂移"，导致计算结果反复横跳、过渡动画无法完成；
      //   offsetLeft 是 DOM 布局层面的坐标，不受 transform 影响，永远稳定。
      //   新手易错点：不要用 getBoundingClientRect 来判断 scroll-snap 的吸附位置，
      //     因为 snap 对齐的是布局位置，不是视觉位置。
      var containerCenterX = cardsScroll.scrollLeft + cardsScroll.clientWidth / 2;

      var closestCard = null;
      var closestDistance = Infinity;

      cards.forEach(function(card) {
        var cardCenterX = card.offsetLeft + card.offsetWidth / 2;
        var distance = Math.abs(cardCenterX - containerCenterX);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestCard = card;
        }
      });

      // 只有当焦点卡片真正变化时才切换类名，避免无意义的重绘打断过渡动画
      if (closestCard === currentFeaturedCard) {
        featuredTicking = false;
        return;
      }

      if (currentFeaturedCard) {
        currentFeaturedCard.classList.remove('inherit-card--featured');
      }
      closestCard.classList.add('inherit-card--featured');
      currentFeaturedCard = closestCard;

      featuredTicking = false;
    }

    // 监听卡片容器的 scroll 事件，用 rAF 节流
    // 新手易错点：这里监听的是 cardsScroll 的 scroll 事件（横向滚动），
    //   不是 window 的 scroll（竖向滚动）。不要搞混。
    // 卡片只保留一组真实数据，避免重复 DOM 和无障碍朗读。

    // scroll 事件中更新焦点卡片（rAF 节流，保证流畅）
    cardsScroll.addEventListener('scroll', function() {
      if (!featuredTicking) {
        requestAnimationFrame(updateFeaturedCard);
        featuredTicking = true;
      }
    });

    // ===== 【交互层】卡片点击 → 弹出详情弹窗 =====
    // 人话讲：用事件委托，在滚动容器上统一监听点击，
    //   而不是给每张卡片单独绑事件（省内存、好维护）。
     cardsScroll.addEventListener('click', function(e) {
      if (e.target.closest('.inherit-card__seal')) return;
      var card = e.target.closest('.inherit-card');
      if (!card) return;
      var index = parseInt(card.getAttribute('data-index'), 10);
      var m = MASTERS[index];
      if (!m) return;
      lastMasterTrigger = card;
       openMasterModal(m);
     });

    cardsScroll.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.inherit-card');
      if (!card || e.target.closest('.inherit-card__seal')) return;
      e.preventDefault();
      var index = parseInt(card.getAttribute('data-index'), 10);
      if (!MASTERS[index]) return;
      lastMasterTrigger = card;
      openMasterModal(MASTERS[index]);
    });

    // ===== 【交互层】手势方向识别 + 长按检测 =====
    // 在干什么：
    //   1) 手指按下时（无论是否按在卡片上）记录起点，初始化手势状态；
    //      若按在印章上同时启动长按计时器（1.5秒出小故事气泡）。
    //   2) 手指移动超过阈值后判断方向：
    //      - 横向位移 > 纵向位移 × 1.3 → 判定为横滑（卡片切换），
    //        由浏览器原生 overflow-x:auto + touch-action:pan-x 处理横向滚动。
    //      - 否则判定为竖滑（页面滚动），给容器加 lock-x 类，
    //        临时禁止 overflow-x，避免卡片跟着左右乱动。
    //   3) 只要手指移动超过 10px，就取消长按计时器（滑动不触发气泡）。
    //   4) 松手时重置方向锁、清除长按计时器；同时用 hasMoved 标记阻止滑动后的误点击弹窗。
    //   5) 桌面端滚轮/触控板横向滑动：wheel 事件将水平滚动量映射到卡片容器。
    //
    // 修复点：原代码 touchstart 里 `if (!card) return;` 导致手指按在卡片间隙/留白区时
    //   手势状态未初始化，滑动无法正确判定方向、lock-x 无法移除。
    //   现在无论从哪开始触摸都正确初始化，印章长按逻辑仅在触摸印章时生效。
    var longPressStartX = 0;
    var longPressStartY = 0;
    var LONG_PRESS_DURATION = 1500;
    var MOVE_THRESHOLD = 10;
    var LONGPRESS_CANCEL_THRESHOLD = 10;
    var gestureState = 'none'; // 'none' | 'horizontal' | 'vertical'
    var hasMoved = false; // 是否发生过滑动（用于阻止误点击弹窗）
    var longPressTriggered = false; // 长按是否已触发（用于阻止长按后的误点击）

    // 触摸开始：始终初始化手势跟踪；仅在触摸印章时启动长按计时
    cardsScroll.addEventListener('touchstart', function(e) {
      longPressStartX = e.touches[0].clientX;
      longPressStartY = e.touches[0].clientY;
      gestureState = 'none';
      hasMoved = false;
      longPressTriggered = false;
      cardsScroll.classList.remove('inherit-cards-scroll--lock-x');

      var card = e.target.closest('.inherit-card');
      var isOnSeal = !!e.target.closest('.inherit-card__seal');
      if (card && isOnSeal) {
        var index = parseInt(card.getAttribute('data-index'), 10);
        longPressTimer = setTimeout(function() {
          longPressTriggered = true;
          showTrivia(MASTERS[index].trivia);
        }, LONG_PRESS_DURATION);
      }
    }, { passive: true });

    cardsScroll.addEventListener('touchmove', function(e) {
      var dx = e.touches[0].clientX - longPressStartX;
      var dy = e.touches[0].clientY - longPressStartY;
      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);

      if (absDx > LONGPRESS_CANCEL_THRESHOLD || absDy > LONGPRESS_CANCEL_THRESHOLD) {
        hasMoved = true;
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }

      if (gestureState === 'none' && (absDx > MOVE_THRESHOLD || absDy > MOVE_THRESHOLD)) {
        if (absDx > absDy * 1.3) {
          gestureState = 'horizontal';
        } else {
          gestureState = 'vertical';
          cardsScroll.classList.add('inherit-cards-scroll--lock-x');
        }
      }
    }, { passive: true });

    function resetGesture() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      cardsScroll.classList.remove('inherit-cards-scroll--lock-x');
      setTimeout(function() { gestureState = 'none'; }, 100);
    }

    cardsScroll.addEventListener('touchend', resetGesture);
    cardsScroll.addEventListener('touchcancel', resetGesture);
    window.addEventListener('touchend', function() {
      cardsScroll.classList.remove('inherit-cards-scroll--lock-x');
      setTimeout(function() { gestureState = 'none'; }, 100);
    }, { passive: true });

    // 桌面端鼠标兼容（PC浏览器拖拽/长按）：同样不要求必须点在卡片上
    cardsScroll.addEventListener('mousedown', function(e) {
      longPressStartX = e.clientX;
      longPressStartY = e.clientY;
      hasMoved = false;
      longPressTriggered = false;
      gestureState = 'none';
      cardsScroll.classList.remove('inherit-cards-scroll--lock-x');

      var card = e.target.closest('.inherit-card');
      var isOnSeal = !!e.target.closest('.inherit-card__seal');
      if (card && isOnSeal) {
        var index = parseInt(card.getAttribute('data-index'), 10);
        longPressTimer = setTimeout(function() {
          longPressTriggered = true;
          showTrivia(MASTERS[index].trivia);
        }, LONG_PRESS_DURATION);
      }
    });

    cardsScroll.addEventListener('mousemove', function(e) {
      var absDx = Math.abs(e.clientX - longPressStartX);
      var absDy = Math.abs(e.clientY - longPressStartY);
      if (absDx > LONGPRESS_CANCEL_THRESHOLD || absDy > LONGPRESS_CANCEL_THRESHOLD) {
        hasMoved = true;
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
    });

    cardsScroll.addEventListener('mouseup', resetGesture);
    cardsScroll.addEventListener('mouseleave', resetGesture);

    // 桌面端滚轮/触控板水平滚动支持
    // 人话讲：笔记本触控板横向双指滑动浏览卡片；竖滑优先放行页面滚动。
    // 新手易错点：
    //   - deltaY 是竖向滚动量（上下滚），deltaX 是横向滚动量（左右滚）。
    //   - 如果竖滑幅度明显大于横滑（1.3倍判定），直接 return 不拦截，让页面正常上下滚。
    //   - 只有横滑为主时，才把滚动量映射到卡片容器的 scrollLeft，并阻止默认行为。
    //   验证：鼠标滚轮在卡片区上下滚，页面应正常上下走；触控板横滑，卡片应左右走。
    cardsScroll.addEventListener('wheel', function(e) {
      var deltaX = e.deltaX;
      var deltaY = e.deltaY;

      // 竖滑主导：放行，不拦截页面滚动
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
        return;
      }

      // 横滑主导：将滚动量映射到卡片容器横向滚动
      var scrollDelta = deltaX || deltaY;
      if (Math.abs(scrollDelta) > 0.5) {
        cardsScroll.scrollLeft += scrollDelta;
        e.preventDefault();
      }
    }, { passive: false });

    // 阻止滑动后/长按后的误点击：如果发生过滑动或长按已触发，拦截 click
    cardsScroll.addEventListener('click', function(e) {
      if (hasMoved || longPressTriggered) {
        e.stopPropagation();
        e.preventDefault();
        hasMoved = false;
        longPressTriggered = false;
        return;
      }
    }, true);

    // ===== 【交互层】显示 / 隐藏冷门小故事气泡 =====
    function showTrivia(text) {
      triviaBubble.textContent = text;
      triviaBubble.classList.add('visible');
      triviaBubble.setAttribute('aria-hidden', 'false');
      // 3 秒后自动消失
      setTimeout(function() {
        hideTrivia();
      }, 3000);
    }

    function hideTrivia() {
      triviaBubble.classList.remove('visible');
      triviaBubble.setAttribute('aria-hidden', 'true');
    }

    // ===== 【弹窗层】打开 / 关闭匠人详情弹窗 =====
    // 在干什么：把匠人数据填进 modal 各元素，加 .inherit-modal--open 显示。
    function openMasterModal(m) {
      // 头像：没有公开肖像时直接使用首字占位，有照片时才创建图片请求。
      modalAvatarWrap.innerHTML = '';
      if (m.portrait === false) {
        var placeholder = document.createElement('div');
        placeholder.className = 'inherit-modal__avatar-placeholder';
        placeholder.textContent = m.initial;
        placeholder.setAttribute('aria-label', m.name + '暂无公开肖像');
        modalAvatarWrap.appendChild(placeholder);
      } else {
        var avatarImg = document.createElement('img');
        avatarImg.className = 'inherit-modal__avatar';
        avatarImg.src = m.img;
        avatarImg.alt = m.name;
        avatarImg.onerror = function() {
          var placeholder = document.createElement('div');
          placeholder.className = 'inherit-modal__avatar-placeholder';
          placeholder.textContent = m.initial;
          this.replaceWith(placeholder);
        };
        modalAvatarWrap.appendChild(avatarImg);
      }

      modalName.textContent = m.name;
      modalLevel.textContent = m.levelText;
      // 根据级别设置对应的标签背景色类
      modalLevel.className = 'inherit-modal__level';
      if (m.level === 'national') modalLevel.classList.add('inherit-modal__level--national');
      else if (m.level === 'provincial') modalLevel.classList.add('inherit-modal__level--provincial');
      else if (m.level === 'folk') modalLevel.classList.add('inherit-modal__level--folk');
      modalStory.textContent = m.story;
      masterModal.classList.add('inherit-modal--open');
      masterModal.setAttribute('aria-hidden', 'false');
      modalClose.focus();

      // 弹窗打开时绑 Esc 关闭
      document.addEventListener('keydown', onEscCloseModal);
    }

    function closeMasterModal() {
      masterModal.classList.remove('inherit-modal--open');
      masterModal.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', onEscCloseModal);
      if (lastMasterTrigger) lastMasterTrigger.focus();
    }

    // Esc 键关闭弹窗（命名函数，方便 addEventListener/removeEventListener 配对）
    function onEscCloseModal(e) {
      if (e.key === 'Escape') closeMasterModal();
    }

    // 关闭按钮点击
    modalClose.addEventListener('click', closeMasterModal);

    // 点遮罩空白处关闭
    masterModal.addEventListener('click', function(e) {
      if (e.target === masterModal) closeMasterModal();
    });

    // ===== 【年轮弹窗 v3 工具函数】 =====

    // 设置弹窗状态：切换 start/carving/manual/finish 四种状态类
    // 人话讲：所有UI显示/隐藏都靠CSS状态类控制，JS只负责切类名
    // 新手易错点：必须先移除所有状态类，再添加新的，避免多个类同时存在导致样式冲突
    function setRingState(state) {
      ringModal.classList.remove('ring-modal--state-start', 'ring-modal--state-carving', 'ring-modal--state-manual', 'ring-modal--state-finish');
      ringModal.classList.add('ring-modal--state-' + state);
    }

    // 显示Toast轻提示：居中显示文字，duration毫秒后自动消失（默认1500ms）
    function showRingToast(msg, duration) {
      duration = duration || 1500;
      ringToast.textContent = msg;
      ringToast.classList.add('ring-toast--show');
      setTimeout(function() {
        ringToast.classList.remove('ring-toast--show');
      }, duration);
    }

    // 在木板区生成一粒木屑粒子：(x,y)是SVG viewBox坐标(0-300)
    // 人话讲：镌刻时在"刻刀位置"生成小木屑，CSS动画控制它飘落消失
    // 数据从哪来：自动镌刻时从path.getPointAtLength取点，手动镌刻时从触摸坐标转换
    // 新手易错点：
    //   - 要把SVG坐标(0-300)转换成木板div的百分比位置
    //   - 粒子上限MAX_RING_PARTICLES，超出就不生成，避免性能问题
    //   - --rx/--ry/--rot是CSS自定义属性，动画里var()引用实现随机飘落
    function spawnRingParticle(svgX, svgY) {
      if (ringParticleCount >= MAX_RING_PARTICLES) return;
      var p = document.createElement('div');
      p.className = 'ring-particle';
      // SVG坐标(0-300) → 百分比定位（适配任意尺寸木板）
      var pctX = (svgX / 300) * 100;
      var pctY = (svgY / 300) * 100;
      p.style.left = pctX + '%';
      p.style.top = pctY + '%';
      // 随机大小 3-7px，长方形模拟木屑
      var size = 3 + Math.random() * 4;
      p.style.width = size + 'px';
      p.style.height = (size + 1 + Math.random() * 2) + 'px';
      // 随机漂移方向：rx水平漂移(-15~15px)，ry向下漂移(10~30px)，rot旋转角度
      p.style.setProperty('--rx', ((Math.random() - 0.5) * 30) + 'px');
      p.style.setProperty('--ry', (10 + Math.random() * 20) + 'px');
      p.style.setProperty('--rot', ((Math.random() - 0.5) * 90) + 'deg');
      ringParticles.appendChild(p);
      ringParticleCount++;
      // 动画结束后自动移除粒子（1.2s动画+一点缓冲）
      setTimeout(function() {
        if (p.parentNode) p.remove();
        ringParticleCount--;
      }, 1300);
    }

    // 在木板中心附近爆发一堆木屑粒子（完成印章弹出时用）
    function burstRingParticles() {
      for (var i = 0; i < 12; i++) {
        var angle = (Math.PI * 2 / 12) * i;
        var dist = 10 + Math.random() * 30;
        var cx = 150 + Math.cos(angle) * dist;
        var cy = 150 + Math.sin(angle) * dist;
        spawnRingParticle(cx, cy);
      }
    }

    // 重置弹窗到初始状态：清空输入、重置轨迹、隐藏印章和点
    function resetRingModalState() {
      ringInput.value = '';
      // 清空3组用户绘制轨迹（金线+阴影）
      userTracePaths.forEach(function(path) {
        path.setAttribute('d', '');
        path.setAttribute('opacity', '0');
        path.style.transition = '';
      });
      userTraceShadows.forEach(function(shadow) {
        shadow.setAttribute('d', '');
        shadow.setAttribute('opacity', '0');
        shadow.style.transition = '';
      });
      ringCenterSeal.classList.remove('ring-seal-center--show');
      ringHint.textContent = '';
      // 重置鎏金弧线（阴影层+金线层都要重置）
      ringTracesGold.forEach(function(trace) {
        trace.setAttribute('opacity', '0');
        trace.style.opacity = '';
        trace.style.strokeDashoffset = '';
        trace.style.transition = '';
      });
      ringTracesShadow.forEach(function(trace) {
        trace.setAttribute('opacity', '0');
        trace.style.opacity = '';
        trace.style.strokeDashoffset = '';
        trace.style.transition = '';
      });
      ringDots.forEach(function(dot) {
        dot.setAttribute('opacity', '0');
        dot.style.opacity = '';
        dot.style.transition = '';
      });
      // 清空所有粒子
      ringParticles.innerHTML = '';
      ringParticleCount = 0;
      // 取消进行中的动画帧
      if (ringAnimFrameId) {
        cancelAnimationFrame(ringAnimFrameId);
        ringAnimFrameId = null;
      }
      btnAutoCarve.disabled = false;
      isCarving = false;
      manualDrawing = false;
      manualPathPoints = [];
      manualLinesCount = 0;
      manualAllPaths = [];
      currentTraceIndex = 0;
    }

    // ===== 【弹窗层】年轮弹窗 打开 / 关闭 =====

    // 打开弹窗：滑入面板，重置状态，锁定背景滚动
    function openRingModal() {
      if (isRingModalOpen) return;
      isRingModalOpen = true;
      lastRingTrigger = document.activeElement;
      wasInFinishState = false;
      resetRingModalState();
      setRingState('start');
      ringModal.classList.add('inherit-ring-modal--open');
      ringModal.setAttribute('aria-hidden', 'false');
      ringClose.focus();
      // 禁止背景页面滚动
      document.body.style.overflow = 'hidden';
      // 绑定Esc键关闭
      document.addEventListener('keydown', onRingEscClose);
    }

    // 关闭弹窗：滑出面板，解锁背景滚动
    // 如果是从完成态关闭，400ms动画结束后触发卡片柔光
    function closeRingModal() {
      if (!isRingModalOpen) return;
      // 检查关闭前是否在完成态
      wasInFinishState = ringModal.classList.contains('ring-modal--state-finish');
      isRingModalOpen = false;
      ringModal.classList.remove('inherit-ring-modal--open');
      ringModal.setAttribute('aria-hidden', 'true');
      // 恢复背景页面滚动
      document.body.style.overflow = '';
      // 解绑Esc键
      document.removeEventListener('keydown', onRingEscClose);
      if (lastRingTrigger && typeof lastRingTrigger.focus === 'function') lastRingTrigger.focus();
      // 400ms滑出动画结束后重置状态
      setTimeout(function() {
        resetRingModalState();
        setRingState('start');
        // 如果是完成后关闭，触发匠人卡片柔光联动
        if (wasInFinishState) {
          triggerCardGlow();
        }
      }, 420);
    }

    // Esc键关闭弹窗
    function onRingEscClose(e) {
      if (e.key === 'Escape' && isRingModalOpen) {
        closeRingModal();
      }
    }

    // ===== 【一键镌刻动画】自动画三条鎏金弧线 =====
    // 在干什么：依次动画画出三条弧线，每条600ms，用stroke-dashoffset实现"画线"效果
    // 数据从哪来：三条path的d属性写死在SVG里，getTotalLength()获取路径长度
    // 数据去哪：动画期间stroke-dashoffset从总长度变到0（线从无到有），同时生成木屑粒子
    function startAutoCarve() {
      if (isCarving) return;
      isCarving = true;
      setRingState('carving');
      btnAutoCarve.disabled = true;
      ringHint.textContent = '正在镌刻...';

      // 递归动画第index条弧线（0→1→2）
      function animateTrace(index) {
        // 三条都画完了 → 弹出守心印章 → 完成态
        if (index >= 3) {
          setTimeout(function() {
            ringCenterSeal.classList.add('ring-seal-center--show');
            burstRingParticles();
            setTimeout(function() {
              finishCarving();
            }, 800);
          }, 300);
          return;
        }

        var traceGold = ringTracesGold[index];
        var traceShadow = ringTracesShadow[index];
        var dot = ringDots[index];

        // 先亮起点白点
        dot.style.opacity = '1';
        dot.setAttribute('opacity', '1');
        // 显示弧线（阴影层和金线层都显示）
        traceGold.style.opacity = '1';
        traceGold.setAttribute('opacity', '1');
        traceShadow.style.opacity = '1';
        traceShadow.setAttribute('opacity', '1');

        // 获取路径实际总长度（以金线为准，阴影层路径一样长度相同）
        var totalLen = traceGold.getTotalLength ? traceGold.getTotalLength() : 80;
        traceGold.style.strokeDasharray = totalLen;
        traceGold.style.strokeDashoffset = totalLen;
        traceShadow.style.strokeDasharray = totalLen;
        traceShadow.style.strokeDashoffset = totalLen;

        var startTime = null;
        var duration = 600;
        var lastParticleTime = 0;

        // 用requestAnimationFrame逐帧动画
        function animateStep(ts) {
          if (!startTime) startTime = ts;
          var elapsed = ts - startTime;
          var progress = Math.min(elapsed / duration, 1);
          // 当前dashoffset：从totalLen线性变到0（两层同步动画）
          var curOffset = totalLen * (1 - progress);
          traceGold.style.strokeDashoffset = curOffset;
          traceShadow.style.strokeDashoffset = curOffset;

          // 每隔约50ms在笔尖位置生成木屑粒子（用金线层获取笔尖坐标）
          if (ts - lastParticleTime > 50 && progress < 1) {
            var point = traceGold.getPointAtLength(progress * totalLen);
            spawnRingParticle(point.x, point.y);
            lastParticleTime = ts;
          }

          if (progress < 1) {
            ringAnimFrameId = requestAnimationFrame(animateStep);
          } else {
            // 本条线画完，递归画下一条
            ringAnimFrameId = null;
            animateTrace(index + 1);
          }
        }
        ringAnimFrameId = requestAnimationFrame(animateStep);
      }

      // 从第一条开始画
      animateTrace(0);
    }

    // 镌刻完成：切换到finish状态，更新结果文案（如果用户输入了文字就插入到文案中间）
    function finishCarving() {
      isCarving = false;
      btnAutoCarve.disabled = false;
      ringHint.textContent = '';
      setRingState('finish');
      // 发光描边+端点白点淡出，留下木板原有的刻痕
      // 人话讲：先设置transition（下一帧生效），再设opacity触发动画；直接同帧设置会被浏览器合并导致无动画
      // 新手易错：setAttribute和style.transition在同一帧执行时，浏览器可能跳过过渡，需要用requestAnimationFrame分隔
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          ringTracesGold.forEach(function(trace) {
            trace.style.transition = 'opacity 0.8s ease';
            trace.style.opacity = '0';
          });
          ringTracesShadow.forEach(function(trace) {
            trace.style.transition = 'opacity 0.8s ease';
            trace.style.opacity = '0';
          });
          ringDots.forEach(function(dot) {
            dot.style.transition = 'opacity 0.8s ease';
            dot.style.opacity = '0';
          });
          // 用户亲手画的3条线保留显示，不淡出！让用户能看到自己的作品
        });
      });
      // 如果用户输入了文字，把它插入到结果文案中
      var userText = ringInput.value.trim();
      if (userText) {
        ringResult.innerHTML = '你刻下了自己的坚持<br>'
          + '<span style="color:#9c2424;font-weight:700;display:inline-block;margin:3px 0;">「' + escapeHtml(userText) + '」</span><br>'
          + '以刀刻木，以心守艺；<br>长久坚持，皆被看见。';
      } else {
        ringResult.innerHTML = '以刀刻木，以心守艺；<br>岁月奔赴所爱，<br>长久坚持，皆被看见。';
      }
    }

    // ===== 【手动顺纹雕刻】手指沿木板滑动画线 =====
    // 在干什么：切换到manual状态，用户手指在SVG上滑动时动态绘制path
    // 新手易错点：
    //   - 必须把clientX/clientY屏幕坐标转换成SVG viewBox坐标(0-300)
    //   - 转换公式：svgX = (clientX - rect.left) * (300 / rect.width)
    //   - touch-action:none已在CSS设置，防止滑动时页面被拖动
    //   - 需要画3条线才完成，每条线存在自己的path里，不会被覆盖
    function startManualCarve() {
      if (isCarving) return;
      setRingState('manual');
      ringHint.textContent = '沿年轮纹路，刻下第一条线';
      manualPathPoints = [];
      manualDrawing = false;
      manualLinesCount = 0;
      manualAllPaths = [];
      currentTraceIndex = 0;
      // 清空所有3组用户轨迹，只激活第1组
      userTracePaths.forEach(function(path, i) {
        path.setAttribute('d', '');
        path.setAttribute('opacity', i === 0 ? '1' : '0');
        path.style.opacity = i === 0 ? '1' : '0';
      });
      userTraceShadows.forEach(function(shadow, i) {
        shadow.setAttribute('d', '');
        shadow.setAttribute('opacity', i === 0 ? '1' : '0');
        shadow.style.opacity = i === 0 ? '1' : '0';
      });
      // 白点亮起作为引导点
      ringDots.forEach(function(dot) {
        dot.style.opacity = '0.7';
        dot.setAttribute('opacity', '0.7');
      });
      // 引导弧线半透明显示（阴影层和金线层都要显示）
      ringTracesGold.forEach(function(trace) {
        trace.style.opacity = '0.3';
        trace.setAttribute('opacity', '0.3');
      });
      ringTracesShadow.forEach(function(trace) {
        trace.style.opacity = '0.3';
        trace.setAttribute('opacity', '0.3');
      });
    }

    // 坐标转换：屏幕坐标 → SVG viewBox坐标(0-300)
    // 人话讲：因为内层wrapper有scale(1.55)放大裁切白边，点击位置要除以1.55还原缩放，再映射到SVG的0-300坐标系
    // 新手易错：直接用board容器坐标除以宽度是错的，因为中间隔了一层scale变换，中心对齐的缩放要从中心点反向计算
    function getSvgCoord(clientX, clientY) {
      var rect = ringBoard.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;
      var vdx = clientX - cx;
      var vdy = clientY - cy;
      var pdx = vdx / 1.55;
      var pdy = vdy / 1.55;
      var scale = 300 / rect.width;
      return {
        x: 150 + pdx * scale,
        y: 150 + pdy * scale
      };
    }

    // 手指/鼠标按下：开始画线
    function onManualStart(e) {
      if (!ringModal.classList.contains('ring-modal--state-manual')) return;
      if (manualLinesCount >= 3) return; // 三条都画完了就不画了
      e.preventDefault();
      manualDrawing = true;
      var clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      var pt = getSvgCoord(clientX, clientY);
      manualPathPoints = [pt];
      // 开始新路径：M移动到起始点（金线和阴影层都要设置），使用当前活动的第N组path
      var curPath = userTracePaths[currentTraceIndex];
      var curShadow = userTraceShadows[currentTraceIndex];
      var startD = 'M ' + pt.x + ',' + pt.y;
      curPath.setAttribute('d', startD);
      curShadow.setAttribute('d', startD);
      spawnRingParticle(pt.x, pt.y);
    }

    // 手指/鼠标移动：继续画线
    function onManualMove(e) {
      if (!manualDrawing) return;
      e.preventDefault();
      var clientX, clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      var pt = getSvgCoord(clientX, clientY);
      manualPathPoints.push(pt);
      // 追加L线段到新点（金线和阴影层同步追加），使用当前活动的第N组path
      var curPath = userTracePaths[currentTraceIndex];
      var curShadow = userTraceShadows[currentTraceIndex];
      var newD = curPath.getAttribute('d') + ' L ' + pt.x + ',' + pt.y;
      curPath.setAttribute('d', newD);
      curShadow.setAttribute('d', newD);
      // 偶尔生成木屑（每3个点生成1粒，避免太多粒子）
      if (manualPathPoints.length % 3 === 0) {
        spawnRingParticle(pt.x, pt.y);
      }
    }

    // 手指/鼠标抬起：结束画线，判断长度是否达标，处理三条线计数
    // 在干什么：
    //   1) 计算当前这条线长度，<60px 算太短，清空当前线重画（不计数）
    //   2) 够长就保存这条线到 manualAllPaths，计数+1
    //   3) 如果还没到3条：切换到下一个空path，提示继续画
    //   4) 如果到3条了：完成，弹印章，进结果页
    // 新手易错点：画完一条后要"固定"当前path，下一条用新path，不然会覆盖
    function onManualEnd(e) {
      if (!manualDrawing) return;
      manualDrawing = false;
      // 计算路径总长度（相邻点距离之和）
      var totalDist = 0;
      for (var i = 1; i < manualPathPoints.length; i++) {
        var dx = manualPathPoints[i].x - manualPathPoints[i-1].x;
        var dy = manualPathPoints[i].y - manualPathPoints[i-1].y;
        totalDist += Math.sqrt(dx*dx + dy*dy);
      }
      // 画够60px（SVG坐标系）才算有效线条
      if (totalDist > 60) {
        // 保存当前这条线的点
        manualAllPaths.push(manualPathPoints.slice());
        manualLinesCount++;
        // 还没画够3条，准备下一条
        if (manualLinesCount < 3) {
          // 切换到下一个path
          currentTraceIndex = manualLinesCount;
          // 激活下一组path
          userTracePaths[currentTraceIndex].setAttribute('opacity', '1');
          userTracePaths[currentTraceIndex].style.opacity = '1';
          userTraceShadows[currentTraceIndex].setAttribute('opacity', '1');
          userTraceShadows[currentTraceIndex].style.opacity = '1';
          // 清空当前线点集，准备画新的
          manualPathPoints = [];
          // 提示进度
          if (manualLinesCount === 1) {
            ringHint.textContent = '第一条刻好了，继续刻第二条';
          } else if (manualLinesCount === 2) {
            ringHint.textContent = '第二条刻好了，还差最后一条';
          }
        } else {
          // 3条都画完了！镌刻完成
          ringHint.textContent = '镌刻完成';
          setTimeout(function() {
            ringCenterSeal.classList.add('ring-seal-center--show');
            burstRingParticles();
            // 隐藏引导线（阴影层和金线层都隐藏）
            ringTracesGold.forEach(function(trace) {
              trace.style.opacity = '0';
              trace.setAttribute('opacity', '0');
            });
            ringTracesShadow.forEach(function(trace) {
              trace.style.opacity = '0';
              trace.setAttribute('opacity', '0');
            });
            ringDots.forEach(function(dot) {
              dot.style.opacity = '0';
              dot.setAttribute('opacity', '0');
            });
            setTimeout(function() {
              finishCarving();
            }, 600);
          }, 400);
        }
      } else {
        // 画太短了，提示重画，只清空当前这条线，计数不变
        showRingToast('再刻几笔吧');
        setTimeout(function() {
          if (ringModal.classList.contains('ring-modal--state-manual') && manualLinesCount < 3) {
            var curPath = userTracePaths[currentTraceIndex];
            var curShadow = userTraceShadows[currentTraceIndex];
            curPath.setAttribute('d', '');
            curShadow.setAttribute('d', '');
            manualPathPoints = [];
          }
        }, 800);
      }
    }

    // ===== 【保存时光木卷】生成图片并保存 =====
    // 人话讲：理想情况用html2canvas截图，但这里没引入库，所以用简化方案：
    //   1) 尝试用Canvas绘制木板+弧线+印章+文字
    //   2) 如果CORS跨域导致图片无法绘制（跨域图片污染canvas），就降级显示保存提示层
    //   3) 微信浏览器不支持JS下载，直接弹提示层让用户长按保存
    function saveRingImage() {
      var isWeChat = /MicroMessenger/i.test(navigator.userAgent);
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      canvas.width = 600;
      canvas.height = 800;

      // 先画深色背景
      ctx.fillStyle = '#1a1209';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 尝试加载木板图片绘制
      var woodImg = new Image();
      woodImg.crossOrigin = 'anonymous';
      woodImg.onload = function() {
        try {
          // 绘制木板到canvas（居中300x300区域）
          var boardSize = 400;
          var boardX = (canvas.width - boardSize) / 2;
          var boardY = 120;
          ctx.drawImage(woodImg, boardX, boardY, boardSize, boardSize);

          // 绘制鎏金弧线：判断是一键镌刻（预设三条弧线）还是手动镌刻（用户画的真实痕迹）
          // 人话讲：manualAllPaths长度为3说明是用户亲手画的，就画用户的线；否则画标准预设弧线
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          var scale = boardSize / 300;
          var isManualMode = manualAllPaths && manualAllPaths.length === 3;

          // 第一层：深棕色阴影（粗线，模拟刻槽凹槽）
          ctx.strokeStyle = '#2a1505';
          ctx.lineWidth = 5;
          if (isManualMode) {
            // 手动模式：绘制用户画的折线
            manualAllPaths.forEach(function(points) {
              if (points.length < 2) return;
              ctx.beginPath();
              ctx.moveTo(boardX + points[0].x * scale, boardY + points[0].y * scale);
              for (var pi = 1; pi < points.length; pi++) {
                ctx.lineTo(boardX + points[pi].x * scale, boardY + points[pi].y * scale);
              }
              ctx.stroke();
            });
          } else {
            // 一键镌刻模式：预设三条标准贝塞尔弧线
            var autoTraces = [
              [[210,95], [180,140], [150,150]],
              [[85,190], [120,170], [150,150]],
              [[230,225], [190,180], [150,150]]
            ];
            autoTraces.forEach(function(trace) {
              ctx.beginPath();
              ctx.moveTo(boardX + trace[0][0]*scale, boardY + trace[0][1]*scale);
              ctx.quadraticCurveTo(
                boardX + trace[1][0]*scale, boardY + trace[1][1]*scale,
                boardX + trace[2][0]*scale, boardY + trace[2][1]*scale
              );
              ctx.stroke();
            });
          }

          // 第二层：亮金色主线（略细，在阴影上面）
          ctx.strokeStyle = '#e8c968';
          ctx.lineWidth = 3.2;
          if (isManualMode) {
            // 手动模式：绘制用户画的折线（金线）
            manualAllPaths.forEach(function(points) {
              if (points.length < 2) return;
              ctx.beginPath();
              ctx.moveTo(boardX + points[0].x * scale, boardY + points[0].y * scale);
              for (var pi = 1; pi < points.length; pi++) {
                ctx.lineTo(boardX + points[pi].x * scale, boardY + points[pi].y * scale);
              }
              ctx.stroke();
            });
          } else {
            // 一键镌刻模式：预设三条标准贝塞尔弧线
            var autoTracesGold = [
              [[210,95], [180,140], [150,150]],
              [[85,190], [120,170], [150,150]],
              [[230,225], [190,180], [150,150]]
            ];
            autoTracesGold.forEach(function(trace) {
              ctx.beginPath();
              ctx.moveTo(boardX + trace[0][0]*scale, boardY + trace[0][1]*scale);
              ctx.quadraticCurveTo(
                boardX + trace[1][0]*scale, boardY + trace[1][1]*scale,
                boardX + trace[2][0]*scale, boardY + trace[2][1]*scale
              );
              ctx.stroke();
            });
          }

          // 绘制中心守心印章（红色竖排）
          var sealW = 64, sealH = 76;
          var sealX = boardX + 150*scale - sealW/2;
          var sealY = boardY + 150*scale - sealH/2;
          ctx.fillStyle = '#9c2424';
          ctx.fillRect(sealX, sealY, sealW, sealH);
          ctx.fillStyle = '#f8f5ed';
          ctx.font = 'bold 28px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('守', sealX + sealW/2, sealY + sealH*0.3);
          ctx.fillText('心', sealX + sealW/2, sealY + sealH*0.7);

          // 绘制标题
          ctx.fillStyle = '#c8a466';
          ctx.font = 'bold 36px serif';
          ctx.textAlign = 'center';
          ctx.fillText('刻下我的坚持', canvas.width/2, 70);

          // 绘制用户文字或默认文案
          var userText = ringInput.value.trim();
          ctx.fillStyle = '#f8f5ed';
          ctx.font = '18px serif';
          var textY = boardY + boardSize + 50;
          if (userText) {
            ctx.fillStyle = '#c8a466';
            ctx.font = 'bold 22px serif';
            ctx.fillText('「' + userText + '」', canvas.width/2, textY);
            textY += 40;
            ctx.fillStyle = 'rgba(248,245,237,0.85)';
            ctx.font = '16px serif';
          }
          ctx.fillText('潮州木雕匠人以刀刻木，耗费半生守望一门手艺', canvas.width/2, textY);
          ctx.fillText('你以岁月奔赴心中所爱', canvas.width/2, textY + 28);
          ctx.fillText('所有长久的坚持，皆值得被看见', canvas.width/2, textY + 56);

          // 转换为图片URL
          var dataUrl = canvas.toDataURL('image/png');
          if (isWeChat) {
            // 微信：显示提示层让用户长按保存
            ringSaveImg.src = dataUrl;
            ringSaveOverlay.classList.add('ring-save-overlay--show');
            ringSaveOverlay.setAttribute('aria-hidden', 'false');
          } else {
            // 非微信：尝试触发下载
            var link = document.createElement('a');
            link.download = '时光木卷.png';
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showRingToast('图片已保存');
          }
        } catch(e) {
          // Canvas被跨域图片污染等错误 → 降级提示
          console.warn('Canvas save failed, falling back to overlay:', e);
          showSaveFallback();
        }
      };
      woodImg.onerror = function() {
        // 图片加载失败 → 降级提示
        showSaveFallback();
      };
      woodImg.src = 'assets/images/inherit/wood_ring_base_clean.jpg';

      // 如果是微信，不用等canvas，直接弹提示层（微信保存必须用户长按）
      if (isWeChat) {
        // 微信直接弹提示，尝试加载木板图作为预览
        setTimeout(function() {
          if (!ringSaveImg.src || ringSaveImg.src.indexOf('data:') === -1) {
            ringSaveImg.src = 'assets/images/inherit/wood_ring_base_clean.jpg';
          }
          ringSaveOverlay.classList.add('ring-save-overlay--show');
          ringSaveOverlay.setAttribute('aria-hidden', 'false');
        }, 300);
      }
    }

    // 保存降级方案：显示提示层，告诉用户截图/右键保存
    function showSaveFallback() {
      ringSaveImg.src = 'assets/images/inherit/wood_ring_base_clean.jpg';
      ringSaveOverlay.classList.add('ring-save-overlay--show');
      ringSaveOverlay.setAttribute('aria-hidden', 'false');
      showRingToast('请截图保存您的时光木卷');
    }

    // 关闭保存提示层
    function closeSaveOverlay() {
      ringSaveOverlay.classList.remove('ring-save-overlay--show');
      ringSaveOverlay.setAttribute('aria-hidden', 'true');
    }

    // ===== 【复制分享文案】=====
    function copyShareText() {
      var userText = ringInput.value.trim() || '日复一日的热爱';
      var text = '在潮州木雕传承页，我刻下了属于自己的坚持：「' + userText + '」。匠人以刀刻木，以心守艺；你以岁月奔赴所爱，所有长久的坚持，皆值得被看见。';
      // 优先用现代Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() {
          showRingToast('文案已复制');
        }).catch(function() {
          // Clipboard API失败，用旧方法兜底
          copyTextFallback(text);
        });
      } else {
        copyTextFallback(text);
      }
    }

    // 旧版复制兜底：创建临时textarea，选中，execCommand('copy')
    function copyTextFallback(text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        showRingToast('文案已复制');
      } catch(e) {
        showRingToast('复制失败，请手动复制');
      }
      document.body.removeChild(ta);
    }

    // ===== 【事件绑定】年轮弹窗所有按钮和交互 =====
    ringClose.addEventListener('click', closeRingModal);
    ringOverlay.addEventListener('click', closeRingModal);
    btnAutoCarve.addEventListener('click', startAutoCarve);
    btnManualCarve.addEventListener('click', startManualCarve);
    btnSaveImage.addEventListener('click', saveRingImage);
    btnCopyText.addEventListener('click', copyShareText);
    btnBackToPage.addEventListener('click', closeRingModal);
    btnCloseSave.addEventListener('click', closeSaveOverlay);

    // 手动镌刻：SVG层触摸/鼠标事件
    // 人话讲：监听SVG上的触摸和鼠标事件，实现手指/鼠标拖拽画线
    ringSvg.addEventListener('touchstart', onManualStart, { passive: false });
    ringSvg.addEventListener('touchmove', onManualMove, { passive: false });
    ringSvg.addEventListener('touchend', onManualEnd);
    ringSvg.addEventListener('touchcancel', onManualEnd);
    ringSvg.addEventListener('mousedown', onManualStart);
    // mousemove/mouseup绑在document上，防止鼠标划出SVG时丢失事件
    document.addEventListener('mousemove', onManualMove);
    document.addEventListener('mouseup', onManualEnd);

    // ===== 【联动动画】卡片依次柔光亮起 =====
    // 在干什么：年轮弹窗关闭后，4 张卡片依次（间隔 0.3s）播放柔光动画。
    // animation-delay 递增实现"依次亮起"效果。
    function triggerCardGlow() {
      var cards = cardsScroll.querySelectorAll('.inherit-card');
      cards.forEach(function(card, i) {
        // 先移除旧动画类（如果有的话），强制重排后重新添加
        card.classList.remove('inherit-card--glow');
        // 强制重排：让浏览器"看到"类被移除，再添加才能重新触发动画
        void card.offsetWidth;
        card.style.animationDelay = (i * 0.3) + 's';
        card.classList.add('inherit-card--glow');
      });
      // 动画结束后清理（最长一张卡片 delay=0.9s + 动画 2s = 2.9s）
      setTimeout(function() {
        cards.forEach(function(card) {
          card.classList.remove('inherit-card--glow');
          card.style.animationDelay = '';
        });
      }, 3500);
    }

    // ===== 【按钮交互】底部双按钮 =====
    // "匠语漫行" → 打开匠语漫行全屏模态（逻辑在文件末尾定义）

    // "刻下我的坚持" → 打开年轮弹窗
    btnMyPersistence.addEventListener('click', function() {
      openRingModal();
    });

    // ===== 【明暗模式】月亮按钮切换 =====
    // 在干什么：点击切换 .dark 类，CSS 变量自动换色。
    darkModeBtn.addEventListener('click', function() {
      isDarkMode = !isDarkMode;
      page.classList.toggle('dark', isDarkMode);
      document.body.classList.toggle('dark', isDarkMode);
    });

    // ===== 【视差滚动更新】 =====
    function updateParallax() {
      var scrollY = window.pageYOffset || document.documentElement.scrollTop;
      var offset = scrollY * 0.4;
      if (parallaxOverlay) {
        parallaxOverlay.style.transform = 'translateY(' + offset + 'px)';
      }

      var delta = Math.abs(scrollY - lastScrollY);
      lastScrollY = scrollY;
      particleSpawnAccumulator += delta;
      while (particleSpawnAccumulator > 30) {
        spawnParticle();
        particleSpawnAccumulator -= 30;
      }

      parallaxTicking = false;
    }

    window.addEventListener('scroll', function() {
      if (!parallaxTicking) {
        requestAnimationFrame(updateParallax);
        parallaxTicking = true;
      }
    }, { passive: true });

    // ===== 【木屑粒子特效】 =====
    function spawnParticle() {
      if (particleCount >= MAX_PARTICLES) return;
      var p = document.createElement('div');
      p.className = 'inherit-particle';
      p.style.left = (Math.random() * 100) + '%';
      p.style.top = '-10px';
      var size = 2 + Math.random() * 3;
      p.style.width = size + 'px';
      p.style.height = (size + 1 + Math.random() * 2) + 'px';
      var drift = (Math.random() - 0.5) * 60;
      p.style.setProperty('--drift', drift + 'px');
      p.style.animationDuration = (4 + Math.random() * 3) + 's';
      var alpha = 0.1 + Math.random() * 0.1;
      p.style.background = 'rgba(180, 140, 90, ' + alpha + ')';
      particlesContainer.appendChild(p);
      particleCount++;
      setTimeout(function() {
        if (p.parentNode) p.remove();
        particleCount--;
      }, 7000);
    }

    // 页面初始加载时生成几粒粒子
    for (var i = 0; i < 5; i++) {
      setTimeout(spawnParticle, i * 400);
    }

    // ===== 【初始化】 =====
    renderCards();

    // ===== 匠语漫行模态逻辑 =====
    // 匠人语录集（来自语录集.txt）
    // 人话讲：匠人们的心里话和从艺感悟，会在飘字区域从右往左慢慢飘过
    var JIANGYU_QUOTES = [
      '镂木求活，蟹篓为功',
      '刀不离手，手不离木，三年入门，十年成家',
      '杂杂、匀匀、通通',
      '细而不腻、大而不空、繁而不乱、艳而不俗',
      '刀是手的延伸，手是心的延伸。心到，刀才能到',
      '除了你认认真真地从艺，还要胸怀宽广，对事不对人',
      '木雕技艺最大的困难就是耐心，从业者要有坚持的精神',
      '做木雕太辛苦了，托雕刀的手掌上有一块很大的茧',
      '不管这手艺多苦多累都不能放弃，这是文化，是祖宗传下来的瑰宝',
      '木雕一开始最关键就是挑选材料',
      '木雕的制作要达到以后的文物水平',
      '多层次镂空是潮州木雕最大的特点',
      '完成一件作品最难的是什么？绝对是创意',
      '如果滥竽充数，那等于工艺的垃圾',
      '我不认为自己现在已经是成功了，真正的成功还需留待后世人去评判',
      '吃亏是肯定的，但为了让这门手艺能够完整地传承下去，值！',
      '一般年轻人知道要学两三年才能出师，都不愿意干了',
      '完全用工具代替手工，也是舍本求末',
      '最好的石雕在欧洲，最好的木雕在中国',
      '传统工艺一定要改革，一定要有创造性',
      '唯有潮州木雕艺人，创造了熔雕刻与绘画于一炉的木雕镂通雕技艺',
      '匠心就是甘于寂寞',
      '我一辈子都学不完',
      '老老实实地去做，用身体用时间去做，来不得一点虚假',
      '如切如磋，如琢如磨',
      '只要有恒心、有耐心、热爱木雕，我都愿意倾囊相授',
      '磨刀，磨的不仅仅是器，更是磨炼耐心',
      '我把自己叫作木头人，因为我这一生都在跟木头打交道',
      '手艺活从来都是谁做得好，谁就是标准',
      '艺术不能死守，只有不断创新才能赋予木雕新的生命',
      '放低姿态才能飞得更高',
      '木雕入门先磨刀，学会磨刀刀会利才能做好工作',
      '我是一个用木头讲故事的非遗传承人',
      '传承是一种责任！',
      '荣誉即责任，非遗技艺的传承需要自己勇于担当',
      '器物是有魂魄的，可以穿越时光与人相遇',
      '想要做好一件作品，必须要有三心：静心、耐心、细心',
      '一项非遗若想很好地传承，首先要让它被看见',
      '我希望潮州木雕能离生活更近些',
      '祖孙三代，一把刀；人民大会堂，三代人的考场',
      '做木雕的过程非常打磨心性，磨炼的是一颗耐得住寂寞的心',
      '篓子里的东西最难雕刻，只能一点一点雕琢',
      '斧凿刀刻，一雕一琢，让古建筑在手中重获新生'
    ];

    // 祝福语集（来自祝福语.txt）
    // 人话讲：点击光球后随机显示一句温暖的祝福语给用户
    var JIANGYU_BLESSINGS = [
      '岁月漫漫长途，所有默默耕耘都不会被时光辜负，风浪当作历练，静待繁花盛开，所有期许终会落地生根。',
      '不必急于奔赴终点，慢慢走好脚下路途，在沉淀中积蓄力量，终会穿过迷雾，遇见辽阔明朗的远方。',
      '生活总有起落浮沉，守住心底不变的热忱，与遗憾和解，向前路前行，光亮总会自四面八方奔赴而来。',
      '把细碎的努力交给时间，不惧暂时的沉寂，凡是坚持奔赴的方向，终会迎来风和日丽，万事渐入佳境。',
      '沿途风雨皆是馈赠，坎坷铺成前行道路，保持从容平和的心境，长久坚持，自能抵达心之所向。',
      '于平凡日常里坚守热爱，不困于眼前困顿，不忧于未知前路，时光缓缓，所有美好正在缓缓酝酿。',
      '驱散心底的迷茫与焦虑，稳步向前，沿途会遇见温柔晚风、烂漫光景，想要的生活终将如约而至。',
      '心怀山海，眼有星光，接纳世事无常，依旧勇敢出发，漫长跋涉之后，自有广阔天地等候相逢。',
      '凡是走过的道路皆有意义，所有熬过的艰难都会化作底气，往后路途平顺，处处遇见不期而遇的惊喜。',
      '不必追随旁人的脚步，安心遵循自身节奏生长，静待时机成熟，自有独属于自己的风景与荣光。',
      '阴霾终会随风散去，暖意缓缓漫入生活，保持乐观与坚定，所有等待，都会换来称心如意的答案。',
      '以温柔对抗世间纷扰，以坚韧面对重重挑战，持续向上生长，往后四季安稳，好事源源不断。',
      '漫长征途里，稳住心神，持续深耕，暂时的失意只是短暂停留，曙光常在前方，万事皆有转机。',
      '收集日常里细碎的美好，消解生活带来的疲惫，怀揣希望一路向前，前路开阔，万事皆可期待。',
      '心有笃定，不惧路远，纵使前路蜿蜒曲折，只要步履不停，终能跨过重重阻碍，奔赴理想彼岸。',
      '世间所有璀璨，都源自长久默默的坚守，沉下心默默蓄力，待到风起之时，便可扬帆远航。',
      '和过往的困顿挥手作别，带着勇气奔赴下一程山海，往后日子清净无忧，所愿之事慢慢成真。',
      '四季流转，风物常新，守住内心的纯粹与赤诚，在日复一日的坚持中，慢慢活成理想中的模样。',
      '纵使前路偶有荆棘，亦不要停下前行脚步，风雨洗礼过后，眼界更加开阔，前路满目春光。',
      '时光自有安排，不必焦虑得失，认真做好当下每件小事，长久积累之下，惊喜会如期奔赴而来。',
      '褪去浮躁，静守本心，在喧嚣人间寻得安宁，持续奔赴热爱，漫漫余生，常有喜乐相伴左右。',
      '所有蛰伏的时光都在积蓄力量，熬过漫长沉寂，终会冲破层层阻隔，迎来属于自己的万丈光芒。',
      '拥抱生活所有不完美，保持永远向前的信念，穿越重重人海，终会遇见温柔与无限可能。',
      '晚风捎来好运，前路铺满星光，所有付出皆有回响，往后路途顺遂无忧，处处皆是温柔光景。',
      '以热爱抵御岁月荒芜，以坚持跨越万般难关，征途漫漫，终有一日，能够抵达心中向往的远方。',
      '暂时的困境只是旅途插曲，心怀希望静静等候，云雾散尽之时，万里晴空便会展露眼前。',
      '在烟火人间慢慢修行，不慌不忙稳步前行，积攒温柔与力量，往后岁岁平安，事事顺心如愿。',
      '长路漫漫，自有清风相伴，保持永不褪色的热忱，跨越山海之后，理想与美好终将双向奔赴。',
      '放下无谓内耗，专注自身成长，时光不会亏待每一份努力，未来处处藏着崭新的机遇与欢喜。',
      '历经世事百态，依旧心存善意与向往，踏过山河万里，终会寻得安稳归宿，收获满心欢喜。',
      '前路自有清风引路，所有迷茫终会消散，持续向上奔赴，在不远的将来，邂逅期盼已久的风景。',
      '把遗憾留在昨日，带着期待奔赴来日，生活慢慢升温，好运接踵而至，一切都在向好发展。',
      '静候时机，潜心沉淀，不必羡慕他人花期，每个人都有专属节奏，终会绽放独有的光彩。',
      '山水迢迢，初心不改，不惧路途遥远与艰难，坚持一路向前，终能拨开云雾，看见万里晨光。',
      '寻常岁月亦可滋生浪漫，守住心中光亮，从容应对世事变迁，往后日日安宁，常有好事发生。',
      '每一次跌倒都是蓄力，每一次坚持都靠近目标，长久奔赴之下，所有遥不可及的梦想慢慢触手可及。',
      '人间风物温柔，前路自有光亮，卸下心头重担轻装前行，一路收获暖意，与美好频频相逢。',
      '不惧世事跌宕，常怀从容之心，在漫长岁月里持续成长，终会拥有抵御风雨的底气与力量。',
      '春风总会抵达旷野，美好终会奔赴人间，耐心等候，持续前行，所有期待都会迎来圆满结局。',
      '走过曲折小径，方能遇见开阔平川，所有经历皆为馈赠，往后征途坦荡，万事顺遂无忧。'
    ];

    var jiangyuModal = document.getElementById('jiangyuModal');
    var jiangyuClose = document.getElementById('jiangyuClose');
    var jiangyuFloating = document.getElementById('jiangyuFloating');
    var jiangyuOrb = document.getElementById('jiangyuOrb');
    var jiangyuBlessing = document.getElementById('jiangyuBlessing');
    var jiangyuBlessingText = document.getElementById('jiangyuBlessingText');
    var jiangyuBlessingClose = document.getElementById('jiangyuBlessingClose');

    var jiangyuInterval = null;
    var jiangyuActiveItems = 0;
    var JIANGYU_MAX_ITEMS = 6; // 最多6条飘字同时显示（6个轨道）
    var JIANGYU_MIN_ITEMS = 5; // 最少保持5条飘字

    // 轨道制分布算法：把垂直空间切成6条"轨道"，每条轨道同时只能有1条飘字
    // 人话讲：就像6条平行的跑道，每条跑道上同时只能跑一个运动员，跑完了才能让下一个上
    // 新手易错点：轨道范围要避开中央"潮州木雕"区域(30%-56%)，轨道之间留2%以上间距防止重叠
    // 人话讲：把可用区域分成6个轨道，上区3条（3%-30%），下区3条（56%-90%）
    var jiangyuTracks = [
      [3, 10],     // 轨道0：最顶部 3%-10%
      [12, 20],    // 轨道1：上部 12%-20%
      [22, 30],    // 轨道2：上部靠下 22%-30%
      [56, 66],    // 轨道3：下部靠上 56%-66%（跳过中央文字区30%-56%）
      [68, 78],    // 轨道4：下部 68%-78%
      [80, 90]     // 轨道5：最底部 80%-90%（给光球留10%空间）
    ];
    // 每个轨道是否被占用：false=空闲，true=有飘字正在飞
    var jiangyuTrackOccupied = [false, false, false, false, false, false];

    // 打开匠语漫行模态
    // 人话讲：显示模态，禁止页面滚动，开始飘字
    function openJiangyuModal() {
      lastJiangyuTrigger = document.activeElement;
      jiangyuModal.classList.add('visible');
      jiangyuModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      jiangyuClose.focus();
      document.addEventListener('keydown', onJiangyuEscClose);
      startFloatingTexts();
    }

    // 关闭匠语漫行模态
    // 人话讲：隐藏模态，恢复页面滚动，停止飘字，同时关闭祝福语弹窗
    function closeJiangyuModal() {
      jiangyuModal.classList.remove('visible');
      jiangyuModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      stopFloatingTexts();
      document.removeEventListener('keydown', onJiangyuEscClose);
      jiangyuBlessing.classList.remove('visible');
      jiangyuBlessing.setAttribute('aria-hidden', 'true');
      if (lastJiangyuTrigger && typeof lastJiangyuTrigger.focus === 'function') lastJiangyuTrigger.focus();
    }

    function onJiangyuEscClose(e) {
      if (e.key === 'Escape' && jiangyuModal.classList.contains('visible')) {
        closeJiangyuModal();
      }
    }

    // 开始飘字动画（轨道制版）
    // 人话讲：打开模态后，循环6个轨道，每个轨道创建一个飘字，间隔600ms错开时间
    // 新手易错点：必须错开时间创建，否则所有飘字同时从右侧出来会重叠在一起
    function startFloatingTexts() {
      jiangyuFloating.innerHTML = '';
      jiangyuActiveItems = 0;
      // 重置所有轨道为空闲状态（6个轨道）
      jiangyuTrackOccupied = [false, false, false, false, false, false];
      
      // 循环6个轨道，每个轨道创建一个飘字，间隔600ms
      for (var i = 0; i < 6; i++) {
        (function(idx) {
          setTimeout(function() {
            createFloatingText();
          }, idx * 600); // 间隔600ms，更快填满屏幕
        })(i);
      }
      
      // 定时器：检查是否有空闲轨道，有则创建新飘字
      jiangyuInterval = setInterval(function() {
        // 人话讲：遍历轨道数组，找到第一个空闲的轨道就创建飘字
        var hasFreeTrack = false;
        for (var i = 0; i < jiangyuTrackOccupied.length; i++) {
          if (!jiangyuTrackOccupied[i]) {
            hasFreeTrack = true;
            break;
          }
        }
        // 有空闲轨道才创建，没有就等动画结束释放轨道
        if (hasFreeTrack) {
          createFloatingText();
        }
      }, 1500); // 每1.5秒检查一次，补充飘字
    }

    // 停止飘字
    // 人话讲：清除定时器，清空飘字区域，重置计数，同时重置所有轨道为空闲状态
    // 新手易错点：动画结束后一定要移除DOM元素，否则会内存泄漏；还要重置轨道占用状态
    function stopFloatingTexts() {
      if (jiangyuInterval) {
        clearInterval(jiangyuInterval);
        jiangyuInterval = null;
      }
      jiangyuFloating.innerHTML = '';
      jiangyuActiveItems = 0;
      // 重置所有轨道为空闲状态，下次打开模态时才能正常创建飘字
      jiangyuTrackOccupied = [false, false, false, false, false, false];
    }

    // 创建一条飘字（轨道制版）
    // 人话讲：先找空闲轨道，选中后在轨道范围内随机top位置，标记占用，创建DOM元素
    // 新手易错点：必须给DOM元素添加data-track属性记录轨道编号，animationend时才能正确释放
    function createFloatingText() {
      // 第一步：找空闲轨道
      var freeTrackIndex = -1;
      for (var i = 0; i < jiangyuTrackOccupied.length; i++) {
        if (!jiangyuTrackOccupied[i]) {
          freeTrackIndex = i;
          break;
        }
      }
      // 没有空闲轨道就不创建，等动画结束释放
      if (freeTrackIndex === -1) return;

      // 第二步：选中轨道后，标记为占用
      jiangyuTrackOccupied[freeTrackIndex] = true;

      // 第三步：在选中轨道的范围内随机一个top位置（增加自然感）
      var trackRange = jiangyuTracks[freeTrackIndex];
      var topPercent = trackRange[0] + Math.random() * (trackRange[1] - trackRange[0]);

      // 第四步：创建DOM元素
      var text = JIANGYU_QUOTES[Math.floor(Math.random() * JIANGYU_QUOTES.length)];
      var item = document.createElement('div');
      item.className = 'jiangyu-floating__item';
      item.textContent = text;
      // 关键：给DOM元素添加data-track属性，记录它占用的轨道编号
      item.setAttribute('data-track', freeTrackIndex);

      item.style.top = topPercent + '%';

      var duration = 25 + Math.random() * 15;
      item.style.animationDuration = duration + 's';

      // 字体大小调整：从14-18px改为18-23px，让飘字更清晰
      var fontSize = 18 + Math.floor(Math.random() * 6);
      item.style.fontSize = fontSize + 'px';

      item.style.opacity = 0;

      jiangyuFloating.appendChild(item);
      jiangyuActiveItems++;

      // 第五步：动画结束后，释放该轨道
      item.addEventListener('animationend', function() {
        if (item.parentNode) {
          item.parentNode.removeChild(item);
          jiangyuActiveItems--;
          // 通过data-track属性找到对应轨道并释放
          var trackIdx = parseInt(item.getAttribute('data-track'), 10);
          if (!isNaN(trackIdx) && trackIdx >= 0 && trackIdx < jiangyuTrackOccupied.length) {
            jiangyuTrackOccupied[trackIdx] = false;
          }
        }
      });
    }

    // 点击光球：显示随机祝福语
    jiangyuOrb.addEventListener('click', function() {
      var blessing = JIANGYU_BLESSINGS[Math.floor(Math.random() * JIANGYU_BLESSINGS.length)];
      jiangyuBlessingText.textContent = blessing;
      jiangyuBlessing.classList.add('visible');
      jiangyuBlessing.setAttribute('aria-hidden', 'false');
    });

    // 关闭祝福语
    jiangyuBlessingClose.addEventListener('click', function() {
      jiangyuBlessing.classList.remove('visible');
      jiangyuBlessing.setAttribute('aria-hidden', 'true');
    });

    // 点击遮罩也关闭祝福语
    jiangyuBlessing.querySelector('.jiangyu-blessing__overlay').addEventListener('click', function() {
      jiangyuBlessing.classList.remove('visible');
      jiangyuBlessing.setAttribute('aria-hidden', 'true');
    });

    // 右上角关闭模态
    jiangyuClose.addEventListener('click', closeJiangyuModal);

    // 修改按钮点击行为：匠语漫行
    btnViewMasters.addEventListener('click', openJiangyuModal);

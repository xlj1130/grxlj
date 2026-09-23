/**
 * content.js —— 注入求职网站的核心脚本
 * ------------------------------------------------------------------
 * 职责：
 *   1. 依据域名匹配 config/sites.js 中的站点配置；
 *   2. 扫描职位卡片并解析 职位名/公司/地区/经验/学历；
 *   3. 按用户设置筛选（工作年限、城市地区、学历、关键词、排除词）；
 *   4. 批量投递：模拟人类点击“投递/沟通”按钮，带间隔与抖动；
 *   5. 通过悬浮面板 + chrome.runtime 消息实时反馈进度。
 */
'use strict';

(function () {
  // 防止重复注入·
  if (window.__qzzdhInjected) return;
  window.__qzzdhInjected = true;

  // -------------------------------------------------------------------------
  // 运行时状态
  // -------------------------------------------------------------------------
  const state = {
    running: false,          // 是否正在批量投递
    stopFlag: false,         // 停止信号
    scan: 0, match: 0, sent: 0, skip: 0,
    appliedKeys: new Set(),  // 已投递去重（title|company）
    site: null,              // 当前站点配置
    discoveredLogged: false  // 自适应发现是否已提示过
  };

  // -------------------------------------------------------------------------
  // 工具函数
  // -------------------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (base) => base + Math.floor(Math.random() * 800);

  function textOf(el) {
    return (el && el.textContent ? el.textContent : '').trim();
  }

  function queryFirst(scope, selector) {
    if (!selector) return null;
    try { return scope.querySelector(selector); } catch (e) { return null; }
  }

  function queryAll(scope, selector) {
    if (!selector) return [];
    try { return Array.from(scope.querySelectorAll(selector)); } catch (e) { return []; }
  }

  function splitCsv(str) {
    return String(str || '')
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // -------------------------------------------------------------------------
  // 站点识别
  // -------------------------------------------------------------------------
  function detectSiteConfig() {
    const sites = window.QZZDH_SITES || {};
    const host = location.hostname;
    for (const key of Object.keys(sites)) {
      const cfg = sites[key];
      if (cfg.host && cfg.host.test(host)) return cfg;
    }
    return window.QZZDH_GENERIC || null;
  }

  // -------------------------------------------------------------------------
  // 字段解析
  // -------------------------------------------------------------------------
  function parseExperience(cardText) {
    const dict = window.QZZDH_EXP_KEYWORDS || {};
    for (const cat of Object.keys(dict)) {
      const words = dict[cat];
      if (words.some((w) => cardText.includes(w))) return cat;
    }
    return null;
  }

  function parseEducation(cardText) {
    const dict = window.QZZDH_EDU_KEYWORDS || {};
    for (const cat of Object.keys(dict)) {
      const words = dict[cat];
      if (words.some((w) => cardText.includes(w))) return cat;
    }
    return null;
  }

  // 解析招聘者活跃时间（如“今日活跃/3日内活跃/4月内活跃/半年前活跃”）→ 折算为天数
  // 先去掉空白再匹配（新版 DOM 可能把文案拆成多个元素渲染）
  function parseActiveDays(text) {
    const t = String(text || '').replace(/\s+/g, '');
    if (/刚刚活跃|几分钟前|半小时前|\d+分钟前|\d+小时前|今日活跃/.test(t)) return 0;
    if (/昨日活跃/.test(t)) return 1;
    const mDay = t.match(/(\d+)日内活跃/);
    if (mDay) return parseInt(mDay[1], 10);
    if (/本周活跃/.test(t)) return 7;
    if (/半月内活跃/.test(t)) return 15;
    // “2周内活跃/3周内活跃”等 N 周写法
    const mWeek = t.match(/(\d+)周内活跃/);
    if (mWeek) return parseInt(mWeek[1], 10) * 7;
    // “4月内活跃/3个月内活跃”等 N 月内写法
    const mMon = t.match(/(\d+)个?月内活跃/);
    if (mMon) return parseInt(mMon[1], 10) * 30;
    if (/月内活跃/.test(t)) return 30;
    const mMonAgo = t.match(/(\d+)个?月前活跃/);
    if (mMonAgo) return parseInt(mMonAgo[1], 10) * 30;
    if (/半年[前内]活跃/.test(t)) return 180;
    const mYear = t.match(/(\d+)年前活跃/);
    if (mYear) return parseInt(mYear[1], 10) * 365;
    return null; // 未识别到活跃信息
  }

  // 卡片富文本：textContent + title/aria-label 属性（活跃文案可能藏在属性里）
  function cardRichText(card) {
    let t = textOf(card);
    queryAll(card, '[title], [aria-label]').forEach((el) => {
      t += ' ' + (el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '');
    });
    return t;
  }

  // 活跃文案特征正则（与 parseActiveDays 规则一致，用于识别招聘者信息块）
  const ACTIVE_TEXT_RE = /刚刚活跃|几分钟前|半小时前|\d+分钟前|\d+小时前|今日活跃|昨日活跃|\d+日内活跃|本周活跃|半月内活跃|\d+周内活跃|\d+个?月内活跃|月内活跃|\d+个?月前活跃|半年[前内]活跃|\d+年前活跃/;

  // 配对缓存（DOM 变化后失效，每次扫描开始时清空）
  let pairCacheMap = new Map();

  // 从文本中提取活跃文案（用于跳过原因展示，如“半年前活跃”）
  function extractActiveLabel(text) {
    const t = String(text || '').replace(/\s+/g, '');
    const m = t.match(/\d+个?月前活跃|\d+年前活跃|半年[前内]活跃|\d+周内活跃|\d+个?月内活跃|月内活跃|\d+日内活跃|本周活跃|半月内活跃|今日活跃|昨日活跃|刚刚活跃|\d+分钟前|\d+小时前/);
    return m ? m[0] : '';
  }

  // 新版 BOSS 列表：职位卡片（div.card-area）与招聘者信息块（div.job-info）
  // 是同一容器里并列的子元素，且两者携带相同的 data-jobid。
  // 首选按 data-jobid 精确配对；拿不到属性时退回几何配对
  // （信息块归属水平重叠且垂直最近的卡片，未渲染的宁缺勿错）
  function findPairedInfo(card) {
    const parent = card.parentElement;
    if (!parent) return null;
    let cache = pairCacheMap.get(parent);
    if (!cache) {
      cache = { idMap: new Map(), geomMap: new Map() };
      const children = Array.from(parent.children).filter((c) => c.nodeType === 1);
      const cards = [], infos = [];
      for (const c of children) {
        const t = cardRichText(c).replace(/\s+/g, '');
        if (ACTIVE_TEXT_RE.test(t)) {
          infos.push(c);
          const id = (c.getAttribute && (c.getAttribute('data-jobid') || c.getAttribute('data-jid'))) || '';
          if (id) cache.idMap.set(id, c);
        } else if (c === card || c.querySelector('a[href]')) {
          cards.push(c);
        }
      }
      // 几何配对兜底
      const rects = new Map();
      const rect = (el) => {
        let r = rects.get(el);
        if (!r) { r = el.getBoundingClientRect(); rects.set(el, r); }
        return r;
      };
      const cy = (r) => (r.top + r.bottom) / 2;
      const cand = new Map();
      for (const info of infos) {
        const ir = rect(info);
        const iy = cy(ir);
        for (const c of cards) {
          const cr = rect(c);
          const overlapX = Math.min(cr.right, ir.right) - Math.max(cr.left, ir.left);
          if (overlapX <= 0) continue; // 不同列/网格布局不配对
          const dist = Math.abs(cy(cr) - iy);
          const old = cand.get(c);
          if (!old || dist < old.dist) cand.set(c, { info, dist });
        }
      }
      cand.forEach((v, c) => cache.geomMap.set(c, v.info));
      pairCacheMap.set(parent, cache);
    }
    const myId = (card.getAttribute && (card.getAttribute('data-jobid') || card.getAttribute('data-jid'))) || '';
    if (myId && cache.idMap.has(myId)) return cache.idMap.get(myId);
    return cache.geomMap.get(card) || null;
  }

  // ---- 组件数据挖掘：活跃徽章可能尚未渲染进 DOM，但数据已在 Vue 组件内存里 ----
  // 深度查找包含指定 jobId 的最小数据节点（先找子节点再判断自身，避免拿到外层包裹对象）
  function deepFindJobNode(value, jobId, depth, seen) {
    if (depth > 6 || value == null || typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    try {
      const values = Object.values(value);
      let count = 0;
      for (const v of values) {
        if (++count > 150) break;
        if (v == null || typeof v !== 'object') continue;
        const r = deepFindJobNode(v, jobId, depth + 1, seen);
        if (r) return r;
      }
      if (values.some((v) => (typeof v === 'string' || typeof v === 'number') && String(v) === jobId)) {
        return value;
      }
    } catch (e) { /* noop */ }
    return null;
  }

  // 在数据节点里找符合活跃文案规则的字符串
  function deepFindActiveText(value, depth, seen) {
    if (depth > 5 || value == null) return null;
    if (typeof value === 'string') {
      const t = value.replace(/\s+/g, '');
      return (t.length <= 20 && ACTIVE_TEXT_RE.test(t)) ? t : null;
    }
    if (typeof value !== 'object' || seen.has(value)) return null;
    seen.add(value);
    try {
      let count = 0;
      for (const v of Object.values(value)) {
        if (++count > 150) break;
        const r = deepFindActiveText(v, depth + 1, seen);
        if (r) return r;
      }
    } catch (e) { /* noop */ }
    return null;
  }

  const vueActiveCache = new WeakMap();
  function readVueActiveText(card) {
    if (vueActiveCache.has(card)) return vueActiveCache.get(card);
    const jobId = (card.getAttribute && (card.getAttribute('data-jobid') || card.getAttribute('data-jid'))) || '';
    if (!jobId) return null;
    try {
      let el = card;
      for (let i = 0; i < 3 && el; i++) {
        let inst = null;
        try { inst = el.__vue__ || (el.__vueParentComponent && el.__vueParentComponent.proxy) || null; } catch (e) { inst = null; }
        if (inst) {
          const jobNode = deepFindJobNode(inst.$data || inst, jobId, 0, new WeakSet());
          if (jobNode) {
            const t = deepFindActiveText(jobNode, 0, new WeakSet());
            if (t) { vueActiveCache.set(card, t); return t; }
          }
        }
        el = el.parentElement;
      }
    } catch (e) { /* noop */ }
    return null;
  }

  // 活跃信息：卡片内部 → data-jobid/几何配对的信息块 → Vue 组件数据 → 祖先链
  // （祖先某层出现多个徽章时停止，避免跨卡误配）
  function findActiveInfoNear(card) {
    const sources = [cardRichText(card)];
    const paired = findPairedInfo(card);
    if (paired) sources.push(cardRichText(paired));
    const vt = readVueActiveText(card);
    if (vt) sources.push(vt);
    let anc = card.parentElement;
    for (let i = 0; i < 3 && anc && anc !== document.body; i++) {
      const rt = cardRichText(anc);
      const hits = (rt.replace(/\s+/g, '').match(/活跃/g) || []).length;
      if (hits > 1) break;
      if (hits === 1) sources.push(rt);
      anc = anc.parentElement;
    }
    for (const t of sources) {
      const d = parseActiveDays(t);
      if (d != null) return { days: d, label: extractActiveLabel(t) || `约${d}天前活跃` };
    }
    return null;
  }

  function findActiveDaysNear(card) {
    const r = findActiveInfoNear(card);
    return r ? r.days : null;
  }

  // 活跃文案懒加载兜底：BOSS 的活跃徽章只在卡片滚入视口后才渲染，
  // 因此把未识别的卡片逐个滚进视口并模拟悬停触发渲染，再重新解析（最多两轮）
  async function retryActiveDays(jobs, settings) {
    if (!(settings.activeDays > 0)) return;
    let pending = jobs.filter((j) => j.activeDays == null);
    if (!pending.length) return;
    // 页面上完全没有任何活跃徽章时（新版布局徽章只在详情页渲染），
    // 逐张滚动也刷不出文案，不做无谓滚动，活跃校验交给详情页
    const pageText = (document.body.textContent || '').replace(/\s+/g, '');
    if (!ACTIVE_TEXT_RE.test(pageText)) return;
    for (let round = 0; round < 2 && pending.length; round++) {
      pairCacheMap = new Map(); // 滚动后 DOM 有变化，配对缓存失效
      const batch = pending.filter((j) => j.card.isConnected).slice(0, 100);
      for (const j of batch) {
        try { j.card.scrollIntoView({ block: 'center' }); } catch (e) { /* noop */ }
        // 部分懒加载依赖 hover 事件，补一组鼠标事件触发渲染
        // （mouseenter 不冒泡，必须以 bubbles:false 直接派发到目标元素）
        ['mouseover', 'mousemove'].forEach((type) => {
          try { j.card.dispatchEvent(new MouseEvent(type, { bubbles: true, view: window })); } catch (e) { /* noop */ }
        });
        ['mouseenter', 'pointerenter'].forEach((type) => {
          try { j.card.dispatchEvent(new MouseEvent(type, { bubbles: false, view: window })); } catch (e) { /* noop */ }
        });
        await sleep(150); // 逐张触发懒渲染
      }
      try { window.dispatchEvent(new Event('scroll')); } catch (e) { /* noop */ }
      await sleep(1200); // 等待渲染完成
      pending.forEach((j) => {
        if (j.activeDays != null || !j.card.isConnected) return;
        const a = findActiveInfoNear(j.card);
        if (a) { j.activeDays = a.days; j.activeLabel = a.label; }
      });
      pending = jobs.filter((j) => j.activeDays == null && j.card.isConnected);
    }
    if (settings.activeDays > 0) {
      const un = jobs.filter((j) => j.activeDays == null).length;
      if (un) {
        reportProgress(`活跃度识别：${jobs.length - un}/${jobs.length} 张已识别，${un} 张未找到徽章（可点“DOM 诊断”查看详情）`, 'warn');
      }
    }
  }

  // 解析公司规模（如“20-99人/100-499人/10000人以上”）→ 归一到标准档位
  function parseCompanySize(text) {
    const mr = text.match(/(\d+)\s*[-~—至]\s*(\d+)\s*人/);
    if (mr) {
      const hi = parseInt(mr[2], 10);
      if (hi <= 20) return '0-20人';
      if (hi <= 99) return '20-99人';
      if (hi <= 499) return '100-499人';
      if (hi <= 999) return '500-999人';
      return '1000-9999人';
    }
    const mo = text.match(/(\d+)\s*人以上/);
    if (mo) return parseInt(mo[1], 10) >= 10000 ? '10000人以上' : '1000-9999人';
    return null;
  }

  function parseCard(card, cfg) {
    const fullText = textOf(card);
    // 职位名多级兜底：配置选择器 → 标题标签 → 模糊 class → 卡片首行文本
    let title = textOf(queryFirst(card, cfg.titleSelector));
    if (!title) {
      const h = queryFirst(card, 'h1,h2,h3,h4');
      title = h ? textOf(h) : '';
    }
    if (!title) title = textOf(queryFirst(card, '[class*="job-name"], [class*="title"]'));
    if (!title) title = (fullText.split(/\n+/)[0] || '').trim();
    let company = textOf(queryFirst(card, cfg.companySelector));
    if (!company) company = textOf(queryFirst(card, '[class*="company"]'));
    let location = textOf(queryFirst(card, cfg.locationSelector));
    if (!location) location = textOf(queryFirst(card, '[class*="area"], [class*="city"], [class*="region"], [class*="addr"]'));
    const salary = textOf(queryFirst(card, cfg.salarySelector));

    // 经验/学历优先从标签里找，找不到再从全文找
    let exp = null, edu = null;
    const tags = [];
    (cfg.tagSelectors || []).forEach((sel) => {
      queryAll(card, sel).forEach((t) => { const x = textOf(t); if (x) tags.push(x); });
    });
    const tagText = tags.join(' ');
    exp = parseExperience(tagText) || parseExperience(fullText);
    edu = parseEducation(tagText) || parseEducation(fullText);

    const act = findActiveInfoNear(card);
    return { card, title, company, location, salary, experience: exp, education: edu, fullText, activeDays: act ? act.days : null, activeLabel: act ? act.label : '', size: parseCompanySize(fullText) };
  }

  // -------------------------------------------------------------------------
  // 扫描职位卡片
  // -------------------------------------------------------------------------
  // 兜底卡片选择器：站点改版导致配置选择器失效时，按顺序尝试
  const FALLBACK_CARD_SELECTORS = [
    '.job-card-wrapper',
    '[class*="job-card-wrapper"]',
    '.search-job-result li',
    'ul[class*="job-list"] > li',
    '.job-list-box li',
    '[class*="job-card"][class*="item"]',
    '[class*="position-item"]',
    '[class*="jobItem"]'
  ];

  // 判断元素是否位于推荐位/猜你喜欢等次要列表区域
  function isRecAncestor(el) {
    for (let n = el, i = 0; n && n !== document.body && i < 8; i++, n = n.parentElement) {
      const cls = (typeof n.className === 'string') ? n.className : '';
      if (/rec-job|job-recommend|recommend|guess-like|guess-you-like|related-job/i.test(cls)) return true;
    }
    return false;
  }

  // 页面常同时存在主搜索结果列表与推荐位列表（如 ul.rec-job-list），
  // 推荐位徽章不渲染且混入会拉低识别率：优先只扫主列表。
  // 多个候选列表并存时，取含活跃徽章/位于搜索结果区/卡片最多的一簇
  function pickPrimaryCards(cards) {
    if (cards.length < 2) return cards;
    const main = cards.filter((c) => !isRecAncestor(c));
    const chosen = main.length ? main : cards;
    // 按所属列表容器聚类（向上找最近的 ul/ol）
    const byList = new Map();
    for (const c of chosen) {
      let list = c.parentElement || c;
      for (let n = c, i = 0; n && n !== document.body && i < 4; i++, n = n.parentElement) {
        if (n.tagName === 'UL' || n.tagName === 'OL') { list = n; break; }
        list = n;
      }
      if (!byList.has(list)) byList.set(list, []);
      byList.get(list).push(c);
    }
    if (byList.size <= 1) return chosen;
    let best = null;
    byList.forEach((list, container) => {
      const hasActive = ACTIVE_TEXT_RE.test((container.textContent || '').replace(/\s+/g, ''));
      let inSearch = false;
      try { inSearch = !!(container.closest && container.closest('.search-job-result')); } catch (e) { /* noop */ }
      const score = (hasActive ? 100000 : 0) + (inSearch ? 10000 : 0) + list.length;
      if (!best || score > best.score) best = { list, score };
    });
    return best ? best.list : chosen;
  }

  function findJobCards(cfg) {
    let cards = queryAll(document, cfg.cardSelector);
    if (!cards.length) {
      for (const sel of FALLBACK_CARD_SELECTORS) {
        cards = queryAll(document, sel);
        if (cards.length) break;
      }
    }
    // 兜底一：按“详情链接”聚类定位（比类名可靠：类名会被混淆，
    // 且搜索结果列表的详情链接通常比推荐模块多，聚类取最大簇即主列表）
    if (!cards.length && cfg.detailHrefKeyword) {
      cards = discoverByDetailLinks(cfg.detailHrefKeyword);
      if (cards.length) logDiscovery('详情链接聚类', cards);
    }
    // 兜底二：按 job-card 类名特征聚类
    if (!cards.length) {
      cards = autoDiscoverCards();
      if (cards.length) logDiscovery('类名聚类', cards);
    }
    // 主列表优先：剔除推荐位卡片，多列表并存时取主搜索结果列表
    cards = pickPrimaryCards(cards);
    // 只保留最外层卡片，剔除嵌套命中的子元素
    return cards.filter((el) => el && !cards.some((o) => o !== el && o.contains(el)));
  }

  function logDiscovery(method, cards) {
    if (state.discoveredLogged === method) return;
    state.discoveredLogged = method;
    const cls = String(cards[0].className || '').slice(0, 60);
    reportProgress(`已自动适配页面结构（${method}）：发现 ${cards.length} 张卡片 [${cls}]`, 'ok');
  }

  // 按“详情链接”定位职位列表：每个职位卡片都含指向详情页的链接，
  // 将链接按祖先元素聚类，取链接数最多的一簇（即主搜索结果列表，
  // 而非推荐位/侧边栏）。
  function discoverByDetailLinks(hrefKeyword) {
    const links = queryAll(document, `a[href*="${hrefKeyword}"]`);
    if (links.length < 5) return [];

    for (let depth = 0; depth <= 5; depth++) {
      const byAncestor = new Map();
      for (const a of links) {
        let anc = a;
        for (let i = 0; i <= depth && anc; i++) anc = anc.parentElement;
        if (!anc) continue;
        if (!byAncestor.has(anc)) byAncestor.set(anc, []);
        byAncestor.get(anc).push(a);
      }
      let bestAnc = null, bestCount = 0;
      byAncestor.forEach((list, anc) => {
        if (list.length > bestCount) { bestCount = list.length; bestAnc = anc; }
      });
      if (!bestAnc || bestCount < 5) continue;
      const cards = Array.from(bestAnc.children).filter((c) =>
        c.nodeType === 1 && (links.indexOf(c) >= 0 || links.some((x) => c.contains(x)))
      );
      if (cards.length >= 5) return cards;
    }
    return [];
  }

  // 结构自适应发现：当所有选择器失效时，
  // 依据“同一祖先下聚集了大量 class 含 job-card 的元素”这一特征定位职位列表。
  function autoDiscoverCards() {
    const candidates = queryAll(document, '[class*="job-card"], [class*="jobCard"], [class*="job-item"], [class*="jobItem"]');
    if (candidates.length < 5) return [];

    // 分别按 0/1/2 级祖先聚类，取最早命中的层
    for (let depth = 0; depth <= 2; depth++) {
      const byAncestor = new Map();
      for (const el of candidates) {
        let anc = el;
        for (let i = 0; i <= depth && anc; i++) anc = anc.parentElement;
        if (!anc) continue;
        if (!byAncestor.has(anc)) byAncestor.set(anc, []);
        byAncestor.get(anc).push(el);
      }
      let bestAnc = null, bestCount = 0;
      byAncestor.forEach((list, anc) => {
        if (list.length > bestCount) { bestCount = list.length; bestAnc = anc; }
      });
      if (!bestAnc || bestCount < 5) continue;
      // 卡片 = 该祖先下包含候选元素（或自身即候选）的子元素
      const cards = Array.from(bestAnc.children).filter((c) =>
        c.nodeType === 1 && (candidates.indexOf(c) >= 0 || candidates.some((x) => c.contains(x)))
      );
      if (cards.length >= 5) return cards;
    }
    return [];
  }

  function scanJobs(cfg) {
    const cards = findJobCards(cfg);
    const seen = new Set();
    const jobs = [];
    cards.forEach((card) => {
      const job = parseCard(card, cfg);
      if (!job.title && !job.company) return; // 无有效信息
      const key = (job.title + '|' + job.company);
      if (seen.has(key)) return;
      seen.add(key);
      jobs.push(job);
    });
    return jobs;
  }

  // SPA 列表异步渲染，找不到卡片时等待重试几轮
  async function scanJobsWithRetry(cfg, tries) {
    let jobs = scanJobs(cfg);
    let n = 0;
    while (!jobs.length && n < (tries || 3)) {
      await sleep(1200);
      jobs = scanJobs(cfg);
      n++;
    }
    return jobs;
  }

  // 扫描为 0 时输出诊断信息，便于定位页面结构变化
  function diagnoseCards() {
    const probes = ['.job-card-wrapper', '.search-job-result', '.job-list-box', '[class*="job-card"]', '[class*="joblist"]'];
    const info = probes.map((p) => `${p}=${queryAll(document, p).length}`).join(' ');
    reportProgress('未找到职位卡片，请等列表加载完再试。诊断: ' + info, 'warn');
  }

  // -------------------------------------------------------------------------
  // 筛选逻辑
  // -------------------------------------------------------------------------
  function matchesFilters(job, s) {
    const title = job.title || '';
    const company = job.company || '';
    // 新版 DOM 下地区字段可能解析失败，兜底到卡片全文（地区文本必然在卡片内）
    const locationText = job.location || job.fullText || title;

    // 统一转小写，做大小写不敏感匹配（如 java / Java / JAVA）
    const titleL = title.toLowerCase();
    const companyL = company.toLowerCase();

    // 1) 排除关键词
    const excludes = splitCsv(s.excludes);
    for (const w of excludes) {
      const wl = w.toLowerCase();
      if (titleL.includes(wl) || companyL.includes(wl)) {
        return { pass: false, reason: `排除词「${w}」` };
      }
    }

    // 2) 职位关键词
    const keywords = splitCsv(s.keywords);
    if (keywords.length) {
      if (!keywords.some((w) => titleL.includes(w.toLowerCase()))) {
        return { pass: false, reason: '职位关键词不符' };
      }
    }

    // 3) 城市地区
    const cities = splitCsv(s.cities);
    if (cities.length) {
      if (!cities.some((c) => locationText.includes(c))) {
        return { pass: false, reason: `地区不符（需含 ${cities.join('/')}）` };
      }
    }

    // 4) 工作年限（严格模式：勾选了筛选但识别不出年限时直接跳过，避免漏网）
    if (s.experience && s.experience.length) {
      if (job.experience) {
        if (!s.experience.includes(job.experience)) {
          return { pass: false, reason: `年限不符（${job.experience}）` };
        }
      } else {
        return { pass: false, reason: '未识别年限' };
      }
    }

    // 5) 学历（严格模式同上）
    if (s.education && s.education.length) {
      if (job.education) {
        if (!s.education.includes(job.education)) {
          return { pass: false, reason: `学历不符（${job.education}）` };
        }
      } else {
        return { pass: false, reason: '未识别学历' };
      }
    }

    // 6) 招聘者活跃时间：新版 BOSS 列表卡片不展示活跃徽章，只有详情页可见。
    //    卡片上能识别且超档 → 直接淘汰（省一次详情页访问）；
    //    识别不出 → 放行，由 queue-detail 流程在详情页逐个权威拦截
    if (s.activeDays > 0) {
      if (job.activeDays != null && job.activeDays > s.activeDays) {
        return { pass: false, reason: `活跃度不符（${job.activeLabel || `约${job.activeDays}天前活跃`}）` };
      }
    }

    // 7) 公司规模（新版列表卡片常不展示规模：识别不出时先放行，
    //    BOSS queue-detail 流程会在详情页二次校验后再决定是否沟通）
    if (s.sizes && s.sizes.length) {
      if (job.size && !s.sizes.includes(job.size)) {
        return { pass: false, reason: `规模不符（${job.size}）` };
      }
    }

    return { pass: true, reason: '' };
  }

  // -------------------------------------------------------------------------
  // 查找“投递/沟通”按钮
  // -------------------------------------------------------------------------
  function findApplyButton(card, cfg) {
    // 1) 配置的选择器
    const bySelector = queryFirst(card, cfg.applySelector);
    if (bySelector) return bySelector;

    // 2) 文案兜底：在卡片内找含“投递/沟通/申请/聊聊”的可点击元素
    const candidates = queryAll(card, 'a, button, [role="button"], [ka], span, div');
    const pattern = /投递|沟通|申请|聊聊|立即沟通|打\s*招呼|投递该职位/;
    for (const el of candidates) {
      const t = textOf(el);
      if (t && t.length < 12 && pattern.test(t)) return el;
    }
    return null;
  }

  function clickElement(el) {
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* noop */ }
    const opts = { bubbles: true, cancelable: true, view: window };
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach((type) => {
      try { el.dispatchEvent(new MouseEvent(type, opts)); } catch (e) { /* noop */ }
    });
    try { if (typeof el.click === 'function') el.click(); } catch (e) { /* noop */ }
  }

  // -------------------------------------------------------------------------
  // 卡片标记
  // -------------------------------------------------------------------------
  // 清除上次扫描留下的卡片标记（徽标文案含“活跃”字样，
  // 会干扰活跃度识别与信息块配对）
  function clearCardMarks() {
    pairCacheMap = new Map();
    queryAll(document, '.qzzdh-badge').forEach((b) => b.remove());
    queryAll(document, '.qzzdh-mark-match, .qzzdh-mark-skip, .qzzdh-mark-sent').forEach((el) => {
      el.classList.remove('qzzdh-mark-match', 'qzzdh-mark-skip', 'qzzdh-mark-sent');
    });
  }

  function markCard(card, type, reason) {
    card.classList.remove('qzzdh-mark-match', 'qzzdh-mark-skip', 'qzzdh-mark-sent');
    const old = card.querySelector('.qzzdh-badge');
    if (old) old.remove();

    if (type === 'match') card.classList.add('qzzdh-mark-match');
    if (type === 'skip') card.classList.add('qzzdh-mark-skip');
    if (type === 'sent') card.classList.add('qzzdh-mark-sent');

    const badge = document.createElement('span');
    badge.className = 'qzzdh-badge ' + type;
    badge.textContent = type === 'match' ? '符合' : type === 'sent' ? '已投递' : (reason || '跳过');
    card.style.position = 'relative';
    card.appendChild(badge);
  }

  // -------------------------------------------------------------------------
  // 进度上报
  // -------------------------------------------------------------------------
  function reportProgress(logText, level) {
    const data = {
      scan: state.scan, match: state.match, sent: state.sent, skip: state.skip,
      running: state.running,
      log: logText ? { text: logText, level: level || 'info' } : null
    };
    updatePanel(data, logText);
    try {
      chrome.runtime.sendMessage({ type: 'QZZDH_PROGRESS', data }, () => {
        void chrome.runtime.lastError; // 忽略 popup 未打开时的错误
      });
    } catch (e) { /* noop */ }
  }

  // -------------------------------------------------------------------------
  // 自动加载更多（翻页/下拉）
  // -------------------------------------------------------------------------
  async function loadMore(cfg, rounds) {
    for (let i = 0; i < rounds; i++) {
      // 用自适应发现统计卡片数（配置选择器在新版 DOM 下可能失效）
      const before = findJobCards(cfg).length;
      const container = queryFirst(document, cfg.scrollContainer) || window;
      try {
        if (container === window) {
          window.scrollTo(0, document.body.scrollHeight);
        } else {
          container.scrollTop = container.scrollHeight;
        }
      } catch (e) { /* noop */ }
      await sleep(1200);
      const after = findJobCards(cfg).length;
      if (after <= before) break; // 没有新内容了
    }
  }

  // -------------------------------------------------------------------------
  // 主流程：扫描
  // -------------------------------------------------------------------------
  async function doScan(settings) {
    state.site = detectSiteConfig();
    const cfg = state.site;
    if (!cfg) {
      reportProgress('未找到站点配置', 'err');
      return;
    }
    clearCardMarks(); // 清除上次扫描的标记，避免徽标文案干扰活跃识别
    if (settings.autoScroll) await loadMore(cfg, 6);

    const jobs = await scanJobsWithRetry(cfg);
    state.scan = jobs.length;
    state.match = 0; state.skip = 0;
    if (!jobs.length) {
      diagnoseCards();
      return;
    }

    // 活跃文案懒加载兜底：等渲染后重试一次
    await retryActiveDays(jobs, settings);

    const reasonCount = {};
    let pendingActive = 0; // 列表上识别不出活跃度、需进详情页核实的卡片数
    jobs.forEach((job) => {
      const r = matchesFilters(job, settings);
      if (r.pass) {
        state.match++;
        markCard(job.card, 'match');
        if (settings.activeDays > 0 && job.activeDays == null) pendingActive++;
      } else {
        state.skip++;
        markCard(job.card, 'skip', r.reason);
        const key = (r.reason || '其他').replace(/（[^）]*）/g, '');
        reasonCount[key] = (reasonCount[key] || 0) + 1;
      }
    });

    if (state.match) {
      const note = pendingActive ? `（其中 ${pendingActive} 张的活跃状态将在详情页核实）` : '';
      reportProgress(`扫描 ${state.scan} 条，匹配 ${state.match} 条${note}`, 'ok');
    } else {
      const summary = Object.keys(reasonCount)
        .sort((a, b) => reasonCount[b] - reasonCount[a])
        .map((k) => `${k}×${reasonCount[k]}`).join('、');
      const samples = jobs.slice(0, 3).map((j) => j.title || '(未解析到职位名)').join(' | ');
      reportProgress(`扫描 ${state.scan} 条，匹配 0 条。跳过原因：${summary || '无'}。示例职位名：${samples}`, 'warn');
    }
  }

  // -------------------------------------------------------------------------
  // 主流程：批量投递
  // -------------------------------------------------------------------------
  async function doStart(settings) {
    if (state.running) return;
    clearCardMarks(); // 清除上次扫描的标记，避免徽标文案干扰活跃识别
    const cfg = detectSiteConfig();
    // BOSS直聘：列表卡片无直接投递按钮，走“收集详情链接→逐页沟通”的专用流程
    if (cfg && cfg.mode === 'queue-detail') {
      return doBossQueueStart(settings, cfg);
    }
    state.running = true;
    state.stopFlag = false;
    state.site = cfg;
    if (!cfg) {
      state.running = false;
      reportProgress('未找到站点配置', 'err');
      return;
    }

    if (settings.autoScroll) await loadMore(cfg, 6);

    const jobs = await scanJobsWithRetry(cfg);
    state.scan = jobs.length;
    state.match = 0; state.sent = 0; state.skip = 0;
    if (!jobs.length) {
      state.running = false;
      setPanelRunning(false);
      diagnoseCards();
      return;
    }
    setPanelRunning(true);
    reportProgress(`开始投递，扫描到 ${jobs.length} 条`, 'info');

    // 合并历史投递记录（跨会话去重，投过的岗位不再重复投递）
    const appliedRec = await readAppliedRecords();
    Object.keys(appliedRec).forEach((k) => state.appliedKeys.add(k));

    const max = settings.maxCount || 30;
    const intervalMs = Math.max(1, settings.interval || 3) * 1000;

    for (const job of jobs) {
      if (state.stopFlag) break;
      if (state.sent >= max) { reportProgress(`已达最大投递数 ${max}`, 'warn'); break; }

      const r = matchesFilters(job, settings);
      if (!r.pass) {
        state.skip++;
        markCard(job.card, 'skip', r.reason);
        continue;
      }
      state.match++;

      const key = (job.title + '|' + job.company);
      if (state.appliedKeys.has(key)) {
        state.skip++;
        markCard(job.card, 'skip', '已投递过');
        continue;
      }

      if (settings.dryRun) {
        markCard(job.card, 'match');
        reportProgress(`[预演] 符合：${job.title} @ ${job.company}`, 'info');
        state.sent++;
        continue;
      }

      // 实际投递
      const btn = findApplyButton(job.card, cfg);
      if (btn) {
        clickElement(btn);
        state.appliedKeys.add(key);
        markApplied(key); // 持久化，下次筛选自动跳过
        state.sent++;
        markCard(job.card, 'sent');
        reportProgress(`已投递：${job.title} @ ${job.company}`, 'ok');
      } else {
        state.skip++;
        markCard(job.card, 'skip', '未找到投递按钮');
        reportProgress(`跳过（无投递按钮）：${job.title}`, 'warn');
      }

      await sleep(jitter(intervalMs));
    }

    state.running = false;
    setPanelRunning(false);
    reportProgress(`完成：投递 ${state.sent}，跳过 ${state.skip}`, 'ok');
    notify('批量投递完成', `已投递 ${state.sent} 条，跳过 ${state.skip} 条`);
  }

  function doStop() {
    state.stopFlag = true;
    state.running = false;
    setPanelRunning(false);
    reportProgress('已手动停止', 'warn');
    // 同步停止 BOSS 后台编排队列
    try {
      chrome.runtime.sendMessage({ type: 'QZZDH_BOSS_STOP' }, () => void chrome.runtime.lastError);
    } catch (e) { /* noop */ }
  }

  function notify(title, message) {
    try {
      chrome.runtime.sendMessage({ type: 'QZZDH_NOTIFY', title, message }, () => {
        void chrome.runtime.lastError;
      });
    } catch (e) { /* noop */ }
  }

  // -------------------------------------------------------------------------
  // BOSS直聘专用：列表收集详情链接 → 后台逐页导航 → 详情页自动“立即沟通”
  // -------------------------------------------------------------------------
  function absUrl(href) {
    try { return new URL(href, location.origin).href; } catch (e) { return ''; }
  }

  function readBossState() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['qzzdh_boss'], (r) => resolve(r.qzzdh_boss || null));
      } catch (e) { resolve(null); }
    });
  }

  function writeBossState(st) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ qzzdh_boss: st }, () => resolve()); }
      catch (e) { resolve(); }
    });
  }

  // ---- 已投递记录（跨会话持久化，重新筛选时自动跳过已投过的岗位）----
  function readAppliedRecords() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['qzzdh_applied'], (r) => resolve(r.qzzdh_applied || {}));
      } catch (e) { resolve({}); }
    });
  }

  function writeAppliedRecords(rec) {
    return new Promise((resolve) => {
      try { chrome.storage.local.set({ qzzdh_applied: rec }, () => resolve()); }
      catch (e) { resolve(); }
    });
  }

  async function markApplied(key) {
    if (!key) return;
    const rec = await readAppliedRecords();
    if (!rec[key]) {
      rec[key] = Date.now();
      await writeAppliedRecords(rec);
    }
  }

  // 去重键：链接只取路径（忽略跟踪参数），避免同一职位因参数不同被当作新岗位
  function hrefKey(href) {
    try { return new URL(href).pathname; } catch (e) { return href; }
  }

  // 提取详情页链接：类名会被混淆，但链接可靠，多级兜底
  function findDetailHref(card, cfg) {
    // 1) 配置的详情链接选择器
    let link = queryFirst(card, cfg.detailSelector);
    let href = link ? (link.getAttribute('href') || '') : '';
    // 2) 卡片内任意含详情关键词的链接
    if (!href && cfg.detailHrefKeyword) {
      link = queryFirst(card, `a[href*="${cfg.detailHrefKeyword}"]`);
      href = link ? (link.getAttribute('href') || '') : '';
    }
    // 3) 卡片自身就是链接（整卡可点的新布局）
    if (!href && card.tagName === 'A') href = card.getAttribute('href') || '';
    if (href === '#') href = '';
    // 4) 新版布局标题链接 href="#"（SPA 路由）：用 data-jobid 拼详情页
    if (!href && card.getAttribute) {
      const jid = card.getAttribute('data-jobid') || card.getAttribute('data-jid') || '';
      if (jid) href = `/job_detail/${jid}.html`;
    }
    // 5) 任意非 javascript 链接兜底（排除公司主页等非详情链接）
    if (!href) {
      const any = queryAll(card, 'a[href]').filter((a) => {
        const h = a.getAttribute('href') || '';
        if (!h || h.startsWith('javascript') || h === '#') return false;
        return !/gongsi|company|brand/i.test(h);
      });
      if (any.length) href = any[0].getAttribute('href');
    }
    return href ? absUrl(href) : '';
  }

  // 列表页：扫描筛选后收集详情页链接，交给后台逐个打开
  async function doBossQueueStart(settings, cfg) {
    state.site = cfg;
    buildPanel();
    if (settings.autoScroll) await loadMore(cfg, 6);

    const jobs = await scanJobsWithRetry(cfg);
    state.scan = jobs.length;
    state.match = 0; state.sent = 0; state.skip = 0;
    if (!jobs.length) {
      state.running = false;
      setPanelRunning(false);
      diagnoseCards();
      return;
    }

    // 活跃文案懒加载兜底：等渲染后重试一次
    await retryActiveDays(jobs, settings);

    const queue = [];
    const seen = new Set();
    const reasonCount = {};
    // 历史已投递记录：投过的岗位直接跳过，不重复沟通
    const applied = await readAppliedRecords();
    let appliedSkipped = 0;
    for (const job of jobs) {
      const r = matchesFilters(job, settings);
      if (!r.pass) {
        state.skip++;
        markCard(job.card, 'skip', r.reason);
        const key = (r.reason || '其他').replace(/（[^）]*）/g, '');
        reasonCount[key] = (reasonCount[key] || 0) + 1;
        continue;
      }
      state.match++;
      const href = findDetailHref(job.card, cfg);
      const jkey = href ? hrefKey(href) : '';
      if (jkey && applied[jkey]) {
        state.skip++;
        appliedSkipped++;
        markCard(job.card, 'sent');
        continue;
      }
      if (href && !seen.has(jkey)) {
        seen.add(jkey);
        queue.push(href);
        markCard(job.card, 'match');
      } else if (!href) {
        state.skip++;
        markCard(job.card, 'skip', '未找到详情链接');
        reasonCount['未找到详情链接'] = (reasonCount['未找到详情链接'] || 0) + 1;
      }
      if (settings.maxCount && queue.length >= settings.maxCount) break;
    }

    if (!queue.length) {
      const summary = Object.keys(reasonCount)
        .sort((a, b) => reasonCount[b] - reasonCount[a])
        .map((k) => `${k}×${reasonCount[k]}`).join('、');
      const samples = jobs.slice(0, 3).map((j) => j.title || '(未解析到职位名)').join(' | ');
      reportProgress(`未收集到可投递的职位。跳过原因：${summary || '无'}。示例职位名：${samples}`, 'warn');
      return;
    }
    if (settings.dryRun) {
      reportProgress(`[预演] BOSS 匹配 ${queue.length} 个职位，未实际沟通`, 'ok');
      return;
    }

    const st = {
      queue, index: 0, running: true, sent: 0, skip: 0,
      settings: {
        interval: settings.interval || 3,
        maxCount: settings.maxCount || queue.length,
        sizes: settings.sizes || [], // 详情页二次校验公司规模用
        activeDays: settings.activeDays > 0 ? settings.activeDays : 0 // 详情页权威校验活跃度用
      },
      activePath: ''
    };
    await writeBossState(st);
    // 队列启动：立即置为运行中，确保停止按钮可点
    state.running = true;
    setPanelRunning(true);
    reportProgress(`BOSS：${queue.length} 个职位待沟通` + (appliedSkipped ? `（已跳过历史投递 ${appliedSkipped} 个）` : '') + '，开始逐页打开', 'ok');
    if (settings.activeDays > 0) {
      reportProgress(`活跃度档位已启用：逐个打开详情页核实招聘者活跃状态，超档自动跳过`, 'info');
    }
    try {
      chrome.runtime.sendMessage({ type: 'QZZDH_BOSS_START' }, () => void chrome.runtime.lastError);
    } catch (e) { /* noop */ }
  }

  function findButtonByText(root, selectors, texts) {
    for (const sel of selectors) {
      const el = queryFirst(root, sel);
      if (el) return el;
    }
    const nodes = queryAll(root, 'a, button, span, div, [role="button"]');
    for (const el of nodes) {
      const t = textOf(el);
      if (t && t.length < 12 && texts.some((w) => t.includes(w))) return el;
    }
    return null;
  }

  async function waitForButton(selectors, texts, timeout) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = findButtonByText(document, selectors, texts);
      if (el) return el;
      await sleep(400);
    }
    return null;
  }

  // 详情页：读取招聘者活跃状态。新版 BOSS 列表卡片不带活跃徽章，
  // 进入详情页后招聘者卡片才会渲染活跃文案（如“今日活跃/半年前活跃”）
  function findDetailBossActive() {
    // 1) 已知招聘者信息区块类名，优先在局部范围内找
    const scopes = ['.boss-info', '[class*="boss-info"]', '[class*="boss-card"]', '[class*="boss-wrapper"]', '.job-boss-info', '[class*="bossInfo"]'];
    for (const sel of scopes) {
      const el = queryFirst(document, sel);
      if (!el) continue;
      const t = cardRichText(el);
      const d = parseActiveDays(t);
      if (d != null) return { days: d, label: extractActiveLabel(t) || '' };
    }
    // 2) 兜底：遍历页面短文本节点，按 DOM 顺序取首个命中
    //    （招聘者卡片在页面靠前位置，优先于底部“相似职位”里其他招聘者的文案）
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const t = (node.nodeValue || '').replace(/\s+/g, '');
        if (!t || t.length > 20 || !ACTIVE_TEXT_RE.test(t)) continue;
        const el = node.parentElement;
        if (!el) continue;
        try {
          if (el.closest('script, style, noscript, textarea')) continue;
          if (el.closest('#qzzdh-panel, #qzzdh-reopen, .qzzdh-badge')) continue;
        } catch (e) { /* noop */ }
        const d = parseActiveDays(t);
        if (d != null) return { days: d, label: extractActiveLabel(t) || t };
      }
    } catch (e) { /* noop */ }
    return null;
  }

  // 详情页提取公司规模：优先在公司信息区块里找，找不到再退到全文
  function findDetailCompanySize() {
    const scopes = ['.company-info', '.company-card', '[class*="company-info"]', '[class*="companyInfo"]', '.job-banner'];
    for (const sel of scopes) {
      const el = queryFirst(document, sel);
      if (!el) continue;
      const size = parseCompanySize(textOf(el));
      if (size) return size;
    }
    return parseCompanySize(textOf(document.body));
  }

  // 详情页自动点“立即沟通”。若是编排中的详情页返回 true，否则 false。
  async function bossDetailAutoApply() {
    const cfg = detectSiteConfig();
    if (!cfg || cfg.mode !== 'queue-detail') return false;
    if (cfg.detailUrlPattern && !cfg.detailUrlPattern.test(location.href)) return false;
    const st = await readBossState();
    if (!st || !st.running) return false;
    if (window.__qzzdhBossDone) return true;
    window.__qzzdhBossDone = true;

    const selectors = cfg.applyOnDetailSelector
      ? String(cfg.applyOnDetailSelector).split(',').map((s) => s.trim()) : [];
    const texts = ['立即沟通', '继续沟通', '和TA聊聊', '开聊'];

    await sleep(1500); // 等详情页渲染

    const bossSettings = (st && st.settings) || {};
    // 招聘者活跃度权威校验：列表卡片不带活跃徽章，详情页是唯一可靠来源。
    // 超档或识别不出 → 直接跳过，严格执行所选档位
    if (bossSettings.activeDays > 0) {
      let act = findDetailBossActive();
      if (!act) { await sleep(2000); act = findDetailBossActive(); }
      if (!act || act.days > bossSettings.activeDays) {
        try {
          chrome.runtime.sendMessage({ type: 'QZZDH_BOSS_NEXT', result: 'skip' }, () => void chrome.runtime.lastError);
        } catch (e) { /* noop */ }
        return true;
      }
    }

    // 公司规模二次校验（列表卡片常不展示规模，在详情页拦截）
    if (bossSettings.sizes && bossSettings.sizes.length) {
      const size = findDetailCompanySize();
      if (size && !bossSettings.sizes.includes(size)) {
        try {
          chrome.runtime.sendMessage({ type: 'QZZDH_BOSS_NEXT', result: 'skip' }, () => void chrome.runtime.lastError);
        } catch (e) { /* noop */ }
        return true;
      }
    }

    const btn = await waitForButton(selectors, texts, 6000);

    // 点击前二次确认队列未被停止，避免停止后仍发起沟通
    if (btn) {
      const cur = await readBossState();
      if (!cur || !cur.running) return true;
    }

    // 先回报结果再执行点击；后台会按 interval 控制下一页打开的节奏
    const result = btn ? 'sent' : 'skip';
    try {
      chrome.runtime.sendMessage({ type: 'QZZDH_BOSS_NEXT', result }, () => void chrome.runtime.lastError);
    } catch (e) { /* noop */ }
    if (btn) clickElement(btn);
    // 记录已投递（按详情页路径去重），下次筛选时自动跳过
    if (btn) markApplied(hrefKey(location.href));
    return true;
  }

  // -------------------------------------------------------------------------
  // 右侧栏：完整筛选面板（设置 + 操作 + 进度日志，不再依赖扩展弹窗）
  // -------------------------------------------------------------------------
  const SB_EXP_OPTIONS = ['应届', '1年以下', '1-3年', '3-5年', '5-10年', '10年以上'];
  const SB_EDU_OPTIONS = ['学历不限', '初中及以下', '高中/中专', '大专', '本科', '硕士', '博士'];
  const SB_SIZE_OPTIONS = ['0-20人', '20-99人', '100-499人', '500-999人', '1000-9999人', '10000人以上'];
  const SB_ACTIVE_OPTIONS = [
    { label: '不限', value: 0 }, { label: '今日', value: 1 }, { label: '3日内', value: 3 },
    { label: '7日内', value: 7 }, { label: '30日内', value: 30 }
  ];
  const SB_DEFAULT_SIZES = ['20-99人', '100-499人', '500-999人', '1000-9999人', '10000人以上'];

  const sbSel = { exp: new Set(), edu: new Set(), size: new Set() };
  let sbActiveDays = 7;
  let panelEls = null;

  function buildPanel() {
    if (document.getElementById('qzzdh-panel')) {
      document.body.classList.add('qzzdh-sidebar-open');
      return;
    }
    const panel = document.createElement('div');
    panel.id = 'qzzdh-panel';
    panel.innerHTML = `
      <div id="qzzdh-panel-head">
        <span class="qzzdh-title">🎯 求职助手</span>
        <span class="qzzdh-collapse" id="qzzdh-collapse">–</span>
      </div>
      <div id="qzzdh-panel-body">
        <div class="qz-site"><span class="qz-dot"></span><span id="qz-site-name">检测站点中…</span></div>

        <div class="qz-section">
          <div class="qz-section-title">筛选条件</div>
          <div class="qz-field"><label>工作年限</label><div class="qz-chips" id="qz-exp"></div></div>
          <div class="qz-field"><label>学历要求</label><div class="qz-chips" id="qz-edu"></div></div>
          <div class="qz-field"><label>招聘者活跃时间</label><div class="qz-chips" id="qz-active"></div>
            <p class="qz-hint">投递前逐个打开详情页核实，避开僵尸岗位</p></div>
          <div class="qz-field"><label>公司规模</label><div class="qz-chips" id="qz-size"></div>
            <p class="qz-hint">多选，不勾选任何档位则不限制</p></div>
          <div class="qz-field"><label>城市地区</label>
            <input class="qz-input" id="qz-city" placeholder="如：广州、深圳，留空不限制"></div>
          <div class="qz-field"><label>职位关键词（可选）</label>
            <input class="qz-input" id="qz-keywords" placeholder="如：全栈、Java，留空不限制"></div>
          <div class="qz-field"><label>排除关键词（可选）</label>
            <input class="qz-input" id="qz-excludes" placeholder="如：外包、实习生，留空不排除"></div>
        </div>

        <div class="qz-section">
          <div class="qz-section-title">投递策略</div>
          <div class="qz-row">
            <div class="qz-field half"><label>间隔（秒）</label>
              <input class="qz-input" type="number" id="qz-interval" min="1" max="60" value="3"></div>
            <div class="qz-field half"><label>最大投递数</label>
              <input class="qz-input" type="number" id="qz-max" min="1" max="500" value="30"></div>
          </div>
          <label class="qz-switch"><input type="checkbox" id="qz-autoscroll" checked>
            <span>自动翻页 / 下拉加载更多职位</span></label>
          <label class="qz-switch"><input type="checkbox" id="qz-dryrun">
            <span>预演模式（只筛选不投递）</span></label>
        </div>

        <div class="qzzdh-btns">
          <button class="qzzdh-btn" id="qz-scanbtn">扫描筛选</button>
          <button class="qzzdh-btn start" id="qz-start">开始投递</button>
          <button class="qzzdh-btn stop" id="qz-stop" disabled>停止</button>
        </div>

        <div class="qz-section">
          <div class="qz-section-title">运行状态</div>
          <div class="qzzdh-stats">
            <div class="qzzdh-stat"><b id="qz-scan">0</b><i>扫描</i></div>
            <div class="qzzdh-stat"><b id="qz-match">0</b><i>匹配</i></div>
            <div class="qzzdh-stat"><b id="qz-sent">0</b><i>已投递</i></div>
            <div class="qzzdh-stat"><b id="qz-skip">0</b><i>跳过</i></div>
          </div>
          <div class="qzzdh-progress"><div class="qzzdh-progress-bar" id="qz-bar"></div></div>
          <div class="qzzdh-status-text" id="qz-status">待命</div>
          <div class="qz-log" id="qz-log"></div>
          <button class="qz-link-btn" id="qz-clearapplied">清空已投递记录</button>
          <button class="qz-link-btn" id="qz-diagnose">DOM 诊断（活跃文案）</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    document.body.classList.add('qzzdh-sidebar-open');

    panelEls = {
      panel,
      scan: panel.querySelector('#qz-scan'),
      match: panel.querySelector('#qz-match'),
      sent: panel.querySelector('#qz-sent'),
      skip: panel.querySelector('#qz-skip'),
      bar: panel.querySelector('#qz-bar'),
      status: panel.querySelector('#qz-status'),
      log: panel.querySelector('#qz-log'),
      scanBtn: panel.querySelector('#qz-scanbtn'),
      start: panel.querySelector('#qz-start'),
      stop: panel.querySelector('#qz-stop'),
      collapse: panel.querySelector('#qzzdh-collapse'),
      siteName: panel.querySelector('#qz-site-name'),
      siteDot: panel.querySelector('.qz-dot'),
      city: panel.querySelector('#qz-city'),
      keywords: panel.querySelector('#qz-keywords'),
      excludes: panel.querySelector('#qz-excludes'),
      interval: panel.querySelector('#qz-interval'),
      max: panel.querySelector('#qz-max'),
      autoScroll: panel.querySelector('#qz-autoscroll'),
      dryRun: panel.querySelector('#qz-dryrun'),
      clearApplied: panel.querySelector('#qz-clearapplied'),
      diagnose: panel.querySelector('#qz-diagnose')
    };

    // 站点状态
    if (state.site) {
      panelEls.siteName.textContent = `已识别：${state.site.name}`;
      panelEls.siteDot.classList.add('ok');
    } else {
      panelEls.siteName.textContent = '当前站点不受支持';
      panelEls.siteDot.classList.add('bad');
    }

    // 折叠：隐藏侧栏并让页面恢复原宽度，右下角留小按钮随时展开
    panelEls.collapse.addEventListener('click', () => {
      panel.style.display = 'none';
      document.body.classList.remove('qzzdh-sidebar-open');
      showReopenButton();
    });

    bindSidebar();
    loadSettingsIntoSidebar();
    // popup 端修改设置时同步到侧栏；BOSS 队列状态变化时同步按钮可用性
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.qzzdh_settings) loadSettingsIntoSidebar();
        if (changes.qzzdh_boss) {
          const running = !!(changes.qzzdh_boss.newValue && changes.qzzdh_boss.newValue.running);
          if (running !== state.running) {
            state.running = running;
            setPanelRunning(running);
          }
        }
      });
    } catch (e) { /* noop */ }
  }

  // 折叠后的重新展开按钮（右下角小圆钮）
  function showReopenButton() {
    let btn = document.getElementById('qzzdh-reopen');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'qzzdh-reopen';
      btn.textContent = '🎯';
      btn.title = '打开求职助手';
      btn.addEventListener('click', () => {
        const panel = document.getElementById('qzzdh-panel');
        if (panel) panel.style.display = '';
        document.body.classList.add('qzzdh-sidebar-open');
        btn.style.display = 'none';
      });
      document.body.appendChild(btn);
    } else {
      btn.style.display = '';
    }
  }

  // ---- 侧栏交互：chips 渲染 / 收集 / 保存 / 回填 ----
  function sbRenderMultiChips(container, options, set) {
    container.innerHTML = '';
    options.forEach((opt) => {
      const chip = document.createElement('span');
      chip.className = 'qz-chip' + (set.has(opt) ? ' active' : '');
      chip.textContent = opt;
      chip.addEventListener('click', () => {
        if (set.has(opt)) set.delete(opt); else set.add(opt);
        chip.classList.toggle('active');
        saveSidebarSettings();
      });
      container.appendChild(chip);
    });
  }

  function sbRenderActiveChips() {
    const container = document.getElementById('qz-active');
    if (!container) return;
    container.innerHTML = '';
    SB_ACTIVE_OPTIONS.forEach((opt) => {
      const chip = document.createElement('span');
      chip.className = 'qz-chip' + (sbActiveDays === opt.value ? ' active' : '');
      chip.textContent = opt.label;
      chip.addEventListener('click', () => {
        sbActiveDays = opt.value;
        sbRenderActiveChips();
        saveSidebarSettings();
      });
      container.appendChild(chip);
    });
  }

  function clampNum(n, min, max) {
    return Math.min(Math.max(n, min), max);
  }

  function collectSidebarSettings() {
    return {
      experience: [...sbSel.exp],
      education: [...sbSel.edu],
      sizes: [...sbSel.size],
      cities: panelEls.city.value,
      keywords: panelEls.keywords.value,
      excludes: panelEls.excludes.value,
      interval: clampNum(parseInt(panelEls.interval.value, 10) || 3, 1, 60),
      maxCount: clampNum(parseInt(panelEls.max.value, 10) || 30, 1, 500),
      autoScroll: panelEls.autoScroll.checked,
      dryRun: panelEls.dryRun.checked,
      activeDays: sbActiveDays
    };
  }

  function saveSidebarSettings() {
    try {
      chrome.storage.local.set({ qzzdh_settings: collectSidebarSettings() });
    } catch (e) { /* noop */ }
  }

  function applySettingsToSidebar(s) {
    sbSel.exp.clear(); (s.experience || []).forEach((e) => sbSel.exp.add(e));
    sbSel.edu.clear(); (s.education || []).forEach((e) => sbSel.edu.add(e));
    sbSel.size.clear(); (s.sizes || SB_DEFAULT_SIZES).forEach((e) => sbSel.size.add(e));
    sbActiveDays = (typeof s.activeDays === 'number') ? s.activeDays : 7;
    panelEls.city.value = s.cities || '';
    panelEls.keywords.value = s.keywords || '';
    panelEls.excludes.value = s.excludes || '';
    panelEls.interval.value = s.interval ?? 3;
    panelEls.max.value = s.maxCount ?? 30;
    panelEls.autoScroll.checked = s.autoScroll !== false;
    panelEls.dryRun.checked = !!s.dryRun;
    sbRenderMultiChips(document.getElementById('qz-exp'), SB_EXP_OPTIONS, sbSel.exp);
    sbRenderMultiChips(document.getElementById('qz-edu'), SB_EDU_OPTIONS, sbSel.edu);
    sbRenderMultiChips(document.getElementById('qz-size'), SB_SIZE_OPTIONS, sbSel.size);
    sbRenderActiveChips();
  }

  function loadSettingsIntoSidebar() {
    loadSettings().then((s) => {
      if (panelEls) applySettingsToSidebar(s);
    });
  }

  function bindSidebar() {
    // 输入/开关变更即保存
    ['city', 'keywords', 'excludes', 'interval', 'max'].forEach((k) => {
      panelEls[k].addEventListener('change', saveSidebarSettings);
    });
    panelEls.autoScroll.addEventListener('change', saveSidebarSettings);
    panelEls.dryRun.addEventListener('change', saveSidebarSettings);

    // 操作按钮：直接用侧栏当前设置执行
    panelEls.scanBtn.addEventListener('click', () => {
      const s = collectSidebarSettings();
      saveSidebarSettings();
      doScan(s);
    });
    panelEls.start.addEventListener('click', () => {
      const s = collectSidebarSettings();
      saveSidebarSettings();
      doStart(s);
    });
    panelEls.stop.addEventListener('click', doStop);

    // 清空历史投递记录（之后重新筛选会再次投递这些岗位）
    panelEls.clearApplied.addEventListener('click', () => {
      if (!window.confirm('确定清空所有已投递记录？清空后重新筛选时会再次投递这些岗位。')) return;
      try {
        chrome.storage.local.remove(['qzzdh_applied'], () => void chrome.runtime.lastError);
      } catch (e) { /* noop */ }
      appendLog('已清空投递记录', 'warn');
    });

    // DOM 诊断：输出“活跃”文案所在元素的类名层级（替代 F12 检查元素）
    panelEls.diagnose.addEventListener('click', diagnoseActiveDom);
  }

  // 诊断：页面结构 + “活跃”文案全面排查（BOSS 有反调试，开 F12 会关页，用此替代）
  function diagnoseActiveDom() {
    // 1) 页面结构：职位链接数 + 失效卡片数（虚拟列表滚动后旧节点会被移出 DOM）
    const links = queryAll(document, 'a[href*="job_detail"]');
    let cardNodes = [];
    try { cardNodes = findJobCards(state.site || {}); } catch (e) { cardNodes = []; }
    const deadCards = cardNodes.filter((c) => !c.isConnected).length;
    const recCards = cardNodes.filter((c) => isRecAncestor(c)).length;
    appendLog(`诊断：job_detail 链接 ${links.length} 个 | 卡片 ${cardNodes.length} 张${deadCards ? `（其中 ${deadCards} 张已脱离页面）` : ''}${recCards ? `（其中 ${recCards} 张位于推荐位列表）` : ''}`, 'info');

    // 2) 文本节点采样（排除插件自己的徽标/侧栏）
    const hits = [];
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const t = (node.nodeValue || '').replace(/\s+/g, '');
        if (!/活跃/.test(t) || t.length > 40) continue;
        const el = node.parentElement;
        if (!el) continue;
        try { if (el.closest('.qzzdh-badge, #qzzdh-panel, #qzzdh-reopen')) continue; } catch (e) { /* noop */ }
        hits.push(t.slice(0, 16));
        if (hits.length >= 5) break;
      }
    } catch (e) { /* noop */ }
    if (hits.length) {
      appendLog('诊断：站点原生“活跃”文案样本：' + hits.join(' | '), 'info');
      return;
    }

    // 3) 无文案：转储首张卡片的类名链与全部属性（徽章可能藏在 data-* 里）
    appendLog('诊断：页面里没有站点原生的“活跃”文案，转储首张卡片供排查', 'warn');
    const first = cardNodes[0];
    if (!first) {
      appendLog('诊断：当前未找到职位卡片（请等列表加载完再点）', 'warn');
      return;
    }
    const chain = [];
    for (let el = first, i = 0; el && i < 3; i++) {
      const cls = (typeof el.className === 'string')
        ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      chain.push(el.tagName.toLowerCase() + (cls ? '.' + cls : ''));
      el = el.parentElement;
    }
    appendLog('诊断卡片：' + chain.join(' > '), 'info');
    try {
      const attrs = {};
      queryAll(first, '*').concat([first]).forEach((el) => {
        Array.from(el.attributes || []).forEach((at) => {
          const key = el.tagName.toLowerCase() + '@' + at.name;
          if (!attrs[key]) attrs[key] = at.value;
        });
      });
      const parts = Object.keys(attrs).map((k) => `${k}=${attrs[k].slice(0, 24)}`);
      for (let i = 0; i < parts.length; i += 10) {
        appendLog('诊断属性' + (i ? `(${i + 1})` : '') + '：' + parts.slice(i, i + 10).join(' '), 'info');
      }
    } catch (e) { /* noop */ }
  }

  function updatePanel(data, statusText) {
    if (!panelEls) return;
    panelEls.scan.textContent = data.scan ?? 0;
    panelEls.match.textContent = data.match ?? 0;
    panelEls.sent.textContent = data.sent ?? 0;
    panelEls.skip.textContent = data.skip ?? 0;
    // 同步运行态（后台队列结束/停止时恢复按钮可用性）
    if (typeof data.running === 'boolean' && data.running !== state.running) {
      state.running = data.running;
      setPanelRunning(data.running);
    }
    const total = Math.max(data.match || 0, (data.sent || 0) + (data.skip || 0), 1);
    const done = (data.sent || 0) + (data.skip || 0);
    panelEls.bar.style.width = Math.min(100, Math.round((done / total) * 100)) + '%';
    if (statusText) {
      panelEls.status.textContent = statusText;
      appendLog(statusText);
    }
  }

  function appendLog(text, level) {
    if (!panelEls || !panelEls.log) return;
    const line = document.createElement('div');
    line.className = 'qz-log-line l-' + (level || 'info');
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    line.textContent = `[${time}] ${text}`;
    panelEls.log.appendChild(line);
    // 最多保留 200 行
    while (panelEls.log.children.length > 200) panelEls.log.removeChild(panelEls.log.firstChild);
    panelEls.log.scrollTop = panelEls.log.scrollHeight;
  }

  function setPanelRunning(running) {
    if (!panelEls) return;
    panelEls.start.disabled = running;
    panelEls.stop.disabled = !running;
    if (panelEls.scanBtn) panelEls.scanBtn.disabled = running;
  }

  // -------------------------------------------------------------------------
  // 读取配置
  // -------------------------------------------------------------------------
  function loadSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(['qzzdh_settings'], (res) => {
          resolve(res.qzzdh_settings || {});
        });
      } catch (e) {
        resolve({});
      }
    });
  }

  // -------------------------------------------------------------------------
  // 消息监听（来自 popup）
  // -------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
    // 接收后台广播的进度（BOSS 后台编排时同步刷新面板）
    if (msg.type === 'QZZDH_PROGRESS') {
      if (msg.data) updatePanel(msg.data, msg.data.log ? msg.data.log.text : null);
      return false;
    }
    if (msg.type !== 'QZZDH_CONTROL') return false;

    const settings = msg.settings || {};
    if (msg.action === 'scan') {
      buildPanel();
      doScan(settings).then(() => sendResponse({
        ok: true,
        data: { scan: state.scan, match: state.match, sent: state.sent, skip: state.skip }
      }));
      return true; // 异步响应
    }
    if (msg.action === 'start') {
      buildPanel();
      doStart(settings);
      sendResponse({ ok: true, data: { scan: state.scan, match: state.match, sent: state.sent, skip: state.skip } });
      return false;
    }
    if (msg.action === 'stop') {
      doStop();
      sendResponse({ ok: true, data: { scan: state.scan, match: state.match, sent: state.sent, skip: state.skip } });
      return false;
    }
    if (msg.action === 'ping') {
      sendResponse({ ok: true, site: state.site ? state.site.name : '未知' });
      return false;
    }
    return false;
  });

  // -------------------------------------------------------------------------
  // 初始化：页面加载后构建面板
  // -------------------------------------------------------------------------
  async function init() {
    state.site = detectSiteConfig();
    // 若当前是 BOSS 编排中的详情页：不建面板，直接自动沟通
    const handled = await bossDetailAutoApply();
    if (handled) return;
    buildPanel();
    if (state.site) {
      reportProgress(`已就绪：${state.site.name}`, 'ok');
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 300);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  }
})();

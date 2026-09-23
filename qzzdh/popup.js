/**
 * popup.js —— 设置面板逻辑
 * 负责：读取/保存筛选配置、检测当前站点、向 content script 下发指令、
 *       订阅运行进度并渲染到 UI。
 */
'use strict';

// ---------------------------------------------------------------------------
// 选项默认值
// ---------------------------------------------------------------------------
const EXP_OPTIONS = ['应届', '1年以下', '1-3年', '3-5年', '5-10年', '10年以上'];
const EDU_OPTIONS = ['学历不限', '初中及以下', '高中/中专', '大专', '本科', '硕士', '博士'];
const SIZE_OPTIONS = ['0-20人', '20-99人', '100-499人', '500-999人', '1000-9999人', '10000人以上'];
// 招聘者活跃时间档位（单选）：值 = 允许的最大活跃天数，0 = 不限制
const ACTIVE_OPTIONS = [
  { label: '不限', value: 0 },
  { label: '今日', value: 1 },
  { label: '3日内', value: 3 },
  { label: '7日内', value: 7 },
  { label: '30日内', value: 30 }
];

const DEFAULT_SETTINGS = {
  experience: [],          // 选中的工作年限（多选）
  education: [],           // 选中的学历要求（多选）
  cities: '',              // 城市地区，逗号分隔
  keywords: '',            // 职位关键词，逗号分隔
  excludes: '',            // 排除关键词，逗号分隔
  interval: 3,             // 投递间隔（秒）
  maxCount: 30,            // 最大投递数
  autoScroll: true,        // 自动翻页/下拉
  dryRun: false,           // 预演模式
  activeDays: 7,           // 招聘者活跃时间上限（天），0 = 不限制
  // 公司规模（多选），默认排除 0-20 人的微型公司
  sizes: ['20-99人', '100-499人', '500-999人', '1000-9999人', '10000人以上']
};

// ---------------------------------------------------------------------------
// DOM 引用
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  siteBar: $('siteBar'), siteName: $('siteName'),
  expChips: $('expChips'), eduChips: $('eduChips'), activeChips: $('activeChips'), sizeChips: $('sizeChips'),
  cityInput: $('cityInput'), keywordInput: $('keywordInput'), excludeInput: $('excludeInput'),
  intervalInput: $('intervalInput'), maxInput: $('maxInput'),
  autoScrollChk: $('autoScrollChk'), dryRunChk: $('dryRunChk'),
  scanBtn: $('scanBtn'), startBtn: $('startBtn'), stopBtn: $('stopBtn'),
  statusCard: $('statusCard'),
  statScan: $('statScan'), statMatch: $('statMatch'), statSent: $('statSent'), statSkip: $('statSkip'),
  progressBar: $('progressBar'), logBox: $('logBox')
};

// 当前选中的集合
const selectedExp = new Set();
const selectedEdu = new Set();
const selectedSize = new Set();
let selectedActiveDays = 7; // 当前选中的活跃度档位

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------
function splitCsv(str) {
  return String(str || '')
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function log(msg, level = 'info') {
  const line = document.createElement('div');
  line.className = 'l-' + level;
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  line.textContent = `[${time}] ${msg}`;
  els.logBox.appendChild(line);
  els.logBox.scrollTop = els.logBox.scrollHeight;
}

// ---------------------------------------------------------------------------
// 渲染 chips（多选标签）
// ---------------------------------------------------------------------------
function renderChips(container, options, selectedSet) {
  container.innerHTML = '';
  options.forEach((opt) => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (selectedSet.has(opt) ? ' active' : '');
    chip.textContent = opt;
    chip.addEventListener('click', () => {
      if (selectedSet.has(opt)) selectedSet.delete(opt);
      else selectedSet.add(opt);
      chip.classList.toggle('active');
      saveSettings();
    });
    container.appendChild(chip);
  });
}

// 活跃度档位：单选 chips
function renderActiveChips() {
  els.activeChips.innerHTML = '';
  ACTIVE_OPTIONS.forEach((opt) => {
    const chip = document.createElement('span');
    chip.className = 'chip' + (selectedActiveDays === opt.value ? ' active' : '');
    chip.textContent = opt.label;
    chip.addEventListener('click', () => {
      selectedActiveDays = opt.value;
      renderActiveChips();
      saveSettings();
    });
    els.activeChips.appendChild(chip);
  });
}

// ---------------------------------------------------------------------------
// 收集当前 UI 配置
// ---------------------------------------------------------------------------
function collectSettings() {
  return {
    experience: [...selectedExp],
    education: [...selectedEdu],
    sizes: [...selectedSize],
    cities: els.cityInput.value,
    keywords: els.keywordInput.value,
    excludes: els.excludeInput.value,
    interval: clamp(parseInt(els.intervalInput.value, 10) || 3, 1, 60),
    maxCount: clamp(parseInt(els.maxInput.value, 10) || 30, 1, 500),
    autoScroll: els.autoScrollChk.checked,
    dryRun: els.dryRunChk.checked,
    activeDays: selectedActiveDays
  };
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

// ---------------------------------------------------------------------------
// 保存 / 读取配置
// ---------------------------------------------------------------------------
function saveSettings() {
  const settings = collectSettings();
  chrome.storage.local.set({ qzzdh_settings: settings });
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['qzzdh_settings'], ({ qzzdh_settings }) => {
      resolve(Object.assign({}, DEFAULT_SETTINGS, qzzdh_settings || {}));
    });
  });
}

// ---------------------------------------------------------------------------
// 与 content script / background 通信
// ---------------------------------------------------------------------------
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp || { ok: false, error: '无响应' });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

// 向 background 订阅进度推送
function subscribeProgress() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'QZZDH_PROGRESS') {
      renderProgress(msg.data);
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// 渲染进度
// ---------------------------------------------------------------------------
function renderProgress(d) {
  els.statusCard.hidden = false;
  els.statScan.textContent = d.scan ?? 0;
  els.statMatch.textContent = d.match ?? 0;
  els.statSent.textContent = d.sent ?? 0;
  els.statSkip.textContent = d.skip ?? 0;

  const total = Math.max(d.match || 0, d.sent + d.skip, 1);
  const done = d.sent + d.skip;
  const pct = Math.min(100, Math.round((done / total) * 100));
  els.progressBar.style.width = pct + '%';

  if (d.log) {
    log(d.log.text, d.log.level || 'info');
  }
}

// ---------------------------------------------------------------------------
// 站点检测
// ---------------------------------------------------------------------------
async function detectSite() {
  const tab = await getActiveTab();
  if (!tab || !tab.url) {
    setSiteBar(false, '无法获取当前标签页');
    return;
  }
  let hostname = '';
  try { hostname = new URL(tab.url).hostname; } catch (e) { /* noop */ }

  const supported = [
    { re: /zhipin\.com$/, name: 'BOSS直聘' },
    { re: /zhaopin\.com$/, name: '智联招聘' },
    { re: /51job\.com$/, name: '前程无忧' },
    { re: /liepin\.com$/, name: '猎聘' },
    { re: /lagou\.com$/, name: '拉勾' }
  ];
  const hit = supported.find((s) => s.re.test(hostname));
  if (hit) {
    setSiteBar(true, `已识别：${hit.name}`);
    els.scanBtn.disabled = false;
    els.startBtn.disabled = false;
  } else {
    setSiteBar(false, '当前站点不受支持');
    els.scanBtn.disabled = true;
    els.startBtn.disabled = true;
  }
}

function setSiteBar(ok, text) {
  els.siteBar.classList.toggle('ok', ok);
  els.siteBar.classList.toggle('bad', !ok);
  els.siteName.textContent = text;
}

// ---------------------------------------------------------------------------
// 动作：扫描 / 开始 / 停止
// ---------------------------------------------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 判断是否为“内容脚本未注入 / 无接收端”类错误
function isNoReceiverError(msg) {
  return /Receiving end does not exist|Could not establish connection|No tab with id|context invalidated/i.test(msg || '');
}

// 主动向目标标签页注入内容脚本（应对“页面在插件安装/重载前已打开”的情况）
async function injectContentScripts(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
  } catch (e) { /* CSS 注入失败不阻塞主流程 */ }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['config/sites.js', 'content.js']
  });
}

async function runAction(action) {
  const tab = await getActiveTab();
  if (!tab) return;
  const settings = collectSettings();
  saveSettings();

  const message = { type: 'QZZDH_CONTROL', action, settings }; // action: scan | start | stop
  let resp = await sendToTab(tab.id, message);

  // 无接收端 → 内容脚本尚未注入：主动注入后重试一次
  if (!resp.ok && isNoReceiverError(resp.error)) {
    els.statusCard.hidden = false;
    log('内容脚本未注入，正在自动注入并重试…', 'info');
    try {
      await injectContentScripts(tab.id);
      await wait(300); // 等脚本初始化
      resp = await sendToTab(tab.id, message);
    } catch (e) {
      resp = { ok: false, error: (e && e.message) || String(e) };
    }
  }

  if (!resp.ok) {
    els.statusCard.hidden = false;
    log('指令失败：' + (resp.error || '未知错误'), 'err');
    return;
  }
  if (resp.data) renderProgress(resp.data);
}

// ---------------------------------------------------------------------------
// 事件绑定 & 初始化
// ---------------------------------------------------------------------------
function bindEvents() {
  els.scanBtn.addEventListener('click', () => runAction('scan'));
  els.startBtn.addEventListener('click', () => {
    setRunning(true);
    runAction('start');
  });
  els.stopBtn.addEventListener('click', () => {
    setRunning(false);
    runAction('stop');
  });

  // 输入即保存
  ['cityInput', 'keywordInput', 'excludeInput', 'intervalInput', 'maxInput'].forEach((k) => {
    els[k].addEventListener('change', saveSettings);
  });
  els.autoScrollChk.addEventListener('change', saveSettings);
  els.dryRunChk.addEventListener('change', saveSettings);
}

function setRunning(running) {
  els.startBtn.disabled = running;
  els.scanBtn.disabled = running;
  els.stopBtn.disabled = !running;
}

async function init() {
  const s = await loadSettings();

  // 回填配置
  s.experience.forEach((e) => selectedExp.add(e));
  s.education.forEach((e) => selectedEdu.add(e));
  (s.sizes || []).forEach((e) => selectedSize.add(e));
  els.cityInput.value = s.cities || '';
  els.keywordInput.value = s.keywords || '';
  els.excludeInput.value = s.excludes || '';
  els.intervalInput.value = s.interval ?? 3;
  els.maxInput.value = s.maxCount ?? 30;
  els.autoScrollChk.checked = !!s.autoScroll;
  els.dryRunChk.checked = !!s.dryRun;
  selectedActiveDays = (typeof s.activeDays === 'number') ? s.activeDays : 7;

  renderChips(els.expChips, EXP_OPTIONS, selectedExp);
  renderChips(els.eduChips, EDU_OPTIONS, selectedEdu);
  renderActiveChips();
  renderChips(els.sizeChips, SIZE_OPTIONS, selectedSize);

  bindEvents();
  subscribeProgress();
  detectSite();
}

document.addEventListener('DOMContentLoaded', init);

/**
 * background.js —— 后台 Service Worker
 * ------------------------------------------------------------------
 * 职责：
 *   1. 接收 content script 的进度消息，转发给打开的 popup；
 *   2. 接收通知请求，弹出系统通知；
 *   3. 更新扩展图标徽标，展示已投递数量。
 */
'use strict';

let sentTotal = 0;

// BOSS直聘批量编排状态
let bossTabId = null;      // 执行投递的工作标签页
let bossWatchdog = null;   // 详情页超时未回报的看门狗
let bossNavTimer = null;   // 控制翻页节奏的延时器
const BOSS_WATCHDOG_MS = 15000;

chrome.runtime.onInstalled.addListener(() => {
  console.log('[求职助手] 已安装');
  setBadge('');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

  // 进度上报：content script 的 sendMessage 会直达 popup，
  // 后台在此只更新图标徽标，不再二次广播（避免 popup 日志重复）
  if (msg.type === 'QZZDH_PROGRESS') {
    const data = msg.data || {};
    if (typeof data.sent === 'number') {
      sentTotal = data.sent;
      setBadge(sentTotal > 0 ? String(sentTotal) : '');
    }
    return false;
  }

  // 系统通知
  if (msg.type === 'QZZDH_NOTIFY') {
    showNotification(msg.title || '求职助手', msg.message || '');
    sendResponse({ ok: true });
    return false;
  }

  // BOSS直聘批量编排
  if (msg.type === 'QZZDH_BOSS_START') { bossStart(); sendResponse({ ok: true }); return false; }
  if (msg.type === 'QZZDH_BOSS_NEXT') { bossNext(msg.result); sendResponse({ ok: true }); return false; }
  if (msg.type === 'QZZDH_BOSS_STOP') { bossStop(); sendResponse({ ok: true }); return false; }

  return false;
});

function broadcast(message) {
  try {
    chrome.runtime.sendMessage(message, () => {
      void chrome.runtime.lastError; // popup 未打开时忽略
    });
  } catch (e) { /* noop */ }
}

function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      priority: 1
    });
  } catch (e) { /* noop */ }
}

function setBadge(text) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#4f6ef7' });
    chrome.action.setBadgeText({ text });
  } catch (e) { /* noop */ }
}

// ---------------------------------------------------------------------------
// BOSS直聘批量编排：后台逐页打开职位详情，由详情页脚本自动点“立即沟通”
// ---------------------------------------------------------------------------
function getBoss() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['qzzdh_boss'], (r) => resolve(r.qzzdh_boss || null));
  });
}

function setBoss(st) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ qzzdh_boss: st }, () => resolve());
  });
}

function safePath(u) {
  try { return new URL(u).pathname; } catch (e) { return ''; }
}

async function tabExists(id) {
  try { await chrome.tabs.get(id); return true; } catch (e) { return false; }
}

function clearBossTimers() {
  if (bossWatchdog) { clearTimeout(bossWatchdog); bossWatchdog = null; }
  if (bossNavTimer) { clearTimeout(bossNavTimer); bossNavTimer = null; }
}

async function bossStart() {
  const st = await getBoss();
  if (!st || !st.queue || !st.queue.length) return;
  st.running = true; st.index = 0; st.sent = 0; st.skip = 0;
  await setBoss(st);
  await bossNavigate(st, 0);
}

async function bossNavigate(st, index) {
  clearBossTimers();
  st.index = index;
  st.activePath = safePath(st.queue[index]);
  const url = st.queue[index];
  emitBossProgress(st, `打开 ${index + 1}/${st.queue.length}`);
  try {
    if (bossTabId && (await tabExists(bossTabId))) {
      await chrome.tabs.update(bossTabId, { url });
    } else {
      const t = await chrome.tabs.create({ url, active: true });
      bossTabId = t.id;
    }
  } catch (e) {
    try {
      const t = await chrome.tabs.create({ url, active: true });
      bossTabId = t.id;
    } catch (e2) { /* noop */ }
  }
  st.tabId = bossTabId;
  await setBoss(st);
  armWatchdog();
}

function armWatchdog() {
  bossWatchdog = setTimeout(() => { bossAdvanceWatchdog(); }, BOSS_WATCHDOG_MS);
}

async function bossAdvanceWatchdog() {
  const st = await getBoss();
  if (!st || !st.running) return;
  st.skip++;
  await setBoss(st);
  const max = (st.settings && st.settings.maxCount) || st.queue.length;
  if (st.sent >= max || st.index >= st.queue.length - 1) return bossFinish(st);
  await bossNavigate(st, st.index + 1);
}

async function bossNext(result) {
  clearBossTimers();
  const st = await getBoss();
  if (!st || !st.running) return;
  if (result === 'sent') st.sent++; else st.skip++;
  await setBoss(st);
  const max = (st.settings && st.settings.maxCount) || st.queue.length;
  if (st.sent >= max || st.index >= st.queue.length - 1) {
    return bossFinish(st);
  }
  emitBossProgress(st, '准备下一个');
  const interval = Math.max(1, (st.settings && st.settings.interval) || 3) * 1000;
  bossNavTimer = setTimeout(() => { bossNavigate(st, st.index + 1); }, interval);
}

function bossFinish(st) {
  clearBossTimers();
  st.running = false;
  setBoss(st);
  emitBossProgress(st, 'BOSS 批量沟通完成');
  showNotification('BOSS 批量沟通完成', `已沟通 ${st.sent} 个，跳过 ${st.skip} 个`);
  if (bossTabId) { try { chrome.tabs.remove(bossTabId); } catch (e) { /* noop */ } bossTabId = null; }
}

async function bossStop() {
  clearBossTimers();
  const st = await getBoss();
  if (st) { st.running = false; await setBoss(st); }
  emitBossProgress(st || { queue: [], sent: 0, skip: 0, running: false }, '已停止');
  if (bossTabId) { try { chrome.tabs.remove(bossTabId); } catch (e) { /* noop */ } bossTabId = null; }
}

function emitBossProgress(st, text) {
  const data = {
    scan: st.queue ? st.queue.length : 0,
    match: st.queue ? st.queue.length : 0,
    sent: st.sent || 0,
    skip: st.skip || 0,
    running: !!st.running,
    log: text ? { text, level: 'info' } : null
  };
  setBadge(data.sent > 0 ? String(data.sent) : '');
  broadcast({ type: 'QZZDH_PROGRESS', data });
}

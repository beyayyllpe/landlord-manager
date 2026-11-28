// 租房管家 —— 核心财务与安全回归测试（零外部依赖，完全隔离临时数据目录）
// 用法：node test/finance.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = 3129;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tianhui-test-'));

function 北京日期() {
  const b = new Date(Date.now() + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}`;
}

function 准备隔离数据() {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('testpass123', salt, 64).toString('hex');
  fs.writeFileSync(
    path.join(TMP_DIR, '登录凭据.json'),
    JSON.stringify({ 用户名: 'admin', 盐: salt, 哈希: hash }, null, 2),
    'utf8'
  );
  // 预置 32 份旧的每日备份 + 1 份手动备份，测试 30 天滚动清理与手动文件保护
  const dailyDir = path.join(TMP_DIR, '备份', 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  for (let i = 1; i <= 32; i++) {
    const day = String(i).padStart(2, '0');
    const name = i <= 28 ? `2025-01-${day}.json` : `2025-02-${String(i - 28).padStart(2, '0')}.json`;
    fs.writeFileSync(path.join(dailyDir, name), '{"dummy":true}', 'utf8');
  }
  fs.writeFileSync(path.join(dailyDir, 'manual-keep.json'), '{"manual":true}', 'utf8');
}

async function 等待就绪(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/login`, { redirect: 'manual' });
      if (r.status === 200) return;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('测试服务启动超时');
}

let cookie = '';
async function req(method, url, body, useCookie = true) {
  const headers = {};
  if (useCookie && cookie) headers['Cookie'] = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const setCookie = r.headers.get('set-cookie');
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { status: r.status, json, text, setCookie, headers: r.headers };
}

let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`  [PASS] ${name}`);
}

async function main() {
  准备隔离数据();
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: TMP_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  child.stderr.on('data', d => { stderrBuf += d.toString(); });

  try {
    await 等待就绪();
    console.log('开始执行租房管家核心财务与安全回归测试...\n');

    await test('1. 鉴权拦截：未登录访问 API 返回 401，访问首页 302 跳转 /login，登录页和样式表公开 200', async () => {
      const apiRes = await req('GET', '/api/all', undefined, false);
      assert.strictEqual(apiRes.status, 401);
      const homeRes = await req('GET', '/', undefined, false);
      assert.strictEqual(homeRes.status, 302);
      assert.strictEqual(homeRes.headers.get('location'), '/login');
      const loginRes = await req('GET', '/login', undefined, false);
      assert.strictEqual(loginRes.status, 200);
      const cssRes = await req('GET', '/style.css', undefined, false);
      assert.strictEqual(cssRes.status, 200);
      const siteRes = await req('GET', '/api/site-info', undefined, false);
      assert.strictEqual(siteRes.status, 200);
      assert.deepStrictEqual(Object.keys(siteRes.json).sort(), ['ICP备案', 'turnstileSiteKey', '公安备案']);
    });

    await test('2. 登录校验：错误密码返回 401，正确密码返回 200 且签发 HttpOnly Cookie', async () => {
      const bad = await req('POST', '/api/login', { 用户名: 'admin', 密码: 'wrong' }, false);
      assert.strictEqual(bad.status, 401);
      const ok = await req('POST', '/api/login', { 用户名: 'admin', 密码: 'testpass123' }, false);
      assert.strictEqual(ok.status, 200);
      assert.ok(ok.setCookie && ok.setCookie.includes('th_session=') && ok.setCookie.includes('HttpOnly'));
      cookie = ok.setCookie.split(';')[0];
    });

    await test('3. 房源创建、月租入住、新收押金与水电跨月滚动计费', async () => {
      // 设当前月份为 2026-09，水价 5、电价 1.3
      const s0 = await req('POST', '/api/settings', { 当前月份: '2026-09', 水价: 5, 电价: 1.3 });
      assert.strictEqual(s0.status, 200);

      for (const [房号, 房型] of [['201', '月租'], ['202', '月租'], ['801', '日租']]) {
        const h = await req('POST', '/api/houses', { 房号, 房型 });
        assert.strictEqual(h.status, 200);
      }

      // 201 入住（2026-09-10）
      const r201 = await req('POST', '/api/rooms', {
        房号: '201', 租客姓名: '张三', 电话: '13800000001',
        月租金: 1000, 管理费: 30, 押金: 1000, 房卡押金: 50,
        水表底度: 100, 电表底度: 200, 入住日: '2026-09-10',
      });
      assert.strictEqual(r201.status, 200);

      // 2026-09 当月新租：新收押金 = 1050
      const bills09 = await req('GET', '/api/bills?month=2026-09&房号=201');
      assert.strictEqual(bills09.status, 200);
      assert.strictEqual(bills09.json.length, 1);
      assert.strictEqual(bills09.json[0].新收押金, 1050);

      // 切到 2026-10，录 201 抄表（水 112 -> 12方*5=60，电 250 -> 50度*1.3=65）
      await req('POST', '/api/settings', { 当前月份: '2026-10' });
      const m201 = await req('POST', '/api/meters', { 房号: '201', 水表: 112, 电表: 250, 日期: '2026-10-10' });
      assert.strictEqual(m201.status, 200);

      const bills10 = await req('GET', '/api/bills?month=2026-10&房号=201');
      const b = bills10.json[0];
      assert.strictEqual(b.用水量, 12);
      assert.strictEqual(b.水费, 60);
      assert.strictEqual(b.用电量, 50);
      assert.strictEqual(b.电费, 65);
      assert.strictEqual(b.新收押金, 0); // 跨月押金归 0
      assert.strictEqual(b.应付租金, 1155); // 1000 + 30 + 60 + 65
    });

    await test('4. 预缴余额池：房租与管理费各自逐月抵扣，到期自动恢复', async () => {
      // 202 入住（2026-10-05，月租 800，管理费 20）
      const r202 = await req('POST', '/api/rooms', {
        房号: '202', 租客姓名: '李四', 月租金: 800, 管理费: 20, 押金: 800,
        水表底度: 10, 电表底度: 20, 入住日: '2026-10-05',
      });
      assert.strictEqual(r202.status, 200);

      // 2026-10 预缴房租 2400（抵 10/11/12 三月）+ 管理费 40（抵 10/11 两月）
      const p1 = await req('POST', '/api/prepay', { 房号: '202', 月份: '2026-10', 类型: '房租', 金额: 2400 });
      assert.strictEqual(p1.status, 200);
      const p2 = await req('POST', '/api/prepay', { 房号: '202', 月份: '2026-10', 类型: '管理费', 金额: 40 });
      assert.strictEqual(p2.status, 200);

      // 2026-10 抄表：水 14（4*5=20），电 30（10*1.3=13）
      await req('POST', '/api/meters', { 房号: '202', 水表: 14, 电表: 30, 日期: '2026-10-05' });
      const b10 = (await req('GET', '/api/bills?month=2026-10&房号=202')).json[0];
      assert.strictEqual(b10.应付租金, 33); // 房租与管理费已由预缴抵扣，仅剩水电 20 + 13
      assert.strictEqual(b10.预缴, 2440);
      assert.strictEqual(b10.预缴余额房租, 1600);
      assert.strictEqual(b10.预缴余额管理费, 20);

      // 2026-12（第 3 个月）：房租仍抵 0（房租已预缴=true），管理费余额耗尽恢复应收 20
      await req('POST', '/api/meters', { 房号: '202', 水表: 14, 电表: 30, 日期: '2026-12-05' });
      const b12 = (await req('GET', '/api/bills?month=2026-12&房号=202')).json[0];
      assert.strictEqual(b12.房租, 0);
      assert.strictEqual(b12.房租已预缴, true);
      assert.strictEqual(b12.管理费, 20);
      assert.strictEqual(b12.管理费已预缴, false);

      // 2027-01（第 4 个月）：房租和管理费全部恢复应收
      await req('POST', '/api/meters', { 房号: '202', 水表: 14, 电表: 30, 日期: '2027-01-05' });
      const b01 = (await req('GET', '/api/bills?month=2027-01&房号=202')).json[0];
      assert.strictEqual(b01.房租, 800);
      assert.strictEqual(b01.管理费, 20);
    });

    await test('5. 部分核收、追缴累加、欠费滚存跨月结转、发送快照与撤销', async () => {
      // 201 在 2026-10 应付 1155：先发送定格
      const sent = await req('POST', '/api/bills/sent', { 房号: '201', 月份: '2026-10' });
      assert.strictEqual(sent.status, 200);
      assert.strictEqual(sent.json.已发送, true);

      // 部分实收 500 + 追缴 155 -> 欠费 500
      await req('POST', '/api/bills/collect', { 房号: '201', 月份: '2026-10', 实收: 500, 强制: false });
      const arr = await req('POST', '/api/bills/arrears', { 房号: '201', 月份: '2026-10', 金额: 155 });
      assert.strictEqual(arr.status, 200);
      assert.strictEqual(arr.json.补缴, 155);

      const b10BeforeCarry = (await req('GET', '/api/bills?month=2026-10&房号=201')).json[0];
      assert.strictEqual(b10BeforeCarry.欠款, 500);

      // 欠费滚存 -> 转下月 500，下月（2026-11）结转 500
      const carry = await req('POST', '/api/bills/carry', { 房号: '201', 月份: '2026-10' });
      assert.strictEqual(carry.status, 200);
      assert.strictEqual(carry.json.结转金额, 500);
      assert.strictEqual(carry.json.下月, '2026-11');

      const b11 = (await req('GET', '/api/bills?month=2026-11&房号=201')).json[0];
      assert.strictEqual(b11.结转, 500);

      // 撤销发送
      const unsent = await req('POST', '/api/bills/unsent', { 房号: '201', 月份: '2026-10' });
      assert.strictEqual(unsent.status, 200);
      assert.strictEqual(unsent.json.已发送, false);
    });

    await test('6. 切月固化与锁定拦截：有未处理欠款阻止切月；结清后锁定月拒绝写入，解锁后恢复', async () => {
      // 此时 2026-10 中 202 未核收（应付 33 未清），settle 必须被 400 拦住
      const blocked = await req('POST', '/api/settle', { 月份: '2026-10' });
      assert.strictEqual(blocked.status, 400);

      // 将 202 在 2026-10 核收，再次 settle 应成功
      await req('POST', '/api/bills/collect', { 房号: '202', 月份: '2026-10', 实收: 33, 强制: true });
      const settled = await req('POST', '/api/settle', { 月份: '2026-10' });
      assert.strictEqual(settled.status, 200);

      // 锁定后，向 2026-10 写入抄表/核收/追缴/预缴/支出均返回 400
      const mLocked = await req('POST', '/api/meters', { 房号: '201', 水表: 120, 电表: 260, 日期: '2026-10-15' });
      assert.strictEqual(mLocked.status, 400);
      const cLocked = await req('POST', '/api/bills/collect', { 房号: '201', 月份: '2026-10', 实收: 600 });
      assert.strictEqual(cLocked.status, 400);
      const pLocked = await req('POST', '/api/prepay', { 房号: '202', 月份: '2026-10', 类型: '房租', 金额: 800 });
      assert.strictEqual(pLocked.status, 400);

      // 解锁 2026-10 后恢复可写
      const unlocked = await req('POST', '/api/unlock', { 月份: '2026-10' });
      assert.strictEqual(unlocked.status, 200);
      assert.strictEqual(unlocked.json.已解锁, true);
      const cAfter = await req('POST', '/api/bills/collect', { 房号: '202', 月份: '2026-10', 实收: 33, 强制: true });
      assert.strictEqual(cAfter.status, 200);
    });

    await test('7. 退房与撤销退房：实退 > 0 自动写支出流水并支持撤销；实退 <= 0 绝不写支出流水', async () => {
      const today = 北京日期();
      // 201 退房：押金 1000 + 房卡 50 - 水(10*5=50) - 电(20*1.3=26) - 卫生 50 = 924
      const co1 = await req('POST', '/api/checkout', {
        房号: '201', 日期: today,
        上月水底: 112, 退房水底: 122, 上月电底: 250, 退房电底: 270,
        退房卫生费: 50, 房间损耗: 0, 退押金: true, 退房卡押金: true,
      });
      assert.strictEqual(co1.status, 200);
      assert.strictEqual(co1.json.退入金额, 924);
      assert.ok(co1.json.流水id, '实退 > 0 必须生成支出流水');

      const todayMonth = today.slice(0, 7);
      const txAfterCo1 = (await req('GET', `/api/transactions?month=${todayMonth}`)).json;
      assert.ok(txAfterCo1.some(t => t.id === co1.json.流水id && t.金额 === 924));

      // 撤销退房：房间恢复、退房记录删除、对应支出流水同步删除
      const undo = await req('POST', `/api/checkouts/undo/${co1.json.id}`);
      assert.strictEqual(undo.status, 200);
      const roomsAfterUndo = (await req('GET', '/api/rooms')).json;
      assert.ok(roomsAfterUndo.some(r => r.房号 === '201'));
      const txAfterUndo = (await req('GET', `/api/transactions?month=${todayMonth}`)).json;
      assert.ok(!txAfterUndo.some(t => t.id === co1.json.流水id), '撤销退房必须删除对应支出流水');

      // 再次退房但扣款大于押金（实退 = 1050 - 1200 = -150 <= 0）
      const co2 = await req('POST', '/api/checkout', {
        房号: '201', 日期: today,
        上月水底: 112, 退房水底: 112, 上月电底: 250, 退房电底: 250,
        退房卫生费: 200, 房间损耗: 1000, 退押金: true, 退房卡押金: true,
      });
      assert.strictEqual(co2.status, 200);
      assert.strictEqual(co2.json.退入金额, -150);
      assert.strictEqual(co2.json.流水id, undefined, '实退 <= 0 绝不能写入支出流水');
    });

    await test('8. 日租状态机：入住入账 -> 续住同步改账 -> 退房变脏房不动账 -> 清洁变空闲 -> 撤销入住删账', async () => {
      const ci = await req('POST', '/api/roomstatus/checkin', {
        房号: '801', 入住日: '2026-10-12', 天数: 2, 金额: 200, 客人: '王五',
      });
      assert.strictEqual(ci.status, 200);
      assert.strictEqual(ci.json.房态.状态, '在住');
      assert.strictEqual(ci.json.账单.金额, 200);

      // 续住/改价：3 天 300 元，必须原地改同一条 daily
      const ext = await req('POST', '/api/roomstatus/extend', {
        房号: '801', 天数: 3, 金额: 300, 客人: '王五',
      });
      assert.strictEqual(ext.status, 200);
      assert.strictEqual(ext.json.账单.id, ci.json.账单.id);
      assert.strictEqual(ext.json.账单.金额, 300);

      // 退房变脏房，不动账
      const co = await req('POST', '/api/roomstatus/checkout', { 房号: '801' });
      assert.strictEqual(co.status, 200);
      assert.strictEqual(co.json.房态.状态, '脏房');
      const dailyList1 = (await req('GET', '/api/daily')).json;
      assert.strictEqual(dailyList1.filter(d => d.房号 === '801').length, 1);
      assert.strictEqual(dailyList1.find(d => d.房号 === '801').金额, 300);

      // 清洁变空闲
      const cl = await req('POST', '/api/roomstatus/clean', { 房号: '801' });
      assert.strictEqual(cl.status, 200);

      // 再入住后撤销入住：房态归空闲且新账单被删
      const ci2 = await req('POST', '/api/roomstatus/checkin', {
        房号: '801', 入住日: '2026-10-15', 天数: 1, 金额: 120, 客人: '赵六',
      });
      assert.strictEqual(ci2.status, 200);
      const undoCi = await req('POST', '/api/roomstatus/undo-checkin', { 房号: '801' });
      assert.strictEqual(undoCi.status, 200);
      assert.strictEqual(undoCi.json.删除账单, true);
      const dailyList2 = (await req('GET', '/api/daily')).json;
      assert.strictEqual(dailyList2.filter(d => d.房号 === '801').length, 1);
    });

    await test('9. 每日自动滚动备份：生成带时间戳完整备份、自动清理至近 7 天、保留手动备份文件', async () => {
      const dailyDir = path.join(TMP_DIR, '备份', 'daily');
      const allFiles = fs.readdirSync(dailyDir);
      const todayPrefix = `${北京日期()}_`;
      const todayName = allFiles.find(f => f.startsWith(todayPrefix) && /^\d{4}-\d{2}-\d{2}_\d{4}\.json$/.test(f));
      assert.ok(todayName, `应已生成形如 YYYY-MM-DD_HHmm.json 的当日自动备份文件，实际: ${allFiles.join(', ')}`);

      const parsed = JSON.parse(fs.readFileSync(path.join(dailyDir, todayName), 'utf8'));
      assert.strictEqual(parsed.类型, '租房管家完整备份');
      assert.ok(parsed.数据 && Array.isArray(parsed.数据.rooms));
      assert.ok(parsed.登录凭据 && parsed.登录凭据.用户名 === 'admin');
      assert.ok(Array.isArray(parsed.客人档案));

      const autoFiles = allFiles.filter(f => /^\d{4}-\d{2}-\d{2}(_\d{4})?\.json$/.test(f));
      assert.strictEqual(autoFiles.length, 7, `自动备份应滚动保留 7 份，实际 ${autoFiles.length}`);
      assert.ok(allFiles.includes('manual-keep.json'), '不得误删用户手动放入的备份文件');
    });

    await test('10. 修改密码：旧会话 Cookie 立即失效，新密码可正常登录', async () => {
      const ch = await req('POST', '/api/password', {
        当前密码: 'testpass123', 用户名: 'admin', 新密码: 'newpass456', 确认密码: 'newpass456',
      });
      assert.strictEqual(ch.status, 200);

      // 旧 Cookie 必须立即失效
      const oldCheck = await req('GET', '/api/all');
      assert.strictEqual(oldCheck.status, 401);

      // 新密码可重新登录
      const relogin = await req('POST', '/api/login', { 用户名: 'admin', 密码: 'newpass456' }, false);
      assert.strictEqual(relogin.status, 200);
      cookie = relogin.setCookie.split(';')[0];
    });

    await test('11. 前端模块化静态资源：首页版本号注入正常，全部 js/*.js 返回 200 且带禁缓存头', async () => {
      const home = await req('GET', '/');
      assert.strictEqual(home.status, 200);
      assert.ok(!home.text.includes('__版本__'), '首页版本号占位符必须已被替换');
      const scripts = [...home.text.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
      assert.ok(scripts.length >= 10, `应加载全部前端模块脚本，实际 ${scripts.length}`);
      for (const s of scripts) {
        const res = await req('GET', '/' + s);
        assert.strictEqual(res.status, 200, `脚本加载失败: ${s}`);
        assert.ok((res.headers.get('cache-control') || '').includes('no-cache'), `脚本缺少禁缓存头: ${s}`);
      }
    });

    await test('12. 前端模块静态完整性：所有脚本联合加载无重名冲突且内联事件函数均已定义', async () => {
      const vm = require('vm');
      const jsDir = path.join(__dirname, '..', 'public', 'js');
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
      const order = [...html.matchAll(/<script\s+src="js\/([^"?]+)/g)].map(m => m[1]);
      const noop = () => {};
      const el = () => ({ style: {}, classList: { toggle: noop, add: noop, remove: noop }, dataset: {}, addEventListener: noop, querySelectorAll: () => [], querySelector: () => null, innerHTML: '', textContent: '' });
      const sandbox = {
        console, Math, Date, Number, String, Array, Object, Set, Map, JSON, RegExp, Error, Promise, URLSearchParams, Intl,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop, requestAnimationFrame: noop,
        fetch: async (url) => ({ ok: true, status: 200, json: async () => (url === '/api/all' ? { settings: { 当前月份: '2026-03' }, 房源: [], rooms: [], meters: [], bills: [], daily: [], transactions: [], 退房记录: [], 历史总账单: [], 预缴记录: [], 月度快照: [], 备忘录: [], 日租房态: [] } : (String(url).includes('/api/summary') ? { 数据不齐: [], 欠费: [], 月租已收: 0, 日租已收: 0, 支出: 0, 工资: 0, 合计: 0 } : [])) }),
        localStorage: { getItem: () => null, setItem: noop },
        location: { replace: noop, reload: noop },
        document: {
          documentElement: { setAttribute: noop },
          body: { classList: { toggle: noop, add: noop, remove: noop }, insertAdjacentHTML: noop },
          getElementById: () => el(), querySelectorAll: () => [], querySelector: () => null, addEventListener: noop
        },
        window: {}
      };
      sandbox.window = sandbox;
      for (const f of order) {
        vm.runInNewContext(fs.readFileSync(path.join(jsDir, f), 'utf8'), sandbox, { filename: f });
      }

      const allJs = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'))
        .map(f => fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n');
      const defs = new Set();
      for (const m of allJs.matchAll(/(?:^|\n)(?:async\s+)?function\s+([\w\u4e00-\u9fa5$]+)\s*\(/g)) defs.add(m[1]);
      for (const m of allJs.matchAll(/window\.([\w\u4e00-\u9fa5$]+)\s*=/g)) defs.add(m[1]);
      const builtins = new Set(['if', 'setTimeout', 'clearTimeout', 'document', 'location', 'window', 'this', 'event', 'Number', 'String', 'Math', 'Array', 'Date', 'JSON', 'console', 'navigator', 'fetch']);
      const missing = new Set();
      for (const m of allJs.matchAll(/on(?:click|change|input|keydown)="([^"]+)"/g)) {
        for (const call of m[1].matchAll(/(?<![.\w\u4e00-\u9fa5$])([\w\u4e00-\u9fa5$]+)\s*\(/g)) {
          const name = call[1];
          if (!builtins.has(name) && !defs.has(name)) missing.add(name);
        }
      }
      assert.deepStrictEqual([...missing], [], `发现未定义的内联事件处理函数: ${[...missing].join(', ')}`);
    });

    await test('13. 日租预订状态机：新增预订 -> 冲突拦截 -> 确认 -> 预订转入住自动核销并入账', async () => {
      const bkList0 = await req('GET', '/api/bookings');
      const today = bkList0.json.今日;
      const b1 = await req('POST', '/api/bookings', {
        房号: '801', 客户: '预订客甲', 电话: '13800001111', 渠道: '微信', 人数: 2,
        入住日: today, 天数: 2, 金额: 320, 定金: 100, 备注: '测试预订'
      });
      assert.strictEqual(b1.status, 200);
      assert.strictEqual(b1.json.记录.状态, 'pending');

      // 同房同区间应触发冲突拦截 400
      const dup = await req('POST', '/api/bookings', {
        房号: '801', 客户: '冲突客', 电话: '13900002222',
        入住日: today, 天数: 2, 金额: 180
      });
      assert.strictEqual(dup.status, 400);

      // 确认预订
      const cfm = await req('PUT', `/api/bookings/${b1.json.记录.id}`, { 状态: 'confirmed' });
      assert.strictEqual(cfm.status, 200);
      assert.strictEqual(cfm.json.记录.状态, 'confirmed');

      // 预订转入住：房态转在住 + daily 入账 + 预订状态变为 checkedin
      const ci = await req('POST', '/api/roomstatus/checkin', {
        房号: '801', 入住日: today, 天数: 2, 金额: 320,
        客人们: [{ 姓名: '预订客甲', 电话: '13800001111' }],
        预订id: b1.json.记录.id
      });
      assert.strictEqual(ci.status, 200);
      assert.strictEqual(ci.json.已入账, true);

      const list = await req('GET', '/api/bookings');
      const hit = list.json.列表.find(x => x.id === b1.json.记录.id);
      assert.strictEqual(hit.状态, 'checkedin');

      // 还原：撤销入住 + 删除测试预订
      await req('POST', '/api/roomstatus/undo-checkin', { 房号: '801' });
      const del = await req('DELETE', `/api/bookings/${b1.json.记录.id}`);
      assert.strictEqual(del.status, 200);
    });

    await test('14. Turnstile Secret 脱敏、按需读取与操作审计日志', async () => {
      const saved = await req('POST', '/api/settings', {
        TurnstileSiteKey: '0x4AAAAAAATestSite',
        TurnstileSecretKey: '0x4AAAAAAATestSecret'
      });
      assert.strictEqual(saved.status, 200);
      assert.strictEqual(saved.json.TurnstileSecretKey, undefined);
      assert.strictEqual(saved.json.TurnstileSecret已配置, true);
      assert.strictEqual(saved.json.TurnstileSecret来源, 'settings');

      const all = await req('GET', '/api/all');
      assert.strictEqual(all.status, 200);
      assert.strictEqual(all.json.settings.TurnstileSecretKey, undefined);
      assert.strictEqual(all.json.settings.TurnstileSecret已配置, true);

      const sec = await req('GET', '/api/settings/turnstile-secret');
      assert.strictEqual(sec.status, 200);
      assert.strictEqual(sec.json.secretKey, '0x4AAAAAAATestSecret');

      const notFound = await req('GET', '/api/no-such-endpoint-for-test');
      assert.strictEqual(notFound.status, 404);
      const clientErr = await req('POST', '/api/logs/client-error', {
        来源: 'frontend-api', 路由: '/api/test', 信息: '模拟前端接口报错'
      });
      assert.strictEqual(clientErr.status, 200);

      const logs = await req('GET', '/api/logs');
      assert.strictEqual(logs.status, 200);
      assert.ok(Array.isArray(logs.json.操作日志) && logs.json.操作日志.length > 0);
      assert.ok(logs.json.操作日志.some(x => x.动作 === '修改账单'));
      assert.ok(logs.json.操作日志.some(x => x.动作 === '解锁月份'));
      assert.ok(Array.isArray(logs.json.系统错误日志) && logs.json.系统错误日志.length >= 2);
      assert.ok(logs.json.系统错误日志.some(x => x.来源 === 'api-404'));
      assert.ok(logs.json.系统错误日志.some(x => x.来源 === 'frontend-api'));
      assert.ok(logs.json.系统错误日志.some(x => x.来源 === 'login'));

      const cleared = await req('POST', '/api/logs/clear-all');
      assert.strictEqual(cleared.status, 200);
      const logsAfter = await req('GET', '/api/logs');
      assert.strictEqual(logsAfter.json.操作日志.length, 0);
      assert.strictEqual(logsAfter.json.系统错误日志.length, 0);
    });

    await test('15. 报错日志同类合并与登录失败限流保护', async () => {
      // 清空第 14 项留下的 Turnstile 测试密钥，以便直测密码错误限流
      await req('POST', '/api/settings', { TurnstileSiteKey: '', TurnstileSecretKey: '' });
      // 同类报错连续上报两次应合并为 1 条且 次数 === 2
      await req('POST', '/api/logs/client-error', { 来源: 'frontend-api', 路由: '/api/dup', 信息: '重复报错A' });
      await req('POST', '/api/logs/client-error', { 来源: 'frontend-api', 路由: '/api/dup', 信息: '重复报错A' });
      const logs = await req('GET', '/api/logs');
      const dupRows = logs.json.系统错误日志.filter(x => x.路由 === '/api/dup');
      assert.strictEqual(dupRows.length, 1);
      assert.strictEqual(dupRows[0].次数, 2);

      // 登录连续输错 5 次触发 429 限流（第 6 次）
      for (let i = 0; i < 5; i++) {
        const bad = await req('POST', '/api/login', { 用户名: 'admin', 密码: 'wrong-password-' + i }, false);
        assert.strictEqual(bad.status, 401);
      }
      const locked = await req('POST', '/api/login', { 用户名: 'admin', 密码: 'newpass456' }, false);
      assert.strictEqual(locked.status, 429);
    });

    console.log(`\n全部 ${passed} 项核心回归测试通过！`);
  } finally {
    child.kill();
    await new Promise(r => setTimeout(r, 250));
    try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (e) {}
    if (stderrBuf.trim()) {
      console.error('子进程 stderr 输出：\n' + stderrBuf);
    }
  }
}

main().catch(err => {
  console.error('\n[FAIL] 测试失败：', err);
  process.exit(1);
});

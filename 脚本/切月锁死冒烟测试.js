// 切月锁死（快照 + 写锁 + 解锁）后端冒烟测试
// 安全性：把 server.js 复制到临时子目录 .冒烟临时\ 里跑（server.js 用 __dirname 定位 data，
// 所以它只会读写那个临时目录里的假数据），**绝不碰 data\数据.json**；跑在 PORT=3999，不影响正在运行的服务。
// 用法：node 脚本\切月锁死冒烟测试.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');

const 根 = path.join(__dirname, '..');
const 临时 = path.join(根, '.冒烟临时');
const 端口 = 3999;
const 账号 = { 用户名: 'admin', 密码: 'smoke123456' };

// ---------- 准备隔离环境 ----------
fs.rmSync(临时, { recursive: true, force: true });
fs.mkdirSync(path.join(临时, 'data'), { recursive: true });
fs.copyFileSync(path.join(根, 'server.js'), path.join(临时, 'server.js'));
fs.mkdirSync(path.join(临时, 'public'), { recursive: true });
fs.writeFileSync(path.join(临时, 'public', 'index.html'), '<!doctype html><title>t</title>', 'utf8');

// 假数据：两间月租房。2026-08 已有真实数据且历史总账单里存了「旧支出 9999」（模拟退房流水取整前的老值），
// 用于验证启动时自动补快照会把旧值刷新成当前正确值；2026-09 是当前月，用来测「切月锁定 → 解锁 → 重新锁定」。
const 房301 = { id: 1, 房号: '301', 月租金: 1000, 管理费: 50, 押金: 0, 房卡押金: 0, 水费单价: '', 电费单价: '', 水表底度: 0, 电表底度: 0, 租客姓名: '张三', 电话: '', 身份证: '', 入住日: '2026-08-01', 到期日: '', 备注: '' };
const 房401 = { id: 2, 房号: '401', 月租金: 2000, 管理费: 0, 押金: 0, 房卡押金: 0, 水费单价: '', 电费单价: '', 水表底度: 0, 电表底度: 0, 租客姓名: '李四', 电话: '', 身份证: '', 入住日: '2026-08-01', 到期日: '', 备注: '' };
fs.writeFileSync(path.join(临时, 'data', '数据.json'), JSON.stringify({
  settings: { 水价: 5, 电价: 1.3, 当前月份: '2026-09', 隐藏房号: [], 工资分段: [{ 起始月份: '2024-03', 金额: 4000 }], 钟点房默认价: 60, 空置脏房: [] },
  房源: [{ id: 1, 房号: '301', 房型: '月租' }, { id: 2, 房号: '401', 房型: '月租' }],
  rooms: [房301, 房401],
  meters: [
    { id: 1, 日期: '2026-08-01', 房号: '301', 水表: 10, 电表: 100 },
    { id: 2, 日期: '2026-08-01', 房号: '401', 水表: 20, 电表: 200 },
    { id: 3, 日期: '2026-09-01', 房号: '301', 水表: 15, 电表: 150 },
    { id: 4, 日期: '2026-09-01', 房号: '401', 水表: 25, 电表: 250 }
  ],
  bills: [{ id: 1, 房号: '301', 月份: '2026-08', 房间损耗: 0, 损耗说明: '', 实收: 1000, 强制: true, 平账: false, 收款日期: '', 补缴: 0, 结转: 0, 转下月: 0 }],
  daily: [
    { id: 1, 日期: '2026-08-10', 房号: '301', 客人: '张三', 入住天数: 1, 金额: 100 },
    { id: 2, 日期: '2026-09-10', 房号: '301', 客人: '王五', 入住天数: 1, 金额: 200 }
  ],
  transactions: [
    { id: 1, 日期: '2026-08-05', 事项: '电费', 金额: 500 },
    { id: 2, 日期: '2026-09-05', 事项: '电费', 金额: 600 }
  ],
  退房记录: [], 历史总账单: [{ 月份: '2026-08', 月租: 0, 日租: 0, 支出: 9999 }], 预缴记录: [], 月度快照: [], 备忘录: [], 日租房态: [], 日租清洁记录: []
}, null, 2), 'utf8');
const crypto = require('crypto');
const 盐 = crypto.randomBytes(16).toString('hex');
fs.writeFileSync(path.join(临时, 'data', '登录凭据.json'), JSON.stringify({
  用户名: 账号.用户名, 盐, 哈希: crypto.scryptSync(账号.密码, 盐, 64).toString('hex')
}, null, 2), 'utf8');

// ---------- 起服务 ----------
const 子进程 = spawn(process.execPath, ['server.js'], {
  cwd: 临时, env: { ...process.env, PORT: String(端口) }, stdio: ['ignore', 'pipe', 'pipe']
});
let 服务日志 = '';
子进程.stdout.on('data', b => { 服务日志 += b; });
子进程.stderr.on('data', b => { 服务日志 += b; });

const 认证 = 'Basic ' + Buffer.from(`${账号.用户名}:${账号.密码}`).toString('base64');
function 请求(方法, 路径, 体) {
  return new Promise((resolve, reject) => {
    const 数据 = 体 == null ? null : JSON.stringify(体);
    const r = http.request({ host: '127.0.0.1', port: 端口, path: 路径, method: 方法,
      headers: { Authorization: 认证, ...(数据 ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(数据) } : {}) } },
      res => { let s = ''; res.on('data', c => s += c); res.on('end', () => { try { resolve({ 码: res.statusCode, 体: JSON.parse(s) }); } catch (e) { resolve({ 码: res.statusCode, 体: s }); } }); });
    r.on('error', reject);
    if (数据) r.write(数据);
    r.end();
  });
}
const 等 = ms => new Promise(r => setTimeout(r, ms));
const 编码查询 = (obj) => Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
async function 等服务起来() {
  for (let i = 0; i < 50; i++) {
    try { const r = await 请求('GET', '/api/now'); if (r.码 === 200) return true; } catch (e) { /* 还没起来 */ }
    await 等(200);
  }
  return false;
}
let 通过 = 0, 失败 = 0;
function 断言(说明, 条件, 附加) {
  if (条件) { 通过++; console.log('  ✅ ' + 说明); }
  else { 失败++; console.log('  ❌ ' + 说明 + (附加 ? '\n     ' + 附加 : '')); }
}

(async () => {
  try {
    if (!await 等服务起来()) { console.log('服务起不来，日志：\n' + 服务日志); process.exit(1); }

    console.log('\n【1】启动自动补快照：2026-08 有真实数据 + 历史总账单旧值 → 应自动固化并刷新旧值');
    let 全部 = await 请求('GET', '/api/all');
    断言('2026-08 已被自动补进 月度快照', (全部.体.月度快照 || []).some(k => k.月份 === '2026-08'));
    断言('历史总账单 2026-08 支出从旧值 9999 刷新为 500', (全部.体.历史总账单.find(h => h.月份 === '2026-08') || {}).支出 === 500,
      '实际=' + JSON.stringify(全部.体.历史总账单.find(h => h.月份 === '2026-08')));

    console.log('\n【2】全部账单 / 月度账单读快照（锁定月不再现算）');
    let 史 = await 请求('GET', '/api/history');
    const h08 = 史.体.find(h => h.月份 === '2026-08');
    断言('全部账单 2026-08 月租总收 = 1000（读固化值）', h08 && h08.月租总收 === 1000, '实际=' + JSON.stringify(h08));
    断言('全部账单 2026-08 日租总收 = 100', h08 && h08.日租总收 === 100);
    断言('全部账单 2026-08 支出原始 = 500', h08 && h08.支出原始 === 500);
    let 账 = await 请求('GET', '/api/bills?month=2026-08');
    const 行301 = (账.体 || []).find(b => b.房号 === '301' && b.状态 !== '未出租' && b.状态 !== '已退房');
    断言('月度账单 2026-08 301 行读到快照（房租 1000 / 实收 1000 / 已核收）', 行301 && 行301.房租 === 1000 && 行301.实收 === 1000 && 行301.状态 === '已核收', '实际=' + JSON.stringify(行301));

    console.log('\n【3】锁定月的写操作全部被拒');
    断言('锁定月新增日租 → 400', (await 请求('POST', '/api/daily', { 日期: '2026-08-15', 房号: '301', 客人: 'x', 金额: 50 })).码 === 400);
    断言('锁定月新增支出 → 400', (await 请求('POST', '/api/transactions', { 日期: '2026-08-06', 事项: 'x', 金额: 9 })).码 === 400);
    断言('锁定月新增抄表 → 400', (await 请求('POST', '/api/meters', { 房号: '301', 水表: 99, 电表: 99, 日期: '2026-08-20' })).码 === 400);
    断言('锁定月核收 → 400', (await 请求('POST', '/api/bills/collect', { 房号: '301', 月份: '2026-08', 实收: 999 })).码 === 400);
    断言('锁定月追缴 → 400', (await 请求('POST', '/api/bills/arrears', { 房号: '301', 月份: '2026-08', 金额: 100 })).码 === 400);
    断言('锁定月欠费滚存 → 400', (await 请求('POST', '/api/bills/carry', { 房号: '301', 月份: '2026-08', 金额: 100 })).码 === 400);
    断言('锁定月删账单 → 400', (await 请求('DELETE', '/api/bills?' + 编码查询({ 房号: '301', 月份: '2026-08' }))).码 === 400);
    断言('锁定月删抄表 → 400', (await 请求('DELETE', '/api/meters/1')).码 === 400);
    断言('锁定月删支出 → 400', (await 请求('DELETE', '/api/transactions/1')).码 === 400);
    断言('当前月份设回锁定月 → 400', (await 请求('POST', '/api/settings', { 当前月份: '2026-08' })).码 === 400);

    console.log('\n【4】改现在的房间租金不影响已锁定月（快照解耦）');
    await 请求('PUT', '/api/rooms/1', { 月租金: 5000 });   // 把 301 现在租金改成 5000
    账 = await 请求('GET', '/api/bills?month=2026-08');
    const 行301改 = (账.体 || []).find(b => b.房号 === '301' && b.状态 !== '未出租' && b.状态 !== '已退房');
    断言('改租金后 2026-08 的 301 房租仍是 1000（不是 5000）', 行301改 && 行301改.房租 === 1000, '实际房租=' + (行301改 && 行301改.房租));

    console.log('\n【5】切月：settle 2026-09 → 锁定 2026-09');
    await 请求('POST', '/api/settle', { 月份: '2026-09' });
    断言('2026-09 已进 月度快照', (await 请求('GET', '/api/all')).体.月度快照.some(k => k.月份 === '2026-09'));
    断言('锁定后往 2026-09 写支出 → 400', (await 请求('POST', '/api/transactions', { 日期: '2026-09-20', 事项: 'x', 金额: 9 })).码 === 400);

    console.log('\n【6】解锁 2026-09 → 可编辑 → 重新锁定 → 再次冻结');
    await 请求('POST', '/api/unlock', { 月份: '2026-09' });
    全部 = await 请求('GET', '/api/all');
    断言('解锁后 2026-09 已从快照移除', !(全部.体.月度快照 || []).some(k => k.月份 === '2026-09'));
    断言('解锁后往 2026-09 写支出 → 200', (await 请求('POST', '/api/transactions', { 日期: '2026-09-20', 事项: '补', 金额: 999 })).码 === 200);
    史 = await 请求('GET', '/api/history');
    const h09 = 史.体.find(h => h.月份 === '2026-09');
    断言('解锁中 2026-09 全部账单现算（支出含新加的 999）', h09 && h09.支出原始 === 1599, '实际=' + JSON.stringify(h09));
    await 请求('POST', '/api/settle', { 月份: '2026-09' });   // 重新锁定
    史 = await 请求('GET', '/api/history');
    const h09锁 = 史.体.find(h => h.月份 === '2026-09');
    断言('重新锁定后 2026-09 支出固化 = 1599', h09锁 && h09锁.支出原始 === 1599);
    断言('重新锁定后再写 2026-09 → 400', (await 请求('POST', '/api/transactions', { 日期: '2026-09-21', 事项: 'x', 金额: 1 })).码 === 400);

    console.log(`\n========== 通过 ${通过} / ${失败 + 通过} ==========`);
    子进程.kill();
    await 等(400);   // 等服务进程真正退出、释放文件句柄，再删临时目录（Windows 下直接 rm 会 EPERM）
    try { fs.rmSync(临时, { recursive: true, force: true }); } catch (e) { /* 删不掉就留着，不影响 */ }
    process.exit(失败 ? 1 : 0);
  } catch (e) {
    console.error('测试异常：', e);
    子进程.kill();
    process.exit(1);
  }
})();

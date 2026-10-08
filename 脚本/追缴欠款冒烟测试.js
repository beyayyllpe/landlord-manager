// 追缴 → 欠款联动 冒烟测试
// 验证「追缴金额冲减欠款」的修复：欠款 = 应付 − 实收 − 补缴剩余（补缴先冲结转，多出的再冲本月欠款）。
// 安全性：把 server.js 复制到临时子目录 .冒烟临时追缴\ 里跑（server.js 用 __dirname 定位 data，
// 只读写临时目录里的假数据），**绝不碰 data\数据.json**；跑在 PORT=4001，不影响正在运行的服务。
// 用法：node 脚本\追缴欠款冒烟测试.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');

const 根 = path.join(__dirname, '..');
const 临时 = path.join(根, '.冒烟临时追缴');
const 端口 = 4001;
const 账号 = { 用户名: 'admin', 密码: 'smoke123456' };
const 月份 = '2026-10';

// ---------- 准备隔离环境 ----------
fs.rmSync(临时, { recursive: true, force: true });
fs.mkdirSync(path.join(临时, 'data'), { recursive: true });
fs.copyFileSync(path.join(根, 'server.js'), path.join(临时, 'server.js'));
fs.mkdirSync(path.join(临时, 'public'), { recursive: true });
fs.writeFileSync(path.join(临时, 'public', 'index.html'), '<!doctype html><title>t</title>', 'utf8');

// 假数据：3 间月租房（当月新租，可计算）。1002 结转 800、1003 结转 300，用来验证补缴冲结转/冲欠款两条路。
const 房 = (房号, 租客) => ({ 房号, 月租金: '1000', 管理费: '0', 押金: 0, 房卡押金: 0, 水费单价: '', 电费单价: '', 水表底度: 0, 电表底度: 0, 租客姓名: 租客, 电话: '', 身份证: '', 入住日: '2026-10-05', 到期日: '', 备注: '' });
fs.writeFileSync(path.join(临时, 'data', '数据.json'), JSON.stringify({
  settings: { 水价: 5, 电价: 1.3, 当前月份: 月份, 隐藏房号: [], 工资分段: [{ 起始月份: '2024-03', 金额: 4000 }] },
  房源: [
    { id: 1, 房号: '1001', 房型: '月租' }, { id: 2, 房号: '1002', 房型: '月租' }, { id: 3, 房号: '1003', 房型: '月租' }
  ],
  rooms: [房('1001', '测试甲'), 房('1002', '测试乙'), 房('1003', '测试丙')],
  meters: [], daily: [], transactions: [], 退房记录: [], 历史总账单: [], 备忘录: [], 预缴记录: [],
  bills: [
    { id: 1, 房号: '1002', 月份, 房间损耗: 0, 损耗说明: '', 实收: 0, 强制: false, 平账: false, 收款日期: '', 补缴: 0, 结转: 800, 转下月: 0 },
    { id: 2, 房号: '1003', 月份, 房间损耗: 0, 损耗说明: '', 实收: 0, 强制: false, 平账: false, 收款日期: '', 补缴: 0, 结转: 300, 转下月: 0 }
  ]
}, null, 2), 'utf8');

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
async function 等服务起来() {
  for (let i = 0; i < 50; i++) {
    try { const r = await 请求('GET', `/api/bills?month=${月份}`); if (r.码 === 200) return true; } catch (e) { /* 还没起来 */ }
    await 等(200);
  }
  return false;
}
const 账单行 = async 房号 => { const r = await 请求('GET', `/api/bills?month=${月份}`); return r.体.find(x => x.房号 === 房号); };

let 通过 = 0, 失败 = 0;
function 断言(说明, 条件, 附加) {
  if (条件) { 通过++; console.log('  ✅ ' + 说明); }
  else { 失败++; console.log('  ❌ ' + 说明 + (附加 ? '\n     ' + 附加 : '')); }
}

(async () => {
  try {
    if (!await 等服务起来()) { console.log('服务起不来，日志：\n' + 服务日志); process.exit(1); }

    console.log('\n【1】初始状态：1001 无结转、应付 1000、欠款 0');
    let b = await 账单行('1001');
    断言('应付租金 = 1000', b.应付租金 === 1000, JSON.stringify(b));
    断言('状态 = 未交、欠款 0', b.状态 === '未交' && b.欠款 === 0, JSON.stringify(b));

    console.log('\n【2】追缴 500（无结转）→ 欠款应 500（本修复核心）');
    await 请求('POST', '/api/bills/arrears', { 房号: '1001', 月份, 金额: 500 });
    b = await 账单行('1001');
    断言('补缴 = 500', b.补缴 === 500, JSON.stringify(b));
    断言('状态 = 欠款', b.状态 === '欠款', JSON.stringify(b));
    断言('欠款 = 应付1000 − 实收0 − 补缴剩余500 = 500', b.欠款 === 500, JSON.stringify(b));

    console.log('\n【3】追缴 500（结转 800）→ 只冲结转，欠款 = 300 + 1000 = 1300（不回归 09-17 修复）');
    await 请求('POST', '/api/bills/arrears', { 房号: '1002', 月份, 金额: 500 });
    b = await 账单行('1002');
    断言('结转显示剩余 300', b.结转 === 300, JSON.stringify(b));
    断言('应付 = 1000 + 结转剩余300 = 1300', b.应付租金 === 1300, JSON.stringify(b));
    断言('欠款 = 1300', b.欠款 === 1300, JSON.stringify(b));

    console.log('\n【4】追缴 500（结转 300）→ 冲完结转后多出 200 继续冲欠款 → 欠款 800');
    await 请求('POST', '/api/bills/arrears', { 房号: '1003', 月份, 金额: 500 });
    b = await 账单行('1003');
    断言('结转显示 0', b.结转 === 0, JSON.stringify(b));
    断言('应付 = 1000（结转已冲完）', b.应付租金 === 1000, JSON.stringify(b));
    断言('欠款 = 应付1000 − 补缴剩余200 = 800', b.欠款 === 800, JSON.stringify(b));

    console.log('\n【5】欠费滚存默认金额（后端 carry 未传金额）也用补缴剩余：1001 拖欠应 500');
    const c = await 请求('POST', '/api/bills/carry', { 房号: '1001', 月份 });
    断言('结转金额 = 500（=应付1000−实收0−补缴剩余500−转下月0）', c.体.结转金额 === 500, JSON.stringify(c.体));

    console.log(`\n================  通过 ${通过} 项，失败 ${失败} 项  ================\n`);
  } catch (e) {
    console.log('\n测试异常：' + (e && e.stack || e));
    console.log('服务日志：\n' + 服务日志);
    失败++;
  } finally {
    子进程.kill();
    await 等(300);
    fs.rmSync(临时, { recursive: true, force: true });   // 清掉临时目录
    process.exit(失败 ? 1 : 0);
  }
})();

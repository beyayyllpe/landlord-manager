// 状态栏「追缴清空后不再显示」冒烟测试
// 验证：未抄表房，上月结转欠费被「追缴」清空（欠款=0）后，不再出现在总览状态栏的欠费列表里；
//       还没追缴清（欠款>0）的仍然显示。等抄水电（可计算）后自然恢复显示。
// 安全性：把 server.js 复制到临时子目录 .冒烟临时状态\ 里跑（只读写临时目录假数据），绝不碰 data\数据.json；
//       跑在 PORT=4002，不影响正在运行的服务。
// 用法：node 脚本\状态栏追缴清空冒烟测试.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');

const 根 = path.join(__dirname, '..');
const 临时 = path.join(根, '.冒烟临时状态');
const 端口 = 4002;
const 账号 = { 用户名: 'admin', 密码: 'smoke123456' };
const 月份 = '2026-10';

// ---------- 准备隔离环境 ----------
fs.rmSync(临时, { recursive: true, force: true });
fs.mkdirSync(path.join(临时, 'data'), { recursive: true });
fs.copyFileSync(path.join(根, 'server.js'), path.join(临时, 'server.js'));
fs.mkdirSync(path.join(临时, 'public'), { recursive: true });
fs.writeFileSync(path.join(临时, 'public', 'index.html'), '<!doctype html><title>t</title>', 'utf8');

// 两间未抄表房（入住日在上月，本月无抄表 → 可计算=false），上月分别滚存了结转欠费
const 房 = (房号, 入住日) => ({ 房号, 月租金: '1000', 管理费: '0', 押金: 0, 房卡押金: 0, 水费单价: '', 电费单价: '', 水表底度: 0, 电表底度: 0, 租客姓名: '测试' + 房号, 电话: '', 身份证: '', 入住日, 到期日: '', 备注: '' });
fs.writeFileSync(path.join(临时, 'data', '数据.json'), JSON.stringify({
  settings: { 水价: 5, 电价: 1.3, 当前月份: 月份, 隐藏房号: [], 工资分段: [{ 起始月份: '2024-03', 金额: 4000 }] },
  房源: [
    { id: 1, 房号: '2001', 房型: '月租' }, { id: 2, 房号: '2002', 房型: '月租' }
  ],
  rooms: [房('2001', '2026-09-05'), 房('2002', '2026-09-06')],
  meters: [], daily: [], transactions: [], 退房记录: [], 历史总账单: [], 备忘录: [], 预缴记录: [],
  bills: [
    { id: 1, 房号: '2001', 月份, 房间损耗: 0, 损耗说明: '', 实收: 0, 强制: false, 平账: false, 收款日期: '', 补缴: 0, 结转: 1000, 转下月: 0 },
    { id: 2, 房号: '2002', 月份, 房间损耗: 0, 损耗说明: '', 实收: 0, 强制: false, 平账: false, 收款日期: '', 补缴: 0, 结转: 800, 转下月: 0 }
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
    try { const r = await 请求('GET', '/api/summary?month=' + 月份); if (r.码 === 200) return true; } catch (e) { /* 还没起来 */ }
    await 等(200);
  }
  return false;
}
const 欠费房号们 = async () => { const r = await 请求('GET', '/api/summary?month=' + 月份); return r.体.欠费.map(b => b.房号); };

let 通过 = 0, 失败 = 0;
function 断言(说明, 条件, 附加) {
  if (条件) { 通过++; console.log('  ✅ ' + 说明); }
  else { 失败++; console.log('  ❌ ' + 说明 + (附加 ? '\n     ' + JSON.stringify(附加) : '')); }
}

(async () => {
  try {
    if (!await 等服务起来()) { console.log('服务起不来，日志：\n' + 服务日志); process.exit(1); }

    console.log('\n【1】初始：两间未抄表房都有结转欠费，都应在状态栏显示');
    let 房号们 = await 欠费房号们();
    断言('2001 在欠费列表', 房号们.includes('2001'), 房号们);
    断言('2002 在欠费列表', 房号们.includes('2002'), 房号们);

    console.log('\n【2】2001 追缴 1000（刚好清空结转）→ 应消失；2002 还在');
    await 请求('POST', '/api/bills/arrears', { 房号: '2001', 月份, 金额: 1000 });
    房号们 = await 欠费房号们();
    断言('2001 已从欠费列表消失', !房号们.includes('2001'), 房号们);
    断言('2002 仍在欠费列表', 房号们.includes('2002'), 房号们);

    console.log('\n【3】2001 追缴清空后，账单口径不变：结转/应付仍是原值，欠款=0');
    const b = (await 请求('GET', '/api/bills?month=' + 月份)).体.find(x => x.房号 === '2001');
    断言('结转仍 = 1000（追缴不冲结转）', b.结转 === 1000, b);
    断言('补缴 = 1000', b.补缴 === 1000, b);
    断言('应付租金 = null（未抄表）', b.应付租金 === null, b);
    断言('欠款 = 0（已追缴清）', b.欠款 === 0, b);

    console.log('\n【4】2002 追缴 500（部分）→ 仍显示，欠款 = 800−500 = 300');
    await 请求('POST', '/api/bills/arrears', { 房号: '2002', 月份, 金额: 500 });
    房号们 = await 欠费房号们();
    断言('2002 仍在欠费列表', 房号们.includes('2002'), 房号们);
    const b2 = (await 请求('GET', '/api/bills?month=' + 月份)).体.find(x => x.房号 === '2002');
    断言('2002 欠款 = 300', b2.欠款 === 300, b2);

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

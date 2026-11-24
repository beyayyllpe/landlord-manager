// 发送定格 + 撤销发送 冒烟测试
// 验证：
//   1) 抄表 → 待发送；点「发送」→ 已发送 + 存「发送快照」（账单内容定格）。
//   2) 发送后「追缴」→ 实时补缴/欠款照常变，但「发送快照」里的应付/补缴/结转不变（定格）。
//   3) 撤销发送 → 已发送=false、发送快照清空，回到待发送；已追缴的钱不受影响。
// 安全性：把 server.js 复制到临时子目录跑，绝不碰 data\数据.json；PORT=4004。
// 用法：node 脚本/发送定格与撤销冒烟测试.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');

const 根 = path.join(__dirname, '..');
const 临时 = path.join(根, '.冒烟临时定格');
const 端口 = 4004;
const 账号 = { 用户名: 'admin', 密码: 'smoke123456' };
const 月份 = '2026-10';

fs.rmSync(临时, { recursive: true, force: true });
fs.mkdirSync(path.join(临时, 'data'), { recursive: true });
fs.copyFileSync(path.join(根, 'server.js'), path.join(临时, 'server.js'));
fs.mkdirSync(path.join(临时, 'public'), { recursive: true });
fs.writeFileSync(path.join(临时, 'public', 'index.html'), '<!doctype html><title>t</title>', 'utf8');

const 房 = (房号, 入住日) => ({ 房号, 月租金: '1000', 管理费: '0', 押金: 0, 房卡押金: 0, 水费单价: '', 电费单价: '', 水表底度: 0, 电表底度: 0, 租客姓名: '测试' + 房号, 电话: '', 身份证: '', 入住日, 到期日: '', 备注: '' });
fs.writeFileSync(path.join(临时, 'data', '数据.json'), JSON.stringify({
  settings: { 水价: 5, 电价: 1.3, 当前月份: 月份, 隐藏房号: [], 工资分段: [{ 起始月份: '2024-03', 金额: 4000 }] },
  房源: [{ id: 1, 房号: '3001', 房型: '月租' }],
  rooms: [房('3001', '2026-09-05')],
  meters: [], daily: [], transactions: [], 退房记录: [], 历史总账单: [], 备忘录: [], 预缴记录: [], bills: []
}, null, 2), 'utf8');

const 盐 = crypto.randomBytes(16).toString('hex');
fs.writeFileSync(path.join(临时, 'data', '登录凭据.json'), JSON.stringify({ 用户名: 账号.用户名, 盐, 哈希: crypto.scryptSync(账号.密码, 盐, 64).toString('hex') }, null, 2), 'utf8');

const 子进程 = spawn(process.execPath, ['server.js'], { cwd: 临时, env: { ...process.env, PORT: String(端口) }, stdio: ['ignore', 'pipe', 'pipe'] });
let 服务日志 = '';
子进程.stdout.on('data', b => { 服务日志 += b; });
子进程.stderr.on('data', b => { 服务日志 += b; });

const 认证 = 'Basic ' + Buffer.from(`${账号.用户名}:${账号.密码}`).toString('base64');
function 请求(方法, 路径, 体) {
  return new Promise((resolve, reject) => {
    const 数据 = 体 == null ? null : JSON.stringify(体);
    const r = http.request({ host: '127.0.0.1', port: 端口, path: 路径, method: 方法, headers: { Authorization: 认证, ...(数据 ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(数据) } : {}) } },
      res => { let s = ''; res.on('data', c => s += c); res.on('end', () => { try { resolve({ 码: res.statusCode, 体: JSON.parse(s) }); } catch (e) { resolve({ 码: res.statusCode, 体: s }); } }); });
    r.on('error', reject);
    if (数据) r.write(数据);
    r.end();
  });
}
const 等 = ms => new Promise(r => setTimeout(r, ms));
async function 等服务起来() {
  for (let i = 0; i < 50; i++) { try { const r = await 请求('GET', '/api/bills?month=' + 月份); if (r.码 === 200) return true; } catch (e) {} await 等(200); }
  return false;
}
const 账单行 = async () => { const r = await 请求('GET', `/api/bills?month=${月份}`); return r.体.find(x => x.房号 === '3001'); };

let 通过 = 0, 失败 = 0;
function 断言(说明, 条件, 附加) { if (条件) { 通过++; console.log('  ✅ ' + 说明); } else { 失败++; console.log('  ❌ ' + 说明 + (附加 ? '\n     ' + JSON.stringify(附加) : '')); } }

(async () => {
  try {
    if (!await 等服务起来()) { console.log('服务起不来，日志：\n' + 服务日志); process.exit(1); }

    console.log('\n【1】抄表 → 待发送（无快照）');
    await 请求('POST', '/api/meters', { 房号: '3001', 水表: 0, 电表: 0 });
    let b = await 账单行();
    断言('待发送 = true', b.待发送 === true, b);
    断言('已发送 = false', b.已发送 === false, b);
    断言('发送快照 = null', b.发送快照 == null, b);

    console.log('\n【2】点「发送」→ 已发送 + 存快照（应付 1000 定格）');
    await 请求('POST', '/api/bills/sent', { 房号: '3001', 月份 });
    b = await 账单行();
    断言('已发送 = true', b.已发送 === true, b);
    断言('待发送 = false', b.待发送 === false, b);
    断言('有发送快照', !!b.发送快照, b);
    断言('快照.应付租金 = 1000', b.发送快照 && b.发送快照.应付租金 === 1000, b.发送快照);
    断言('快照.补缴 = 0', b.发送快照 && b.发送快照.补缴 === 0, b.发送快照);

    console.log('\n【3】发送后「追缴 500」→ 实时补缴/欠款变，但快照不变（定格）');
    await 请求('POST', '/api/bills/arrears', { 房号: '3001', 月份, 金额: 500 });
    b = await 账单行();
    断言('实时补缴 = 500', b.补缴 === 500, b);
    断言('实时欠款 = 500（1000−500）', b.欠款 === 500, b);
    断言('快照.补缴 仍 = 0（定格）', b.发送快照 && b.发送快照.补缴 === 0, b.发送快照);
    断言('快照.应付租金 仍 = 1000（定格）', b.发送快照 && b.发送快照.应付租金 === 1000, b.发送快照);

    console.log('\n【4】撤销发送 → 回到待发送、快照清空，已追缴的钱保留');
    await 请求('POST', '/api/bills/unsent', { 房号: '3001', 月份 });
    b = await 账单行();
    断言('已发送 = false', b.已发送 === false, b);
    断言('待发送 = true', b.待发送 === true, b);
    断言('发送快照 = null', b.发送快照 == null, b);
    断言('实时补缴 仍 = 500（撤销不删追缴）', b.补缴 === 500, b);
    断言('实时欠款 = 500', b.欠款 === 500, b);

    console.log(`\n================  通过 ${通过} 项，失败 ${失败} 项  ================\n`);
  } catch (e) {
    console.log('\n测试异常：' + (e && e.stack || e));
    console.log('服务日志：\n' + 服务日志); 失败++;
  } finally {
    子进程.kill(); await 等(300);
    fs.rmSync(临时, { recursive: true, force: true });
    process.exit(失败 ? 1 : 0);
  }
})();

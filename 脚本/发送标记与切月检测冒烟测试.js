// 发送标记 + 切月欠款检测 冒烟测试
// 验证：
//   1) 老账单（无 已发送 字段）默认「已发送」，不是待发送。
//   2) 抄表 → 待发送 → 点「发送」→ 已发送；总览 summary 据此列出/隐藏。
//   3) 切月（/api/settle 当前月）时，有房间欠款未滚存 → 400 拒绝并列出欠款房；滚存后可切月。
// 注意顺序：切月会锁死当前月，所以发送流转测完再测切月。
// 安全性：把 server.js 复制到临时子目录 .冒烟临时发送\ 里跑，绝不碰 data\数据.json；PORT=4003。
// 用法：node 脚本/发送标记与切月检测冒烟测试.js
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const { spawn } = require('child_process');
const crypto = require('crypto');

const 根 = path.join(__dirname, '..');
const 临时 = path.join(根, '.冒烟临时发送');
const 端口 = 4003;
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
  房源: [{ id: 1, 房号: '3001', 房型: '月租' }, { id: 2, 房号: '3002', 房型: '月租' }],
  rooms: [房('3001', '2026-09-05'), 房('3002', '2026-10-05')], // 3001 上月入住(未抄表)、3002 当月新租(可计算)
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
const 账单行 = async 房号 => { const r = await 请求('GET', `/api/bills?month=${月份}`); return r.体.find(x => x.房号 === 房号); };
const 欠费含 = async 房号 => { const r = await 请求('GET', '/api/summary?month=' + 月份); return r.体.欠费.find(x => x.房号 === 房号); };

let 通过 = 0, 失败 = 0;
function 断言(说明, 条件, 附加) { if (条件) { 通过++; console.log('  ✅ ' + 说明); } else { 失败++; console.log('  ❌ ' + 说明 + (附加 ? '\n     ' + JSON.stringify(附加) : '')); } }

(async () => {
  try {
    if (!await 等服务起来()) { console.log('服务起不来，日志：\n' + 服务日志); process.exit(1); }

    console.log('\n【1】老账单默认已发送：3002 当月新租（可计算）但无 bills 记录 → 不应待发送');
    let b = await 账单行('3002');
    断言('3002 可计算 = true', b.可计算 === true, b);
    断言('3002 已发送 = true（缺省）', b.已发送 === true, b);
    断言('3002 待发送 = false', b.待发送 === false, b);

    console.log('\n【2】3001 抄表前未抄表（非待发送）');
    b = await 账单行('3001');
    断言('3001 可计算 = false', b.可计算 === false, b);
    断言('3001 待发送 = false', b.待发送 === false, b);

    console.log('\n【3】抄表 3001 → 待发送=true、已发送=false，summary 列出待发送');
    const 抄表回 = await 请求('POST', '/api/meters', { 房号: '3001', 水表: 0, 电表: 0 });
    断言('抄表成功（非 400）', 抄表回.码 === 200, 抄表回);
    b = await 账单行('3001');
    断言('3001 可计算 = true', b.可计算 === true, b);
    断言('3001 待发送 = true', b.待发送 === true, b);
    断言('3001 已发送 = false', b.已发送 === false, b);
    let 项 = await 欠费含('3001');
    断言('summary 欠费里 3001 待发送=true', !!项 && 项.待发送 === true, 项);

    console.log('\n【4】点「发送」→ 已发送=true、待发送=false，summary 里转为正常未交');
    await 请求('POST', '/api/bills/sent', { 房号: '3001', 月份 });
    b = await 账单行('3001');
    断言('3001 已发送 = true', b.已发送 === true, b);
    断言('3001 待发送 = false', b.待发送 === false, b);
    项 = await 欠费含('3001');
    断言('summary 里 3001 待发送=false（正常未交）', !!项 && 项.待发送 === false, 项);

    console.log('\n【5】切月阻止：3001/3002 都未收未滚存 → /api/settle 应 400');
    let s = await 请求('POST', '/api/settle', { 月份 });
    断言('settle 返回 400', s.码 === 400, s.体);
    断言('欠款房含 3001 欠 1000', Array.isArray(s.体.欠款房) && s.体.欠款房.some(x => x.房号 === '3001' && x.欠 === 1000), s.体);
    断言('欠款房含 3002 欠 1000', Array.isArray(s.体.欠款房) && s.体.欠款房.some(x => x.房号 === '3002' && x.欠 === 1000), s.体);

    console.log('\n【6】滚存 3001/3002 后 → 可切月');
    await 请求('POST', '/api/bills/carry', { 房号: '3001', 月份, 金额: 1000 });
    await 请求('POST', '/api/bills/carry', { 房号: '3002', 月份, 金额: 1000 });
    s = await 请求('POST', '/api/settle', { 月份 });
    断言('settle 返回 200', s.码 === 200, s.体);

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

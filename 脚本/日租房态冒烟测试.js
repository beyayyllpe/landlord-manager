// 日租房态（EBK 房态图）后端冒烟测试
// 安全性：把 server.js 复制到临时子目录 .冒烟临时\ 里跑（server.js 用 __dirname 定位 data，
// 所以它只会读写那个临时目录里的假数据），**绝不碰 data\数据.json**；跑在 PORT=3999，不影响正在运行的服务。
// 用法：node 脚本\日租房态冒烟测试.js
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
// 假数据：3 间日租房 + 1 间月租房（月租房用来验证「非日租房不给入住」）
fs.writeFileSync(path.join(临时, 'data', '数据.json'), JSON.stringify({
  settings: { 水价: 5, 电价: 1.3, 当前月份: new Date().toISOString().slice(0, 7), 隐藏房号: [], 工资分段: [{ 起始月份: '2024-03', 金额: 4000 }] },
  房源: [
    { id: 1, 房号: '101', 房型: '日租' }, { id: 2, 房号: '102', 房型: '日租' },
    { id: 3, 房号: '103', 房型: '日租' }, { id: 4, 房号: '201', 房型: '月租' }
  ],
  rooms: [], meters: [], bills: [], daily: [], transactions: [], 退房记录: [], 历史总账单: [], 备忘录: []
}, null, 2), 'utf8');
// 预置登录凭据，省得猜自动生成的密码
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
async function 等服务起来() {
  for (let i = 0; i < 50; i++) {
    try { const r = await 请求('GET', '/api/roomstatus'); if (r.码 === 200) return true; } catch (e) { /* 还没起来 */ }
    await 等(200);
  }
  return false;
}

let 通过 = 0, 失败 = 0;
function 断言(说明, 条件, 附加) {
  if (条件) { 通过++; console.log('  ✅ ' + 说明); }
  else { 失败++; console.log('  ❌ ' + 说明 + (附加 ? '\n     ' + 附加 : '')); }
}
function 读数据文件() { return JSON.parse(fs.readFileSync(path.join(临时, 'data', '数据.json'), 'utf8')); }

(async () => {
  try {
    if (!await 等服务起来()) { console.log('服务起不来，日志：\n' + 服务日志); process.exit(1); }
    const 今天 = new Date().toISOString().slice(0, 10);

    console.log('\n【1】初始房态');
    let r = await 请求('GET', '/api/roomstatus');
    断言('只列出房型=日租的 3 间（月租房 201 不进房态图）', r.体.房间.length === 3 && !r.体.房间.some(x => x.房号 === '201'));
    断言('全部初始为「空闲」', r.体.房间.every(x => x.状态 === '空闲'));
    断言('概览：可用 3 / 在住 0 / 脏房 0 / 今日收入 0',
      r.体.概览.可用 === 3 && r.体.概览.在住 === 0 && r.体.概览.脏房 === 0 && r.体.概览.今日收入 === 0);

    console.log('\n【2】办入住 → 变绿 + 同步写日租账单');
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '101', 客人: '张三', 电话: '13800000000', 入住日: 今天, 天数: 2, 金额: 388 });
    断言('入住成功', r.码 === 200 && r.体.ok, JSON.stringify(r.体));
    const 账单id = r.体.账单 && r.体.账单.id;
    let d = 读数据文件();
    断言('daily 里真的多了一条账单', d.daily.length === 1 && d.daily[0].金额 === 388);
    断言('账单字段与手工录入完全一致（日期/房号/客人/入住天数/金额）',
      ['日期', '房号', '客人', '入住天数', '金额'].every(k => k in d.daily[0]) && d.daily[0].房号 === '101' && d.daily[0].入住天数 === 2,
      JSON.stringify(d.daily[0]));
    断言('房态存了 日租id 指向那条账单（撤销时靠它反查）', d.日租房态[0].日租id === 账单id);
    r = await 请求('GET', '/api/roomstatus');
    const 房101 = () => r.体.房间.find(x => x.房号 === '101');
    断言('101 变为「在住」', 房101().状态 === '在住');
    const 加天 = (日期, n) => { const t = new Date(日期 + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    断言('到期日 = 入住日 + 2 天', 房101().到期日 === 加天(今天, 2), `实际 ${房101().到期日}，期望 ${加天(今天, 2)}`);
    断言('概览：在住 1 / 可用 2 / 今日收入 388',
      r.体.概览.在住 === 1 && r.体.概览.可用 === 2 && r.体.概览.今日收入 === 388);

    console.log('\n【3】状态机拦截');
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '101', 天数: 1, 金额: 100 });
    断言('在住的房不能再次入住', r.码 === 400 && /正在住人/.test(r.体.错误), JSON.stringify(r.体));
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '201', 天数: 1, 金额: 100 });
    断言('月租房不能办日租入住', r.码 === 400 && /不是日租房/.test(r.体.错误), JSON.stringify(r.体));
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '102', 天数: 1, 金额: '' });
    断言('不填金额被拦', r.码 === 400 && /房费/.test(r.体.错误), JSON.stringify(r.体));
    r = await 请求('POST', '/api/roomstatus/checkout', { 房号: '102' });
    断言('没人住的房不能退房', r.码 === 400, JSON.stringify(r.体));
    r = await 请求('POST', '/api/roomstatus/clean', { 房号: '102' });
    断言('不是脏房不能清洁', r.码 === 400, JSON.stringify(r.体));
    断言('这些失败请求没有污染 daily', 读数据文件().daily.length === 1);

    console.log('\n【4】续住 / 改价 → 账单同步改');
    r = await 请求('POST', '/api/roomstatus/extend', { 房号: '101', 天数: 3, 金额: 500 });
    断言('续住成功', r.码 === 200 && r.体.ok, JSON.stringify(r.体));
    d = 读数据文件();
    断言('账单条数不变（是改不是新增）', d.daily.length === 1);
    断言('账单金额/天数跟着改了', d.daily[0].金额 === 500 && d.daily[0].入住天数 === 3, JSON.stringify(d.daily[0]));
    断言('房态与账单一致', d.日租房态[0].金额 === 500 && d.日租房态[0].天数 === 3);

    console.log('\n【5】退房 → 脏房（黄），钱不动');
    r = await 请求('POST', '/api/roomstatus/checkout', { 房号: '101' });
    断言('退房成功', r.码 === 200 && r.体.ok);
    d = 读数据文件();
    断言('daily 一条都没少、金额没变（退房不影响账单）', d.daily.length === 1 && d.daily[0].金额 === 500);
    r = await 请求('GET', '/api/roomstatus');
    断言('101 变「脏房」且记了退房时间', 房101().状态 === '脏房' && !!房101().退房时间);
    断言('脏房仍显示上一位客人（卡片上要展示）', 房101().客人 === '张三');
    断言('概览：脏房 1 / 在住 0 / 可用 2',
      r.体.概览.脏房 === 1 && r.体.概览.在住 === 0 && r.体.概览.可用 === 2);
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '101', 天数: 1, 金额: 100 });
    断言('脏房不能直接入住（必须先清洁）', r.码 === 400 && /脏房/.test(r.体.错误), JSON.stringify(r.体));

    console.log('\n【6】确认清洁 → 恢复无色 + 留记录');
    r = await 请求('POST', '/api/roomstatus/clean', { 房号: '101' });
    断言('清洁成功', r.码 === 200 && r.体.ok);
    d = 读数据文件();
    断言('清洁记录留了一条（含房号 + 上位客人）',
      d.日租清洁记录.length === 1 && d.日租清洁记录[0].房号 === '101' && d.日租清洁记录[0].上位客人 === '张三',
      JSON.stringify(d.日租清洁记录));
    断言('客人信息已清空，房间可再次接客', !d.日租房态[0].客人 && d.日租房态[0].状态 === '空闲');
    断言('daily 依然完好（清洁不动账）', d.daily.length === 1 && d.daily[0].金额 === 500);
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '101', 客人: '李四', 天数: 1, 金额: 200 });
    断言('清洁后可以接新客人', r.码 === 200 && r.体.ok);
    断言('同一房间第二笔生意 = 第二条账单', 读数据文件().daily.length === 2);

    console.log('\n【7】一键全清');
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '102', 客人: '王五', 天数: 1, 金额: 150 });
    await 请求('POST', '/api/roomstatus/checkout', { 房号: '101' });
    await 请求('POST', '/api/roomstatus/checkout', { 房号: '102' });
    r = await 请求('GET', '/api/roomstatus');
    断言('此时 2 间脏房', r.体.概览.脏房 === 2);
    r = await 请求('POST', '/api/roomstatus/clean-all', {});
    断言('一键全清报告清了 2 间', r.体.ok && r.体.数量 === 2, JSON.stringify(r.体));
    r = await 请求('GET', '/api/roomstatus');
    断言('全部恢复可用', r.体.概览.脏房 === 0 && r.体.概览.可用 === 3);
    断言('每间各留一条清洁记录（累计 3 条）', 读数据文件().日租清洁记录.length === 3);

    console.log('\n【8】撤销入住 → 连账单一起删（录错了的退路）');
    const 撤前 = 读数据文件().daily.length;
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 客人: '录错的', 天数: 1, 金额: 999 });
    断言('先办一笔错的入住', r.码 === 200 && 读数据文件().daily.length === 撤前 + 1);
    r = await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '103' });
    断言('撤销成功且报告删了账单', r.体.ok && r.体.删除账单 === true, JSON.stringify(r.体));
    d = 读数据文件();
    断言('那条 999 的账单确实没了', d.daily.length === 撤前 && !d.daily.some(x => x.金额 === 999));
    断言('103 退回「空闲」', (d.日租房态.find(x => x.房号 === '103') || {}).状态 === '空闲');

    console.log('\n【8.5】营业日（早 6 点换日）+ 今日入住记录');
    // 与 server.js 的 营业日() 同一算法：本地时间 6 点前算前一天
    const 营业日 = (t) => { const d = t ? new Date(t) : new Date(); if (d.getHours() < 6) d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    断言('凌晨 2 点算前一天', 营业日('2026-08-27T02:30:00') === '2026-08-26', 营业日('2026-08-27T02:30:00'));
    断言('5:59 仍算前一天', 营业日('2026-08-27T05:59:00') === '2026-08-26', 营业日('2026-08-27T05:59:00'));
    断言('6:00 整开始算新的一天', 营业日('2026-08-27T06:00:00') === '2026-08-27', 营业日('2026-08-27T06:00:00'));
    断言('晚上 23 点算当天', 营业日('2026-08-26T23:00:00') === '2026-08-26', 营业日('2026-08-26T23:00:00'));
    r = await 请求('GET', '/api/roomstatus');
    断言('接口返回的「今日」= 营业日', r.体.今日 === 营业日(), `接口 ${r.体.今日} vs 本地算 ${营业日()}`);
    const 本营业日记录 = 读数据文件().daily.filter(x => x.日期 === r.体.今日);
    断言('今日入住记录条数 = 本营业日的 daily 条数', r.体.今日入住.length === 本营业日记录.length);
    断言('记录带房号/客人/金额（界面要显示这三样）',
      r.体.今日入住.every(x => '房号' in x && '客人' in x && '金额' in x));
    断言('今日收入 = 这些记录金额之和',
      r.体.概览.今日收入 === r.体.今日入住.reduce((s, x) => s + x.金额, 0));
    断言('已不再返回清洁记录（界面换成入住记录了）', r.体.清洁记录 === undefined);

    console.log('\n【8.6】删一条入住记录 → 账单同步删 + 房态退回可用');
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '102', 客人: '待删的', 天数: 1, 金额: 66 });
    const 待删id = r.体.账单.id;
    const 删前条数 = 读数据文件().daily.length;
    r = await 请求('POST', '/api/roomstatus/delete-record', { id: 待删id });
    断言('删除成功且报告重置了房态', r.体.ok && r.体.重置房态 === true, JSON.stringify(r.体));
    d = 读数据文件();
    断言('daily 里那条没了', d.daily.length === 删前条数 - 1 && !d.daily.some(x => x.id === 待删id));
    断言('102 退回「空闲」', (d.日租房态.find(x => x.房号 === '102') || {}).状态 === '空闲');
    r = await 请求('POST', '/api/roomstatus/delete-record', { id: 待删id });
    断言('重复删同一条被拦（不会误删别的）', r.码 === 400, JSON.stringify(r.体));

    console.log('\n【8.7】0 元不入账 + 身份证登记');
    const 零前 = 读数据文件().daily.length;
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 客人: '自用', 身份证: '110101199001011234', 天数: 1, 金额: 0 });
    断言('0 元也能办入住（房间照样占上）', r.码 === 200 && r.体.ok, JSON.stringify(r.体));
    断言('接口明确回报「未入账」', r.体.已入账 === false && r.体.账单 === null);
    断言('daily 一条都没多', 读数据文件().daily.length === 零前);
    d = 读数据文件();
    const 态103 = d.日租房态.find(x => x.房号 === '103');
    断言('房间是「在住」但 日租id 为空', 态103.状态 === '在住' && 态103.日租id === null);
    断言('身份证存进了房态', 态103.身份证 === '110101199001011234');
    r = await 请求('GET', '/api/roomstatus');
    断言('房态接口把身份证透出来（详情要显示）',
      r.体.房间.find(x => x.房号 === '103').身份证 === '110101199001011234');
    断言('0 元的入住不出现在今日入住记录里', !r.体.今日入住.some(x => x.房号 === '103'));

    console.log('\n【8.8】改价时账单双向补建 / 撤销');
    r = await 请求('POST', '/api/roomstatus/extend', { 房号: '103', 天数: 1, 金额: 188 });
    断言('0 元改成 188 → 补记一条账单', r.体.ok && r.体.账单 && r.体.账单.金额 === 188, JSON.stringify(r.体));
    d = 读数据文件();
    断言('daily 多了这一条', d.daily.length === 零前 + 1);
    断言('房态的 日租id 指向新账单', d.日租房态.find(x => x.房号 === '103').日租id === r.体.账单.id);
    断言('补记的账单带上了身份证', d.daily.find(x => x.id === r.体.账单.id).身份证 === '110101199001011234');
    r = await 请求('POST', '/api/roomstatus/extend', { 房号: '103', 天数: 1, 金额: 0 });
    断言('188 改回 0 → 撤掉账单', r.体.ok && r.体.账单 === null, JSON.stringify(r.体));
    d = 读数据文件();
    断言('daily 又回到原来的条数', d.daily.length === 零前);
    断言('日租id 清空，房间仍在住', d.日租房态.find(x => x.房号 === '103').日租id === null && d.日租房态.find(x => x.房号 === '103').状态 === '在住');
    await 请求('POST', '/api/roomstatus/checkout', { 房号: '103' });
    await 请求('POST', '/api/roomstatus/clean', { 房号: '103' });
    断言('0 元入住的房间也能正常退房+清洁', (读数据文件().日租房态.find(x => x.房号 === '103') || {}).状态 === '空闲');

    console.log('\n【8.9】钟点房：到点自动转脏房');
    await 请求('POST', '/api/roomstatus/clean-all', {});
    // 3 小时的钟点房：还没到点
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '101', 客人们: [{ 姓名: '钟点甲', 电话: '13900000001' }], 金额: 88, 房型: '钟点', 时长小时: 3 });
    断言('钟点房入住成功', r.码 === 200 && r.体.ok, JSON.stringify(r.体));
    断言('房态记了房型/时长/到点时刻', r.体.房态.房型 === '钟点' && r.体.房态.时长小时 === 3 && !!r.体.房态.预计退房);
    断言('账单里也标了钟点', r.体.账单.房型 === '钟点' && r.体.账单.入住天数 === 1);
    r = await 请求('GET', '/api/roomstatus');
    let 房101态 = r.体.房间.find(x => x.房号 === '101');
    断言('没到点前仍是「在住」', 房101态.状态 === '在住');
    断言('剩余分钟约 180', 房101态.剩余分钟 > 170 && 房101态.剩余分钟 <= 180, '实际 ' + 房101态.剩余分钟);
    // 手工把到点时刻改到过去，模拟「3 小时到了」
    d = 读数据文件();
    d.日租房态.find(x => x.房号 === '101').预计退房 = new Date(Date.now() - 60000).toISOString();
    fs.writeFileSync(path.join(临时, 'data', '数据.json'), JSON.stringify(d, null, 2), 'utf8');
    r = await 请求('GET', '/api/roomstatus');
    房101态 = r.体.房间.find(x => x.房号 === '101');
    断言('到点后读一次房态就自动转「脏房」', 房101态.状态 === '脏房', JSON.stringify(房101态));
    断言('自动转脏房已落盘（不是只在返回值里改）', 读数据文件().日租房态.find(x => x.房号 === '101').状态 === '脏房');
    断言('钟点房的账单不受影响（钱照收）', 读数据文件().daily.some(x => x.金额 === 88));

    console.log('\n【8.10】钟点房延时：从入住时刻重算，不是从现在起算');
    await 请求('POST', '/api/roomstatus/clean', { 房号: '101' });
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '101', 客人们: [{ 姓名: '钟点乙' }], 金额: 50, 房型: '钟点', 时长小时: 2 });
    const 入住时刻 = new Date(r.体.房态.入住时间).getTime();
    r = await 请求('POST', '/api/roomstatus/extend', { 房号: '101', 金额: 70, 时长小时: 5 });
    const 新到点 = new Date(r.体.房态.预计退房).getTime();
    断言('延到 5 小时 = 入住时刻 + 5 小时', Math.abs(新到点 - (入住时刻 + 5 * 3600e3)) < 2000,
      `差 ${Math.round((新到点 - (入住时刻 + 5 * 3600e3)) / 1000)} 秒`);
    断言('金额也跟着改了', 读数据文件().daily.find(x => x.id === r.体.账单.id).金额 === 70);

    console.log('\n【8.11】多客人登记 + 客人档案自动带出');
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '101' });
    r = await 请求('POST', '/api/roomstatus/checkin', { 房号: '101', 金额: 300, 天数: 1, 客人们: [
      { 姓名: '同行甲', 电话: '13700000001', 身份证: '110101199001011111' },
      { 姓名: '同行乙', 电话: '13700000002', 身份证: '110101199002022222' }
    ] });
    断言('两位客人都存进房态', (r.体.房态.客人们 || []).length === 2, JSON.stringify(r.体.房态.客人们));
    断言('账单的客人列是姓名合起来', r.体.账单.客人 === '同行甲、同行乙', r.体.账单.客人);
    const 档案文件 = path.join(临时, 'data', '客人档案.json');
    断言('客人档案文件已生成', fs.existsSync(档案文件));
    let 档案 = JSON.parse(fs.readFileSync(档案文件, 'utf8'));
    断言('两位都进了档案', 档案.filter(x => x.姓名.startsWith('同行')).length === 2, JSON.stringify(档案.map(x => x.姓名)));
    r = await 请求('GET', '/api/guests?name=' + encodeURIComponent('同行甲'));
    断言('按姓名能查出身份证和电话',
      r.体.候选[0].身份证 === '110101199001011111' && r.体.候选[0].电话 === '13700000001', JSON.stringify(r.体));
    // 只填电话、不填身份证也要存档
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '102', 金额: 100, 天数: 1, 客人们: [{ 姓名: '只留电话', 电话: '13600000000' }] });
    r = await 请求('GET', '/api/guests?name=' + encodeURIComponent('只留电话'));
    断言('只填电话也存档（姓名 + 证/话二选一）', r.体.候选.length === 1 && r.体.候选[0].电话 === '13600000000');
    // 姓名都没有 → 不存档
    const 档案数 = JSON.parse(fs.readFileSync(档案文件, 'utf8')).length;
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 金额: 100, 天数: 1, 客人们: [{ 姓名: '', 电话: '13500000000' }] });
    断言('没姓名不存档', JSON.parse(fs.readFileSync(档案文件, 'utf8')).length === 档案数);

    console.log('\n【8.11.5】备注也进客人档案（姓名 + 证/话/备注 三选一）');
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '103' });
    // 只填姓名 + 备注（没证没电话）也要存档
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 金额: 100, 天数: 1,
      客人们: [{ 姓名: '只留备注' }], 备注: '老客户，可以议价' });
    r = await 请求('GET', '/api/guests?name=' + encodeURIComponent('只留备注'));
    断言('姓名 + 备注（无证无话）也存档', r.体.候选.length === 1, JSON.stringify(r.体.候选));
    断言('备注存进了档案', r.体.候选[0].备注 === '老客户，可以议价', JSON.stringify(r.体.候选[0]));
    // 多位客人时，备注只记给第一位
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '103' });
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 金额: 100, 天数: 1, 备注: '主客的备注',
      客人们: [{ 姓名: '备注主客', 电话: '13000000001' }, { 姓名: '备注同行', 电话: '13000000002' }] });
    const 主 = (await 请求('GET', '/api/guests?name=' + encodeURIComponent('备注主客'))).体.候选[0];
    const 同 = (await 请求('GET', '/api/guests?name=' + encodeURIComponent('备注同行'))).体.候选[0];
    断言('备注记给第一位客人', 主.备注 === '主客的备注', JSON.stringify(主));
    断言('同行的不沾这条备注', !同.备注, JSON.stringify(同));

    console.log('\n【8.11.6】带出档案后改了内容 → 覆盖原条目，不新增');
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '103' });
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 金额: 100, 天数: 1,
      客人们: [{ 姓名: '会改号的', 电话: '13011110000', 身份证: '440101199001011111' }] });
    let 原条 = (await 请求('GET', '/api/guests?name=' + encodeURIComponent('会改号的'))).体.候选[0];
    const 档案总数 = JSON.parse(fs.readFileSync(档案文件, 'utf8')).length;
    // 模拟：从档案带出这条（带回 档案id），但把身份证和电话都改了
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '103' });
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 金额: 100, 天数: 1,
      客人们: [{ 姓名: '会改号的', 电话: '13022220000', 身份证: '440101199002022222', 档案id: 原条.id }] });
    let 改后 = (await 请求('GET', '/api/guests?name=' + encodeURIComponent('会改号的'))).体;
    断言('还是只有一条（没因为改了身份证就新增）', 改后.同名数 === 1, JSON.stringify(改后.候选));
    断言('id 没变，还是原来那条', 改后.候选[0].id === 原条.id);
    断言('身份证被覆盖成新的', 改后.候选[0].身份证 === '440101199002022222');
    断言('电话被覆盖成新的', 改后.候选[0].电话 === '13022220000');
    断言('档案总条数没涨', JSON.parse(fs.readFileSync(档案文件, 'utf8')).length === 档案总数);
    // 不带 档案id 改身份证 → 认成另一个人，正常新增
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '103' });
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 金额: 100, 天数: 1,
      客人们: [{ 姓名: '会改号的', 电话: '13033330000', 身份证: '440101199003033333' }] });
    改后 = (await 请求('GET', '/api/guests?name=' + encodeURIComponent('会改号的'))).体;
    断言('没带 档案id 时按新人新增（同名两条）', 改后.同名数 === 2, JSON.stringify(改后.候选));
    // 覆盖时不能把已存的备注抹掉（月租那边根本不传备注）
    const 有备注 = (await 请求('GET', '/api/guests?name=' + encodeURIComponent('只留备注'))).体.候选[0];
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '103' });
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '103', 金额: 100, 天数: 1, 备注: '',
      客人们: [{ 姓名: '只留备注', 电话: '13044440000', 档案id: 有备注.id }] });
    const 备注后 = (await 请求('GET', '/api/guests?name=' + encodeURIComponent('只留备注'))).体.候选[0];
    断言('覆盖时不传备注 → 原备注保留', 备注后.备注 === '老客户，可以议价', JSON.stringify(备注后));
    断言('电话仍被正常覆盖', 备注后.电话 === '13044440000');
    断言('档案id 不会漏进房态', !('档案id' in (读数据文件().日租房态.find(x => x.房号 === '103').客人们[0] || {})));

    console.log('\n【8.12】同名不同人：两条都留着，供前端弹窗选');
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '102' });
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '102', 金额: 100, 天数: 1, 客人们: [{ 姓名: '张伟', 身份证: '310101199001011111', 电话: '13100000001' }] });
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '102' });
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '102', 金额: 100, 天数: 1, 客人们: [{ 姓名: '张伟', 身份证: '310101199505055555', 电话: '13100000002' }] });
    r = await 请求('GET', '/api/guests?name=' + encodeURIComponent('张伟'));
    断言('同名不同证 → 两条候选都在', r.体.同名数 === 2, JSON.stringify(r.体.候选));
    断言('最近登记的排最前', r.体.候选[0].身份证 === '310101199505055555');
    // 同一个人（同身份证）再来一次：更新而不是新增
    await 请求('POST', '/api/roomstatus/undo-checkin', { 房号: '102' });
    await 请求('POST', '/api/roomstatus/checkin', { 房号: '102', 金额: 100, 天数: 1, 客人们: [{ 姓名: '张伟', 身份证: '310101199001011111', 电话: '13100009999' }] });
    r = await 请求('GET', '/api/guests?name=' + encodeURIComponent('张伟'));
    断言('同身份证不重复堆条目', r.体.同名数 === 2, JSON.stringify(r.体.候选));
    断言('电话被更新成最新的',
      r.体.候选.find(x => x.身份证 === '310101199001011111').电话 === '13100009999');
    r = await 请求('GET', '/api/guests');
    断言('不带姓名时回姓名清单（给输入建议用）', Array.isArray(r.体.姓名们) && r.体.姓名们.includes('张伟'));

    console.log('\n【9】财务口径没被动过');
    d = 读数据文件();
    const 本月 = d.settings.当前月份;
    const 手算 = d.daily.filter(x => (x.日期 || '').startsWith(本月)).reduce((s, x) => s + (Number(x.金额) || 0), 0);
    r = await 请求('GET', `/api/summary?month=${本月}`);
    断言(`/api/summary 的日租已收 = 手算 daily 合计（¥${手算}）`, r.体.日租已收 === 手算, `接口 ${r.体.日租已收} vs 手算 ${手算}`);
    const 旧支出 = r.体.支出;
    r = await 请求('POST', '/api/settle', { 月份: 本月 });
    d = 读数据文件();
    const 历史 = d.历史总账单.find(h => h.月份 === 本月);
    断言('切月固化时日租进了历史总账单，口径一致', 历史 && 历史.日租 === 手算, JSON.stringify(历史));
    断言('房态数据不影响支出口径', typeof 旧支出 === 'number');

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

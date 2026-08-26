// 租房管家 —— 后端服务
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, execFileSync } = require('child_process');

const app = express();

const 数据目录 = path.join(__dirname, 'data');
const 数据文件 = path.join(数据目录, '数据.json');

// ============ 在线更新：版本读取 ============
let 版本缓存 = null;
function 读版本() {
  if (版本缓存) return 版本缓存;
  let 版本 = '未知', 日期 = '';
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, '版本.json'), 'utf8'));
    版本 = v.版本; 日期 = v.日期;
  } catch (e) { /* 版本.json 不存在或损坏，用「未知」兜底，不影响服务启动 */ }
  let 提交 = '';
  try {
    // 带 timeout：git 万一卡住不能把整个事件循环阻塞死
    提交 = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: __dirname, encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
  } catch (e) { /* 非 git 目录 / 没装 git，提交号留空 */ }
  let 仓库 = '';
  try {
    // 拉取地址 = 当前目录 git 仓库的 origin，让前端直观展示「更新是从哪拉的」
    仓库 = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: __dirname, encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
  } catch (e) { /* 没配 origin 就留空 */ }
  return (版本缓存 = { 版本, 提交, 日期, 仓库 });
}

// 统一走 execFile（不用 exec，免 shell 注入 + Windows 中文路径转义问题）
function 跑命令(命令, 参数, 超时 = 20000) {
  return new Promise((resolve, reject) => {
    execFile(命令, 参数, {
      cwd: __dirname, timeout: 超时, encoding: 'utf8', windowsHide: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } // 凭据失效时直接报错，不弹交互提示卡死进程
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message || '').trim() || '命令执行失败'));
      resolve(String(stdout).trim());
    });
  });
}

let 更新中 = false; // 并发锁：apply / rollback 共用

// 解析「更新日志.md」文本，按 "## 版本 — 日期" 切段
function 解析更新日志文本(文本) {
  const 段落 = String(文本 || '').split(/^##\s+/m).slice(1);
  return 段落.map(块 => {
    const 行 = 块.split('\n');
    const 标题行 = (行[0] || '').trim();
    // 标题形如「1.0.0 — 2026-08-26」，全角/半角破折号都认；
    // 不能直接 split('-')，否则日期里的 - 会被误切成三段
    const 匹配 = 标题行.match(/^(\S+)\s*[—–-]\s*(.*)$/);
    const 版本部分 = 匹配 ? 匹配[1] : 标题行;
    const 日期部分 = 匹配 ? 匹配[2].trim() : '';
    const 条目 = 行.slice(1).map(l => l.trim()).filter(l => l.startsWith('-')).map(l => l.replace(/^-\s*/, ''));
    return { 版本: 版本部分 || 标题行, 日期: 日期部分 || '', 条目 };
  });
}
function 读更新日志() {
  try { return 解析更新日志文本(fs.readFileSync(path.join(__dirname, '更新日志.md'), 'utf8')); }
  catch (e) { return []; }
}

// 更新/回滚成功后触发重启：直接退出，由外部守护拉起新进程
//   Windows → guard.js 识别退出码 88 后重新 spawn
//   Linux   → pm2 / systemd 的 autorestart、Restart=always 同样会拉起，不用特殊处理
// 不调 `pm2 restart <名字>`：进程名写死不可靠，且万一命令执行成功而本进程没退出，
// 更新锁 `更新中` 会永远停在 true，之后所有更新/回滚都返回 409，只能手动重启才能恢复
function 触发重启() {
  setTimeout(() => process.exit(88), 800);
}

// 备份目录只保留最近 N 份自动备份，避免每次更新堆一个几十 KB 的文件把磁盘塞满。
// 只清理本程序生成的「更新前_ / 回滚前_」文件，手动放进来的备份一律不动
function 清理旧备份(目录, 保留 = 20) {
  try {
    const 文件 = fs.readdirSync(目录)
      .filter(f => /^(更新前|回滚前)_.*\.json$/.test(f))
      .map(f => ({ 名: f, 时间: fs.statSync(path.join(目录, f)).mtimeMs }))
      .sort((a, b) => a.时间 - b.时间);
    for (const x of 文件.slice(0, Math.max(0, 文件.length - 保留))) fs.unlinkSync(path.join(目录, x.名));
  } catch (e) { /* 清理失败不影响更新主流程 */ }
}

// ----------密码---------
// 登录凭据单独存 data/登录凭据.json（加盐 scrypt 哈希，不存明文），理由：
//   1. 不混进 /api/export 的备份包（备份只导数据.json），导入备份也不会把密码冲掉
//   2. .gitignore 的 data/*.json 已覆盖，不会误提交到仓库
// 首次运行：凭据文件不存在时随机生成密码并打印（代码里不写死明文密码，开源安全）
const 默认用户名 = 'admin';
const 凭据文件 = path.join(数据目录, '登录凭据.json');
function 随机密码() { return crypto.randomBytes(6).toString('hex'); } // 12 位随机十六进制
function 算哈希(密码, 盐) { return crypto.scryptSync(String(密码), 盐, 64).toString('hex'); }
function 造凭据(用户名, 密码) { const 盐 = crypto.randomBytes(16).toString('hex'); return { 用户名: String(用户名), 盐, 哈希: 算哈希(密码, 盐) }; }
function 写凭据(凭据) {
  fs.mkdirSync(数据目录, { recursive: true });
  const 临时 = 凭据文件 + '.tmp';
  fs.writeFileSync(临时, JSON.stringify(凭据, null, 2), 'utf8'); fs.renameSync(临时, 凭据文件);
}
function 读凭据() {
  try { if (fs.existsSync(凭据文件)) return JSON.parse(fs.readFileSync(凭据文件, 'utf8')); }
  catch (e) { console.error('读取登录凭据失败，回退默认账号：', e.message); }
  // 凭据文件不存在（首次启动或被删）→ 随机生成并打印，登录后可在「设置 → 登录密码」里改
  const 初始密码 = 随机密码();
  console.log('\n========================================');
  console.log('  首次启动，已生成随机登录密码：');
  console.log('  用户名：' + 默认用户名);
  console.log('  密　码：' + 初始密码);
  console.log('  请登录后在「设置 → 登录密码」里修改');
  console.log('========================================\n');
  const 凭据 = 造凭据(默认用户名, 初始密码); 写凭据(凭据); return 凭据;
}
// 定长比较，避免用耗时差反推密码
function 定长相等(甲, 乙) {
  const a = Buffer.from(甲), b = Buffer.from(乙);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function 校验凭据(用户名, 密码) {
  const 凭据 = 读凭据();
  return 定长相等(String(用户名), 凭据.用户名) && 定长相等(算哈希(密码, 凭据.盐), 凭据.哈希);
}
const basicAuth = require('express-basic-auth');
app.use(basicAuth({ authorizer: 校验凭据, challenge: true }));
// -----------密码---------

app.use(express.json());

// 首页动态注入版本号：把 index.html 里的 __版本__ 占位符替换成当前 commit 短哈希
// 必须放在 express.static 之前，才能拦下 GET / 这个精确路径（已知坑 12 的永久解决方案）
app.get('/', (req, res) => {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    // 首页被这条路由接管后就不再经过下面 express.static 的 setHeaders，
    // 必须自己补禁缓存头，否则浏览器（尤其手机）会拿缓存的旧首页 →
    // 里面的 ?v= 还是旧 commit → 加载旧 app.js → 「更新完没生效」（已知坑 12 复发）
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('html').send(html.replaceAll('__版本__', 读版本().提交 || String(Date.now())));
  } catch (e) {
    res.status(500).send('页面加载失败：' + e.message);
  }
});

// 前端资源禁用缓存：改完 app.js/style.css 后浏览器强制刷新才能拿到新版，否则老代码一直跑
app.use(express.static(path.join(__dirname, 'public'), {
  index: false, // 关掉默认首页，避免直接访问 /index.html 绕过上面的版本号替换
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

function 当前月份() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
// 工资分段默认值：2024-03 起每月 4000（与历史口径一致，改动只影响之后新增的分段）
function 默认工资分段() { return [{ 起始月份: '2024-03', 金额: 4000 }]; }
function 空数据() { return { settings: { 水价: 5, 电价: 1.3, 当前月份: 当前月份(), 隐藏房号: [], 工资分段: 默认工资分段() }, 房源: [], rooms: [], meters: [], bills: [], daily: [], transactions: [], 退房记录: [], 历史总账单: [], 备忘录: [] }; }
// 某月工资 = 起始月份 ≤ 该月 的分段里，起始月份最大的那条；都不满足则 0；未来月份（没到当月）不发工资
function 月工资(settings, 月份) {
  if (String(月份) > 当前月份()) return 0;
  const 分段 = (settings.工资分段 || []).filter(x => x && x.起始月份 && String(x.起始月份) <= String(月份));
  if (!分段.length) return 0;
  分段.sort((a, b) => String(a.起始月份).localeCompare(String(b.起始月份)));
  return Number(分段[分段.length - 1].金额) || 0;
}
function 舍入(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function 新id(list) { return list.length ? Math.max(...list.map(x => x.id)) + 1 : 1; }
function 加月(月份, 偏移) { const [y, m] = String(月份).split('-').map(Number); const d = new Date(y, m - 1 + 偏移, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

// 数据迁移
function 迁移(data) {
  for (const 房 of data.rooms) {
    if ('房型' in 房) delete 房.房型;
    if ('交租日' in 房) delete 房.交租日;
    if (!('房卡押金' in 房)) 房.房卡押金 = '';
    if (!('水费单价' in 房)) 房.水费单价 = '';
    if (!('电费单价' in 房)) 房.电费单价 = '';
    if (!('身份证' in 房)) 房.身份证 = '';
    if (!('预缴金' in 房)) 房.预缴金 = '';
    if (!('管理费预缴金' in 房)) 房.管理费预缴金 = '';
  }
  for (const b of data.bills) {
    if ('其他加项' in b) { b.房间损耗 = b.其他加项; delete b.其他加项; }
    if (!('房间损耗' in b)) b.房间损耗 = 0;
    if ('核收' in b) { if (b.核收 === '已交') b.强制 = true; delete b.核收; }
    if (!('实收' in b)) b.实收 = 0;
    if (!('强制' in b)) b.强制 = false;
    if (!('平账' in b)) b.平账 = false;
    if (!('补缴' in b)) b.补缴 = 0;
    if (!('结转' in b)) b.结转 = 0;
    if (!('转下月' in b)) b.转下月 = 0;
  }
  for (const d of data.daily) {
    if ('入住日期' in d && !('日期' in d)) { d.日期 = d.入住日期; delete d.入住日期; }
    if ('退房日期' in d) { d.入住天数 = Math.max(0, Math.round((new Date(d.退房日期) - new Date(d.日期)) / 86400000)) || 1; delete d.退房日期; }
    if (!('入住天数' in d)) d.入住天数 = 1;
    if (!('房号' in d)) d.房号 = '';
  }
  if (!Array.isArray(data.备忘录)) data.备忘录 = []; // 备忘录：全局常驻，与月份无关
  // 工资分段：老数据没有这个字段时补默认，保证历史 41 个月的工资/净利润与改造前完全一致
  if (!Array.isArray(data.settings.工资分段) || !data.settings.工资分段.length) data.settings.工资分段 = 默认工资分段();
  if (!data.退房记录) data.退房记录 = [];
  for (const r of data.退房记录) {
    if (!('押金' in r)) r.押金 = 0;
    if (!('房卡押金' in r)) r.房卡押金 = 0;
    if (!('上月水底' in r)) r.上月水底 = '';
    if (!('上月电底' in r)) r.上月电底 = '';
    if (!('水费单价' in r)) r.水费单价 = 0;
    if (!('电费单价' in r)) r.电费单价 = 0;
    if (!('用水量' in r)) r.用水量 = 0;
    if (!('用电量' in r)) r.用电量 = 0;
    if (!('水费' in r)) r.水费 = 0;
    if (!('电费' in r)) r.电费 = 0;
    if (!('水电总额' in r)) r.水电总额 = 0;
  }
  if (!Array.isArray(data.settings.隐藏房号)) data.settings.隐藏房号 = [];
  // 房源表迁移：房源 = 楼里全部房号清单，空置房号由「房源 − 在租」派生，rooms 只保留在租房间
  if (!Array.isArray(data.房源)) {
    data.房源 = [...new Set(data.rooms.map(r => r.房号).filter(Boolean))].map((房号, i) => ({ id: i + 1, 房号 }));
  }
  // 房型迁移：默认月租（日租为新增房型）
  for (const h of data.房源) if (!('房型' in h)) h.房型 = '月租';
  按房号排序(data.房源);
  // rooms 只保留在租的（月租金非空），空置记录移除，房号交给房源表
  data.rooms = data.rooms.filter(租客存在);
  // 兜底：在租房号若不在房源表，补进去
  const 房源房号 = new Set(data.房源.map(h => h.房号));
  for (const 房 of data.rooms) {
    if (!房源房号.has(房.房号)) { data.房源.push({ id: 新id(data.房源), 房号: 房.房号 }); 房源房号.add(房.房号); }
  }
  return data;
}
function 读数据() {
  try {
    if (!fs.existsSync(数据文件)) { const 初始 = 空数据(); fs.mkdirSync(数据目录, { recursive: true }); fs.writeFileSync(数据文件, JSON.stringify(初始, null, 2), 'utf8'); return 初始; }
    const 原始 = JSON.parse(fs.readFileSync(数据文件, 'utf8'));
    const 需写回 = !Array.isArray(原始.房源); // 迁移会就地修改对象，须在迁移前判断
    const data = 迁移(原始);
    // 首次迁移（磁盘还没有房源表）时立即写回，把新结构持久化
    if (需写回) 写数据(data);
    return data;
  } catch (e) { console.error('读取数据失败：', e.message); return 空数据(); }
}
function 写数据(data) { const 临时 = 数据文件 + '.tmp'; fs.writeFileSync(临时, JSON.stringify(data, null, 2), 'utf8'); fs.renameSync(临时, 数据文件); }

// ============ 业务 ============
function 交租日(房) { return 房.入住日 ? Number(String(房.入住日).slice(8, 10)) : null; }
function 月数差(起月, 止月) { const [ay, am] = String(起月).split('-').map(Number); const [by, bm] = String(止月).split('-').map(Number); return (by - ay) * 12 + (bm - am); }
function 房水价(data, 房) { return 房.水费单价 !== '' && 房.水费单价 != null ? Number(房.水费单价) : Number(data.settings.水价) || 0; }
function 房电价(data, 房) { return 房.电费单价 !== '' && 房.电费单价 != null ? Number(房.电费单价) : Number(data.settings.电价) || 0; }
function 租客存在(房) { return (房.月租金 !== '' && 房.月租金 != null) || (房.租客姓名 && 房.租客姓名 !== ''); }
function 按房号排序(list) { return list.sort((a, b) => (parseInt(a.房号) || 0) - (parseInt(b.房号) || 0) || String(a.房号).localeCompare(String(b.房号))); }

function 算水电(data, 房号, 月份) {
  const 房 = data.rooms.find(r => r.房号 === 房号);
  if (!房) return { 上月水底: 0, 本月水底: null, 用水量: 0, 水费: 0, 上月电底: 0, 本月电底: null, 用电量: 0, 电费: 0 };
  const 全部 = data.meters.filter(m => m.房号 === 房号).sort((a, b) => (a.日期 || '').localeCompare(b.日期 || ''));
  const 之前 = 全部.filter(m => (m.日期 || '') < (月份 + '-01'));
  const 本月 = 全部.filter(m => (m.日期 || '').startsWith(月份));
  const 上月水底 = 之前.length ? Number(之前[之前.length - 1].水表) : Number(房.水表底度) || 0;
  const 上月电底 = 之前.length ? Number(之前[之前.length - 1].电表) : Number(房.电表底度) || 0;
  const 本月水底 = 本月.length ? Number(本月[本月.length - 1].水表) : null;
  const 本月电底 = 本月.length ? Number(本月[本月.length - 1].电表) : null;
  const 用水量 = 本月水底 !== null && 本月水底 >= 上月水底 ? 本月水底 - 上月水底 : 0;
  const 用电量 = 本月电底 !== null && 本月电底 >= 上月电底 ? 本月电底 - 上月电底 : 0;
  return { 上月水底, 本月水底, 用水量, 水费: 舍入(用水量 * 房水价(data, 房)), 上月电底, 本月电底, 用电量, 电费: 舍入(用电量 * 房电价(data, 房)) };
}

// 生成账单（未抄表则无法计算）
function 生成账单(data, 房, 月份) {
  const 水电 = 算水电(data, 房.房号, 月份);
  const 记录 = data.bills.find(b => b.房号 === 房.房号 && b.月份 === 月份) || {};
  const 房租 = Number(房.月租金) || 0;
  const 管理费 = Number(房.管理费) || 0;
  // 新收押金：当月入住的房间收押金，跨月不再收
  const 入住月份 = 房.入住日 ? String(房.入住日).slice(0, 7) : '';
  const 当月新租 = 入住月份 === 月份;
  const 新收押金 = 当月新租 ? 舍入((Number(房.押金) || 0) + (Number(房.房卡押金) || 0)) : 0;
  // 预缴免租：预缴金 / 月租金 = 免租月数，入住月之后的 N 个月房租=0；管理费同理
  const 月偏移 = 入住月份 ? 月数差(入住月份, 月份) : -1; // 0=入住月，1=下月…
  const 免租月数 = 房租 > 0 ? Math.floor((Number(房.预缴金) || 0) / 房租) : 0;
  const 免管理费月数 = 管理费 > 0 ? Math.floor((Number(房.管理费预缴金) || 0) / 管理费) : 0;
  const 房租实际 = (月偏移 >= 1 && 月偏移 <= 免租月数) ? 0 : 房租;
  const 管理费实际 = (月偏移 >= 1 && 月偏移 <= 免管理费月数) ? 0 : 管理费;
  // 预缴收入：入住月一次性计入已收
  const 预缴 = 当月新租 ? 舍入((Number(房.预缴金) || 0) + (Number(房.管理费预缴金) || 0)) : 0;
  // 房租/管理费展示列：入住月把预缴金合并进房租/管理费列展示（房租列 = 房租 + 预缴金，管理费列同理）
  const 房租展示 = 当月新租 ? 房租 + (Number(房.预缴金) || 0) : 房租实际;
  const 管理费展示 = 当月新租 ? 管理费 + (Number(房.管理费预缴金) || 0) : 管理费实际;
  const 交租日值 = 交租日(房);
  const 交租日期 = 交租日值 ? `${月份}-${String(交租日值).padStart(2, '0')}` : '';
  const 房间损耗 = Number(记录.房间损耗) || 0;
  const 损耗说明 = 记录.损耗说明 || '';
  const 补缴 = Number(记录.补缴) || 0; // 本月补收上月欠款（抵消结转，不进本月欠款）
  const 结转 = Number(记录.结转) || 0; // 上月转入本月的拖欠
  const 转下月 = Number(记录.转下月) || 0; // 本月已结转下月的拖欠（转出后本月状态=欠费）
  // 可计算 = 本月已抄表，或当月新租（当月新租水电尚无跨月用量，按 0 计即可正常核收房租+管理费）
  const 可计算 = (水电.本月水底 !== null && 水电.本月电底 !== null) || 当月新租;
  // 应付 = 上月欠费滚存（结转）+ 本月房租/管理费/水电/损耗（预缴免租期房租/管理费按 0）
  const 应付租金 = 可计算 ? 舍入(房租实际 + 管理费实际 + 水电.水费 + 水电.电费 + 房间损耗 + 结转) : null;
  const 实收 = Number(记录.实收) || 0; // 本月核收实收
  const 强制 = 记录.强制 === true;
  const 平账 = 记录.平账 === true;
  let 状态, 欠款额;
  if (!可计算) { 状态 = '未交'; 欠款额 = 0; }
  else if (强制 || 平账) { 状态 = '已核收'; 欠款额 = 0; }
  else if (转下月 > 0) { 状态 = '欠款'; 欠款额 = 转下月; } // 已欠费滚存：欠费金额 = 滚存金额
  else if (实收 > 0 || 补缴 > 0) { 状态 = '欠款'; 欠款额 = 舍入(应付租金 - 实收 - 补缴); } // 欠费 = 应付 − 核收实收 − 补缴
  else { 状态 = '未交'; 欠款额 = 0; }
  return {
    房号: 房.房号, 租客: 房.租客姓名 || '', 交租日: 交租日值, 交租日期, 房间备注: 房.备注 || '',
    房租: 房租展示, 新收押金, 管理费: 管理费展示, 水费: 水电.水费, 电费: 水电.电费, 房间损耗, 损耗说明, 补缴, 结转, 转下月, 预缴, 应付租金,
    水费单价: 房水价(data, 房), 电费单价: 房电价(data, 房),
    上月水底: 水电.上月水底, 本月水底: 水电.本月水底, 用水量: 水电.用水量,
    上月电底: 水电.上月电底, 本月电底: 水电.本月电底, 用电量: 水电.用电量,
    可计算, 当月新租, 实收, 状态, 欠款: 欠款额,
    收款日期: 记录.收款日期 || '', 月份
  };
}
function 缺项(房) {
  const 必填 = { 房号: '房号', 月租金: '月租金', 管理费: '管理费' };
  return Object.entries(必填).filter(([k]) => 房[k] === '' || 房[k] == null).map(([, v]) => v);
}

// ============ API ============
app.get('/api/all', (req, res) => res.json(读数据()));
app.post('/api/settings', (req, res) => { const data = 读数据(); Object.assign(data.settings, req.body); 写数据(data); res.json(data.settings); });

// 登录账号：只回用户名，绝不返回哈希/盐
app.get('/api/account', (req, res) => res.json({ 用户名: 读凭据().用户名 }));
// 修改登录账号密码：必须先验证当前密码
app.post('/api/password', (req, res) => {
  const { 当前密码, 新用户名, 新密码 } = req.body || {};
  const 凭据 = 读凭据();
  if (!校验凭据(凭据.用户名, String(当前密码 || ''))) return res.status(403).json({ 错误: '当前密码不正确' });
  const 用户名 = String(新用户名 == null || 新用户名 === '' ? 凭据.用户名 : 新用户名).trim();
  const 密码 = String(新密码 || '');
  if (!用户名) return res.status(400).json({ 错误: '用户名不能为空' });
  if (密码.length < 6) return res.status(400).json({ 错误: '新密码至少 6 位' });
  写凭据(造凭据(用户名, 密码));
  res.json({ ok: true, 用户名 });
});

// 房间档案列表 = 房源清单（全部房号）合并其「在租」档案；空置房源返回空字段 + 房源id
app.get('/api/rooms', (req, res) => {
  const data = 读数据();
  const 列表 = data.房源.map(源 => {
    const 在租 = data.rooms.find(r => r.房号 === 源.房号);
    if (在租) return 在租;
    return { id: 源.id, 房源id: 源.id, 房号: 源.房号, 月租金: '', 管理费: '', 押金: '', 房卡押金: '', 水表底度: '', 电表底度: '', 水费单价: '', 电费单价: '', 租客姓名: '', 电话: '', 入住日: '', 到期日: '', 备注: '' };
  });
  res.json(按房号排序(列表));
});
app.post('/api/rooms', (req, res) => {
  const data = 读数据();
  const 房号 = req.body.房号;
  if (!房号 || !data.房源.some(h => h.房号 === 房号)) return res.status(400).json({ 错误: `房号「${房号}」不在房源清单里，请先在「设置 → 房源信息」添加` });
  if (data.rooms.some(r => r.房号 === 房号)) return res.status(400).json({ 错误: `房号「${房号}」已在租` });
  const 房 = { id: 新id(data.rooms), ...req.body }; data.rooms.push(房);
  // 自动生成初始抄表记录：日期=入住日，读数=水电底度
  if (房.入住日 && ((房.水表底度 !== '' && 房.水表底度 != null) || (房.电表底度 !== '' && 房.电表底度 != null))) {
    data.meters.push({ id: 新id(data.meters), 日期: 房.入住日, 房号, 水表: 房.水表底度 || null, 电表: 房.电表底度 || null });
  }
  写数据(data); res.json(房);
});
app.put('/api/rooms/:id', (req, res) => {
  const data = 读数据(); const i = data.rooms.findIndex(r => r.id == req.params.id);
  if (i < 0) return res.status(404).json({ 错误: '房间不存在' });
  data.rooms[i] = { ...data.rooms[i], ...req.body, id: data.rooms[i].id }; 写数据(data); res.json(data.rooms[i]);
});
// 删除：有租客的房间锁定，不能删
app.delete('/api/rooms/:id', (req, res) => {
  const data = 读数据(); const 房 = data.rooms.find(r => r.id == req.params.id);
  if (!房) return res.status(404).json({ 错误: '房间不存在' });
  if (租客存在(房)) return res.status(400).json({ 错误: '该房有租客，请先退房或换房' });
  data.rooms = data.rooms.filter(r => r.id != req.params.id); 写数据(data); res.json({ ok: true });
});

// 房源信息：楼里全部房号清单（设置页维护）
app.get('/api/houses', (req, res) => res.json(按房号排序(读数据().房源)));
app.post('/api/houses', (req, res) => {
  const data = 读数据(); const 房号 = String(req.body.房号 || '').trim();
  if (!房号) return res.status(400).json({ 错误: '请填房号' });
  if (data.房源.some(h => h.房号 === 房号)) return res.status(400).json({ 错误: `房号「${房号}」已存在` });
  const 房源 = { id: 新id(data.房源), 房号, 房型: req.body.房型 === '日租' ? '日租' : '月租' };
  data.房源.push(房源); 写数据(data); res.json(房源);
});
// 修改房源（如切换房型月租/日租）
app.put('/api/houses/:id', (req, res) => {
  const data = 读数据(); const i = data.房源.findIndex(h => h.id == req.params.id);
  if (i < 0) return res.status(404).json({ 错误: '房源不存在' });
  data.房源[i] = { ...data.房源[i], ...req.body, id: data.房源[i].id }; 写数据(data); res.json(data.房源[i]);
});
app.delete('/api/houses/:id', (req, res) => {
  const data = 读数据(); const 源 = data.房源.find(h => h.id == req.params.id);
  if (!源) return res.status(404).json({ 错误: '房源不存在' });
  if (data.rooms.some(r => r.房号 === 源.房号)) return res.status(400).json({ 错误: `房号「${源.房号}」正在出租，请先退房` });
  data.房源 = data.房源.filter(h => h.id != req.params.id); 写数据(data); res.json({ ok: true });
});

// 退房：记录退房信息 + 清空房间租客
app.post('/api/checkout', (req, res) => {
  const data = 读数据();
  const { 房号, 日期, 上月水底, 上月电底, 退房水底, 退房电底, 退房卫生费, 房间损耗, 损耗说明, 退押金, 退房卡押金, 留存金额, 电话, 身份证 } = req.body;
  const 房 = data.rooms.find(r => r.房号 === 房号);
  if (!房) return res.status(404).json({ 错误: '房间不存在' });
  // 押金/房卡押金：复选框勾选才退（默认勾选）；留存金额：预缴房间退房时的剩余预缴金
  const 押金额 = (退押金 === false) ? 0 : (Number(房.押金) || 0);
  const 房卡押金额 = (退房卡押金 === false) ? 0 : (Number(房.房卡押金) || 0);
  const 留存 = Number(留存金额) || 0;
  // 退房水电结算：用量 = 退房底度 − 上月底度，金额 = 用量 × 单价
  const 水价 = 房水价(data, 房), 电价 = 房电价(data, 房);
  const 用水量 = Math.max(0, (Number(退房水底) || 0) - (Number(上月水底) || 0));
  const 用电量 = Math.max(0, (Number(退房电底) || 0) - (Number(上月电底) || 0));
  const 水费 = 舍入(用水量 * 水价), 电费 = 舍入(用电量 * 电价), 水电总额 = 舍入(水费 + 电费);
  const 卫生费 = Number(退房卫生费) || 0, 损耗 = Number(房间损耗) || 0;
  // 退还金额 = 押金 + 房卡押金 + 留存金额 − 水电费 − 卫生费 − 损耗费
  const 退入金额 = 舍入(押金额 + 房卡押金额 + 留存 - 水电总额 - 卫生费 - 损耗);
  const 记录 = { id: 新id(data.退房记录), 日期: 日期 || 今天(), 房号, 租客: 房.租客姓名 || '', 电话: 电话 || 房.电话 || '', 身份证: 身份证 || 房.身份证 || '', 押金: 押金额, 房卡押金: 房卡押金额, 上月水底: 上月水底 || '', 上月电底: 上月电底 || '', 退房水底: 退房水底 || '', 退房电底: 退房电底 || '', 水费单价: 水价, 电费单价: 电价, 用水量, 用电量, 水费, 电费, 水电总额, 退房卫生费: 卫生费, 房间损耗: 损耗, 损耗说明: 损耗说明 || '', 留存金额: 留存, 退入金额, 房间快照: 房 };
  data.退房记录.push(记录);
  // 只有实退 > 0 才补支出流水（退房退还）；≤ 0 说明没实际退钱，不进支出列表、也不存流水 id
  if (退入金额 > 0) {
    const 流水 = { id: 新id(data.transactions), 日期: 记录.日期, 事项: `${房号}退房退还`, 金额: 退入金额 };
    data.transactions.push(流水);
    记录.流水id = 流水.id;
  }
  // 退房后从 rooms 移除该房，房号留在房源表 → 自动变空置
  data.rooms = data.rooms.filter(r => r.房号 !== 房号);
  写数据(data);
  res.json(记录);
});
function 今天() { return new Date().toISOString().slice(0, 10); }
// 某日期距今天多少天（今天=0，昨天=1，前天=2…）。按日期字符串拆年月日算，避免时区偏移把结果带偏
function 距今天数(日期) {
  const [y, m, d] = String(日期).slice(0, 10).split('-').map(Number);
  const 目标 = new Date(Date.UTC(y, m - 1, d)).getTime();
  const 今 = new Date(); const 今天零点 = new Date(Date.UTC(今.getFullYear(), 今.getMonth(), 今.getDate())).getTime();
  return Math.round((今天零点 - 目标) / 86400000);
}

// 换房：把租客移到新房
app.post('/api/switch', (req, res) => {
  const data = 读数据();
  const { 原房号, 新房号, 新水底, 新电底 } = req.body;
  const 原房 = data.rooms.find(r => r.房号 === 原房号);
  if (!原房) return res.status(404).json({ 错误: '原房间不存在' });
  if (!data.房源.some(h => h.房号 === 新房号)) return res.status(400).json({ 错误: `新房号「${新房号}」不在房源清单里，请先在「设置 → 房源信息」添加` });
  let 新房 = data.rooms.find(r => r.房号 === 新房号);
  if (新房 && 租客存在(新房)) return res.status(400).json({ 错误: `新房 ${新房号} 已有租客` });
  if (!新房) { 新房 = { id: 新id(data.rooms), 房号: 新房号, 月租金: 原房.月租金, 押金: 原房.押金, 管理费: 原房.管理费, 房卡押金: 原房.房卡押金, 水费单价: 原房.水费单价, 电费单价: 原房.电费单价, 水表底度: '', 电表底度: '', 租客姓名: '', 电话: '', 入住日: '', 到期日: '', 备注: '' }; data.rooms.push(新房); }
  Object.assign(新房, { 租客姓名: 原房.租客姓名, 电话: 原房.电话, 入住日: 原房.入住日, 到期日: 原房.到期日, 水表底度: 新水底 || '', 电表底度: 新电底 || '', 备注: 原房.备注 });
  // 原房换出后从 rooms 移除，房号留在房源表 → 自动变空置
  data.rooms = data.rooms.filter(r => r.房号 !== 原房号);
  写数据(data);
  res.json(新房);
});

// 退房记录
app.get('/api/checkouts', (req, res) => {
  const data = 读数据();
  res.json(data.退房记录.sort((a, b) => (b.日期 || '').localeCompare(a.日期 || '') || (b.id - a.id)));
});
// 撤销退房：恢复房间为在租 + 删退房记录 + 删退还流水。具体路由写在 /:id 之前
app.post('/api/checkouts/undo/:id', (req, res) => {
  const data = 读数据();
  const i = data.退房记录.findIndex(r => r.id == req.params.id);
  if (i < 0) return res.status(404).json({ 错误: '退房记录不存在' });
  const 记录 = data.退房记录[i];
  // 老版本退房没存快照（房间档案随退房一起删了），恢复不出月租金/管理费/入住日，只能人工重建
  if (!记录.房间快照) return res.status(400).json({ 错误: `这条退房记录是旧版本写的，没保存「${记录.房号}」退房前的房间档案（月租金、管理费、入住日等），无法自动恢复成在租。请去「房间档案 → 添加租户」手动把 ${记录.房号} 建回来，再删掉这条退房记录。` });
  // 退房超过 3 天不再允许撤销（防止旧账被误动，也避免拿错流水）
  if (记录.日期 && 距今天数(记录.日期) > 3) return res.status(400).json({ 错误: `退房已超过 3 天，不能再撤销（如需恢复请去「房间档案 → 添加租户」手动重建 ${记录.房号}）` });
  if (data.rooms.some(r => r.房号 === 记录.房号)) return res.status(400).json({ 错误: `房号「${记录.房号}」已在租，无法撤销退房` });
  data.rooms.push(记录.房间快照); // 恢复房间为在租
  if (记录.流水id) data.transactions = data.transactions.filter(t => t.id !== 记录.流水id); // 删退还流水
  data.退房记录 = data.退房记录.filter(r => r.id != req.params.id);
  写数据(data);
  res.json({ ok: true, 房号: 记录.房号 });
});
app.delete('/api/checkouts/:id', (req, res) => { const data = 读数据(); data.退房记录 = data.退房记录.filter(r => r.id != req.params.id); 写数据(data); res.json({ ok: true }); });

// 抄表
app.get('/api/meters', (req, res) => {
  const data = 读数据(); const 月份 = req.query.month;
  let 列表 = data.meters;
  if (月份) 列表 = 列表.filter(m => (m.日期 || '').startsWith(月份));
  res.json(列表.sort((a, b) => (b.id || 0) - (a.id || 0))); // 最新录入的抄表排最前
});
app.post('/api/meters', (req, res) => {
  const data = 读数据();
  const { 房号, 水表, 电表, 日期 } = req.body;
  const 房 = data.rooms.find(r => r.房号 === 房号);
  // 抄表日期按交租日（入住日日号）落到当前月份；无入住日则用传入日期或今天
  let 抄表日期 = 日期 || 今天();
  if (!日期 && 房 && 房.入住日) {
    const 日 = Number(String(房.入住日).slice(8, 10));
    if (日) 抄表日期 = `${data.settings.当前月份}-${String(日).padStart(2, '0')}`;
  }
  const 记录 = { id: 新id(data.meters), 日期: 抄表日期, 房号, 水表, 电表 };
  data.meters.push(记录); 写数据(data); res.json(记录);
});
// 删除某房某月最后一条抄表（撤销）—— 必须放在 /:id 之前，否则 /:id 会拦截 /undo
app.delete('/api/meters/undo', (req, res) => {
  const data = 读数据();
  const { 房号, 月份 } = req.query;
  const 该房本月 = data.meters.filter(m => m.房号 === 房号 && (m.日期 || '').startsWith(月份));
  if (!该房本月.length) return res.status(404).json({ 错误: '无抄表记录' });
  const 最后 = 该房本月[该房本月.length - 1];
  data.meters = data.meters.filter(m => m.id !== 最后.id);
  写数据(data);
  res.json({ ok: true });
});
app.delete('/api/meters/:id', (req, res) => { const data = 读数据(); data.meters = data.meters.filter(m => m.id != req.params.id); 写数据(data); res.json({ ok: true }); });
app.get('/api/meters/missing', (req, res) => {
  const data = 读数据(); const 月份 = req.query.month || data.settings.当前月份;
  const 未抄 = data.rooms.filter(租客存在).filter(房 => !data.meters.some(m => m.房号 === 房.房号 && (m.日期 || '').startsWith(月份))).map(房 => {
    const 水电 = 算水电(data, 房.房号, 月份);
    return { 房号: 房.房号, 租客: 房.租客姓名, 交租日: 交租日(房), 上月水表: 水电.上月水底, 上月电表: 水电.上月电底 };
  });
  res.json(未抄);
});

// 租客账单
app.get('/api/bills', (req, res) => {
  const data = 读数据(); const 月份 = req.query.month || data.settings.当前月份;
  const 日 = req.query.day ? Number(req.query.day) : null;
  const 房号 = req.query.房号 ? String(req.query.房号).trim() : '';
  const 全部 = req.query.全部 === '1';
  let 列表 = data.rooms.filter(租客存在);
  if (房号) 列表 = 列表.filter(r => String(r.房号).includes(房号));
  if (日 && !全部) 列表 = 列表.filter(r => 交租日(r) === 日);
  按房号排序(列表);
  let 账单;
  if (全部) {
    // 房号搜索「全部」：列出该房号在所有涉及月份（bills 出现过的 + 当前月份）的账单
    const 月集合 = new Set([月份]);
    for (const b of data.bills) if (!房号 || String(b.房号).includes(房号)) 月集合.add(b.月份);
    账单 = [];
    for (const 房 of 列表) for (const 月 of [...月集合].sort()) 账单.push(生成账单(data, 房, 月));
  } else {
    账单 = 列表.map(房 => 生成账单(data, 房, 月份));
    // 无房号、无日筛选（月度账单）时补充空置房，状态「未出租」
    if (!日 && !房号) {
      const 在租房号 = new Set(列表.map(房 => 房.房号));
      const 隐藏 = new Set(data.settings.隐藏房号 || []);
      for (const h of data.房源) {
        if (!在租房号.has(h.房号) && !隐藏.has(h.房号)) 账单.push({ 房号: h.房号, 租客: '', 状态: '未出租', 交租日: null });
      }
      按房号排序(账单);
    }
  }
  res.json(账单);
});
app.post('/api/bills/collect', (req, res) => {
  const data = 读数据(); const { 房号, 月份, 实收, 强制, 平账, 房间损耗, 损耗说明, 收款日期 } = req.body;
  let 记录 = data.bills.find(b => b.房号 === 房号 && b.月份 === 月份);
  if (!记录) { 记录 = { id: 新id(data.bills), 房号, 月份, 房间损耗: 0, 损耗说明: '', 实收: 0, 强制: false, 平账: false, 收款日期: '' }; data.bills.push(记录); }
  if (实收 !== undefined) 记录.实收 = Number(实收) || 0;
  if (强制 !== undefined) 记录.强制 = 强制 === true;
  if (平账 !== undefined) 记录.平账 = 平账 === true;
  if (房间损耗 !== undefined) 记录.房间损耗 = Number(房间损耗) || 0;
  if (损耗说明 !== undefined) 记录.损耗说明 = 损耗说明 || '';
  if (收款日期 !== undefined) 记录.收款日期 = 收款日期;
  写数据(data); res.json(记录);
});
// 追缴：手动输入金额，累加到本月账单「补缴」字段（不改变状态、不碰历史月）
app.post('/api/bills/arrears', (req, res) => {
  const data = 读数据();
  const { 房号, 月份, 金额 } = req.body;
  const 补缴金额 = Number(金额) || 0;
  if (补缴金额 <= 0) return res.status(400).json({ 错误: '追缴金额需大于 0' });
  let 本月 = data.bills.find(b => b.房号 === 房号 && b.月份 === 月份);
  if (!本月) { 本月 = { id: 新id(data.bills), 房号, 月份, 房间损耗: 0, 损耗说明: '', 实收: 0, 强制: false, 平账: false, 收款日期: '', 补缴: 0 }; data.bills.push(本月); }
  if (!('补缴' in 本月)) 本月.补缴 = 0;
  本月.补缴 = 舍入((本月.补缴 || 0) + 补缴金额);
  写数据(data);
  res.json({ 房号, 月份, 补缴: 本月.补缴 });
});
// 欠费滚存：把本月拖欠金额转到下月账单，本月状态立即变「欠费」（欠费金额=滚存金额），下月计入应付
app.post('/api/bills/carry', (req, res) => {
  const data = 读数据();
  const { 房号, 月份, 金额 } = req.body;
  const 房 = data.rooms.find(r => r.房号 === 房号);
  if (!房) return res.status(404).json({ 错误: '房间不存在' });
  const 本月账单 = 生成账单(data, 房, 月份);
  if (本月账单.应付租金 == null) return res.status(400).json({ 错误: '本月账单未抄表无法计算，不能欠费滚存' });
  // 拖欠 = 应付 − 核收实收 − 补缴 − 已转下月（补缴算进实收，不重复）
  const 拖欠 = 舍入((本月账单.应付租金 || 0) - (本月账单.实收 || 0) - (本月账单.补缴 || 0) - (本月账单.转下月 || 0));
  const 结转金额 = 金额 !== undefined ? Number(金额) || 0 : 拖欠;
  if (结转金额 <= 0) return res.status(400).json({ 错误: '滚存金额需大于 0' });
  // 本月记录：标记已转下月（累加），让本月状态显示「欠费」
  let 本月记录 = data.bills.find(b => b.房号 === 房号 && b.月份 === 月份);
  if (!本月记录) { 本月记录 = { id: 新id(data.bills), 房号, 月份, 房间损耗: 0, 损耗说明: '', 实收: 0, 强制: false, 平账: false, 收款日期: '', 补缴: 0, 结转: 0, 转下月: 0 }; data.bills.push(本月记录); }
  if (!('转下月' in 本月记录)) 本月记录.转下月 = 0;
  本月记录.转下月 = 舍入((本月记录.转下月 || 0) + 结转金额);
  // 下月记录：结转累加，计入下月应付
  const 下月 = 加月(月份, 1);
  let 下月记录 = data.bills.find(b => b.房号 === 房号 && b.月份 === 下月);
  if (!下月记录) { 下月记录 = { id: 新id(data.bills), 房号, 月份: 下月, 房间损耗: 0, 损耗说明: '', 实收: 0, 强制: false, 平账: false, 收款日期: '', 补缴: 0, 结转: 0, 转下月: 0 }; data.bills.push(下月记录); }
  if (!('结转' in 下月记录)) 下月记录.结转 = 0;
  下月记录.结转 = 舍入((下月记录.结转 || 0) + 结转金额);
  写数据(data);
  res.json({ 房号, 月份, 下月, 结转金额, 结转: 下月记录.结转, 转下月: 本月记录.转下月 });
});
// 删除某房某月的账单记录
app.delete('/api/bills', (req, res) => {
  const data = 读数据();
  const { 房号, 月份 } = req.query;
  data.bills = data.bills.filter(b => !(b.房号 === 房号 && b.月份 === 月份));
  写数据(data);
  res.json({ ok: true });
});

// 日租
app.get('/api/daily', (req, res) => {
  const data = 读数据(); const 月份 = req.query.month || data.settings.当前月份;
  res.json(data.daily.filter(d => (d.日期 || '').startsWith(月份)).sort((a, b) => (a.日期 || '').localeCompare(b.日期 || '')));
});
app.post('/api/daily', (req, res) => { const data = 读数据(); const 记录 = { id: 新id(data.daily), ...req.body, 入住天数: Number(req.body.入住天数) || 1 }; data.daily.push(记录); 写数据(data); res.json(记录); });
app.delete('/api/daily/:id', (req, res) => { const data = 读数据(); data.daily = data.daily.filter(d => d.id != req.params.id); 写数据(data); res.json({ ok: true }); });

// 收支
app.get('/api/transactions', (req, res) => {
  const data = 读数据(); const 月份 = req.query.month || data.settings.当前月份;
  res.json(data.transactions.filter(t => (t.日期 || '').startsWith(月份)).sort((a, b) => (a.日期 || '').localeCompare(b.日期 || '')));
});
app.post('/api/transactions', (req, res) => { const data = 读数据(); const 记录 = { id: 新id(data.transactions), ...req.body }; data.transactions.push(记录); 写数据(data); res.json(记录); });
app.delete('/api/transactions/:id', (req, res) => { const data = 读数据(); data.transactions = data.transactions.filter(t => t.id != req.params.id); 写数据(data); res.json({ ok: true }); });

// 备忘录（全局常驻，与月份无关；未完成排前面，同组内新的在上）
function 备忘录排序(list) { return [...list].sort((a, b) => (a.完成 ? 1 : 0) - (b.完成 ? 1 : 0) || b.id - a.id); }
app.get('/api/memos', (req, res) => res.json(备忘录排序(读数据().备忘录)));
app.post('/api/memos', (req, res) => {
  const data = 读数据();
  const 内容 = String(req.body.内容 || '').trim();
  if (!内容) return res.status(400).json({ 错误: '内容不能为空' });
  const 记录 = { id: 新id(data.备忘录), 内容, 完成: false, 日期: 今天() };
  data.备忘录.push(记录); 写数据(data); res.json(记录);
});
// 批量删除（删除模式下多选）：具体路由写在 /:id 前面
app.post('/api/memos/delete', (req, res) => {
  const data = 读数据();
  const ids = new Set((Array.isArray(req.body && req.body.ids) ? req.body.ids : []).map(Number));
  if (!ids.size) return res.status(400).json({ 错误: '没有选中任何备忘' });
  const 原数 = data.备忘录.length;
  data.备忘录 = data.备忘录.filter(m => !ids.has(Number(m.id)));
  写数据(data); res.json({ ok: true, 删除数: 原数 - data.备忘录.length });
});
// 清除已完成：具体路由必须写在 /:id 参数路由前面，否则被吞掉（见项目备忘「已知坑」3）
app.delete('/api/memos/done', (req, res) => {
  const data = 读数据();
  const 删除数 = data.备忘录.filter(m => m.完成).length;
  data.备忘录 = data.备忘录.filter(m => !m.完成);
  写数据(data); res.json({ ok: true, 删除数 });
});
app.put('/api/memos/:id', (req, res) => {
  const data = 读数据(); const i = data.备忘录.findIndex(m => m.id == req.params.id);
  if (i < 0) return res.status(404).json({ 错误: '备忘不存在' });
  const 补丁 = { ...req.body };
  if ('内容' in 补丁) 补丁.内容 = String(补丁.内容).trim();
  data.备忘录[i] = { ...data.备忘录[i], ...补丁, id: data.备忘录[i].id };
  写数据(data); res.json(data.备忘录[i]);
});
app.delete('/api/memos/:id', (req, res) => {
  const data = 读数据(); data.备忘录 = data.备忘录.filter(m => m.id != req.params.id);
  写数据(data); res.json({ ok: true });
});

// 总览
app.get('/api/summary', (req, res) => {
  const data = 读数据(); const 月份 = req.query.month || data.settings.当前月份;
  let 月租已收 = 0; const 欠费 = [], 空置 = [], 数据不齐 = [];
  // 空置 = 房源清单 − 在租房号 − 日租房/自住房（日租、自住房不显示为空置）
  const 在租房号 = new Set(data.rooms.map(r => r.房号));
  for (const 源 of data.房源) {
    if (在租房号.has(源.房号)) continue;
    if (源.房型 === '日租' || 源.房型 === '自住房') continue;
    空置.push({ 房号: 源.房号 });
  }
  for (const 房 of data.rooms) {
    const 缺 = 缺项(房);
    if (缺.length) 数据不齐.push({ 房号: 房.房号, 缺失: 缺 });
    const 账单 = 生成账单(data, 房, 月份);
    // 月租已收 = 所有在租房的实收 + 补缴 + 新收押金 + 预缴（与月租账单页「已收」口径一致，不限核收状态、含缺项房）
    月租已收 += 账单.实收 + (账单.补缴 || 0) + (账单.新收押金 || 0) + (账单.预缴 || 0);
    // 状态模块只列「已抄表」或「上月有欠费转入」的未交/欠款房，纯未抄表（无结转）不在总览列
    if (!缺.length && (账单.状态 === '未交' || 账单.状态 === '欠款') && (账单.可计算 || 账单.结转 > 0)) 欠费.push(账单);
  }
  const 日租已收 = data.daily.filter(d => (d.日期 || '').startsWith(月份)).reduce((s, d) => s + (Number(d.金额) || 0), 0);
  const 支出 = data.transactions.filter(t => (t.日期 || '').startsWith(月份)).reduce((s, t) => s + (Number(t.金额) || 0), 0);
  const 工资 = 月工资(data.settings, 月份); // 工资：按「设置 → 数据 → 工资变量」的分段计算
  res.json({ 月份, 月租已收: 舍入(月租已收), 日租已收: 舍入(日租已收), 支出: 舍入(支出), 工资, 合计: 舍入(月租已收 + 日租已收 - 支出 - 工资), 欠费, 空置, 数据不齐 });
});

// 固化月度总账单：把某月总账单写入历史总账单（切月时调用）
app.post('/api/settle', (req, res) => {
  const data = 读数据();
  const 月份 = req.body.月份 || data.settings.当前月份;
  let 月租已收 = 0;
  for (const 房 of data.rooms) {
    const 账单 = 生成账单(data, 房, 月份);
    月租已收 += 账单.实收 + (账单.补缴 || 0) + (账单.新收押金 || 0) + (账单.预缴 || 0);
  }
  const 日租已收 = data.daily.filter(d => (d.日期 || '').startsWith(月份)).reduce((s, d) => s + (Number(d.金额) || 0), 0);
  const 支出 = data.transactions.filter(t => (t.日期 || '').startsWith(月份)).reduce((s, t) => s + (Number(t.金额) || 0), 0);
  let 记录 = data.历史总账单.find(h => h.月份 === 月份);
  if (!记录) { 记录 = { 月份, 月租: 0, 日租: 0, 支出: 0 }; data.历史总账单.push(记录); }
  记录.月租 = 舍入(月租已收); 记录.日租 = 舍入(日租已收); 记录.支出 = 舍入(支出);
  写数据(data);
  res.json(记录);
});

// 导出数据备份（下载完整数据.json）
app.get('/api/export', (req, res) => {
  const data = 读数据();
  const 日期 = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rental-backup-${日期}.json"`);
  res.send(JSON.stringify(data, null, 2));
});
// 导入数据备份（上传数据.json 覆盖当前数据）
app.post('/api/import', (req, res) => {
  try {
    const 数据 = req.body;
    if (!数据 || typeof 数据 !== 'object' || !Array.isArray(数据.rooms)) {
      return res.status(400).json({ 错误: '数据格式不正确，请上传有效的「数据.json」备份文件' });
    }
    迁移(数据); // 字段兼容处理
    写数据(数据);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ 错误: '导入失败：' + e.message });
  }
});

// ============ 在线更新 API（路由一律英文路径，避开已知坑 1） ============

// 当前版本：轻量，不执行任何 git 网络操作，供前端重启后高频轮询
app.get('/api/version', (req, res) => res.json(读版本()));

// 检查更新
app.get('/api/update/check', async (req, res) => {
  try {
    try { await 跑命令('git', ['rev-parse', '--git-dir'], 5000); }
    catch (e) { return res.json({ 可更新: false, 不可更新原因: '当前目录不是 git 仓库，无法在线更新。请用 git clone 部署，或手动替换文件。' }); }

    await 跑命令('git', ['fetch', 'origin', 'main'], 20000);

    const 当前提交 = await 跑命令('git', ['rev-parse', '--short', 'HEAD']);
    const 最新提交 = await 跑命令('git', ['rev-parse', '--short', 'origin/main']);
    const 落后提交数 = Number(await 跑命令('git', ['rev-list', '--count', 'HEAD..origin/main'])) || 0;
    // 也要算本地领先了几个提交：本地有未推送的提交时两边已分叉，
    // git pull --ff-only 必然失败，得提前拦住而不是让用户点了才报错
    const 领先提交数 = Number(await 跑命令('git', ['rev-list', '--count', 'origin/main..HEAD'])) || 0;
    const 有更新 = 落后提交数 > 0;

    const 提交列表 = 有更新
      ? (await 跑命令('git', ['log', '--oneline', 'HEAD..origin/main'])).split('\n').filter(Boolean)
      : [];

    // 更新日志优先读远程（origin/main 上的最新版本），远程读不到才回退本地文件
    let 更新日志 = [];
    try { 更新日志 = 解析更新日志文本(await 跑命令('git', ['show', 'origin/main:更新日志.md'], 10000)); }
    catch (e) { 更新日志 = 读更新日志(); }

    // 必须带 -c core.quotepath=false：默认配置下 git 会把中文文件名转义成八进制
    // （项目备忘.md → "\351\241\271\347\233\256..."），直接显示给用户是一串乱码
    const 状态输出 = await 跑命令('git', ['-c', 'core.quotepath=false', 'status', '--porcelain']);
    const 本地改动 = 状态输出.split('\n').filter(Boolean).map(l => l.slice(3).trim());
    const 工作区干净 = 本地改动.length === 0;

    const 当前版本 = 读版本().版本;
    let 最新版本 = 当前版本;
    try { 最新版本 = JSON.parse(await 跑命令('git', ['show', 'origin/main:版本.json'], 10000)).版本 || 当前版本; }
    catch (e) { /* 远程没有版本.json 时用当前版本兜底 */ }

    res.json({
      当前版本, 当前提交, 最新版本, 最新提交,
      有更新, 落后提交数, 领先提交数, 更新日志, 提交列表,
      工作区干净, 本地改动,
      可更新: 有更新 && 工作区干净 && 领先提交数 === 0,
      不可更新原因: !有更新 ? ''
        : !工作区干净 ? '检测到本地有未提交的改动，请先在开发机处理（commit / push 或撤销改动）后再更新'
        : 领先提交数 > 0 ? `本地有 ${领先提交数} 个未推送的提交，与远程已分叉，只能快进更新的策略会失败。请先 push，或改在部署机上更新`
        : ''
    });
  } catch (e) {
    res.status(500).json({ 错误: '拉取远程失败：' + e.message + '。请检查网络连接。' });
  }
});

// 执行更新：拉取 GitHub 最新代码并重启
app.post('/api/update/apply', async (req, res) => {
  if (更新中) return res.status(409).json({ 错误: '更新正在进行中，请稍候' });
  更新中 = true;
  const 日志 = [];
  try {
    try { await 跑命令('git', ['rev-parse', '--git-dir'], 5000); }
    catch (e) { throw new Error('当前目录不是 git 仓库，无法在线更新'); }

    // -c core.quotepath=false：中文文件名不转义成八进制乱码
    const 状态输出 = await 跑命令('git', ['-c', 'core.quotepath=false', 'status', '--porcelain']);
    if (状态输出.trim()) throw new Error('检测到本地有未提交的改动，为避免误删代码已拒绝更新。请先在开发机 commit / push，或手动处理这些改动后再试。改动文件：' + 状态输出.split('\n').filter(Boolean).map(l => l.slice(3).trim()).join('、'));
    日志.push('✅ 工作区干净');

    // 本地领先远程 = 已分叉，--ff-only 一定失败，提前给个说人话的错误
    const 领先提交数 = Number(await 跑命令('git', ['rev-list', '--count', 'origin/main..HEAD'])) || 0;
    if (领先提交数 > 0) throw new Error(`本地有 ${领先提交数} 个未推送的提交，与远程已分叉，无法快进更新。请先 push，或改在部署机上更新。`);

    const 旧版本信息 = { ...读版本() };

    // 备份数据（失败直接中止，不允许跳过）
    const 数据备份目录 = path.join(数据目录, '备份');
    fs.mkdirSync(数据备份目录, { recursive: true });
    const 时间戳 = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const 备份文件名 = `更新前_${时间戳}.json`;
    if (fs.existsSync(数据文件)) {
      fs.copyFileSync(数据文件, path.join(数据备份目录, 备份文件名));
      清理旧备份(数据备份目录);
      日志.push('✅ 已备份数据：' + 备份文件名);
    } else {
      日志.push('⏭ 数据文件不存在，跳过备份');
    }

    const pkg路径 = path.join(__dirname, 'package.json');
    let 旧pkg内容 = ''; try { 旧pkg内容 = fs.readFileSync(pkg路径, 'utf8'); } catch (e) {}

    try {
      await 跑命令('git', ['pull', '--ff-only', 'origin', 'main'], 60000);
      日志.push('✅ git pull 完成');
    } catch (e) {
      throw new Error('git pull 失败：' + e.message);
    }

    let 装了依赖 = false;
    let 新pkg内容 = ''; try { 新pkg内容 = fs.readFileSync(pkg路径, 'utf8'); } catch (e) {}
    if (新pkg内容 && 新pkg内容 !== 旧pkg内容) {
      try {
        await 跑命令('npm', ['install', '--omit=dev'], 180000);
        装了依赖 = true;
        日志.push('✅ 依赖已更新（npm install）');
      } catch (e) {
        日志.push('⚠️ 代码已更新但依赖安装失败，请手动执行 npm install：' + e.message);
      }
    } else {
      日志.push('⏭ 依赖无变化，跳过 npm install');
    }

    版本缓存 = null; // 失效缓存，读取新的 commit / 版本号
    const 新版本信息 = 读版本();

    const 更新记录文件 = path.join(数据目录, '更新记录.json');
    let 记录列表 = []; try { 记录列表 = JSON.parse(fs.readFileSync(更新记录文件, 'utf8')); } catch (e) {}
    记录列表.unshift({
      时间: new Date().toLocaleString('zh-CN'),
      更新前提交: 旧版本信息.提交, 更新后提交: 新版本信息.提交,
      更新前版本: 旧版本信息.版本, 更新后版本: 新版本信息.版本,
      备份文件: 备份文件名, 结果: '成功'
    });
    fs.writeFileSync(更新记录文件, JSON.stringify(记录列表.slice(0, 50), null, 2), 'utf8');
    日志.push('🔄 正在重启服务...');

    res.json({ ok: true, 旧版本: 旧版本信息.版本, 新版本: 新版本信息.版本, 需重启: true, 装了依赖, 备份文件: 备份文件名, 日志 });
    触发重启();
  } catch (e) {
    更新中 = false;
    res.status(400).json({ 错误: e.message, 日志 });
  }
});

// 回滚到上一版本
app.post('/api/update/rollback', async (req, res) => {
  if (更新中) return res.status(409).json({ 错误: '更新正在进行中，请稍候' });
  更新中 = true;
  const 日志 = [];
  try {
    const 更新记录文件 = path.join(数据目录, '更新记录.json');
    let 记录列表 = []; try { 记录列表 = JSON.parse(fs.readFileSync(更新记录文件, 'utf8')); } catch (e) {}
    if (!记录列表.length) throw new Error('没有可回滚的更新记录');
    const 上一条 = 记录列表[0];
    if (!上一条.更新前提交) throw new Error('更新记录缺少目标版本信息，无法回滚');

    try { await 跑命令('git', ['cat-file', '-e', 上一条.更新前提交]); }
    catch (e) { throw new Error('目标版本 ' + 上一条.更新前提交 + ' 在本地仓库中不存在，无法回滚'); }

    const 状态输出 = await 跑命令('git', ['-c', 'core.quotepath=false', 'status', '--porcelain']);
    if (状态输出.trim()) throw new Error('检测到本地有未提交的改动，已拒绝回滚。改动文件：' + 状态输出.split('\n').filter(Boolean).map(l => l.slice(3).trim()).join('、'));
    日志.push('✅ 工作区干净');

    const 数据备份目录 = path.join(数据目录, '备份');
    fs.mkdirSync(数据备份目录, { recursive: true });
    const 时间戳 = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const 备份文件名 = `回滚前_${时间戳}.json`;
    if (fs.existsSync(数据文件)) {
      fs.copyFileSync(数据文件, path.join(数据备份目录, 备份文件名));
      清理旧备份(数据备份目录);
      日志.push('✅ 已备份数据：' + 备份文件名);
    }

    await 跑命令('git', ['reset', '--hard', 上一条.更新前提交], 20000);
    日志.push('✅ 已回滚到 ' + 上一条.更新前提交);

    版本缓存 = null;
    const 新版本信息 = 读版本();

    记录列表.unshift({
      时间: new Date().toLocaleString('zh-CN'),
      更新前提交: 上一条.更新后提交, 更新后提交: 新版本信息.提交,
      更新前版本: 上一条.更新后版本, 更新后版本: 新版本信息.版本,
      备份文件: 备份文件名, 结果: '回滚成功'
    });
    fs.writeFileSync(更新记录文件, JSON.stringify(记录列表.slice(0, 50), null, 2), 'utf8');
    日志.push('🔄 正在重启服务...');

    res.json({ ok: true, 新版本: 新版本信息.版本, 需重启: true, 日志 });
    触发重启();
  } catch (e) {
    更新中 = false;
    res.status(400).json({ 错误: e.message, 日志 });
  }
});

// 更新历史（前端折叠展示）
app.get('/api/update/history', (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(path.join(数据目录, '更新记录.json'), 'utf8'))); }
  catch (e) { res.json([]); }
});
// 更新日志：读本地「更新日志.md」，按版本切段回给前端（各版本看日志用）
app.get('/api/update/changelog', (req, res) => res.json(读更新日志()));

const 端口 = process.env.PORT || 3000;
// 在线更新重启时，旧进程可能还没完全释放端口，新进程立刻 listen 会 EADDRINUSE。
// 不重试的话新进程会以非 88 的退出码挂掉，guard.js 判定为正常退出跟着一起退出 → 服务彻底下线，
// 用户只看到「重启超时」，必须回电脑重新双击 启动.bat。所以这里必须重试。
// 注意：只建一个 server 对象、只挂一个 error 监听器，重试时复用同一个 server 调 .listen()。
// 不能用 app.listen() 每次重试都调一次——Express 的 app.listen 会在同一个 app 上反复叠
// 加 error 监听器，第 2 次失败时旧监听器也一起触发，重试次数会指数级翻倍。
const 服务 = require('http').createServer(app);
let 重试次数 = 0;
服务.on('error', e => {
  if (e.code === 'EADDRINUSE' && 重试次数 < 6) {
    重试次数 += 1;
    console.log(`端口 ${端口} 暂时被占用，500ms 后重试（${重试次数}/6）`);
    setTimeout(() => 服务.listen(端口, '0.0.0.0'), 500);
  } else {
    console.error('启动失败：' + e.message);
    process.exit(1);
  }
});
服务.listen(端口, '0.0.0.0', () => {
  console.log('租房管家已启动：');
  console.log(`  本机访问：http://localhost:${端口}`);
  console.log(`  手机访问：http://<本机IP>:${端口}`);
  console.log('数据文件：' + 数据文件);
  console.log('按 Ctrl+C 停止');
});

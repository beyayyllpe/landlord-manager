// 租房管家 —— 前端逻辑
'use strict';

async function api(地址, 参数) {
  const 选项 = 参数 || {};
  if (选项.body) { 选项.headers = { 'Content-Type': 'application/json' }; 选项.body = JSON.stringify(选项.body); }
  const r = await fetch(地址, 选项);
  if (r.status === 401) { location.replace('/login'); throw new Error('未登录或登录已过期'); }
  return r.json();
}
function 提示(msg) { const el = document.getElementById('提示'); el.textContent = msg; el.classList.add('显示'); setTimeout(() => el.classList.remove('显示'), 1800); }
function 数字(n) { return String(Math.round(Number(n) || 0)); }
function 金额HTML(n) { return `<span class="币">¥</span>${数字(n)}`; }
// 精金额：保留最多两位小数、去掉末尾的 0（水电金额 358.8 要保留小数，不能用 数字() 取整）
function 精金额(n) { return String(Math.round((Number(n) || 0) * 100) / 100); }
// 短日期："2026-08-24" → "8月24日"（房租单日期列用）
function 短日期(日期) { if (!日期) return '—'; const [, m, d] = String(日期).split('-'); return `${Number(m)}月${Number(d)}日`; }
// ============ 北京时间（全局时间基准） ============
// 两层保障：① 固定 UTC+8，不看设备时区；② 每 6 小时跟服务器校准一次时钟。
// 这样手机/电脑的时间设歪了也不会把账记到别的日子，前后端算出的营业日始终一致。
let 时间偏移 = 0;   // 服务器时间 − 本机时间（毫秒），校准失败就保持 0、退回本机时间
function 现在() { return new Date(Date.now() + 时间偏移); }
function 补零(n) { return String(n).padStart(2, '0'); }
// 加 8 小时后用 getUTC* 读，读出来就是北京的年月日时分
function 北京(时刻) { const d = 时刻 ? new Date(时刻) : 现在(); return new Date(d.getTime() + 8 * 3600 * 1000); }
function 北京日期(时刻) { const b = 北京(时刻); return `${b.getUTCFullYear()}-${补零(b.getUTCMonth() + 1)}-${补零(b.getUTCDate())}`; }
function 北京时分(时刻) { const b = 北京(时刻); return `${补零(b.getUTCHours())}:${补零(b.getUTCMinutes())}`; }
function 今天() { return 北京日期(); }
// 日租营业日：早 6 点换日（26 日 6:00 ~ 27 日 5:59 都算 26 日）
function 营业日(时刻) {
  const b = 北京(时刻);
  if (b.getUTCHours() < 6) b.setUTCDate(b.getUTCDate() - 1);
  return `${b.getUTCFullYear()}-${补零(b.getUTCMonth() + 1)}-${补零(b.getUTCDate())}`;
}
async function 校准时间() {
  const 发出 = Date.now();
  const r = await api('/api/now').catch(() => null);
  if (!r || !r.时间戳) return false;          // 拿不到就继续用本机时间，不影响使用
  const 收到 = Date.now();
  // 减掉一半往返耗时，粗略补偿网络延迟
  时间偏移 = r.时间戳 + (收到 - 发出) / 2 - 收到;
  return true;
}
// 某日期距今天多少天（今天=0，昨天=1，前天=2…）。按日期字符串拆年月日算，避免时区偏移把结果带偏
function 距今天数(日期) {
  const [y, m, d] = String(日期 || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 0;
  const 目标 = new Date(Date.UTC(y, m - 1, d)).getTime();
  const 今 = new Date(); const 今天零点 = new Date(Date.UTC(今.getFullYear(), 今.getMonth(), 今.getDate())).getTime();
  return Math.round((今天零点 - 目标) / 86400000);
}
function 转义(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function 加月(月份, 偏移) { const [y, m] = String(月份).split('-').map(Number); const d = new Date(y, m - 1 + 偏移, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function 中文日期(日期) { if (!日期) return ''; const [y, m, d] = String(日期).split('-'); return `${y}年${Number(m)}月${Number(d)}日`; }
function 中文年月(月份) { if (!月份) return ''; const [y, m] = String(月份).split('-'); return `${y}年${Number(m)}月`; }
function 状态徽章(状态) {
  const map = { '已核收': '<span class="徽章 已核收">已核收</span>', '未交': '<span class="徽章 未交">未交</span>', '欠款': '<span class="徽章 欠款">欠款</span>', '未出租': '<span class="徽章 未出租">未出租</span>', '已退房': '<span class="徽章 已退房">已退房</span>' };
  return map[状态] || 状态;
}

// ============ 模态框 ============
// 关闭规则：点外面 / 按 Esc **全局无效**（编辑态、预览态都一样），只能点「取消/关闭」按钮退出。
// 防误触的「确认」改到两个时机：
//   1) 提交动作（核收/平账/追缴/滚存/保存/退房/换房）→ 点下去先弹 询问确认() 核对输入；
//   2) 取消/关闭按钮 → 表单动过先弹 询问退出()，没动过直接关。
// 保存/提交成功后由业务代码调 关闭模态() 强制关。
let 模态初始值 = '';       // 打开那一刻的表单快照，用来判断有没有动过

// 把模态里所有输入控件的值拼成一个串，用于「有没有改动」的比对
function 表单快照(根) {
  return [...根.querySelectorAll('input, select, textarea')]
    .map(el => (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '1' : '0') : el.value)
    .join('');
}

// ============ 客人档案：按姓名带出身份证 / 电话 ============
// 用在「日租办入住」和「月租添加/编辑租客」两处。姓名框失焦就查，只填空着的框，不覆盖已输入的内容。
window.带出客人 = function(名框id, 证框id, 话框id, 备注框id) {
  return 带出客人到(document.getElementById(名框id), document.getElementById(证框id),
    document.getElementById(话框id), 备注框id ? document.getElementById(备注框id) : null);
};
async function 带出客人到(名框, 证框, 话框, 备注框) {
  if (!名框) return;
  const 名 = 名框.value.trim();
  if (!名) return;
  // 该填的框都已经填了就别打扰用户
  const 空着 = [证框, 话框, 备注框].some(框 => 框 && !框.value.trim());
  if (!空着) return;
  const r = await api('/api/guests?name=' + encodeURIComponent(名)).catch(() => null);
  const 候选 = (r && r.候选) || [];
  // 没带出档案就把旧标记清掉，否则换了个新名字还挂着上一位的 档案id，保存时会覆盖错人
  if (!候选.length) { delete 名框.dataset.档案id; return; }
  let 选中 = 候选[0];
  if (候选.length > 1) {                           // 同名多人 → 让用户挑，也可以按新人录入
    选中 = await 选客人档案(名, 候选);
    if (!选中) { delete 名框.dataset.档案id; return; }   // 选「都不是」= 按新客人录
  }
  // 记住这条是从哪份档案带出来的：保存时带回后端，改了字段就覆盖那条，不新增
  名框.dataset.档案id = 选中.id;
  const 填了 = [];
  if (证框 && !证框.value.trim() && 选中.身份证) { 证框.value = 选中.身份证; 填了.push('身份证'); }
  if (话框 && !话框.value.trim() && 选中.电话) { 话框.value = 选中.电话; 填了.push('电话'); }
  if (备注框 && !备注框.value.trim() && 选中.备注) { 备注框.value = 选中.备注; 填了.push('备注'); }
  if (填了.length) 提示(`已带出${名}的${填了.join('、')}`);
}
// 重名时的选择框：独立一层（.确认遮罩），不能用 打开模态——那会把底下的入住/租客表单一起清掉
function 选客人档案(姓名, 候选) {
  return new Promise(resolve => {
    const 窗 = document.createElement('div');
    窗.className = '确认遮罩';
    窗.innerHTML = `<div class="确认框" style="max-width:520px;text-align:left">
      <h3>「${转义(姓名)}」有 ${候选.length} 条登记记录</h3>
      <p style="margin-bottom:10px">选一位带出他的身份证和电话；如果都不是同一个人，就按新客人录入。</p>
      <div class="客人候选区">
        ${候选.map((c, i) => `<button class="客人候选" data-选择="${i}">
          <div class="客人候选行"><b>${转义(c.姓名)}</b><i>${转义(时刻(c.更新时间) || '')}</i></div>
          <div class="客人候选行"><span>身份证 ${转义(c.身份证 || '—')}</span></div>
          <div class="客人候选行"><span>电话 ${转义(c.电话 || '—')}</span></div>
          ${c.备注 ? `<div class="客人候选行"><span>备注 ${转义(c.备注)}</span></div>` : ''}
        </button>`).join('')}
      </div>
      <div class="确认按钮组">
        <button class="btn 次" data-选择="新">都不是，按新客人录入</button>
      </div>
    </div>`;
    document.body.appendChild(窗);
    窗.addEventListener('click', e => {
      const 钮 = e.target.closest('[data-选择]');
      if (!钮) return;
      窗.remove();
      const 值 = 钮.dataset.选择;
      resolve(值 === '新' ? null : 候选[Number(值)]);
    });
  });
}

let 子模态初始值 = '';
function 打开模态(html, 尺寸) {
  document.querySelectorAll('.模态遮罩').forEach(el => el.remove()); // 清除已有模态，避免叠加导致取消失效
  const 遮罩 = document.createElement('div');
  遮罩.className = '模态遮罩';
  遮罩.innerHTML = `<div class="模态框${尺寸 === '窄' ? ' 窄' : ''}">${html}</div>`;
  document.body.appendChild(遮罩);
  模态初始值 = 表单快照(遮罩);
  子模态初始值 = '';
  // 点外面：全局无效（不做任何事），只能点按钮退出
  遮罩.addEventListener('click', e => { if (e.target === 遮罩) e.stopPropagation(); });
}

// 叠在当前模态框之上的子模态（保留底层弹窗作为模糊背景，点取消仅关闭本层回到上一级）
function 打开子模态(html, 尺寸) {
  document.querySelectorAll('.子模态遮罩').forEach(el => el.remove());
  const 遮罩 = document.createElement('div');
  遮罩.className = '模态遮罩 子模态遮罩';
  遮罩.innerHTML = `<div class="模态框${尺寸 === '窄' ? ' 窄' : ''}">${html}</div>`;
  document.body.appendChild(遮罩);
  子模态初始值 = 表单快照(遮罩);
  遮罩.addEventListener('click', e => { if (e.target === 遮罩) e.stopPropagation(); });
}

// 强制关闭：关闭全部模态层。供保存成功后使用
window.关闭模态 = () => {
  document.querySelectorAll('.模态遮罩').forEach(el => el.remove());
  模态初始值 = '';
  子模态初始值 = '';
};

// 「取消/关闭」按钮的关闭：优先只关最顶层子模态回到上一级；只有「改动过」才提示
window.请求关闭模态 = async function() {
  const 子遮罩 = document.querySelector('.子模态遮罩');
  if (子遮罩) {
    if (表单快照(子遮罩) !== 子模态初始值 && !(await 询问退出())) return;
    子遮罩.remove();
    子模态初始值 = '';
    return;
  }
  const 遮罩 = document.querySelector('.模态遮罩');
  if (!遮罩) return;
  if (表单快照(遮罩) === 模态初始值) { 关闭模态(); return; }
  if (await 询问退出()) 关闭模态();
};

// 「还没保存就退出」二选确认：取消/关闭按钮在表单动过时弹出
function 询问退出() {
  return new Promise(resolve => {
    const 窗 = document.createElement('div');
    窗.className = '确认遮罩';
    窗.innerHTML = `<div class="确认框">
      <h3>内容还没保存</h3>
      <p>退出后这些改动会丢失。</p>
      <div class="确认按钮组">
        <button class="btn 危险" data-选择="退出">确定退出</button>
        <button class="btn 次" data-选择="留">继续编辑</button>
      </div>
    </div>`;
    document.body.appendChild(窗);
    // 只认按钮，点小窗周围不做任何反应——避免在「防误触」的弹窗上再踩一次误触
    窗.addEventListener('click', e => {
      const 选择 = e.target.dataset && e.target.dataset.选择;
      if (!选择) return;
      窗.remove();
      resolve(选择 === '退出');
    });
  });
}

// 通用「确认执行」二选框：提交类按钮（核收/平账/追缴/滚存/保存/退房/换房）点下去先确认，防误触。
// 返回 true = 用户确认，false = 取消。标题/内容传纯文本。
function 询问确认(标题, 内容 = '') {
  return new Promise(resolve => {
    const 窗 = document.createElement('div');
    窗.className = '确认遮罩';
    窗.innerHTML = `<div class="确认框">
      <h3>${标题}</h3>
      ${内容 ? `<p>${内容}</p>` : ''}
      <div class="确认按钮组">
        <button class="btn" data-选择="是">确认</button>
        <button class="btn 次" data-选择="否">取消</button>
      </div>
    </div>`;
    document.body.appendChild(窗);
    窗.addEventListener('click', e => {
      const 选择 = e.target.dataset && e.target.dataset.选择;
      if (!选择) return;
      窗.remove();
      resolve(选择 === '是');
    });
  });
}

// 通用可折叠卡片：备忘录/空置房间/房源信息共用。收起状态只在本次会话内保留，刷新页面回到默认展开
let 折叠状态 = { 房源: true, 已锁定月: true };   // 房源信息/已锁定月份默认收起
function 折叠卡片(键, 标题HTML, 内容HTML, 默认收起) {
  if (!(键 in 折叠状态) && 默认收起) 折叠状态[键] = true;
  const 收起 = !!折叠状态[键];
  return `<div class="卡片">
    <div class="折叠头" onclick="切换折叠('${键}')">
      ${标题HTML}
      <span class="折叠标" id="折叠标-${键}">${收起 ? '展开 ▼' : '收起 ▲'}</span>
    </div>
    <div id="折叠体-${键}" style="${收起 ? 'display:none' : ''}">${内容HTML}</div>
  </div>`;
}
window.切换折叠 = function(键) {
  折叠状态[键] = !折叠状态[键];
  const 体 = document.getElementById('折叠体-' + 键), 标 = document.getElementById('折叠标-' + 键);
  if (体) 体.style.display = 折叠状态[键] ? 'none' : '';
  if (标) 标.textContent = 折叠状态[键] ? '展开 ▼' : '收起 ▲';
};

let 全局 = { settings: { 当前月份: '' } };
let 当前页 = '总览';
let 启用删除 = false; // 删除模式开关：勾选后各页面的删除/撤销按钮才显示

// ============ 切月锁死（前端） ============
// 后端已锁定月：读快照、写接口一律拒绝。前端这里负责：显示「🔒 已锁定」标识、隐藏编辑/删除按钮、禁用输入框。
function 锁定月集合() { return new Set((全局.月度快照 || []).map(k => k.月份)); }
function 月份锁定(月) { const m = String(月 || '').slice(0, 7); return !!m && 锁定月集合().has(m); }
function 锁定徽章(月) { return 月份锁定(月) ? '<span class="徽章" style="background:var(--warn-bg);color:var(--warn-text);margin-left:6px">已锁定</span>' : ''; }

// ============ 在线更新 ============
let 当前版本信息 = null;   // 当前运行版本，每次进「设置 → 关于」时刷新（{版本,提交,日期}）
let 更新检查结果 = null;   // /api/update/check 的结果缓存，null=还没检查过
let 更新检查中 = false;
let 更新执行中 = false;    // apply/rollback 进行中：禁用按钮、展示滚动日志
let 更新日志缓存 = [];     // apply/rollback 返回的 日志[]
let 版本日志缓存 = null;    // /api/update/changelog 返回的各版本日志（拉过一次就缓存）

function 千分位(n) { return (Math.round(Number(n) || 0)).toLocaleString('en-US'); }
function 紧凑金额(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1000000) return `${sign}¥${(abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 10000) return `${sign}¥${(abs / 10000).toFixed(abs >= 100000 ? 0 : 1)}万`;
  return `${sign}¥${Math.round(abs)}`;
}

// 通用极简 SVG 渐变面积趋势图（支持 1~3 条序列 + 悬停准星读数）
let _趋势图计数 = 0;
function 绘制趋势图(区, 配置) {
  if (!区) return;
  const { 标题, 副标题 = '', 开关HTML = '', 标签列表 = [], 序列们 = [], 空提示 = '至少需要 2 个点才能绘制趋势曲线', 浮窗后缀 } = 配置;
  const n = 标签列表.length;
  if (n < 2 || !序列们.length) {
    区.innerHTML = `<div class="趋势头"><div class="趋势标题"><h3>${标题}</h3>${副标题 ? `<span style="font-size:var(--fs-xs);color:var(--ink-3)">${副标题}</span>` : ''}</div>${开关HTML}</div><div class="空" style="padding:18px 0">${空提示}</div>`;
    return;
  }
  const gid = ++_趋势图计数;
  const W = Math.max(360, (区.clientWidth || 1008) - 48), H = 210, PL = 58, PR = 20, PT = 14, PB = 28;
  const CW = W - PL - PR, CH = H - PT - PB;
  const 所有值 = 序列们.flatMap(s => s.数据);
  let minV = Math.min(0, ...所有值);
  let maxV = Math.max(...所有值);
  if (maxV <= minV) maxV = minV + 1000;
  const pad = (maxV - minV) * 0.1;
  maxV += pad;
  if (minV < 0) minV -= pad * 0.5;

  const xAt = i => PL + (n === 1 ? CW / 2 : (i / (n - 1)) * CW);
  const yAt = v => PT + ((maxV - v) / (maxV - minV)) * CH;
  const linePath = pts => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const areaPath = pts => `${linePath(pts)} L${pts[pts.length - 1][0].toFixed(1)},${(PT + CH).toFixed(1)} L${pts[0][0].toFixed(1)},${(PT + CH).toFixed(1)} Z`;

  const 序列坐标 = 序列们.map(s => s.数据.map((v, i) => [xAt(i), yAt(v)]));
  const yTicks = [minV, (minV + maxV) / 2, maxV];
  const xStep = Math.max(1, Math.ceil((n - 1) / 5));
  const xIndices = [];
  for (let i = 0; i < n; i += xStep) xIndices.push(i);
  if (xIndices[xIndices.length - 1] !== n - 1) xIndices.push(n - 1);
  const 面积透明 = 序列们.length >= 3 ? '0.11' : '0.18';

  区.innerHTML = `
    <div class="趋势头">
      <div class="趋势标题">
        <h3>${标题}</h3>
        <div class="趋势图例">
          ${序列们.map(s => `<span><i style="background:${s.颜色}"></i>${s.名称}</span>`).join('')}
        </div>
        ${副标题 ? `<span style="font-size:var(--fs-xs);color:var(--ink-3);font-variant-numeric:tabular-nums">${副标题}</span>` : ''}
      </div>
      ${开关HTML}
    </div>
    <div class="趋势画布盒" id="趋势盒-${gid}">
      <div class="趋势浮窗" id="趋势浮-${gid}"></div>
      <svg viewBox="0 0 ${W} ${H}">
        <defs>
          ${序列们.map((s, idx) => `<linearGradient id="tg-${gid}-${idx}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${s.颜色}" stop-opacity="${面积透明}"/>
            <stop offset="100%" stop-color="${s.颜色}" stop-opacity="0.01"/>
          </linearGradient>`).join('')}
        </defs>
        ${yTicks.map(v => {
          const y = yAt(v).toFixed(1);
          return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="var(--border)" stroke-width="1" opacity="0.65"/>
            <text x="${PL - 8}" y="${Number(y) + 4}" text-anchor="end" fill="var(--ink-3)" font-size="11">${紧凑金额(v)}</text>`;
        }).join('')}
        ${xIndices.map(i => {
          const x = xAt(i).toFixed(1);
          return `<line x1="${x}" y1="${PT}" x2="${x}" y2="${PT + CH}" stroke="var(--border)" stroke-width="1" opacity="0.45"/>
            <text x="${x}" y="${H - 6}" text-anchor="middle" fill="var(--ink-3)" font-size="11">${标签列表[i]}</text>`;
        }).join('')}
        ${序列坐标.map((pts, idx) => `<path d="${areaPath(pts)}" fill="url(#tg-${gid}-${idx})"/>`).join('')}
        ${序列坐标.map((pts, idx) => `<path d="${linePath(pts)}" fill="none" stroke="${序列们[idx].颜色}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
        ${序列坐标.map((pts, idx) => {
          const p = pts[n - 1], c = 序列们[idx].颜色;
          return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="6" fill="${c}" opacity="0.18"/>
            <circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="${c}" stroke="var(--surface)" stroke-width="1.5"/>`;
        }).join('')}
        <line id="趋势准-${gid}" x1="0" y1="${PT}" x2="0" y2="${PT + CH}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
        ${序列们.map((s, idx) => `<circle id="趋势点-${gid}-${idx}" cx="0" cy="0" r="4" fill="${s.颜色}" stroke="var(--surface)" stroke-width="1.5" opacity="0"/>`).join('')}
      </svg>
    </div>`;

  const 盒 = document.getElementById(`趋势盒-${gid}`);
  const 浮窗 = document.getElementById(`趋势浮-${gid}`);
  const 准星 = document.getElementById(`趋势准-${gid}`);
  if (盒 && 浮窗) {
    const 定位 = clientX => {
      const rect = 盒.getBoundingClientRect();
      if (!rect.width) return;
      const relX = ((clientX - rect.left) / rect.width) * W;
      const ratio = Math.max(0, Math.min(1, (relX - PL) / CW));
      const idx = Math.round(ratio * (n - 1));
      const x = xAt(idx);
      准星.setAttribute('x1', x); 准星.setAttribute('x2', x); 准星.setAttribute('opacity', '0.7');
      序列们.forEach((s, si) => {
        const pt = document.getElementById(`趋势点-${gid}-${si}`);
        if (pt) { pt.setAttribute('cx', x); pt.setAttribute('cy', yAt(s.数据[idx])); pt.setAttribute('opacity', '1'); }
      });
      const 额外 = typeof 浮窗后缀 === 'function' ? 浮窗后缀(idx) : '';
      浮窗.innerHTML = `<b>${标签列表[idx]}${额外 ? ` <span style="font-weight:400;color:var(--ink-3)">${额外}</span>` : ''}</b>
        ${序列们.map(s => `<div class="趋势浮行"><span>${s.名称}</span><span>¥${千分位(s.数据[idx])}</span></div>`).join('')}`;
      const leftPx = (x / W) * rect.width;
      const 靠右 = leftPx > rect.width * 0.68;
      浮窗.style.left = 靠右 ? 'auto' : `${Math.min(rect.width - 175, leftPx + 12)}px`;
      浮窗.style.right = 靠右 ? `${Math.max(10, rect.width - leftPx + 12)}px` : 'auto';
      浮窗.classList.add('显示');
    };
    const 隐藏 = () => {
      准星.setAttribute('opacity', '0');
      序列们.forEach((_, si) => {
        const pt = document.getElementById(`趋势点-${gid}-${si}`);
        if (pt) pt.setAttribute('opacity', '0');
      });
      浮窗.classList.remove('显示');
    };
    盒.onmousemove = e => 定位(e.clientX);
    盒.onmouseleave = 隐藏;
    盒.ontouchstart = e => { if (e.touches && e.touches[0]) 定位(e.touches[0].clientX); };
    盒.ontouchmove = e => { if (e.touches && e.touches[0]) 定位(e.touches[0].clientX); };
    盒.ontouchend = 隐藏;
  }
  // 窗口缩放或手机横竖屏切换时自适应重绘
  区._趋势配置 = 配置;
  if (!window._趋势缩放监听) {
    window._趋势缩放监听 = true;
    window.addEventListener('resize', () => {
      clearTimeout(window._趋势缩放定时器);
      window._趋势缩放定时器 = setTimeout(() => {
        document.querySelectorAll('.趋势卡').forEach(el => { if (el._趋势配置) 绘制趋势图(el, el._趋势配置); });
      }, 180);
    });
  }
}


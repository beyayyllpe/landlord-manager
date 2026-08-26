// 租房管家 —— 前端逻辑
'use strict';

async function api(地址, 参数) {
  const 选项 = 参数 || {};
  if (选项.body) { 选项.headers = { 'Content-Type': 'application/json' }; 选项.body = JSON.stringify(选项.body); }
  const r = await fetch(地址, 选项); return r.json();
}
function 提示(msg) { const el = document.getElementById('提示'); el.textContent = msg; el.classList.add('显示'); setTimeout(() => el.classList.remove('显示'), 1800); }
function 数字(n) { return String(Math.round(Number(n) || 0)); }
// 精金额：保留最多两位小数、去掉末尾的 0（水电金额 358.8 要保留小数，不能用 数字() 取整）
function 精金额(n) { return String(Math.round((Number(n) || 0) * 100) / 100); }
// 短日期："2026-08-24" → "8月24日"（房租单日期列用）
function 短日期(日期) { if (!日期) return '—'; const [, m, d] = String(日期).split('-'); return `${Number(m)}月${Number(d)}日`; }
function 今天() { return new Date().toISOString().slice(0, 10); }
// 日租营业日：早 6 点换日（26 日 6:00 ~ 27 日 5:59 都算 26 日）。用本地时间，不能用 toISOString（那是 UTC）
function 营业日(时刻) {
  const d = 时刻 ? new Date(时刻) : new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const map = { '已核收': '<span class="徽章 已核收">已核收</span>', '未交': '<span class="徽章 未交">未交</span>', '欠款': '<span class="徽章 欠款">欠款</span>', '未出租': '<span class="徽章 未出租">未出租</span>' };
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

function 打开模态(html) {
  document.querySelector('.模态遮罩')?.remove(); // 先清除已有模态，避免叠加导致取消失效
  const 遮罩 = document.createElement('div');
  遮罩.className = '模态遮罩';
  遮罩.innerHTML = `<div class="模态框">${html}</div>`;
  document.body.appendChild(遮罩);
  模态初始值 = 表单快照(遮罩);
  // 点外面：全局无效（不做任何事），只能点按钮退出
  遮罩.addEventListener('click', e => { if (e.target === 遮罩) e.stopPropagation(); });
}

// 强制关闭：不询问。供保存成功后、以及切换模式重开模态时使用
window.关闭模态 = () => { document.querySelector('.模态遮罩')?.remove(); 模态初始值 = ''; };

// 「取消/关闭」按钮的关闭：只有「改动过」才提示，没改动直接关
window.请求关闭模态 = async function() {
  const 遮罩 = document.querySelector('.模态遮罩');
  if (!遮罩) return;
  if (表单快照(遮罩) === 模态初始值) { 关闭模态(); return; } // 没改动，直接关
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
let 折叠状态 = { 房源: true };   // 房源信息默认收起：清单长，平时不用看
function 折叠卡片(键, 标题HTML, 内容HTML) {
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

// ============ 在线更新 ============
let 当前版本信息 = null;   // 当前运行版本，每次进「设置 → 关于」时刷新（{版本,提交,日期}）
let 更新检查结果 = null;   // /api/update/check 的结果缓存，null=还没检查过
let 更新检查中 = false;
let 更新执行中 = false;    // apply/rollback 进行中：禁用按钮、展示滚动日志
let 更新日志缓存 = [];     // apply/rollback 返回的 日志[]
let 版本日志缓存 = null;    // /api/update/changelog 返回的各版本日志（拉过一次就缓存）

document.getElementById('导航').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('.导航 button').forEach(b => b.classList.remove('激活'));
  btn.classList.add('激活'); 当前页 = btn.dataset.page; 渲染();
});

const 页面渲染 = { '总览': 渲染总览, '房间': 渲染房间, '抄表': 渲染抄表, '账单': 渲染租客账单, '月租': 渲染月租, '月度账单': 渲染账单, '日租': 渲染日租, '退房': 渲染退房, '收支': 渲染收支, '设置': 渲染设置 };
async function 渲染() { document.getElementById('月份显示').textContent = '当月 ' + 全局.settings.当前月份; await 页面渲染[当前页](document.getElementById('内容')); }

// ============ 总览 ============
async function 渲染总览(容器) {
  const 月份 = 全局.settings.当前月份;
  // 备忘录接口单独兜底：它挂了只少一张卡片，不能把整个总览带崩（历史教训：前端已更新、后端没重启时整页空白）
  const [s, 备忘] = await Promise.all([api(`/api/summary?month=${月份}`), api('/api/memos').catch(() => null)]);
  容器.innerHTML = `
    <div class="卡片">
      <h2>当月总收支（${月份}）</h2>
      <div class="汇总网格">
        <div class="汇总项 收入"><div class="标签">月租已收</div><div class="数值">¥${数字(s.月租已收)}</div></div>
        <div class="汇总项 收入"><div class="标签">日租已收</div><div class="数值">¥${数字(s.日租已收)}</div></div>
        <div class="汇总项 支出"><div class="标签">支出</div><div class="数值">¥${数字(s.支出)}</div></div>
        <div class="汇总项 支出"><div class="标签">工资</div><div class="数值">¥${数字(s.工资)}</div></div>
        <div class="汇总项"><div class="标签">合计</div><div class="数值">¥${数字(s.合计)}</div></div>
      </div>
    </div>
    ${备忘录卡片(备忘)}
    ${s.数据不齐.length ? `<div class="卡片"><h3>🔔 数据不齐（${s.数据不齐.length}）</h3><div class="表格容器"><table><tr><th>房号</th><th>缺失项</th></tr>${s.数据不齐.map(x => `<tr><td><b>${转义(x.房号)}</b></td><td style="color:var(--红)">缺：${x.缺失.join('、')}</td></tr>`).join('')}</table></div></div>` : ''}
    <div class="卡片">
      <h3>💰 状态（${s.欠费.length}）</h3>
      ${s.欠费.length ? `<div class="表格容器"><table>
        <tr><th>房号</th><th>租客</th><th class="数字">应付租金</th><th class="数字">实收</th><th>状态</th><th class="数字">欠款</th><th></th></tr>
        ${s.欠费.map(b => {
          const 未抄 = b.状态 === '未交' && !b.可计算;
          const 默认实收 = 未抄 ? '' : (b.实收 > 0 ? b.实收 : b.应付租金);
          return `<tr>
            <td><b>${转义(b.房号)}</b></td><td>${转义(b.租客||'')}</td>
            <td class="数字">${未抄 ? '未抄表' : '¥' + 数字(b.应付租金)}</td>
            <td class="数字">${未抄 ? '—' : `<input type="number" class="抄表输入" id="实收${转义(b.房号)}" value="${数字(默认实收)}">`}</td>
            <td>${状态徽章(b.状态)}</td>
            <td class="数字" style="color:var(--红)">${b.状态==='欠款' && b.欠款 > 0 ? '¥' + 数字(b.欠款) : ''}</td>
            <td style="white-space:nowrap">
              ${未抄 ? '' : `<button class="btn 行内" onclick="核收('${转义(b.房号)}')">核收</button>`}
              ${未抄 ? '' : `<button class="btn 行内 危险" onclick="平账('${转义(b.房号)}')">平账</button>`}
              ${未抄 ? '' : `<button class="btn 行内 成功" onclick="追缴('${转义(b.房号)}')">追缴</button>`}
              ${未抄 ? '' : `<button class="btn 行内 成功" onclick="欠费滚存('${转义(b.房号)}')">欠费滚存</button>`}
            </td>
          </tr>`;
        }).join('')}
      </table></div>` : '<div class="空">无欠费 👍</div>'}
    </div>
    ${折叠卡片('空置', `<h2 style="margin:0">🏚 空置房间（${s.空置.length}）</h2>`,
      s.空置.length ? 空置按楼层(s.空置.map(x => x.房号)) : '<div class="空">无空置房间</div>')}`;
}
function 空置按楼层(房号列表) {
  const 组 = {};
  for (const 房号 of 房号列表) {
    const n = parseInt(房号);
    const 层 = 房号 === '阁楼' ? '阁楼' : (isNaN(n) ? '其他' : Math.floor(n / 100) + ' 层');
    (组[层] = 组[层] || []).push(房号);
  }
  const 序 = { '阁楼': 99, '其他': 98 };
  return Object.entries(组)
    .sort((a, b) => ((序[a[0]] ?? parseInt(a[0])) - (序[b[0]] ?? parseInt(b[0]))))
    .map(([层, 房们]) => `<div class="楼层行"><span class="楼层名">${层}</span>${房们.map(f => `<span class="空置房">${转义(f)}</span>`).join('')}</div>`)
    .join('');
}
// 核收：记录实收金额，交齐→已核收（从状态消失），没交齐→欠款（保留并标欠费）
window.核收 = async function(房号) {
  const 实收 = document.getElementById('实收' + 房号)?.value;
  if (!(await 询问确认('确认核收？', `${转义(房号)}　实收 ¥${数字(实收 || 0)}`))) return;
  await api('/api/bills/collect', { method: 'POST', body: { 房号, 月份: 全局.settings.当前月份, 实收: 实收, 强制: true, 收款日期: 今天() } });
  提示('已核收'); 渲染();
};
window.平账 = async function(房号) {
  if (!(await 询问确认('确认平账？', `${转义(房号)}　将标记为已核收（不改实收金额）`))) return;
  await api('/api/bills/collect', { method: 'POST', body: { 房号, 月份: 全局.settings.当前月份, 平账: true } });
  提示('已平账'); 渲染();
};
// 追缴：手动输入金额，累加到本月账单（不改变核收状态、不碰历史月）
window.追缴 = async function(房号) {
  打开模态(`<h2>追缴</h2>
    <p style="font-size:19px">房号 <b>${转义(房号)}</b></p>
    <p style="color:var(--次文字);font-size:15px;margin:8px 0">追缴金额累加到本月账单，冲减欠费。金额可手动修改。</p>
    <label style="display:flex;align-items:center;gap:10px;font-size:17px;font-weight:600">追缴金额
      <input type="number" id="追缴金额" placeholder="输入金额" style="width:200px;padding:12px 14px;font-size:22px;font-weight:700;border:2px solid var(--主色);border-radius:10px;text-align:center">
    </label>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" onclick="确认追缴('${转义(房号)}')">确认追缴</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
};
window.确认追缴 = async function(房号) {
  const 金额 = document.getElementById('追缴金额').value;
  if (!(await 询问确认('确认追缴？', `${转义(房号)}　追缴 ¥${数字(金额 || 0)}`))) return;
  const 月份 = 全局.settings.当前月份;
  const r = await api('/api/bills/arrears', { method: 'POST', body: { 房号, 月份, 金额 } });
  if (r.错误) { 提示(r.错误); return; }
  提示('已追缴'); 关闭模态(); 渲染();
};
// 欠费滚存：把本月拖欠金额结转到下月账单
window.欠费滚存 = async function(房号) {
  const 月份 = 全局.settings.当前月份;
  const 账单 = await api(`/api/bills?month=${月份}`);
  const b = 账单.find(x => x.房号 === 房号);
  const 未抄 = b.应付租金 == null;
  const 拖欠 = 未抄 ? 0 : Math.max(0, (b.应付租金 || 0) - (b.实收 || 0) - (b.补缴 || 0) - (b.转下月 || 0));
  打开模态(`<h2>欠费滚存</h2>
    <p style="font-size:19px">房号 <b>${转义(房号)}</b>${未抄 ? '　<span style="color:var(--红)">本月未抄表</span>' : `　本月拖欠 <b style="color:var(--红)">¥${数字(拖欠)}</b>`}</p>
    <p style="color:var(--次文字);font-size:15px;margin:8px 0">欠费滚存（${加月(月份, 1)}）后，本月仍显示欠费，下月账单计入该金额。金额可手动修改。</p>
    <label style="display:flex;align-items:center;gap:10px;font-size:17px;font-weight:600">滚存金额
      <input type="number" id="滚存金额" value="${数字(拖欠)}" style="width:200px;padding:12px 14px;font-size:22px;font-weight:700;border:2px solid var(--主色);border-radius:10px;text-align:center">
    </label>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" onclick="确认欠费滚存('${转义(房号)}')">确认滚存</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
};
window.确认欠费滚存 = async function(房号) {
  const 金额 = document.getElementById('滚存金额').value;
  if (!(await 询问确认('确认欠费滚存？', `${转义(房号)}　结转 ¥${数字(金额 || 0)} 到下月`))) return;
  const 月份 = 全局.settings.当前月份;
  const r = await api('/api/bills/carry', { method: 'POST', body: { 房号, 月份, 金额 } });
  if (r.错误) { 提示(r.错误); return; }
  提示('已欠费滚存'); 关闭模态(); 渲染();
};

// ============ 备忘录（总览卡片，全局常驻不分月份） ============
let 备忘缓存 = [];            // 本地缓存，勾选/切模式时直接重绘，不用每次都请求后端
let 备忘删除模式 = false;      // 默认关闭：平时不显示删除图标，防手机误触
const 备忘选中 = new Set();    // 删除模式下多选的 id

function 备忘录卡片(列表) {
  if (!Array.isArray(列表)) return '<div class="卡片"><h2 style="margin:0">📝 备忘录</h2><div class="空">备忘录加载失败，刷新页面重试（服务端可能未重启）</div></div>';
  备忘缓存 = 列表;
  const 待办 = 列表.filter(m => !m.完成).length;
  const 标题 = `<h2 style="margin:0">📝 备忘录</h2>
    <span class="备忘待办数" id="备忘待办数" style="${待办 ? '' : 'display:none'}">${待办} 条待办</span>`;
  const 内容 = `<div class="备忘输入行">
      <input id="备忘输入" placeholder="记点什么…（回车添加）" maxlength="200" onkeydown="if(event.key==='Enter'&&!event.isComposing)添加备忘()">
      <button class="btn" onclick="添加备忘()">+ 添加</button>
    </div>
    <div id="备忘列表">${备忘录列表HTML(列表)}</div>`;
  return 折叠卡片('备忘录', 标题, 内容);
}
function 备忘录列表HTML(列表) {
  const 行 = 列表.map(m => `<div class="备忘项${m.完成 ? ' 已完成' : ''}">
      <input type="checkbox" class="备忘勾" ${m.完成 ? 'checked' : ''} onchange="切换备忘完成(${m.id}, this.checked)" title="标记完成">
      <span class="备忘内容">${转义(m.内容)}</span>
      <span class="备忘日期">${转义((m.日期 || '').slice(5))}</span>
      ${备忘删除模式 ? `<input type="checkbox" class="备忘选择" ${备忘选中.has(m.id) ? 'checked' : ''} onchange="备忘选中切换(${m.id}, this.checked)" title="选中以批量删除">
      <button class="btn 行内 危险" onclick="删除备忘(${m.id})" title="删除这条">🗑</button>` : ''}
    </div>`).join('');
  return (行 || '<div class="空">还没有备忘，用上面的输入框记一条 👆</div>') + 备忘底栏HTML(列表);
}
function 备忘底栏HTML(列表) {
  if (备忘删除模式) {
    const 全选中 = 列表.length > 0 && 备忘选中.size === 列表.length;
    return `<div class="备忘底栏">
      ${列表.length ? `<label class="备忘全选"><input type="checkbox" ${全选中 ? 'checked' : ''} onchange="备忘全选(this.checked)">全选</label>` : ''}
      <button class="btn 小 危险" onclick="批量删除备忘()">删除选中（${备忘选中.size}）</button>
      <button class="btn 小 次" onclick="切换备忘删除模式()">退出删除模式</button>
    </div>`;
  }
  const 已完成数 = 列表.filter(m => m.完成).length;
  return `<div class="备忘底栏">
    ${已完成数 ? `<button class="btn 小 次" onclick="清除已完成备忘()">清除已完成（${已完成数}）</button>` : ''}
    ${列表.length ? `<button class="btn 小 次" onclick="切换备忘删除模式()">🗑 删除模式</button>` : ''}
  </div>`;
}
// 只重绘列表区（勾选、切模式），不请求后端
function 重绘备忘列表() {
  const 容器 = document.getElementById('备忘列表');
  if (容器) 容器.innerHTML = 备忘录列表HTML(备忘缓存);
}
// 增删改后拉最新数据，只刷新卡片内部，不整页重渲染（避免闪烁和重复请求 summary）
async function 刷新备忘列表() {
  const 列表 = await api('/api/memos').catch(() => null);
  if (Array.isArray(列表)) 备忘缓存 = 列表;
  for (const id of [...备忘选中]) if (!备忘缓存.some(m => m.id === id)) 备忘选中.delete(id); // 已删的不再留在选中集里
  重绘备忘列表();
  const 数标 = document.getElementById('备忘待办数');
  if (数标) {
    const 待办 = 备忘缓存.filter(m => !m.完成).length;
    数标.textContent = `${待办} 条待办`;
    数标.style.display = 待办 ? '' : 'none';
  }
}
window.切换备忘删除模式 = function() { 备忘删除模式 = !备忘删除模式; 备忘选中.clear(); 重绘备忘列表(); };
window.备忘选中切换 = function(id, 选中) { 选中 ? 备忘选中.add(id) : 备忘选中.delete(id); 重绘备忘列表(); };
window.备忘全选 = function(全选) { 备忘选中.clear(); if (全选) 备忘缓存.forEach(m => 备忘选中.add(m.id)); 重绘备忘列表(); };
window.批量删除备忘 = async function() {
  if (!备忘选中.size) { 提示('请先选中要删除的备忘'); return; }
  if (!confirm(`确定删除选中的 ${备忘选中.size} 条备忘？`)) return;
  const r = await api('/api/memos/delete', { method: 'POST', body: { ids: [...备忘选中] } });
  if (r.错误) { 提示(r.错误); return; }
  备忘选中.clear();
  await 刷新备忘列表(); 提示(`已删除 ${r.删除数 || 0} 条`);
};
window.添加备忘 = async function() {
  const 输入 = document.getElementById('备忘输入');
  const 内容 = 输入.value.trim();
  if (!内容) { 提示('请先输入内容'); return; }
  const r = await api('/api/memos', { method: 'POST', body: { 内容 } });
  if (r.错误) { 提示(r.错误); return; }
  输入.value = ''; 输入.focus();
  await 刷新备忘列表(); 提示('已添加');
};
window.切换备忘完成 = async function(id, 完成) {
  await api('/api/memos/' + id, { method: 'PUT', body: { 完成 } });
  await 刷新备忘列表();
};
window.删除备忘 = async function(id) {
  if (!confirm('确定删除这条备忘？')) return;
  await api('/api/memos/' + id, { method: 'DELETE' });
  await 刷新备忘列表(); 提示('已删除');
};
window.清除已完成备忘 = async function() {
  if (!confirm('确定清除全部已完成的备忘？')) return;
  const r = await api('/api/memos/done', { method: 'DELETE' });
  await 刷新备忘列表(); 提示(`已清除 ${r.删除数 || 0} 条`);
};

// ============ 房间档案 ============
async function 渲染房间(容器) {
  const rooms = await api('/api/rooms');
  const 在租列表 = rooms.filter(r => r.月租金 !== '' && r.月租金 != null);
  容器.innerHTML = `
    <div class="卡片">
      <div class="工具栏"><h2 style="margin:0;flex:1">房间档案（${在租列表.length} 间在租）</h2><button class="btn" onclick="打开房间模态()">+ 添加租户</button></div>
      <div class="表格容器"><table>
        <tr><th>房号</th><th>租客</th><th>电话</th><th class="数字">月租</th><th class="数字">押金</th><th class="数字">房卡押金</th><th>入住日</th><th></th></tr>
        ${在租列表.map(r => `<tr>
          <td><b>${转义(r.房号)}</b></td>
          <td>${转义(r.租客姓名||'')}</td><td>${转义(r.电话||'')}</td>
          <td class="数字">${数字(r.月租金)}</td>
          <td class="数字">${数字(r.押金)}</td>
          <td class="数字">${数字(r.房卡押金)}</td>
          <td>${转义(r.入住日||'—')}</td>
          <td style="white-space:nowrap">
            <button class="btn 小" onclick="打开详情('${转义(r.房号)}')">详情</button>
            <button class="btn 小 危险" onclick="打开退房模态('${转义(r.房号)}')">退房</button>
            <button class="btn 小 次" onclick="打开换房模态('${转义(r.房号)}')">换房</button>
          </td>
        </tr>`).join('')}
        ${在租列表.length ? '' : '<tr><td colspan="8" class="空">暂无在租房间，点右上角「添加租户」录入</td></tr>'}
      </table></div>
    </div>
    ${硬账目卡片(在租列表)}`;
}
// 硬账目：当前在租房间「月租金 + 管理费」的应收总额（满租满月的理论值，不含水电/损耗，也不看实际收没收）
function 硬账目卡片(在租列表) {
  const 合计 = (键) => 在租列表.reduce((和, r) => 和 + (Number(r[键]) || 0), 0);
  const 房租 = 合计('月租金'), 管理费 = 合计('管理费');
  return `<div class="卡片">
    <h2>🧱 硬账目（${在租列表.length} 间在租）</h2>
    <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">当前在租房间的<b>房租 + 管理费</b>应收总额，即满月满租的固定月收入。不含水电、损耗、补缴，也与实际收没收无关。</p>
    <div class="汇总网格">
      <div class="汇总项"><div class="标签">房租合计</div><div class="数值">¥${数字(房租)}</div></div>
      <div class="汇总项"><div class="标签">管理费合计</div><div class="数值">¥${数字(管理费)}</div></div>
      <div class="汇总项 收入"><div class="标签">硬账目合计</div><div class="数值">¥${数字(房租 + 管理费)}</div></div>
    </div>
  </div>`;
}
function 交租日显示(房) { if (!房.入住日) return '—'; const d = Number(String(房.入住日).slice(8, 10)); return d ? d + '号' : '—'; }

// 添加租户表单模式：正常 / 预缴（右上角切换）
let 房间模式 = '正常';
// 房间表单（新增/编辑共用；r 为空则空表单，有值则预填；预缴模式多身份证/预缴金/管理费预缴金）
function 房间表单HTML(r = {}) {
  const 字 = (k, v, 标, 额外 = '') => `<div class="字段"><label>${标 || k}</label><input id="${v}" value="${转义(r[k] ?? '')}" ${额外}></div>`;
  // 租客姓名填完失焦，自动从客人档案带出身份证和电话（重名会弹选择框）
  const 姓名框 = 字('租客姓名', 'f租客', null, `onchange="带出客人('f租客','f身份证','f电话')"`);
  const 数 = (k, v, 标) => `<div class="字段"><label>${标 || k}</label><input id="${v}" type="number" value="${r[k] ?? ''}"></div>`;
  // 水电单价留空 = 跟随「设置 → 数据 → 水电变量」，标签里带上当前变量值，填了才覆盖
  const 水标 = `水费单价（空=默认 ${全局.settings.水价}）`, 电标 = `电费单价（空=默认 ${全局.settings.电价}）`;
  if (房间模式 === '预缴') {
    return `
    <div class="行三">${姓名框}${字('电话', 'f电话')}${字('身份证', 'f身份证')}</div>
    <div class="行">
      <div class="字段"><label>入住日（几号入住=几号交租）</label><input id="f入住" type="date" value="${r.入住日||''}"></div>
      <div class="字段"><label>到期日</label><input id="f到期" type="date" value="${r.到期日||''}"></div>
    </div>
    <div class="行">${数('月租金', 'f月租', '月租金 *')}${数('预缴金', 'f预缴金', '预缴金（房租）')}</div>
    <div class="行">${数('管理费', 'f管理费', '管理费 *')}${数('管理费预缴金', 'f管理费预缴金', '预缴金（管理费）')}</div>
    <div class="行">${数('押金', 'f押金')}${数('房卡押金', 'f房卡押金')}</div>
    <div class="行">${数('水费单价', 'f水单价', 水标)}${数('电费单价', 'f电单价', 电标)}</div>
    <div class="行">${数('水表底度', 'f水底')}${数('电表底度', 'f电底')}</div>
    ${字('备注', 'f备注')}`;
  }
  return `
    <div class="行三">${姓名框}${字('电话', 'f电话')}${字('身份证', 'f身份证')}</div>
    <div class="行">
      <div class="字段"><label>入住日（几号入住=几号交租）</label><input id="f入住" type="date" value="${r.入住日||''}"></div>
      <div class="字段"><label>到期日</label><input id="f到期" type="date" value="${r.到期日||''}"></div>
    </div>
    <div class="行四">${数('月租金', 'f月租', '月租金 *')}${数('押金', 'f押金')}${数('房卡押金', 'f房卡押金')}${数('管理费', 'f管理费', '管理费 *')}</div>
    <div class="行">${数('水费单价', 'f水单价', 水标)}${数('电费单价', 'f电单价', 电标)}</div>
    <div class="行">${数('水表底度', 'f水底')}${数('电表底度', 'f电底')}</div>
    ${字('备注', 'f备注')}`;
}
function 收集房间数据() {
  return {
    月租金: document.getElementById('f月租').value, 押金: document.getElementById('f押金').value,
    管理费: document.getElementById('f管理费').value, 房卡押金: document.getElementById('f房卡押金').value,
    水费单价: document.getElementById('f水单价').value, 电费单价: document.getElementById('f电单价').value,
    水表底度: document.getElementById('f水底').value, 电表底度: document.getElementById('f电底').value,
    租客姓名: document.getElementById('f租客').value, 电话: document.getElementById('f电话').value,
    // 从客人档案带出来的话记着来源，改了字段就覆盖那条（后端不会把这个字段存进房间）
    档案id: document.getElementById('f租客').dataset.档案id ? Number(document.getElementById('f租客').dataset.档案id) : null,
    身份证: document.getElementById('f身份证')?.value || '',
    预缴金: document.getElementById('f预缴金')?.value || '',
    管理费预缴金: document.getElementById('f管理费预缴金')?.value || '',
    入住日: document.getElementById('f入住').value, 到期日: document.getElementById('f到期').value,
    备注: document.getElementById('f备注').value
  };
}
window.打开房间模态 = async function(预设房号, 已选房号) {
  const [rooms, 房源] = await Promise.all([api('/api/rooms'), api('/api/houses')]);
  const 在租房号 = new Set(rooms.filter(r => r.月租金 !== '' && r.月租金 != null).map(r => r.房号));
  // 与总览「空置房间」口径一致：排除在租 + 日租房/自住房（见 server.js 的 /api/summary），
  // 否则自住房/日租房也会出现在添加租户的下拉里
  const 空置房号 = 房源.filter(h => !在租房号.has(h.房号) && h.房型 !== '日租' && h.房型 !== '自住房').map(h => h.房号);
  // 从空置房「出租」进入时锁定房号；点「+ 新增房间」时下拉选空置房号
  const 房号控件 = 预设房号
    ? `<input id="f房号" value="${转义(预设房号)}" disabled>`
    : `<select id="f房号"><option value="">请选择房号</option>${空置房号.map(f => `<option ${f === (已选房号 || '') ? 'selected' : ''}>${转义(f)}</option>`).join('')}</select>`;
  const 房号行 = `<div class="字段" style="text-align:center"><label>房号 *</label><div style="display:flex;justify-content:center">${房号控件}</div></div>`;
  打开模态(`<h2>${预设房号 ? `出租房间 ${转义(预设房号)}` : '添加租户'}</h2>
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px">
      <button class="btn 行内 ${房间模式==='正常'?'':'次'}" onclick="切房间模式('正常')">正常模式</button>
      <button class="btn 行内 ${房间模式==='预缴'?'':'次'}" onclick="切房间模式('预缴')">预缴模式</button>
    </div>
    <div class="表单块">
      ${房号行}
      ${房间表单HTML()}
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" onclick="保存房间()">保存</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
};
window.切房间模式 = function(模式) {
  房间模式 = 模式;
  const 房号 = document.getElementById('f房号');
  const 锁定 = 房号 && 房号.disabled;
  const 值 = 房号 ? 房号.value : '';
  关闭模态(); // 先关闭旧模态，避免叠加导致取消失效
  打开房间模态(锁定 ? 值 : undefined, 锁定 ? undefined : 值);
};
window.保存房间 = async function() {
  const 数据 = { 房号: document.getElementById('f房号').value, ...收集房间数据() };
  if (!数据.房号) { 提示('请选择房号'); return; }
  if (!(await 询问确认('确认保存？', `${转义(数据.房号)}　出租信息`))) return;
  const r = await api('/api/rooms', { method: 'POST', body: 数据 });
  if (r.错误) { 提示(r.错误); return; }
  提示('已保存'); 关闭模态(); 渲染();
};
// 编辑在租房间（房号锁定，走 PUT 更新）
window.打开编辑模态 = async function(房号) {
  const rooms = await api('/api/rooms');
  const r = rooms.find(x => x.房号 === 房号);
  if (!r) return;
  打开模态(`<h2>编辑房间 ${转义(房号)}</h2>
    <div class="表单块">
      <div class="字段"><label>房号</label><input id="f房号" value="${转义(房号)}" disabled></div>
      ${房间表单HTML(r)}
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" onclick="保存编辑('${转义(房号)}')">保存</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
};
window.保存编辑 = async function(房号) {
  const rooms = await api('/api/rooms');
  const r = rooms.find(x => x.房号 === 房号);
  if (!r) return;
  if (!(await 询问确认('确认保存？', `${转义(房号)}　房间信息修改`))) return;
  await api(`/api/rooms/${r.id}`, { method: 'PUT', body: 收集房间数据() }); // 房号由 URL 定位，不可改
  提示('已保存'); 关闭模态(); 渲染();
};
// 房间详情弹框（完整字段，左→右排列）
window.打开详情 = async function(房号) {
  const rooms = await api('/api/rooms');
  const r = rooms.find(x => x.房号 === 房号);
  if (!r) return;
  const 行 = (k, v) => `<div class="详情项"><span class="详情键">${k}</span><span class="详情值">${转义(v == null || v === '' ? '—' : v)}</span></div>`;
  const 金额 = (v) => (v !== '' && v != null) ? 数字(v) : '';
  打开模态(`<h2>房间详情 ${转义(房号)}</h2>
    <div class="详情格">
      ${行('租客', r.租客姓名)}${行('电话', r.电话)}
      ${行('入住日', r.入住日)}${行('到期日', r.到期日)}
      ${行('月租金', 金额(r.月租金))}${行('押金', 金额(r.押金))}
      ${行('房卡押金', 金额(r.房卡押金))}${行('管理费', 金额(r.管理费))}
      ${行('水费单价', r.水费单价 || '默认')}${行('电费单价', r.电费单价 || '默认')}
      ${行('水表底度', r.水表底度)}${行('电表底度', r.电表底度)}
      ${行('备注', r.备注)}
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" onclick="关闭模态();打开编辑模态('${转义(房号)}')">编辑</button>
      <button class="btn 次" onclick="请求关闭模态()">关闭</button>
    </div>`);
};
window.删除房源 = async function(id) { if (!confirm('确定删除这个房源？')) return; const r = await api(`/api/houses/${id}`, { method: 'DELETE' }); if (r.错误) { 提示(r.错误); return; } 提示('已删除'); 渲染(); };

window.打开退房模态 = async function(房号) {
  const [rooms, meters] = await Promise.all([api('/api/rooms'), api('/api/meters')]);
  const 房 = rooms.find(r => r.房号 === 房号);
  const 该房抄表 = meters.filter(m => m.房号 === 房号).sort((a, b) => (a.日期 || '').localeCompare(b.日期 || ''));
  // 与水电抄表页面同源（都读 meters 流水）：
  // 上月水表 = 实际的「上月」抄表（倒数第二条），无则用房间初始底度
  const 上月抄表 = 该房抄表[该房抄表.length - 2];
  const 上月水底 = 上月抄表 ? 上月抄表.水表 : (房?.水表底度 ?? '');
  const 上月电底 = 上月抄表 ? 上月抄表.电表 : (房?.电表底度 ?? '');
  // 退房底度 = 自动填「上次抄表」（最近一条），可手动改成退房当天实际读数
  const 上次抄表 = 该房抄表[该房抄表.length - 1];
  const 退房水底 = 上次抄表 ? 上次抄表.水表 : '';
  const 退房电底 = 上次抄表 ? 上次抄表.电表 : '';
  // 预缴房间（有房租预缴或管理费预缴）退房时显示「留存金额」
  const 预缴房 = 房 && ((Number(房.预缴金) || 0) > 0 || (Number(房.管理费预缴金) || 0) > 0);
  打开模态(`<h2>退房 —— ${转义(房号)}</h2>
    <div class="表单块">
      <div class="字段"><label>退房日期</label><input id="退日期" type="date" value="${今天()}"></div>
      <div class="行">
        <div class="字段"><label>手机</label><input id="退电话" value="${转义(房?.电话 || '')}"></div>
        <div class="字段"><label>身份证</label><input id="退身份证" value="${转义(房?.身份证 || '')}"></div>
      </div>
      <div class="行">
        <div class="字段"><label style="font-weight:600"><input type="checkbox" id="退押金" checked style="margin-right:6px">押金（勾选后退还）</label></div>
        <div class="字段"><label style="font-weight:600"><input type="checkbox" id="退房卡押金" checked style="margin-right:6px">房卡押金（勾选后退还）</label></div>
      </div>
      ${预缴房 ? `<div class="字段"><label>留存金额（预缴剩余）</label><input id="退留存" type="number" placeholder="0（没有就留空）"></div>` : ''}
      <div class="行四">
        <div class="字段"><label>上月水表</label><input id="退上月水" type="number" value="${上月水底}"></div>
        <div class="字段"><label>退房时水表底度</label><input id="退水底" type="number" value="${退房水底}"></div>
        <div class="字段"><label>上月电表</label><input id="退上月电" type="number" value="${上月电底}"></div>
        <div class="字段"><label>退房时电表底度</label><input id="退电底" type="number" value="${退房电底}"></div>
      </div>
      <div class="字段"><label>退房卫生费</label><input id="退卫生费" type="number" placeholder="0（不收就留空）"></div>
      <div class="行">
        <div class="字段"><label>房间损耗（说明）</label><input id="退损耗说明" placeholder="如：墙壁损坏、床垫破损"></div>
        <div class="字段"><label>房间损耗（金额）</label><input id="退损耗" type="number" placeholder="0（没损耗就留空）"></div>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn 危险" onclick="确认退房('${转义(房号)}')">确认退房</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
};
window.确认退房 = async function(房号) {
  const body = { 房号, 日期: document.getElementById('退日期').value, 上月水底: document.getElementById('退上月水').value, 上月电底: document.getElementById('退上月电').value, 退房水底: document.getElementById('退水底').value, 退房电底: document.getElementById('退电底').value, 退房卫生费: document.getElementById('退卫生费').value, 房间损耗: document.getElementById('退损耗').value, 损耗说明: document.getElementById('退损耗说明').value, 退押金: document.getElementById('退押金')?.checked ?? true, 退房卡押金: document.getElementById('退房卡押金')?.checked ?? true, 留存金额: document.getElementById('退留存')?.value || 0, 电话: document.getElementById('退电话')?.value || '', 身份证: document.getElementById('退身份证')?.value || '' };
  if (!(await 询问确认('确认退房？', `${转义(房号)}　退房后房间变空置，结算结果见退租结算单`))) return;
  const r = await api('/api/checkout', { method: 'POST', body });
  if (r.错误) { 提示(r.错误); return; }
  // 退还流水已由后端 /api/checkout 自动写入（含流水 id 关联，撤销退房时一并删除）
  提示(`退房完成，退入 ¥${数字(r.退入金额)}`); 关闭模态(); 渲染();
};
window.打开换房模态 = function(原房号) {
  打开模态(`<h2>换房 —— ${转义(原房号)} 换到</h2>
    <div class="表单块">
      <div class="字段"><label>新换的房号</label><input id="换新房号"></div>
      <div class="行">
        <div class="字段"><label>新房水表底度</label><input id="换水底" type="number"></div>
        <div class="字段"><label>新房电表底度</label><input id="换电底" type="number"></div>
      </div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" onclick="确认换房('${转义(原房号)}')">确认换房</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
};
window.确认换房 = async function(原房号) {
  const body = { 原房号, 新房号: document.getElementById('换新房号').value, 新水底: document.getElementById('换水底').value, 新电底: document.getElementById('换电底').value };
  if (!body.新房号) { 提示('请填新房号'); return; }
  if (!(await 询问确认('确认换房？', `${转义(原房号)}　换到 ${转义(body.新房号)}`))) return;
  const r = await api('/api/switch', { method: 'POST', body });
  if (r.错误) { 提示(r.错误); return; }
  提示(`已换到 ${body.新房号}`); 关闭模态(); 渲染();
};

// ============ 水电抄表 ============
async function 渲染抄表(容器) {
  const 月份 = 全局.settings.当前月份;
  const [所有抄表, 未抄, rooms] = await Promise.all([api('/api/meters'), api(`/api/meters/missing?month=${月份}`), api('/api/rooms')]);
  // 未抄表只显示「未来两天要抄」+「今天及之前已到期未抄」，按交租日升序（无交租日排最后）
  const 今天 = new Date();
  const 未来两天 = new Date(今天.getFullYear(), 今天.getMonth(), 今天.getDate() + 2).getTime();
  const 未抄表列表 = 未抄
    .map(x => ({ ...x, 交租日期: x.交租日 ? new Date(`${月份}-${String(x.交租日).padStart(2, '0')}T00:00:00`).getTime() : null }))
    .filter(x => x.交租日期 == null || x.交租日期 <= 未来两天)
    .sort((a, b) => (a.交租日期 ?? Infinity) - (b.交租日期 ?? Infinity));
  容器.innerHTML = `
    <div class="卡片">
      <h2>🔔 未抄表（${未抄表列表.length}）</h2>
      ${未抄表列表.length ? `<div class="表格容器"><table>
        <tr><th>房号</th><th>租客</th><th>交租日</th><th class="数字">上月水表</th><th class="数字">本月水表</th><th class="数字">上月电表</th><th class="数字">本月电表</th><th></th></tr>
        ${未抄表列表.map(x => `<tr><td><b>${转义(x.房号)}</b></td><td>${转义(x.租客)}</td><td>${x.交租日 ? x.交租日 + '号' : '—'}</td>
          <td class="数字">${x.上月水表 ?? ''}</td><td class="数字"><input type="number" class="抄表输入" id="快水${转义(x.房号)}" placeholder="本月底数"></td>
          <td class="数字">${x.上月电表 ?? ''}</td><td class="数字"><input type="number" class="抄表输入" id="快电${转义(x.房号)}" placeholder="本月底数"></td>
          <td><button class="btn 行内" onclick="快速抄表('${转义(x.房号)}')">记录</button></td></tr>`).join('')}</table></div>`
        : '<div class="空">本月全部已抄表 ✓</div>'}
    </div>
    <div class="卡片">
      <h2>抄表记录（搜索）</h2>
      <div class="工具栏"><input id="抄表搜房号" placeholder="按房号搜索" style="width:140px"><input type="month" id="抄表搜日期" style="width:150px"><label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--次文字);cursor:pointer;white-space:nowrap"><input type="checkbox" ${启用删除?'checked':''} onchange="启用删除=this.checked;渲染()" style="cursor:pointer">删除模式</label><span id="抄表计数" style="color:var(--次文字);font-size:13px"></span></div>
      <div class="表格容器"><table id="抄表记录表">
        <tr><th>房号</th><th>日期</th><th class="数字">上月水表</th><th class="数字">本月水表</th><th class="数字">上月电表</th><th class="数字">本月电表</th><th></th></tr>
      </table></div>
    </div>`;
  window.所有抄表数据 = 所有抄表;
  // 房号 → 房间底度，用于第一条抄表记录的「上月底度」
  window.房间底度 = {};
  for (const r of rooms) if (r.月租金 !== '' && r.月租金 != null) window.房间底度[r.房号] = { 水: r.水表底度, 电: r.电表底度 };
  过滤抄表();
  document.getElementById('抄表搜房号').addEventListener('input', 过滤抄表);
  document.getElementById('抄表搜日期').addEventListener('change', 过滤抄表);
}
window.过滤抄表 = function() {
  const 房号词 = (document.getElementById('抄表搜房号')?.value || '').trim().toLowerCase();
  const 日期词 = (document.getElementById('抄表搜日期')?.value || '').trim();
  const 数据 = window.所有抄表数据 || [];
  const 底度 = window.房间底度 || {};
  // 计算每房每条记录的「上月底度」：同房按日期排序后，上月底度 = 前一条读数（无前条则用房间底度）
  const 按房 = {};
  for (const m of 数据) (按房[m.房号] = 按房[m.房号] || []).push(m);
  for (const 房号 in 按房) 按房[房号].sort((a, b) => (a.日期 || '').localeCompare(b.日期 || '') || (a.id || 0) - (b.id || 0));
  const 上月 = {};
  for (const 房号 in 按房) {
    let 前 = null;
    for (const m of 按房[房号]) { 上月[m.id] = { 水: 前 ? 前.水表 : (底度[房号]?.水 ?? ''), 电: 前 ? 前.电表 : (底度[房号]?.电 ?? '') }; 前 = m; }
  }
  const 列表 = 数据.filter(m => (!房号词 || String(m.房号).toLowerCase().includes(房号词)) && (!日期词 || String(m.日期).startsWith(日期词)));
  列表.sort((a, b) => (b.id || 0) - (a.id || 0)); // 最新录入的抄表排最前
  const 表 = document.getElementById('抄表记录表');
  表.innerHTML = `<tr><th>房号</th><th>日期</th><th class="数字">上月水表</th><th class="数字">本月水表</th><th class="数字">上月电表</th><th class="数字">本月电表</th><th></th></tr>` +
    (列表.length ? 列表.map(m => `<tr><td><b>${转义(m.房号)}</b></td><td>${转义(m.日期)}</td><td class="数字">${(上月[m.id] || {}).水 ?? ''}</td><td class="数字">${m.水表 ?? ''}</td><td class="数字">${(上月[m.id] || {}).电 ?? ''}</td><td class="数字">${m.电表 ?? ''}</td><td>${启用删除 ? `<button class="btn 行内 危险" onclick="撤销抄表记录('${转义(m.房号)}','${转义(m.日期)}')">撤销</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="空">无记录</td></tr>');
  const 计数 = document.getElementById('抄表计数');
  if (计数) 计数.textContent = (房号词 || 日期词) ? `匹配 ${列表.length} 条` : '';
};
window.快速抄表 = async function(房号) {
  const 水 = document.getElementById('快水' + 房号).value, 电 = document.getElementById('快电' + 房号).value;
  if (水 === '' && 电 === '') { 提示('请填读数'); return; }
  await api('/api/meters', { method: 'POST', body: { 房号, 水表: 水 === '' ? null : 水, 电表: 电 === '' ? null : 电 } });
  提示('已记录'); 渲染();
};
window.撤销抄表记录 = async function(房号, 日期) {
  const 月份 = String(日期 || '').slice(0, 7);
  if (!confirm(`确定撤销 ${房号} ${月份} 最后一条抄表记录？`)) return;
  await api(`/api/meters/undo?房号=${房号}&月份=${月份}`, { method: 'DELETE' });
  提示('已撤销'); 渲染();
};

// ============ 租客账单 ============
let 账单日期 = 今天(); let 账单搜索房号 = ''; let 账单搜索范围 = '本月'; let 账单指定月 = '';
async function 渲染租客账单(容器) {
  const 日 = Number(账单日期.slice(8, 10));
  const 全部 = 账单搜索范围 === '全部';
  const 查询月 = 账单搜索范围 === '指定' ? (账单指定月 || 全局.settings.当前月份) : 全局.settings.当前月份;
  容器.innerHTML = `
    <div class="卡片">
      <h2>租客账单</h2>
      <div class="工具栏">
        <input id="账单搜房号" placeholder="按房号搜索" value="${转义(账单搜索房号)}" style="width:140px" onchange="账单搜索房号=this.value;渲染()">
        <select onchange="账单搜索范围=this.value;渲染()">
          <option value="本月" ${账单搜索范围==='本月'?'selected':''}>本月</option>
          <option value="全部" ${账单搜索范围==='全部'?'selected':''}>全部</option>
          <option value="指定" ${账单搜索范围==='指定'?'selected':''}>指定月份</option>
        </select>
        ${账单搜索范围==='指定' ? `<input type="month" value="${查询月}" onchange="账单指定月=this.value;渲染()">` : ''}
        <input type="date" value="${账单日期}" onchange="账单日期=this.value;渲染()">
      </div>
      <div id="租客账单列表">加载中…</div>
    </div>`;
  const 参数 = new URLSearchParams();
  if (账单搜索房号) 参数.set('房号', 账单搜索房号);
  if (全部) 参数.set('全部', '1');
  else { 参数.set('month', 查询月); if (日) 参数.set('day', 日); }
  const 账单 = await api(`/api/bills?${参数.toString()}`);
  const el = document.getElementById('租客账单列表');
  if (!账单.length) { el.innerHTML = '<div class="空">没有匹配的账单</div>'; return; }
  el.innerHTML = 账单.map(b => {
    const 未抄 = b.状态 === '未交' && !b.可计算;
    const 免算 = b.当月新租 && b.本月水底 == null; // 当月新租且无本月抄表：水电免算
    const 水电可用 = !未抄 && !免算; // 有抄表读数才显示水电底度明细
    return `<div class="账单卡">
      <div class="账单卡头">
        <b class="头日期">${中文日期(b.交租日期)}</b>
        <b class="房号">房号：${转义(b.房号)}</b>
        <span class="单标题">（房租缴纳单）</span>
      </div>

      <div class="房租单明细">
        <div class="明细行">
          <span class="明细标签"><span class="标签名">水费详细（${精金额(b.水费单价)}元/方）</span><span class="冒号">：</span></span>
          <span class="明细底度">${b.上月水底 ?? '—'} → ${b.本月水底 ?? '—'}</span>
          <span class="明细金额"><span class="金额词">金额：</span><b class="钱数">${水电可用 ? '¥' + 精金额(b.水费) : '—'}</b></span>
        </div>
        <div class="明细行">
          <span class="明细标签"><span class="标签名">电费详细（${精金额(b.电费单价)}元/度）</span><span class="冒号">：</span></span>
          <span class="明细底度">${b.上月电底 ?? '—'} → ${b.本月电底 ?? '—'}</span>
          <span class="明细金额"><span class="金额词">金额：</span><b class="钱数">${水电可用 ? '¥' + 精金额(b.电费) : '—'}</b></span>
        </div>
        <div class="明细行">
          <span class="明细标签"><span class="标签名 备注名">备注信息</span><span class="冒号">：</span></span>
          <span class="明细底度"><input id="损${转义(b.房号)}说明" class="抄表输入" value="${转义(b.损耗说明||'')}" placeholder="备注说明" onchange="改损耗说明('${转义(b.房号)}','${b.月份}',this.value)"></span>
          <span class="明细金额"><span class="金额词">金额：</span><input id="损${转义(b.房号)}金额" type="number" class="抄表输入 钱数" value="${b.房间损耗 || ''}" placeholder="0" onchange="改损耗('${转义(b.房号)}','${b.月份}',this.value)"></span>
        </div>
      </div>

      <div class="汇总行">
        <span>租金 <b>¥${数字(b.房租)}</b></span>
        <span>管理费 <b>¥${数字(b.管理费)}</b></span>
        <span>水费 <b>${水电可用 ? '¥' + 数字(b.水费) : '—'}</b></span>
        <span>电费 <b>${水电可用 ? '¥' + 数字(b.电费) : '—'}</b></span>
        <span>其它 <b>¥${数字(b.房间损耗)}</b></span>
        ${b.结转 ? `<span>上月结转 <b>¥${数字(b.结转)}</b></span>` : ''}
        <span class="应付"><span class="金额词">应付：</span><b class="钱数">${未抄 ? '—' : '¥' + 数字(b.应付租金)}</b></span>
      </div>

      ${未抄 ? '<div class="账单底度">水电未抄，无法计算</div>' : ''}
      ${免算 ? '<div class="账单底度">当月新租，水电免算</div>' : ''}
      ${b.转下月 ? `<div class="账单底度" style="color:var(--红)">本月已欠费滚存 ¥${数字(b.转下月)} 到下月</div>` : ''}
      ${b.状态==='欠款' ? `<div class="账单底度" style="color:var(--红)">欠 ¥${数字(b.欠款)}</div>` : ''}
      ${b.房间备注 ? `<div class="账单备注">📝 房间备注：${转义(b.房间备注)}</div>` : ''}
    </div>`;
  }).join('');
}
window.改损耗说明 = async function(房号, 月份, 值) {
  await api('/api/bills/collect', { method: 'POST', body: { 房号, 月份, 损耗说明: 值 } });
};
window.改损耗 = async function(房号, 月份, 值) {
  await api('/api/bills/collect', { method: 'POST', body: { 房号, 月份, 房间损耗: 值 } });
  渲染租客账单(document.getElementById('内容'));
};

// ============ 账单（总账单 + 月度账单） ============
let 账单tab = '月度账单'; let 汇总类型 = '月租'; let 汇总月份 = null; let 账单状态筛选 = '全部';
let 日租视图 = '表格'; let 日租搜索日 = '';
let 日租姓名筛选 = ''; let 日租房号筛选 = '';   // 只作用在日租的「表格模式」，图表模式按天汇总金额、不看客人
async function 渲染账单(容器) {
  if (!汇总月份) 汇总月份 = 全局.settings.当前月份;
  容器.innerHTML = `
    <div class="tab栏">
      <button class="${账单tab==='月度账单'?'激活':''}" onclick="账单tab='月度账单';渲染()">月度账单</button>
      <button class="${账单tab==='总账单'?'激活':''}" onclick="账单tab='总账单';渲染()">总账单</button>
    </div>
    <div id="账单tab内容"></div>`;
  const el = document.getElementById('账单tab内容');
  if (账单tab === '总账单') await 渲染总账单(el); else await 渲染月度账单明细(el);
}
async function 渲染总账单(el) {
  const 月 = 汇总月份;
  const [s, 账单, daily, 支出] = await Promise.all([
    api(`/api/summary?month=${月}`), api(`/api/bills?month=${月}`), api(`/api/daily?month=${月}`), api(`/api/transactions?month=${月}`)
  ]);
  el.innerHTML = `
    <div class="卡片"><div class="工具栏">
      <input type="month" value="${月}" onchange="汇总月份=this.value;渲染()">
      <button class="btn 次" onclick="汇总月份=加月('${月}',-1);渲染()">上月</button>
      <button class="btn 次" onclick="汇总月份=全局.settings.当前月份;渲染()">本月</button>
      <button class="btn 次" onclick="汇总月份=加月('${月}',1);渲染()">次月</button>
      <button class="btn" onclick="显示全部账单()">全部账单</button>
    </div></div>
    <div class="卡片"><h2>总账单（${月}）</h2>
      <div class="汇总网格">
        <div class="汇总项 收入"><div class="标签">月租总收</div><div class="数值">¥${数字(s.月租已收)}</div></div>
        <div class="汇总项 收入"><div class="标签">日租总收</div><div class="数值">¥${数字(s.日租已收)}</div></div>
        <div class="汇总项 支出"><div class="标签">支出</div><div class="数值">¥${数字(s.支出)}</div></div>
        <div class="汇总项 支出"><div class="标签">工资</div><div class="数值">¥${数字(s.工资)}</div></div>
        <div class="汇总项"><div class="标签">合计</div><div class="数值">¥${数字(s.合计)}</div></div>
      </div>
    </div>`;
}
let 账单月份筛选 = ''; let 账单盈亏筛选 = '全部'; let 账单排序字段 = '';
window.显示全部账单 = async function() {
  const el = document.getElementById('账单tab内容');
  el.innerHTML = '<div class="空">加载中…</div>';
  const 全部 = await api('/api/all');
  // 工资按「设置 → 数据 → 工资变量」的分段计算（与后端 /api/summary 同一算法，口径一致）
  const 分段 = (全部.settings.工资分段 || []).filter(x => x && x.起始月份).sort((a, b) => String(a.起始月份).localeCompare(String(b.起始月份)));
  const 月工资 = m => { const 命中 = 分段.filter(x => String(x.起始月份) <= m); return 命中.length ? Number(命中[命中.length - 1].金额) || 0 : 0; };
  // 房租支出：每半年 150000（2023-03~2026-08）月摊 25000，2026-09 起每半年 110000 月摊 18333
  const 半年第几月 = m => { const 月 = Number(m.slice(5, 7)); return (月 >= 3 && 月 <= 8) ? 月 - 2 : (月 >= 9 ? 月 - 8 : 月 + 4); };
  // 房租支出：每半年 150000（2023-03~2026-08）月摊 25000；2026-09 起每半年 110000，前 5 月各 18333、第 6 月 18335 补齐差额
  const 月房租 = m => m >= '2026-09' ? (半年第几月(m) <= 5 ? 18333 : 18335) : (m >= '2023-03' ? 25000 : 0);
  // 只汇总历史总账单（当月不记录，切月后固化进历史才显示）
  const 结果 = (全部.历史总账单 || []).map(h => ({ 月份: h.月份, 月租总收: h.月租, 日租总收: h.日租, 支出原始: h.支出 })).sort((a, b) => a.月份.localeCompare(b.月份));
  // 计算财务指标
  for (const r of 结果) {
    r.工资 = 月工资(r.月份);
    // 业务规则：支出列从 2024-03 起每月减 4000（把工资从支出里减出来），工资列仍照扣 4000
    r.支出 = (r.支出原始 || 0) - (r.月份 >= '2024-03' ? 4000 : 0);
    r.房租支出 = 月房租(r.月份);
    r.利润 = (r.月租总收 || 0) + (r.日租总收 || 0) - r.支出 - r.工资; // 利润 = 收入 − 支出 − 工资（不含房租支出）
    r.净利润 = r.利润 - r.房租支出;
  }
  window.全部账单数据 = 结果;
  el.innerHTML = `<div class="卡片" id="全部账单透视区"></div>
    <div class="卡片">
      <div class="工具栏">
        <button class="btn 次" onclick="账单tab='总账单';渲染()">返回</button>
        <input type="month" id="账单月份搜" value="${账单月份筛选}" onchange="账单月份筛选=this.value;渲染全部账单表()" title="按月份筛选">
        <select id="账单盈亏筛" onchange="账单盈亏筛选=this.value;渲染全部账单表()">
          <option value="全部" ${账单盈亏筛选==='全部'?'selected':''}>全部</option>
          <option value="盈利" ${账单盈亏筛选==='盈利'?'selected':''}>盈利</option>
          <option value="亏本" ${账单盈亏筛选==='亏本'?'selected':''}>亏本</option>
        </select>
        <select id="账单排序选" onchange="账单排序字段=this.value;渲染全部账单表()">
          <option value="" ${账单排序字段===''?'selected':''}>默认排序</option>
          <option value="净利润" ${账单排序字段==='净利润'?'selected':''}>按净利润</option>
          <option value="日租" ${账单排序字段==='日租'?'selected':''}>按日租</option>
          <option value="月租" ${账单排序字段==='月租'?'selected':''}>按月租</option>
          <option value="支出" ${账单排序字段==='支出'?'selected':''}>按支出</option>
        </select>
      </div>
      <h2>全部账单</h2>
      <div id="全部账单表区"></div>
    </div>`;
  渲染全部账单表();
};
window.渲染全部账单表 = function() {
  const 数据 = window.全部账单数据 || [];
  let 列表 = 数据;
  if (账单月份筛选) 列表 = 列表.filter(r => r.月份 === 账单月份筛选);
  if (账单盈亏筛选 === '盈利') 列表 = 列表.filter(r => r.净利润 >= 0);
  if (账单盈亏筛选 === '亏本') 列表 = 列表.filter(r => r.净利润 < 0);
  if (账单排序字段) {
    const 字段 = { '净利润': '净利润', '日租': '日租总收', '月租': '月租总收', '支出': '支出' }[账单排序字段];
    列表 = [...列表].sort((a, b) => (b[字段] || 0) - (a[字段] || 0));
  }
  const 表区 = document.getElementById('全部账单表区');
  if (表区) {
    表区.innerHTML = `<div class="表格容器"><table class="斑马">
      <tr><th>月份</th><th class="数字">月租总收</th><th class="数字">日租总收</th><th class="数字">支出(减工资)</th><th class="数字">工资</th><th class="数字">利润</th><th class="数字">房租支出</th><th class="数字">净利润</th></tr>
      ${列表.map(r => `<tr><td><b>${r.月份}</b></td><td class="数字">¥${数字(r.月租总收)}</td><td class="数字">¥${数字(r.日租总收)}</td><td class="数字">¥${数字(r.支出)}</td><td class="数字">¥${数字(r.工资)}</td><td class="数字">¥${数字(r.利润)}</td><td class="数字">¥${数字(r.房租支出)}</td><td class="数字">¥${数字(r.净利润)}</td></tr>`).join('')}
      ${列表.length?'':'<tr><td colspan="8" class="空">无匹配数据</td></tr>'}
    </table></div>`;
  }
  const 透视区 = document.getElementById('全部账单透视区');
  if (透视区) {
    const 总利润 = 列表.reduce((s, r) => s + r.利润, 0);
    const 房租支出之和 = 列表.reduce((s, r) => s + r.房租支出, 0);
    const 总净利润 = 列表.reduce((s, r) => s + r.净利润, 0);
    透视区.innerHTML = `<h2>透视表（累计）</h2>
      <div class="汇总网格">
        <div class="汇总项 收入"><div class="标签">总利润</div><div class="数值">¥${数字(总利润)}</div></div>
        <div class="汇总项 支出"><div class="标签">房租支出之和</div><div class="数值">¥${数字(房租支出之和)}</div></div>
        <div class="汇总项"><div class="标签">净利润</div><div class="数值">¥${数字(总净利润)}</div></div>
      </div>`;
  }
};
// 日租按天搜索：选了哪天就把月份一起跳过去，免得选的日子不在当前月、结果一条都搜不出来
window.选日租日 = function(值) {
  日租搜索日 = 值 || '';
  if (日租搜索日) 汇总月份 = 日租搜索日.slice(0, 7);
  渲染();
};
window.删除账单 = async function(房号, 月份) {
  if (!confirm(`确定删除 ${房号} ${月份} 的账单记录？`)) return;
  await api(`/api/bills?房号=${房号}&月份=${月份}`, { method: 'DELETE' });
  提示('已删除'); 渲染();
};
async function 渲染月度账单明细(el) {
  const 月 = 汇总月份;
  el.innerHTML = `
    <div class="卡片"><div class="工具栏">
      <select onchange="汇总类型=this.value;渲染()">
        <option ${汇总类型==='月租'?'selected':''}>月租</option>
        <option ${汇总类型==='日租'?'selected':''}>日租</option>
        <option ${汇总类型==='支出'?'selected':''}>支出</option>
      </select>
      ${汇总类型 === '日租'
        // 日租：月份框换成年月日框，留空 = 看整月（标题里写着是哪个月），选了日子就只看那一天
        ? `<input type="date" value="${日租搜索日}" onchange="选日租日(this.value)" title="按天搜索，留空看整月">
           ${日租搜索日 ? `<button class="btn 次" onclick="日租搜索日='';渲染()">清除</button>` : ''}
           ${日租视图 === '表格' ? `
             <input value="${转义(日租姓名筛选)}" placeholder="客人姓名" style="width:110px" oninput="日租姓名筛选=this.value" onchange="渲染()" onkeydown="if(event.key==='Enter'&&!event.isComposing)渲染()">
             <input value="${转义(日租房号筛选)}" placeholder="房号" style="width:90px" oninput="日租房号筛选=this.value" onchange="渲染()" onkeydown="if(event.key==='Enter'&&!event.isComposing)渲染()">
             ${(日租姓名筛选 || 日租房号筛选) ? `<button class="btn 次" onclick="日租姓名筛选='';日租房号筛选='';渲染()">清空筛选</button>` : ''}` : ''}`
        : `<input type="month" value="${月}" onchange="汇总月份=this.value;渲染()">`}
      ${汇总类型 === '月租' ? `<select onchange="账单状态筛选=this.value;渲染()">
        <option value="全部" ${账单状态筛选==='全部'?'selected':''}>全部状态</option>
        <option value="已核收" ${账单状态筛选==='已核收'?'selected':''}>已核收</option>
        <option value="未交" ${账单状态筛选==='未交'?'selected':''}>未交</option>
        <option value="欠款" ${账单状态筛选==='欠款'?'selected':''}>欠款</option>
        <option value="未出租" ${账单状态筛选==='未出租'?'selected':''}>未出租</option>
      </select>` : ''}
      <button class="btn 次" onclick="汇总月份=加月('${月}',-1);渲染()">上月</button>
      <button class="btn 次" onclick="汇总月份=全局.settings.当前月份;渲染()">本月</button>
      <button class="btn 次" onclick="汇总月份=加月('${月}',1);渲染()">次月</button>
      ${汇总类型 === '日租' ? `<button class="btn 次" onclick="日租视图='${日租视图==='表格'?'图表':'表格'}';渲染()">${日租视图==='表格'?'图表模式':'表格模式'}</button>` : ''}
    </div></div>`;
  if (汇总类型 === '月租') {
    const 账单 = await api(`/api/bills?month=${月}`);
    el.innerHTML += 月租表HTML(账单, 月, true);
  } else if (汇总类型 === '日租') {
    let daily = await api(`/api/daily?month=${月}`);
    if (日租搜索日) daily = daily.filter(d => d.日期 === 日租搜索日);
    const 姓 = 日租姓名筛选.trim(), 房 = 日租房号筛选.trim();
    const 有筛选 = 日租视图 === '表格' && (姓 || 房);
    // 姓名/房号只筛表格模式；图表模式按天汇总金额，按用户要求不动
    const 表格数据 = 有筛选
      ? daily.filter(d => (!姓 || String(d.客人 || '').includes(姓)) && (!房 || String(d.房号 || '').includes(房)))
      : daily;
    const 合计 = (日租视图 === '表格' ? 表格数据 : daily).reduce((s, d) => s + (Number(d.金额) || 0), 0);
    const 筛选说明 = 有筛选 ? ` · 筛选${姓 ? ' 客人「' + 转义(姓) + '」' : ''}${房 ? ' 房号「' + 转义(房) + '」' : ''}（${表格数据.length} 条）` : '';
    el.innerHTML += `<div class="卡片"><h2>日租（${日租搜索日 ? 中文日期(日租搜索日) : 中文年月(月)}${筛选说明}）　合计 ¥${数字(合计)}</h2>
      ${日租视图 === '表格' ? 日租表格(表格数据, 月, 日租搜索日, !有筛选) : 日租图表(daily, 月, 日租搜索日)}
    </div>`;
  } else {
    const 支出 = await api(`/api/transactions?month=${月}`);
    const 合计 = 支出.reduce((s, t) => s + (Number(t.金额) || 0), 0);
    el.innerHTML += `<div class="卡片"><h2>支出（${月}）　合计 ¥${数字(合计)}</h2>
      <div class="表格容器"><table><tr><th>日期</th><th>事项</th><th class="数字">金额</th></tr>
      ${支出.map(t => `<tr><td>${转义(t.日期)}</td><td>${转义(t.事项)}</td><td class="数字">¥${数字(t.金额)}</td></tr>`).join('')}
      ${支出.length?'':'<tr><td colspan="3" class="空">本月无支出</td></tr>'}</table></div></div>`;
  }
}

// 月租表（独立导航页「月租」可编辑；「账单」页引用为只读）
function 月租表HTML(账单, 月, 只读) {
  const 在租账单 = 账单.filter(b => b.状态 !== '未出租');
  const 应收 = 在租账单.reduce((s, b) => s + (b.应付租金 || 0), 0);
  const 实收 = 在租账单.reduce((s, b) => s + (b.实收 || 0) + (b.补缴 || 0) + (b.新收押金 || 0) + (b.预缴 || 0), 0);
  const 显示账单 = 账单状态筛选 === '全部' ? 账单 : 账单.filter(b => b.状态 === 账单状态筛选);
  return `<div class="卡片"><h2>月租账单（${月}）　应付 ¥${数字(应收)}　已收 ¥${数字(实收)}</h2>
    <div class="表格容器"><table><tr><th>房号</th><th>交租日期</th><th class="数字">房租</th><th class="数字">新收押金</th><th class="数字">管理费</th><th class="数字">水费</th><th class="数字">电费</th><th class="数字">欠费滚存</th><th class="数字">实收</th><th>状态</th>${只读 ? '' : '<th></th>'}</tr>
    ${显示账单.map(b => {
      const 未出租 = b.状态 === '未出租';
      const 操作 = (只读 || 未出租 || !启用删除) ? '' : `<td><button class="btn 行内 危险" onclick="删除账单('${转义(b.房号)}','${月}')">删</button></td>`;
      return `<tr><td><b>${转义(b.房号)}</b></td><td>${未出租 ? '—' : 转义(b.交租日期 || '')}</td><td class="数字">${未出租 ? '—' : 数字(b.房租)}</td><td class="数字">${未出租 ? '—' : (b.新收押金 ? 数字(b.新收押金) : '')}</td><td class="数字">${未出租 ? '—' : 数字(b.管理费)}</td><td class="数字">${未出租 ? '—' : 数字(b.水费)}</td><td class="数字">${未出租 ? '—' : 数字(b.电费)}</td><td class="数字">${未出租 ? '—' : (b.结转 ? 数字(b.结转) : '')}</td><td class="数字">${未出租 ? '—' : '¥' + 数字((b.实收 || 0) + (b.补缴 || 0) + (b.新收押金 || 0) + (b.预缴 || 0))}</td><td>${状态徽章(b.状态)}${!未出租 && b.欠款 > 0 ? ` <span style="color:var(--红)">¥${数字(b.欠款)}</span>` : ''}</td>${操作}</tr>`;
    }).join('')}</table></div></div>`;
}
async function 渲染月租(容器) {
  const 月 = 全局.settings.当前月份;
  容器.innerHTML = `
    <div class="卡片"><div class="工具栏">
      <select onchange="账单状态筛选=this.value;渲染()">
        <option value="全部" ${账单状态筛选==='全部'?'selected':''}>全部状态</option>
        <option value="已核收" ${账单状态筛选==='已核收'?'selected':''}>已核收</option>
        <option value="未交" ${账单状态筛选==='未交'?'selected':''}>未交</option>
        <option value="欠款" ${账单状态筛选==='欠款'?'selected':''}>欠款</option>
        <option value="未出租" ${账单状态筛选==='未出租'?'selected':''}>未出租</option>
      </select>
      <label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--次文字);cursor:pointer;white-space:nowrap"><input type="checkbox" ${启用删除?'checked':''} onchange="启用删除=this.checked;渲染()" style="cursor:pointer">删除模式</label>
    </div></div>`;
  const 账单 = await api(`/api/bills?month=${月}`);
  容器.innerHTML += 月租表HTML(账单, 月, false);
}

// 日租表按实时日期封顶：当月只出到今天为止的日子（没到的日子不显示），历史月出整月。指定搜索日就只出那一天。
function 月内日期们(月, 单日) {
  if (单日) return [单日];
  if (!月) return [];
  const [年, 月数] = String(月).split('-').map(Number);
  const 天数 = new Date(年, 月数, 0).getDate(); // 第 0 天 = 上月末日，即本月总天数
  let 止日 = 天数;
  if (月 === 今天().slice(0, 7)) { // 只看当月：以实时日期封顶
    const 今天日 = Number(今天().slice(8, 10));
    if (!isNaN(今天日)) 止日 = Math.min(天数, 今天日);
  }
  return Array.from({ length: 止日 }, (_, i) => `${月}-${String(i + 1).padStart(2, '0')}`);
}
function 按日期分组(daily) {
  const 按日 = {};
  for (const d of daily) (按日[d.日期] = 按日[d.日期] || []).push(d);
  return 按日;
}
// 日租表格模式：完整字段列表。空白天只显示日期，其余列留空
// 补空白=false 用于「按姓名/房号筛选」时：只列命中的记录，不再把整月没客人的天也铺出来
function 日租表格(daily, 月, 单日, 补空白 = true) {
  if (!补空白) {
    const 命中 = [...daily].sort((a, b) => (a.日期 || '').localeCompare(b.日期 || '') || a.id - b.id);
    return `<div class="表格容器"><table><tr><th>日期</th><th>房号</th><th>客人</th><th>天数</th><th class="数字">金额</th></tr>
      ${命中.map(d => `<tr><td>${转义(d.日期)}</td><td>${转义(d.房号||'—')}</td><td>${转义(d.客人||'—')}</td><td>${d.入住天数||1}晚</td><td class="数字">¥${数字(d.金额)}</td></tr>`).join('')
        || '<tr><td colspan="5" class="空">没有匹配的记录</td></tr>'}</table></div>`;
  }
  const 按日 = 按日期分组(daily);
  const 日期们 = 月内日期们(月, 单日);
  const 行 = 日期们.map(日期 => {
    const 记录 = 按日[日期] || [];
    if (!记录.length) return `<tr class="空白日"><td>${转义(日期)}</td><td></td><td></td><td></td><td class="数字"></td></tr>`;
    return 记录.map(d => `<tr><td>${转义(d.日期)}</td><td>${转义(d.房号||'—')}</td><td>${转义(d.客人||'—')}</td><td>${d.入住天数||1}晚</td><td class="数字">¥${数字(d.金额)}</td></tr>`).join('');
  }).join('');
  return `<div class="表格容器"><table><tr><th>日期</th><th>房号</th><th>客人</th><th>天数</th><th class="数字">金额</th></tr>
    ${行 || '<tr><td colspan="5" class="空">无日租</td></tr>'}</table></div>`;
}
// 日租图表模式：每行一天，金额依次展现 + 当日合计。空白天金额与合计留空
function 日租图表(daily, 月, 单日) {
  const 按日 = 按日期分组(daily);
  const 行 = 月内日期们(月, 单日).map(日期 => {
    const 金额们 = (按日[日期] || []).map(d => Number(d.金额) || 0);
    if (!金额们.length) return `<tr class="空白日"><td>${中文日期(日期)}</td><td></td><td class="数字"></td></tr>`;
    const 合计 = 金额们.reduce((s, x) => s + x, 0);
    const 金额格 = 金额们.map(a => `<span class="图表金额">${数字(a)}</span>`).join('');
    return `<tr><td>${中文日期(日期)}</td><td><div class="图表金额行">${金额格}</div></td><td class="数字">¥${数字(合计)}</td></tr>`;
  }).join('');
  return `<div class="表格容器"><table><tr><th>日期</th><th>金额</th><th class="数字">当日合计</th></tr>
    ${行 || '<tr><td colspan="3" class="空">无日租</td></tr>'}</table></div>`;
}

// ============ 日租房态图（EBK 式：空闲 → 在住 → 脏房 → 空闲） ============
// 钱只在「办入住」那一步记进 daily（账单页/总账单的口径没变），退房和清洁只改房间状态。
let 房态数据 = null;   // 最近一次 /api/roomstatus 的结果，弹窗里要用
async function 渲染日租(容器) {
  const d = await api('/api/roomstatus');
  房态数据 = d;
  const 概 = d.概览;
  容器.innerHTML = `
    <div class="卡片">
      <div class="工具栏"><h2 style="margin:0;flex:1">🏨 日租房态（${d.房间.length} 间）</h2>
        ${概.脏房 ? `<button class="btn 黄" onclick="一键全清()">🧹 全部脏房标记已清洁（${概.脏房}）</button>` : ''}
      </div>
      <div class="汇总网格">
        <div class="汇总项 收入"><div class="标签">在住</div><div class="数值">${概.在住} 间</div></div>
        <div class="汇总项"><div class="标签">脏房待清洁</div><div class="数值">${概.脏房} 间</div></div>
        <div class="汇总项"><div class="标签">可用</div><div class="数值">${概.可用} 间</div></div>
        <div class="汇总项 收入"><div class="标签">今日日租收入</div><div class="数值">¥${数字(概.今日收入)}</div></div>
      </div>
      <p style="color:var(--次文字);font-size:13px;margin-top:12px">点房间卡片办理入住 / 退房 / 清洁。<b style="color:var(--绿)">绿色 = 在住</b>，<b style="color:#a16207">黄色 = 脏房待清洁</b>，无色 = 可用。房费在办入住时就记进日租账单。</p>
      ${d.房间.length ? `<div class="房态网格">${d.房间.map(房态卡).join('')}</div>`
        : '<p class="空">还没有日租房间。去「设置 → 参数 → 房源信息」把房间的房型切成「日租」。</p>'}
    </div>
    <div class="卡片">
      <div class="工具栏"><h2 style="margin:0;flex:1">📋 今日入住记录（${中文日期(d.今日)}）　合计 ¥${数字(概.今日收入)}</h2>
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--次文字);cursor:pointer;white-space:nowrap"><input type="checkbox" ${启用删除?'checked':''} onchange="启用删除=this.checked;渲染()" style="cursor:pointer">🗑 删除模式</label>
      </div>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">按<b>营业日</b>统计：早上 6 点换日，${短日期(d.今日)} 6:00 到次日 5:59 记的都算这一天。房费 0 元的入住只占房、不入账，不会出现在这里。</p>
      <div class="表格容器"><table>
        <tr><th>房号</th><th>客人</th><th>晚数</th><th class="数字">金额</th>${启用删除 ? '<th></th>' : ''}</tr>
        ${d.今日入住.map(x => `<tr>
          <td><b>${转义(x.房号 || '—')}</b></td>
          <td>${转义(x.客人 || '—')}</td>
          <td>${x.入住天数} 晚</td>
          <td class="数字">¥${数字(x.金额)}</td>
          ${启用删除 ? `<td><button class="btn 行内 危险" onclick="删除入住记录(${x.id},'${转义(x.房号 || '')}',${x.金额})">删</button></td>` : ''}
        </tr>`).join('')}
        ${d.今日入住.length ? '' : `<tr><td colspan="${启用删除?5:4}" class="空">今天还没有入住记录</td></tr>`}
      </table></div>
    </div>`;
}
// 一间房一张卡：颜色=状态，在住的把客人信息直接印在卡上
function 房态卡(r) {
  const 状态类 = r.状态 === '在住' ? '在住' : (r.状态 === '脏房' ? '脏房' : '空闲');
  let 正文 = '';
  if (r.状态 === '在住') {
    const 钟点 = r.房型 === '钟点';
    // 钟点房看倒计时，全天房看到期日
    const 期 = 钟点
      ? (r.剩余分钟 != null && r.剩余分钟 <= 0
          ? `<div class="房态行 警">⏰ 已到点</div>`
          : `<div class="房态行${r.剩余分钟 != null && r.剩余分钟 <= 30 ? ' 警' : ''}">⏰ ${时刻到点(r.预计退房)} 到点${r.剩余分钟 != null ? `（剩 ${余时文(r.剩余分钟)}）` : ''}</div>`)
      : (r.已超期 ? `<div class="房态行 警">⚠ 已超期（${短日期(r.到期日)} 到期）</div>`
        : r.今日到期 ? `<div class="房态行 警">今天到期</div>`
        : `<div class="房态行">${短日期(r.到期日)} 到期</div>`);
    const 人数 = (r.客人们 || []).length;
    正文 = `<div class="房态客人">${转义(r.客人 || '（未留姓名）')}${人数 > 1 ? `<span class="房态人数">${人数}人</span>` : ''}</div>
      <div class="房态行">${短日期(r.入住日)} 入住 · ${钟点 ? `钟点 ${r.时长小时} 小时` : r.天数 + ' 天'}</div>
      ${期}
      <div class="房态钱">¥${数字(r.金额)}</div>`;
  } else if (r.状态 === '脏房') {
    正文 = `<div class="房态客人">待清洁</div>
      <div class="房态行">${r.客人 ? 转义(r.客人) + ' 已退房' : '客人已退房'}</div>
      <div class="房态行">${转义(时刻(r.退房时间) || '—')}</div>`;
  } else {
    正文 = `<div class="房态客人 淡">可用</div>
      <div class="房态行">点击办理入住</div>
      ${r.清洁时间 ? `<div class="房态行 淡">${转义(时刻(r.清洁时间))} 已清洁</div>` : ''}`;
  }
  return `<button class="房态卡 ${状态类}" onclick="点房间('${转义(r.房号)}')">
    <div class="房态卡头"><b>${转义(r.房号)}</b><span class="房态签 ${状态类}">${r.状态}</span></div>
    <div class="房态卡身">${正文}</div>
  </button>`;
}
// ISO 时间戳 → "8月26日 14:30"（房态记的是 new Date().toISOString()）
function 时刻(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (isNaN(t)) return '';
  return `${t.getMonth() + 1}月${t.getDate()}日 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}
function 找房态(房号) { return (房态数据 && 房态数据.房间.find(r => r.房号 === 房号)) || null; }
// 钟点房到点时刻，只要时分："18:30"
function 时刻到点(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  return isNaN(t) ? '' : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}
// 剩余分钟 → "1 小时 20 分" / "45 分"
function 余时文(分钟) {
  const m = Math.max(0, Number(分钟) || 0);
  return m >= 60 ? `${Math.floor(m / 60)} 小时${m % 60 ? ' ' + (m % 60) + ' 分' : ''}` : `${m} 分`;
}

// 点房间：按当前状态给不同的弹窗
window.点房间 = function(房号) {
  const r = 找房态(房号);
  if (!r) { 提示('房间信息已过期，正在刷新'); 渲染(); return; }
  if (r.状态 === '在住') 打开在住详情(r);
  else if (r.状态 === '脏房') 打开脏房详情(r);
  else 打开入住模态(r);
};
const 钟点房默认价 = 60;   // 选钟点房时自动带出的房费
function 打开入住模态(r) {
  打开模态(`<h2>办理入住 —— ${转义(r.房号)}</h2>
    <div class="房型区">
      <div class="房型选">
        <button class="房型卡 选中" data-房型="全天" onclick="选住房型('全天')">
          <span class="房型图">🛏️</span><span class="房型名">全日房</span>
        </button>
        <button class="房型卡" data-房型="钟点" onclick="选住房型('钟点')">
          <span class="房型图">⏰</span><span class="房型名">钟点房</span>
        </button>
      </div>
      <div class="字段" id="住时长区" style="display:none"><label>钟点时长（小时）</label><input id="住时长" type="number" min="0.5" step="0.5" value="3" style="width:130px"></div>
    </div>
    <div id="客人区">${客人行HTML(true)}</div>
    <div class="行三" style="margin-top:10px">
      <div class="字段"><label>入住日期</label><input id="住日期" type="date" value="${营业日()}"></div>
      <div class="字段"><label>入住天数 *</label><input id="住天数" type="number" min="1" value="1"></div>
      <div class="字段"><label>金额 *</label><input id="住金额" type="number" min="0" placeholder="总房费"></div>
    </div>
    <div class="字段" style="margin-top:10px"><label>备注信息</label><input id="住备注" placeholder="选填"></div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn 成功" onclick="办入住('${转义(r.房号)}')">确认入住</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
}
// 一位客人一行：姓名 / 电话 / 身份证。第一行末尾是「+」加人，后续行是「−」删掉这行
function 客人行HTML(首行) {
  return `<div class="客人行">
    <div class="字段"><label>姓名</label><input class="客名" placeholder="姓名" onchange="带出客人行(this)"></div>
    <div class="字段"><label>电话</label><input class="客话" placeholder="电话"></div>
    <div class="字段"><label>身份证</label><input class="客证" placeholder="身份证"></div>
    ${首行
      ? `<button class="btn 客人加减" onclick="加客人行()" title="再登记一位客人">+</button>`
      : `<button class="btn 次 客人加减" onclick="this.closest('.客人行').remove()" title="删掉这一位">−</button>`}
  </div>`;
}
window.加客人行 = function() {
  const 区 = document.getElementById('客人区');
  if (!区) return;
  区.insertAdjacentHTML('beforeend', 客人行HTML(false));
  const 行们 = 区.querySelectorAll('.客人行');
  行们[行们.length - 1].querySelector('.客名').focus();
};
window.选住房型 = function(房型) {
  const 钟点 = 房型 === '钟点';
  document.querySelectorAll('.房型卡').forEach(b => b.classList.toggle('选中', b.dataset.房型 === 房型));
  document.getElementById('住时长区').style.display = 钟点 ? '' : 'none';
  const 天数框 = document.getElementById('住天数');
  天数框.disabled = 钟点;                       // 钟点房按小时算，天数没意义
  天数框.value = 钟点 ? 1 : (天数框.value || 1);
  // 钟点房带出默认价。只在金额空着时填，不覆盖手输的数；切回全日房时再把自动填的那笔清掉
  const 金额框 = document.getElementById('住金额');
  if (钟点) {
    if (!金额框.value.trim()) { 金额框.value = 钟点房默认价; 金额框.dataset.自动 = '1'; }
  } else if (金额框.dataset.自动 === '1') {
    金额框.value = ''; delete 金额框.dataset.自动;
  }
};
// 行内版的「按姓名带出档案」：从同一行里找电话和身份证框。
// 备注是整单一个框，只让**第一位**客人带出来，免得后面几行互相覆盖
window.带出客人行 = function(名框) {
  const 行 = 名框.closest('.客人行');
  if (!行) return;
  const 区 = document.getElementById('客人区');
  const 首行 = 区 && 区.querySelector('.客人行') === 行;
  带出客人到(名框, 行.querySelector('.客证'), 行.querySelector('.客话'), 首行 ? document.getElementById('住备注') : null);
};
function 收集客人们() {
  return [...document.querySelectorAll('#客人区 .客人行')].map(行 => {
    const 名框 = 行.querySelector('.客名');
    return {
      姓名: 名框.value.trim(),
      电话: 行.querySelector('.客话').value.trim(),
      身份证: 行.querySelector('.客证').value.trim(),
      // 从档案带出来的才有：后端按它覆盖原条目，而不是新增一条
      档案id: 名框.dataset.档案id ? Number(名框.dataset.档案id) : null
    };
  }).filter(x => x.姓名 || x.电话 || x.身份证);
}
function 打开在住详情(r) {
  const 行 = (标, 值) => `<div class="详情项"><span>${标}</span><b>${转义(值 == null || 值 === '' ? '—' : String(值))}</b></div>`;
  const 钟点 = r.房型 === '钟点';
  const 客人们 = (r.客人们 && r.客人们.length) ? r.客人们 : [{ 姓名: r.客人, 电话: r.电话, 身份证: r.身份证 }];
  打开模态(`<h2>${转义(r.房号)} —— 在住中${钟点 ? '（钟点房）' : ''}</h2>
    <div class="表格容器"><table>
      <tr><th>客人</th><th>电话</th><th>身份证</th></tr>
      ${客人们.map(g => `<tr><td>${转义(g.姓名 || '—')}</td><td>${转义(g.电话 || '—')}</td><td>${转义(g.身份证 || '—')}</td></tr>`).join('')}
    </table></div>
    <div class="详情格" style="margin-top:12px">
      ${行('入住日', r.入住日)}
      ${钟点 ? 行('时长', r.时长小时 + ' 小时') : 行('入住天数', r.天数 + ' 天')}
      ${钟点 ? 行('到点时刻', 时刻(r.预计退房)) : 行('到期日', r.到期日)}
      ${行('金额', '¥' + 数字(r.金额) + (r.日租id == null ? '（0 元未入账）' : ''))}
      ${行('办理时间', 时刻(r.入住时间))}${行('备注', r.备注)}
    </div>
    ${r.已超期 ? '<p style="color:var(--红);font-size:13px;margin-top:10px">⚠ 已超过到期日，续住请在下面加天数。</p>' : ''}
    ${钟点 && r.剩余分钟 != null && r.剩余分钟 <= 0 ? '<p style="color:var(--红);font-size:13px;margin-top:10px">⏰ 已到点，刷新后会自动转成脏房；要延时就在下面加小时数。</p>' : ''}
    <h3 style="margin-top:16px">${钟点 ? '延时 / 改价' : '续住 / 改价'}</h3>
    <div class="表单 两列">
      ${钟点
        ? `<div class="字段"><label>时长（小时）</label><input id="续时长" type="number" min="0.5" step="0.5" value="${r.时长小时 || 3}"></div>`
        : `<div class="字段"><label>入住天数</label><input id="续天数" type="number" min="1" value="${r.天数 || 1}"></div>`}
      <div class="字段"><label>金额</label><input id="续金额" type="number" min="0" value="${r.金额}"></div>
    </div>
    <p style="color:var(--次文字);font-size:13px;margin-top:8px">改完会同步更新这间房对应的那条日租账单。改成 <b>0 元会撤掉账单</b>，从 0 改成正数会补记一条。</p>
    <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" onclick="保存续住('${转义(r.房号)}')">保存续住 / 改价</button>
      <button class="btn 黄" onclick="房间退房('${转义(r.房号)}')">退房（转脏房）</button>
      <button class="btn 危险" onclick="撤销入住('${转义(r.房号)}')">撤销入住</button>
      <button class="btn 次" onclick="请求关闭模态()">关闭</button>
    </div>`);
}
function 打开脏房详情(r) {
  打开模态(`<h2>${转义(r.房号)} —— 脏房待清洁</h2>
    <p style="color:var(--次文字);font-size:14px">${r.客人 ? '上一位客人：<b style="color:var(--文字)">' + 转义(r.客人) + '</b>　' : ''}退房时间：<b style="color:var(--文字)">${转义(时刻(r.退房时间) || '—')}</b></p>
    <p style="color:var(--次文字);font-size:13px;margin-top:10px">确认清洁后房间恢复「可用」，并留一条清洁记录。</p>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn 成功" onclick="确认清洁('${转义(r.房号)}')">✅ 确认已清洁</button>
      <button class="btn 次" onclick="请求关闭模态()">关闭</button>
    </div>`);
}
window.办入住 = async function(房号) {
  const 房型 = document.querySelector('.房型卡.选中')?.dataset.房型 || '全天';
  const 钟点 = 房型 === '钟点';
  const 时长小时 = 钟点 ? Number(document.getElementById('住时长').value) || 0 : 0;
  const 天数 = 钟点 ? 1 : (Number(document.getElementById('住天数').value) || 0);
  const 金额值 = document.getElementById('住金额').value;
  if (钟点 && 时长小时 < 0.5) { 提示('钟点时长至少 0.5 小时'); return; }
  if (!钟点 && 天数 < 1) { 提示('入住天数要填 1 以上'); return; }
  if (金额值 === '') { 提示('请填金额'); return; }
  const 金额 = Number(金额值);
  if (!(金额 >= 0)) { 提示('金额不对'); return; }
  const 客人们 = 收集客人们();
  const 名字 = 客人们.map(x => x.姓名).filter(Boolean).join('、');
  const 时长文 = 钟点 ? `钟点房 ${时长小时} 小时` : `${天数} 天`;
  if (!await 询问确认('确认办理入住？',
    `${转义(房号)}　${转义(名字 || '未留姓名')}${客人们.length > 1 ? `（${客人们.length} 人）` : ''}<br>${时长文}　¥${数字(金额)}${金额 > 0 ? '' : '（0 元只占房、不入账）'}`)) return;
  const r = await api('/api/roomstatus/checkin', { method: 'POST', body: {
    房号, 客人们, 入住日: document.getElementById('住日期').value,
    天数, 金额, 房型, 时长小时,
    备注: document.getElementById('住备注').value.trim()
  } });
  if (r.错误) { 提示(r.错误); return; }
  提示(`${房号} 已入住`); 关闭模态(); 渲染();
};
window.保存续住 = async function(房号) {
  const 时长框 = document.getElementById('续时长');
  const 钟点 = !!时长框;
  const 时长小时 = 钟点 ? Number(时长框.value) || 0 : 0;
  const 天数 = 钟点 ? 1 : (Number(document.getElementById('续天数').value) || 0);
  const 金额 = Number(document.getElementById('续金额').value);
  if (钟点 && 时长小时 < 0.5) { 提示('钟点时长至少 0.5 小时'); return; }
  if (!钟点 && 天数 < 1) { 提示('入住天数要填 1 以上'); return; }
  if (!(金额 >= 0)) { 提示('金额不对'); return; }
  if (!await 询问确认('确认修改？',
    `${转义(房号)}　改为 ${钟点 ? 时长小时 + ' 小时（从入住时刻起算）' : 天数 + ' 天'}　¥${数字(金额)}<br>对应的日租账单会一起改。`)) return;
  const r = await api('/api/roomstatus/extend', { method: 'POST', body: { 房号, 天数, 金额, 时长小时 } });
  if (r.错误) { 提示(r.错误); return; }
  提示(r.提示 || '已更新'); 关闭模态(); 渲染();
};
window.房间退房 = async function(房号) {
  if (!await 询问确认('确认退房？', `${转义(房号)} 转为「脏房」等待清洁。<br>房费已在入住时记账，退房不影响账单。`)) return;
  const r = await api('/api/roomstatus/checkout', { method: 'POST', body: { 房号 } });
  if (r.错误) { 提示(r.错误); return; }
  提示(`${房号} 已退房，待清洁`); 关闭模态(); 渲染();
};
window.撤销入住 = async function(房号) {
  if (!await 询问确认('撤销这次入住？', `录错了才用。<br><b>会删掉入住时记的那条日租账单</b>，${转义(房号)} 退回「可用」。`)) return;
  const r = await api('/api/roomstatus/undo-checkin', { method: 'POST', body: { 房号 } });
  if (r.错误) { 提示(r.错误); return; }
  提示(r.删除账单 ? '已撤销，账单记录同步删除' : '已撤销（未找到对应账单）'); 关闭模态(); 渲染();
};
window.确认清洁 = async function(房号) {
  if (!await 询问确认('确认已清洁？', `${转义(房号)} 恢复「可用」，可以接新客人。`)) return;
  const r = await api('/api/roomstatus/clean', { method: 'POST', body: { 房号 } });
  if (r.错误) { 提示(r.错误); return; }
  提示(`${房号} 已清洁`); 关闭模态(); 渲染();
};
// 删掉一条今日入住记录：账单里那笔一起删，房态若正指着它就退回「可用」
window.删除入住记录 = async function(id, 房号, 金额) {
  if (!await 询问确认('删除这条入住记录？', `${转义(房号 || '未填房号')}　¥${数字(金额)}<br><b>日租账单里的这一笔会一起删掉</b>，这间房如果还挂着这笔生意会退回「可用」。`)) return;
  const r = await api('/api/roomstatus/delete-record', { method: 'POST', body: { id } });
  if (r.错误) { 提示(r.错误); return; }
  提示(r.重置房态 ? `已删除，${r.房号} 退回可用` : '已删除');
  渲染();
};
window.一键全清 = async function() {
  const 脏 = 房态数据 ? 房态数据.概览.脏房 : 0;
  if (!脏) { 提示('当前没有脏房'); return; }
  if (!await 询问确认('全部标记为已清洁？', `${脏} 间脏房一次性恢复「可用」，每间各留一条清洁记录。`)) return;
  const r = await api('/api/roomstatus/clean-all', { method: 'POST' });
  if (r.错误) { 提示(r.错误); return; }
  提示(`${r.数量} 间已清洁`); 渲染();
};

// ============ 退房 ============
async function 渲染退房(容器) {
  const list = await api('/api/checkouts');
  容器.innerHTML = `
    <div class="卡片">
      <h2>退房记录</h2>
      <div class="工具栏"><input id="退房搜房号" placeholder="按房号搜索" style="width:140px"><label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--次文字);cursor:pointer;white-space:nowrap"><input type="checkbox" ${启用删除?'checked':''} onchange="启用删除=this.checked;渲染()" style="cursor:pointer">删除模式</label><span id="退房计数" style="color:var(--次文字);font-size:13px"></span></div>
      <div class="表格容器"><table id="退房记录表">
        <tr><th>日期</th><th>房号</th><th class="数字">总押金</th><th class="数字">水电总额</th><th class="数字">卫生费</th><th class="数字">退还金额</th><th></th></tr>
      </table></div>
    </div>`;
  window.退房数据 = list;
  过滤退房();
  document.getElementById('退房搜房号').addEventListener('input', 过滤退房);
}
window.过滤退房 = function() {
  const 房号词 = (document.getElementById('退房搜房号')?.value || '').trim().toLowerCase();
  const 列表 = (window.退房数据 || []).filter(r => (!房号词 || String(r.房号).toLowerCase().includes(房号词)));
  const 表 = document.getElementById('退房记录表');
  表.innerHTML = `<tr><th>日期</th><th>房号</th><th class="数字">总押金</th><th class="数字">水电总额</th><th class="数字">卫生费</th><th class="数字">退还金额</th><th></th></tr>` +
    (列表.length ? 列表.map(r => `<tr>
      <td>${转义(r.日期)}</td><td><b>${转义(r.房号)}</b></td>
      <td class="数字">¥${数字((Number(r.押金)||0)+(Number(r.房卡押金)||0))}</td>
      <td class="数字">¥${数字(r.水电总额)}</td>
      <td class="数字">¥${数字(r.退房卫生费)}</td>
      <td class="数字" style="color:var(--红);font-weight:700">¥${数字(r.退入金额)}</td>
      <td><button class="btn 行内" onclick="打开退房详情(${r.id})">详细</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="空">暂无退房记录</td></tr>');
  const 计数 = document.getElementById('退房计数');
  if (计数) 计数.textContent = 房号词 ? `匹配 ${列表.length} 条` : '';
};
window.打开退房详情 = function(id) {
  const r = (window.退房数据 || []).find(x => x.id === id);
  if (!r) return;
  const 数 = v => Number(v) || 0;
  const 应收 = 数(r.押金) + 数(r.房卡押金) + 数(r.留存金额);
  const 应扣 = 数(r.水电总额) + 数(r.退房卫生费) + 数(r.房间损耗);
  const 应退还 = Math.round((应收 - 应扣) * 100) / 100;
  const 对不上 = Math.abs(应退还 - 数(r.退入金额)) > 0.01; // 旧版本漏减水电写下的老记录会在这里露馅
  // 单据行：说明走小字副行；水电底度并进说明里，不再单列一张明细表（原版和「应扣款项」两处重复）
  const 行 = (标签, 值, 说明) => `<tr><td>${标签}${说明 ? `<div class="退租说明">${转义(说明)}</div>` : ''}</td><td class="数字">${值}</td></tr>`;
  const 抄表说明 = (上, 退, 量, 单位, 单价) => `${上 || '—'} → ${退 || '—'}　用 ${量} ${单位} × ${单价} 元`;
  const 信息项 = (标签, 值) => `<div><span>${标签}</span><b>${转义(值 || '—')}</b></div>`;
  打开模态(`<h2>退租结算单</h2>
    <div class="退租单">
      <div class="退租单头">
        <div class="退租单号"><span>房号</span><b>${转义(r.房号)}</b></div>
        <div class="退租单信息">
          ${信息项('租客', r.租客)}
          ${信息项('退房日期', r.日期)}
          ${信息项('电话', r.电话)}
          ${信息项('身份证', r.身份证)}
        </div>
      </div>
      <table class="退租表">
        <tr class="退租组头 应退"><th>应退款项</th><th class="数字">金额</th></tr>
        ${行('押金', '¥' + 数字(r.押金))}
        ${行('房卡押金', '¥' + 数字(r.房卡押金))}
        ${数(r.留存金额) ? 行('留存金额', '¥' + 数字(r.留存金额), '预缴剩余') : ''}
        <tr class="退租小计"><td>应退小计</td><td class="数字">¥${数字(应收)}</td></tr>
        <tr class="退租组头 应扣"><th>应扣款项</th><th class="数字">金额</th></tr>
        ${行('水费', '−¥' + 数字(r.水费), 抄表说明(r.上月水底, r.退房水底, r.用水量, '方', r.水费单价))}
        ${行('电费', '−¥' + 数字(r.电费), 抄表说明(r.上月电底, r.退房电底, r.用电量, '度', r.电费单价))}
        ${数(r.退房卫生费) ? 行('卫生费', '−¥' + 数字(r.退房卫生费)) : ''}
        ${数(r.房间损耗) ? 行('房间损耗', '−¥' + 数字(r.房间损耗), r.损耗说明) : ''}
        <tr class="退租小计"><td>应扣小计</td><td class="数字">−¥${数字(应扣)}</td></tr>
      </table>
      <div class="退租总">
        <div class="退租总算式">应退 ¥${数字(应收)} − 应扣 ¥${数字(应扣)}</div>
        ${数(r.退入金额) < 0
          ? `<div class="退租总额"><span>应补缴</span><b>¥${数字(Math.abs(r.退入金额))}</b></div>`
          : `<div class="退租总额"><span>实退</span><b>¥${数字(r.退入金额)}</b></div>`}
      </div>
      ${对不上 ? `<div class="退租警告">⚠ 退还金额 ¥${数字(r.退入金额)} 与「应退 − 应扣」= ¥${数字(应退还)} 对不上，这是旧版本漏减水电费留下的老记录</div>` : ''}
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      ${距今天数(r.日期) > 3
        ? `<span style="color:var(--次文字);font-size:13px;margin-right:auto">退房已超过 3 天，不可撤销</span>`
        : `<button class="btn 次" onclick="撤销退房(${r.id})">↩ 撤销退房</button>`}
      ${启用删除 ? `<button class="btn 危险" onclick="删除退房(${r.id})">删除记录</button>` : ''}
      <button class="btn" onclick="请求关闭模态()">关闭</button>
    </div>`);
};
window.撤销退房 = async function(id) {
  const r = (window.退房数据 || []).find(x => x.id === id);
  if (!confirm(`确定撤销「${r?.房号 || ''}」的退房？房间将恢复为在租状态，退还流水一并删除。`)) return;
  const 结果 = await api(`/api/checkouts/undo/${id}`, { method: 'POST' });
  if (结果.错误) { 提示(结果.错误); return; }
  提示(`已撤销 ${结果.房号} 的退房`); 关闭模态(); 渲染();
};
window.删除退房 = async function(id) { if (!confirm('确定删除这条退房记录？')) return; await api(`/api/checkouts/${id}`, { method: 'DELETE' }); 提示('已删除'); 渲染(); };

// ============ 收支 ============
async function 渲染收支(容器) {
  const 月份 = 全局.settings.当前月份;
  const list = await api(`/api/transactions?month=${月份}`);
  const 合计 = list.reduce((s, t) => s + (Number(t.金额) || 0), 0);
  容器.innerHTML = `
    <div class="卡片">
      <h2>支出流水（${月份}）</h2>
      <div class="工具栏">
        <input id="收日期" type="date" value="${今天()}"><input id="收事项" placeholder="事项" style="width:150px"><input id="收金额" type="number" placeholder="金额" style="width:90px">
        <button class="btn" onclick="新增收支()">记录</button>
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--次文字);cursor:pointer;white-space:nowrap"><input type="checkbox" ${启用删除?'checked':''} onchange="启用删除=this.checked;渲染()" style="cursor:pointer">删除模式</label>
        <span style="margin-left:auto"><b>合计 ¥${数字(合计)}</b></span>
      </div>
      <div class="表格容器"><table>
        <tr><th>日期</th><th>事项</th><th class="数字">金额</th><th></th></tr>
        ${list.map(t => `<tr><td>${转义(t.日期)}</td><td>${转义(t.事项)}</td><td class="数字">¥${数字(t.金额)}</td><td>${启用删除 ? `<button class="btn 行内 危险" onclick="删除收支(${t.id})">删</button>` : ''}</td></tr>`).join('')}
        ${list.length?'':'<tr><td colspan="4" class="空">本月无收支记录</td></tr>'}
      </table></div>
    </div>`;
}
window.新增收支 = async function() {
  const 日期 = document.getElementById('收日期').value, 事项 = document.getElementById('收事项').value, 金额 = document.getElementById('收金额').value;
  if (!日期 || !事项 || 金额 === '') { 提示('请填完整'); return; }
  await api('/api/transactions', { method: 'POST', body: { 日期, 事项, 金额 } }); 提示('已记录'); 渲染();
};
window.删除收支 = async function(id) { await api(`/api/transactions/${id}`, { method: 'DELETE' }); 提示('已删除'); 渲染(); };

// ============ 设置（左侧目录树 + 右侧详情） ============
let 设置节点 = '主题';   // 当前选中的目录项，本次会话内保留（刷新页面回到主题模式）
let 主题 = localStorage.getItem('主题') || '明亮';   // 每台设备各自记（localStorage），不占用数据文件
let 房源删除模式 = false; const 房源选中 = new Set();

// 设置目录树：加项 / 改顺序只动这张表，各项的详情由对应的 设置_xxx() 返回 HTML
const 设置目录 = [
  { 键: '主题', 图标: '🎨', 名: '主题模式', 渲染: 设置_主题 },
  { 键: '安全', 图标: '🔒', 名: '安全设置', 渲染: 设置_安全 },
  { 键: '导出', 图标: '📦', 名: '导出', 渲染: 设置_导出 },
  { 键: '参数', 图标: '⚙️', 名: '参数', 渲染: 设置_参数 },
  { 键: '关于', 图标: 'ℹ️', 名: '关于', 渲染: 设置_关于 }
];
function 当前设置项() { return 设置目录.find(x => x.键 === 设置节点) || 设置目录[0]; }

function 应用主题() {
  document.documentElement.setAttribute('data-theme', 主题 === '暗黑' ? 'dark' : 'light');
}
async function 渲染设置(容器) {
  应用主题();
  const 选中 = 当前设置项();
  容器.innerHTML = `
    <div class="设置布局">
      <nav class="设置目录">
        ${设置目录.map(x => `<button class="设置项${x.键 === 选中.键 ? ' 激活' : ''}" data-键="${x.键}" onclick="选设置项('${x.键}')">
          <span class="设置项图标">${x.图标}</span>
          <span class="设置项文字"><b>${x.名}</b></span>
        </button>`).join('')}
      </nav>
      <div class="设置详情" id="设置详情"></div>
    </div>`;
  await 刷新设置详情();
}
// 只重绘右侧详情，不动左边目录（保存后刷新、在线更新轮询都走这里）
async function 刷新设置详情() {
  const el = document.getElementById('设置详情');
  if (!el) return;
  el.innerHTML = await 当前设置项().渲染();
}
window.选设置项 = async function(键) {
  if (设置节点 === 键) return;
  设置节点 = 键;
  房源删除模式 = false; 房源选中.clear();   // 换页时退出删除模式，避免残留勾选
  // 只换高亮 + 重绘右侧详情，**不整页重渲染**：目录树 DOM 原地不动，位置才不会跳
  document.querySelectorAll('.设置项').forEach(b => b.classList.toggle('激活', b.dataset.键 === 键));
  window.scrollTo(0, 0);   // 长页切短页时浏览器会自动回滚，先归顶把这一跳吃掉
  await 刷新设置详情();
};
// 「在线更新」卡片：检查更新 / 一键更新 / 更新日志（看各版本）。放在设置 tab 最底部
function 在线更新卡片() {
  const v = 当前版本信息 || { 版本: '未知', 提交: '', 日期: '', 仓库: '' };
  const 版本行 = `<p style="color:var(--次文字);font-size:13px;margin-bottom:10px">
    当前版本 <b style="color:var(--文字)">v${转义(v.版本)}</b> · <code>${转义(v.提交 || '—')}</code>${v.日期 ? ' · ' + 转义(v.日期) : ''}${v.仓库 ? `<br>更新源 <code>${转义(v.仓库)}</code>` : ''}
  </p>`;

  const 结果 = 更新检查结果;
  let 状态区 = '';

  if (更新执行中) {
    状态区 = `<div class="更新日志区">${(更新日志缓存 || []).map(l => `<div>${转义(l)}</div>`).join('')}</div>
      <p style="color:var(--次文字);font-size:13px;margin-top:8px">服务重启中，请稍候，完成后页面会自动刷新…</p>`;
  } else if (更新检查中) {
    状态区 = `<p style="color:var(--次文字);font-size:13px">正在检查…</p>`;
  } else if (结果 && 结果.错误) {
    状态区 = `<p style="color:var(--红);font-size:13px">⚠️ ${转义(结果.错误)}</p>`;
  } else if (结果 && 结果.当前提交 === undefined) {
    // /api/update/check 对「非 git 仓库」只返回 可更新/不可更新原因 两个字段
    状态区 = `<p style="color:var(--次文字);font-size:13px">${转义(结果.不可更新原因 || '当前无法在线更新。')}</p>`;
  } else if (结果 && !结果.有更新) {
    状态区 = `<p style="color:var(--绿);font-size:14px">✅ 已是最新版本 v${转义(结果.当前版本)}</p>`;
  } else if (结果) {
    const 日志段 = (结果.更新日志 || []).slice(0, 3);
    const 日志HTML = 日志段.length
      ? 日志段.map(段 => `<div style="margin-bottom:8px">
          <b>${转义(段.版本)}</b>${段.日期 ? ` <span style="color:var(--次文字);font-size:12px">— ${转义(段.日期)}</span>` : ''}
          <ul style="margin:4px 0 0 18px;font-size:13px">${(段.条目 || []).map(条 => `<li>${转义(条)}</li>`).join('')}</ul>
        </div>`).join('')
      : `<div style="font-size:13px;color:var(--次文字)">${(结果.提交列表 || []).map(c => `<div>${转义(c)}</div>`).join('')}</div>`;

    // 统一显示后端给的「不可更新原因」（工作区脏 / 本地已分叉），脏工作区再把具体文件列出来
    const 阻止提示 = 结果.可更新 ? '' : `<p style="color:var(--红);font-size:13px;margin-top:8px">⚠️ ${转义(结果.不可更新原因 || '当前无法更新')}${(结果.本地改动 && 结果.本地改动.length) ? '。改动文件：' + 转义(结果.本地改动.join('、')) : ''}。</p>`;

    // 分叉时提供「强制同步到远程版本」按钮，丢弃本地旧提交、对齐远程（部署机常用）
    const 强制同步按钮 = 结果.可强制同步
      ? `<button class="btn 危险" onclick="强制同步()">⚠️ 强制同步到远程版本</button>`
      : '';

    状态区 = `
      <p style="color:var(--主色);font-weight:700;margin-bottom:8px">🎉 发现新版本 v${转义(结果.最新版本)}（落后 ${结果.落后提交数} 个提交）</p>
      <div class="更新日志区">${日志HTML}</div>
      ${阻止提示}
      <div class="工具栏" style="margin-top:12px">
        <button class="btn 成功" ${结果.可更新 ? '' : 'disabled'} onclick="立即更新()">立即更新</button>
        ${强制同步按钮}
      </div>`;
  }

  return `<div class="卡片">
    <h2>🔄 在线更新</h2>
    ${版本行}
    <div class="工具栏">
      <button class="btn" ${更新执行中 || 更新检查中 ? 'disabled' : ''} onclick="检查更新()">检查更新</button>
      <button class="btn 次" ${更新执行中 ? 'disabled' : ''} onclick="看更新日志()">📜 更新日志</button>
    </div>
    ${状态区}
  </div>`;
}
window.检查更新 = async function() {
  更新检查中 = true;
  await 刷新设置详情();
  // 必须兜底：服务端返回非 JSON（重启中拿到 HTML 错误页等）时 r.json() 会抛错，
  // 不catch 的话 更新检查中 永远停在 true，按钮一直灰着，只能刷新页面才能恢复
  try {
    更新检查结果 = await api('/api/update/check');
  } catch (e) {
    更新检查结果 = { 错误: '检查更新失败：' + (e && e.message ? e.message : '服务无响应') };
  } finally {
    更新检查中 = false;
  }
  刷新设置详情();
};
window.立即更新 = async function() {
  if (!更新检查结果 || !更新检查结果.可更新) return;
  const ok = await 询问确认('确认更新', `将从 GitHub 拉取 v${更新检查结果.最新版本}（落后 ${更新检查结果.落后提交数} 个提交）并自动重启服务，期间页面会短暂无法访问。数据已自动备份。`);
  if (!ok) return;
  const 旧提交 = (当前版本信息 && 当前版本信息.提交) || '';
  更新执行中 = true; 更新日志缓存 = ['⏳ 正在拉取更新…'];
  刷新设置详情();
  const r = await api('/api/update/apply', { method: 'POST' });
  if (r.错误) {
    更新执行中 = false; 更新日志缓存 = r.日志 || [];
    提示('更新失败：' + r.错误);
    刷新设置详情();
    return;
  }
  更新日志缓存 = r.日志 || [];
  刷新设置详情();
  await 等服务重启(旧提交);
};
window.强制同步 = async function() {
  if (!更新检查结果 || !更新检查结果.可强制同步) return;
  const ok = await 询问确认('确认强制同步', `将丢弃本地 ${更新检查结果.领先提交数} 个未推送的提交，强制对齐到远程最新版 v${更新检查结果.最新版本}。期间服务会重启，数据已自动备份。`);
  if (!ok) return;
  const 旧提交 = (当前版本信息 && 当前版本信息.提交) || '';
  更新执行中 = true; 更新日志缓存 = ['⏳ 正在强制同步…'];
  刷新设置详情();
  const r = await api('/api/update/force-sync', { method: 'POST' });
  if (r.错误) {
    更新执行中 = false; 更新日志缓存 = r.日志 || [];
    提示('强制同步失败：' + r.错误);
    刷新设置详情();
    return;
  }
  更新日志缓存 = r.日志 || [];
  刷新设置详情();
  await 等服务重启(旧提交);
};
// 更新日志：弹模态框看，日志长了在框内滚动，不把设置页撑长
window.看更新日志 = async function() {
  if (!版本日志缓存) {
    打开模态(`<h2>📜 更新日志</h2>
      <p style="color:var(--次文字);font-size:13px">正在读取…</p>`);
    版本日志缓存 = await api('/api/update/changelog').catch(() => []);
  }
  const 段落 = 版本日志缓存 || [];
  const 正文 = 段落.length
    ? 段落.map(段 => `<div class="日志段">
        <div class="日志段头"><b>${转义(段.版本)}</b>${段.日期 ? `<span>${转义(段.日期)}</span>` : ''}</div>
        <ul>${(段.条目 || []).map(条 => `<li>${转义(条)}</li>`).join('') || '<li style="color:var(--次文字)">（本版本无条目）</li>'}</ul>
      </div>`).join('')
    : '<div style="color:var(--次文字);padding:8px 0">暂无更新日志</div>';
  打开模态(`<h2>📜 更新日志</h2>
    <div class="日志滚动区">${正文}</div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn 次" onclick="关闭模态()">关闭</button>
    </div>`);
};
// 更新/回滚成功后轮询 /api/version，等新进程真的起来了（提交号变化）再刷新页面。
// 重启期间连不上是预期行为，不弹错误提示。
async function 等服务重启(旧提交) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const v = await api('/api/version');
      if (v.提交 && v.提交 !== 旧提交) {
        更新执行中 = false;
        提示('更新完成，正在刷新');
        location.reload();
        return;
      }
    } catch (e) { /* 重启中连不上是正常的，继续等 */ }
  }
  更新执行中 = false;
  提示('服务重启超时，请手动刷新页面或检查服务端窗口');
  刷新设置详情();
}
// 主题模式：明亮 / 暗黑，存 localStorage，每台设备各记各的
function 设置_主题() {
  return `
    <div class="卡片">
      <h2>🎨 主题模式</h2>
      <div class="工具栏">
        <button class="btn ${主题==='明亮'?'':'次'}" onclick="切换主题('明亮')">☀ 明亮</button>
        <button class="btn ${主题==='暗黑'?'':'次'}" onclick="切换主题('暗黑')">🌙 暗黑</button>
      </div>
      <p style="color:var(--次文字);font-size:13px">主题选择存在本浏览器，手机和电脑各自记忆、互不影响。</p>
    </div>`;
}
// 安全设置：登录密码（改密要验当前密码，新密码输两遍）
async function 设置_安全() {
  const 账号 = await api('/api/account').catch(() => ({ 用户名: '' }));
  return `
    <div class="卡片">
      <h2>🔒 登录密码</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">当前登录用户名：<b style="color:var(--文字)">${转义(账号.用户名 || '—')}</b>。改密后需重新登录（浏览器会重新弹出登录框）。</p>
      <div class="表单">
        <div class="字段"><label>当前密码</label><input id="密当前" type="password" autocomplete="current-password"></div>
        <div class="字段"><label>新用户名（留空则不变）</label><input id="密用户" autocomplete="username"></div>
        <div class="字段"><label>新密码（至少 6 位）</label><input id="密新" type="password" autocomplete="new-password"></div>
        <div class="字段"><label>确认新密码（再输一次）</label><input id="密新2" type="password" autocomplete="new-password"></div>
      </div>
      <div style="margin-top:12px"><button class="btn" onclick="修改密码()">修改登录密码</button></div>
    </div>`;
}
// 导出：整库备份 / 迁移 + 按月按类型导 CSV
function 设置_导出() {
  const s = 全局.settings;
  return `
    <div class="卡片">
      <h2>📦 数据备份 / 迁移</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">导出：下载一份完整数据备份（含所有房客、账单、抄表、退房、历史账单、备忘录）；导入：上传备份文件覆盖当前数据（用于换设备、迁移到线上服务器）。登录密码不在备份里，不会被覆盖。</p>
      <div class="工具栏">
        <a class="btn" href="/api/export" download>导出数据备份</a>
        <input type="file" id="导入文件" accept=".json,application/json" style="display:none" onchange="导入数据(this.files[0])">
        <button class="btn 次" onclick="document.getElementById('导入文件').click()">导入数据备份</button>
      </div>
    </div>
    <div class="卡片">
      <h2>账单导出</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">选择月份和账单类型导出（CSV，可用 Excel 打开；日租按天汇总、没客人的天也占一行）。</p>
      <div class="工具栏">
        <input type="month" id="导月份" value="${s.当前月份}">
        <select id="导类型" style="width:150px">
          <option value="月租" selected>月租账单</option>
          <option value="日租">日租账单</option>
          <option value="支出">支出账单</option>
          <option value="总账单">总账单</option>
          <option value="全部">全部账单</option>
        </select>
        <button class="btn" onclick="导出账单()">导出</button>
      </div>
    </div>`;
}
// 参数：当前月份 + 房源清单 + 水电变量 + 工资变量（全楼公用的那些值都在这）
async function 设置_参数() {
  const s = 全局.settings;
  const [房源, rooms] = await Promise.all([api('/api/houses'), api('/api/rooms')]);
  const 在租集合 = new Set(rooms.filter(r => r.月租金 !== '' && r.月租金 != null).map(r => r.房号));
  const 分段 = (s.工资分段 || []).slice().sort((a, b) => String(a.起始月份).localeCompare(String(b.起始月份)));
  const 房源表 = `<div class="工具栏">
      <input id="新房号" placeholder="房号，如 1101" style="width:160px">
      <select id="新房型"><option>月租</option><option>日租</option><option>自住房</option></select>
      <button class="btn" onclick="添加房源()">添加房源</button>
      <button class="btn 次" onclick="切换房源删除模式()">🗑 删除模式</button>
    </div>
    <div class="表格容器"><table>
      <tr><th>房号</th><th>房型</th><th>状态</th>${房源删除模式 ? '<th>选择</th>' : '<th></th>'}</tr>
      ${房源.map(h => {
        const 在租 = 在租集合.has(h.房号);
        const 房型 = h.房型 || '月租';
        const 房型类 = 房型 === '日租' ? '黄' : (房型 === '自住房' ? '紫' : '次');
        return `<tr><td><b>${转义(h.房号)}</b></td><td><button class="btn 行内 ${房型类}" onclick="切换房型(${h.id},'${房型}')">${房型}</button></td>
          <td>${在租 ? '🔒在租' : '<span style="color:var(--次文字)">空置</span>'}</td>
          <td>${房源删除模式 && !在租 ? `<input type="checkbox" data-id="${h.id}" ${房源选中.has(h.id) ? 'checked' : ''} onchange="房源选中切换(${h.id}, this.checked)">` : ''}</td></tr>`;
      }).join('')}
      ${房源.length ? '' : '<tr><td colspan="4" class="空">暂无房源，请先添加</td></tr>'}
    </table></div>
    ${房源删除模式 ? `<div class="备忘底栏">
      ${房源.length ? `<label class="备忘全选"><input type="checkbox" onchange="房源全选(this.checked)">全选空置</label>` : ''}
      <button class="btn 小 危险" onclick="批量删除房源()">删除选中（${房源选中.size}）</button>
      <button class="btn 小 次" onclick="切换房源删除模式()">退出删除模式</button>
    </div>` : ''}`;

  return `
    <div class="卡片">
      <h2>📅 当前月份</h2>
      <div class="工具栏">
        <input id="设月份" type="month" value="${s.当前月份}">
        <button class="btn" onclick="保存设置()">保存</button>
        <button class="btn 次" onclick="切下月()">下月 ▶（一键切月）</button>
      </div>
      <p style="color:var(--次文字);font-size:13px;margin-top:8px">一键切月会先把本月固化进历史总账单，再把当前月份 +1。</p>
    </div>
    ${折叠卡片('房源', `<h2 style="margin:0">🏠 房源信息（${房源.length} 间）</h2>`, `<p style="color:var(--次文字);font-size:13px;margin-bottom:12px">这里是楼里全部房号的清单，总览空置房间、房间档案都以它为准；出租前先在此添加房源。在租/日租/自住房不能被删除。</p>` + 房源表)}
    <div class="卡片">
      <h2>💧 水电变量</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">全楼默认单价。房间档案、水电抄表、退房结算里的单价<b>留空就跟随这里</b>；哪间房要单独定价，就在「房间档案」里填数字覆盖，只影响那一间。改动只影响之后新算的账单，已生成的历史账单不变。</p>
      <div class="表单 两列">
        <div class="字段"><label>水费单价（元/方）</label><input id="设水价" type="number" step="0.01" min="0" value="${s.水价}"></div>
        <div class="字段"><label>电费单价（元/度）</label><input id="设电价" type="number" step="0.01" min="0" value="${s.电价}"></div>
      </div>
      <div style="margin-top:12px"><button class="btn" onclick="保存水电单价()">保存水电单价</button></div>
    </div>
    <div class="卡片">
      <h2>💰 工资变量</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">按起始月份分段生效，影响「总账单」和总览的工资/利润/净利润计算；改动的分段只影响它之后的历史月份，之前的历史数字不变。起始月份之前、以及没有匹配分段的月份按 0 算。</p>
      <div class="表格容器"><table>
        <tr><th>起始月份</th><th class="数字">月工资（元）</th><th></th></tr>
        ${分段.map(x => `<tr><td>${转义(x.起始月份)}</td><td class="数字">¥${数字(x.金额)}</td><td><button class="btn 行内 危险" onclick="删除工资分段('${转义(x.起始月份)}')">删</button></td></tr>`).join('')}
        ${分段.length ? '' : '<tr><td colspan="3" class="空">还没有分段（工资按 0 算）</td></tr>'}
      </table></div>
      <div class="工具栏" style="margin-top:12px">
        <input id="新工资起始" type="month" value="${s.当前月份}">
        <input id="新工资金额" type="number" placeholder="金额，如 4000" style="width:150px">
        <button class="btn" onclick="添加工资分段()">+ 添加分段</button>
      </div>
    </div>`;
}
// 关于：版本号 + 在线更新 + 数据文件在哪
async function 设置_关于() {
  const v = await api('/api/version').catch(() => null);
  if (v) 当前版本信息 = v;   // 拉不到（更新重启中）就沿用上一次的，别把版本号抹成「未知」
  return 在线更新卡片();
}
window.切换主题 = function(新主题) {
  主题 = 新主题; localStorage.setItem('主题', 主题); 应用主题();
  刷新设置详情();   // 只刷新右侧详情，按钮高亮跟着变
};
window.修改密码 = async function() {
  const 当前 = document.getElementById('密当前').value;
  const 用户名 = document.getElementById('密用户').value.trim();
  const 新密码 = document.getElementById('密新').value;
  const 确认密码 = document.getElementById('密新2').value;
  if (!当前) { 提示('请输入当前密码'); return; }
  if (!新密码 || 新密码.length < 6) { 提示('新密码至少 6 位'); return; }
  if (确认密码 !== 新密码) { 提示('两次输入的新密码不一致'); return; }   // 防打错，后端也再校验一次
  if (!await 询问确认('修改登录密码', `确定要把登录密码改掉吗？<br>改完浏览器会重新弹登录框，需要用新密码登录。`)) return;
  const r = await api('/api/password', { method: 'POST', body: { 当前密码: 当前, 新用户名: 用户名, 新密码, 确认密码 } });
  if (r.错误) { 提示(r.错误); return; }
  alert('登录密码已修改为：' + r.用户名 + '\n\n下次访问需用新密码登录（浏览器会重新弹登录框）。');
  关闭模态(); 渲染();
};
// 设置页里的操作一律只重绘右侧详情（别整页 渲染()，否则目录树跟着重建、页面会跳）
window.切换房源删除模式 = function() { 房源删除模式 = !房源删除模式; 房源选中.clear(); 刷新设置详情(); };
window.房源选中切换 = function(id, 选中) { 选中 ? 房源选中.add(id) : 房源选中.delete(id); 刷新设置详情(); };
window.房源全选 = function(全选) { 房源选中.clear(); if (全选) document.querySelectorAll('#设置详情 input[type="checkbox"][data-id]').forEach(c => 房源选中.add(Number(c.dataset.id))); 刷新设置详情(); };
window.批量删除房源 = async function() {
  if (!房源选中.size) { 提示('请先选中要删除的房源'); return; }
  if (!confirm(`确定删除选中的 ${房源选中.size} 间房源？（仅限空置房源）`)) return;
  let 成功 = 0;
  for (const id of [...房源选中]) {
    const r = await api(`/api/houses/${id}`, { method: 'DELETE' });
    if (!r.错误) 成功++;
  }
  房源选中.clear(); 提示(`已删除 ${成功} 间`); 刷新设置详情();
};
// 保存全楼默认水电单价（房间档案里留空的房间跟着变）
window.保存水电单价 = async function() {
  const 水价 = Number(document.getElementById('设水价').value);
  const 电价 = Number(document.getElementById('设电价').value);
  if (!(水价 > 0)) { 提示('水费单价要填大于 0 的数字'); return; }
  if (!(电价 > 0)) { 提示('电费单价要填大于 0 的数字'); return; }
  if (!await 询问确认('保存水电单价', `水费 ${精金额(水价)} 元/方、电费 ${精金额(电价)} 元/度。<br>房间档案里单价留空的房间，往后都按这个价算。`)) return;
  const s = await api('/api/settings', { method: 'POST', body: { 水价, 电价 } });
  if (s.错误) { 提示(s.错误); return; }
  全局.settings = s; 提示('已保存'); 刷新设置详情();
};
window.添加工资分段 = async function() {
  const 起始 = document.getElementById('新工资起始').value;
  const 金额 = Number(document.getElementById('新工资金额').value);
  if (!起始) { 提示('请选起始月份'); return; }
  if (!金额 || 金额 <= 0) { 提示('请输入有效的工资额'); return; }
  const 分段 = 全局.settings.工资分段 || [];
  const 已有 = 分段.find(x => x.起始月份 === 起始);
  const 新分段 = 已有 ? 分段.map(x => x.起始月份 === 起始 ? { 起始月份: 起始, 金额 } : x)
                     : [...分段, { 起始月份: 起始, 金额 }];
  const s = await api('/api/settings', { method: 'POST', body: { 工资分段: 新分段 } });
  全局.settings = s; 提示('已保存'); 刷新设置详情();
};
window.删除工资分段 = async function(起始) {
  if (!confirm(`删除「${起始}」这个工资分段？`)) return;
  const 新分段 = (全局.settings.工资分段 || []).filter(x => x.起始月份 !== 起始);
  const s = await api('/api/settings', { method: 'POST', body: { 工资分段: 新分段 } });
  全局.settings = s; 提示('已删除'); 刷新设置详情();
};
window.导出账单 = async function() {
  const 月 = document.getElementById('导月份').value;
  const 类型值 = document.getElementById('导类型').value;
  if (!月) { 提示('请选月份'); return; }
  if (!类型值) { 提示('请选导出类型'); return; }
  const 类型 = 类型值 === '全部' ? ['月租', '日租', '支出', '总账单'] : [类型值];
  const 块 = [];
  if (类型.includes('月租')) {
    const 账单 = await api(`/api/bills?month=${月}`);
    const 在租 = 账单.filter(b => b.状态 !== '未出租');
    const 表头 = ['房号', '交租日期', '房租', '新收押金', '管理费', '水费', '电费', '欠费滚存', '实收', '欠款', '状态'];
    const 行们 = 在租.map(b => [b.房号, b.交租日期 || '', b.房租, b.新收押金 || 0, b.管理费, b.水费, b.电费, b.结转 || 0, (b.实收 || 0) + (b.补缴 || 0) + (b.新收押金 || 0) + (b.预缴 || 0), b.欠款 || 0, b.状态]);
    块.push([['月租账单'], 表头, ...行们]);
  }
  if (类型.includes('日租')) {
    const daily = await api(`/api/daily?month=${月}`);
    // 图表模式：每行一天，横向每个单元格一个客户金额，末尾当日合计
    const 按日 = {};
    for (const d of daily) (按日[d.日期] = 按日[d.日期] || []).push(Number(d.金额) || 0);
    // 整月每天都出一行，没客人的那天后面各列留空（与页面显示一致）
    const 日期列表 = 月内日期们(月);
    const 最大客户数 = Math.max(1, ...日期列表.map(日 => (按日[日] || []).length));
    const 表头 = ['日期', ...Array.from({ length: 最大客户数 }, (_, i) => '客户' + (i + 1)), '当日合计'];
    const 行们 = 日期列表.map(日 => {
      const 金额们 = 按日[日] || [];
      if (!金额们.length) return [日, ...Array(最大客户数).fill(''), ''];
      return [日, ...金额们, ...Array(最大客户数 - 金额们.length).fill(''), 金额们.reduce((s, x) => s + x, 0)];
    });
    块.push([['日租账单（明细）'], 表头, ...行们]);
  }
  if (类型.includes('支出')) {
    const 支出 = await api(`/api/transactions?month=${月}`);
    const 行们 = 支出.map(t => [t.日期, t.事项, t.金额]);
    块.push([['支出账单'], ['日期', '事项', '金额'], ...行们]);
  }
  if (类型.includes('总账单')) {
    const s = await api(`/api/summary?month=${月}`);
    块.push([['总账单'], ['月份', '月租总收', '日租总收', '支出', '合计'], [月, s.月租已收, s.日租已收, s.支出, s.合计]]);
  }
  const csv = '﻿' + 块.map(b => b.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')).join('\n\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `账单导出_${月}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  提示('已导出 ' + 月);
};
window.导入数据 = async function(文件) {
  if (!文件) return;
  if (!confirm('导入会覆盖当前所有数据，确定继续？建议先「导出」留个备份。')) return;
  const 内容 = await 文件.text();
  let 数据;
  try { 数据 = JSON.parse(内容); } catch (e) { 提示('文件不是有效的 JSON'); return; }
  const r = await api('/api/import', { method: 'POST', body: 数据 });
  if (r.错误) { 提示(r.错误); return; }
  提示('数据已导入'); 全局 = await api('/api/all'); 渲染();
};
window.保存设置 = async function() {
  const s = await api('/api/settings', { method: 'POST', body: { 当前月份: document.getElementById('设月份').value } });
  全局.settings = s; 提示('已保存'); 渲染();
};
// 一键切到下月（当前月份 +1）
window.切下月 = async function() {
  const 当前月 = 全局.settings.当前月份;
  await api('/api/settle', { method: 'POST', body: { 月份: 当前月 } }); // 固化本月到历史总账单
  const 下月 = 加月(当前月, 1);
  const s = await api('/api/settings', { method: 'POST', body: { 当前月份: 下月 } });
  全局.settings = s; 提示('已切到 ' + 下月); 渲染();
};
window.添加房源 = async function() {
  const 房号 = document.getElementById('新房号').value.trim();
  const 房型 = document.getElementById('新房型').value;
  if (!房号) { 提示('请填房号'); return; }
  const r = await api('/api/houses', { method: 'POST', body: { 房号, 房型 } });
  if (r.错误) { 提示(r.错误); return; }
  提示('已添加'); 刷新设置详情();
};
window.切换房型 = async function(id, 当前) {
  const 顺序 = ['月租', '日租', '自住房'];
  const i = 顺序.indexOf(当前 || '月租');
  const 新 = 顺序[(i + 1) % 顺序.length];
  await api(`/api/houses/${id}`, { method: 'PUT', body: { 房型: 新 } });
  提示('已切换为' + 新); 刷新设置详情();
};

(async function 初始化() { 应用主题(); 全局 = await api('/api/all'); 渲染(); })();

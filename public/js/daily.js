// ============ 日租房态图（EBK 式：空闲 → 在住 → 脏房 → 空闲） + 未来预订 ============
// 钱只在「办入住」那一步记进 daily（账单页/总账单的口径没变），退房和清洁只改房间状态。
let 房态数据 = null;   // 最近一次 /api/roomstatus 的结果，弹窗里要用
let 预订缓存 = { 今日: '', 列表: [] };
let 日租趋势月 = '';
let 日租页视图 = '状态'; // '状态' | '预订'
const 回看天数 = 3;
let 时间线起点偏移 = -回看天数; // 默认从今天往前 3 天开始，完整看见已住与剩余
let 时间线窗宽 = 14;    // 7 天 | 14 天 | 30 天
const 未来总天数 = 60;

function 日租加天(日期, 偏移) {
  const [y, m, d] = String(日期).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 偏移));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function 晚数差(a, b) {
  if (!a || !b) return 0;
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
function 有效预订列表() {
  return (预订缓存.列表 || []).filter(b => b.状态 === 'pending' || b.状态 === 'confirmed');
}

async function 渲染日租(容器) {
  const 当前月 = 全局.settings.当前月份 || 营业日().slice(0, 7);
  if (!日租趋势月) 日租趋势月 = 当前月;
  const [d, 月流水, 预订包] = await Promise.all([
    api('/api/roomstatus'),
    api(`/api/daily?month=${日租趋势月}`).catch(() => []),
    api('/api/bookings').catch(() => ({ 今日: 营业日(), 列表: [] }))
  ]);
  房态数据 = d;
  预订缓存 = 预订包 || { 今日: d.今日 || 营业日(), 列表: [] };
  const 概 = d.概览;
  const 有效数 = 有效预订列表().length;
  const 今农 = 农历信息(d.今日 || 营业日());

  const 顶栏 = `
    <div class="日租顶栏">
      <div>
        <h2 style="margin:0;font-size:var(--fs-lg)">日租工作台</h2>
        <div class="日租副标">${中文日期(d.今日)} · ${今农.周} · 农历${今农.全称}</div>
      </div>
      <div class="日租顶右">
        <div class="分段胶囊" role="tablist">
          <button type="button" aria-selected="${日租页视图 === '状态'}" onclick="切日租视图('状态')">当前状态</button>
          <button type="button" aria-selected="${日租页视图 === '预订'}" onclick="切日租视图('预订')">预订${有效数 ? `<span class="胶囊数">${有效数}</span>` : ''}</button>
        </div>
        <button type="button" class="btn" onclick="打开预订抽屉()">+ 新增预订</button>
      </div>
    </div>`;

  if (日租页视图 === '预订') {
    容器.innerHTML = 顶栏 + 渲染日租预订HTML(d);
    requestAnimationFrame(() => 绑定预订交互(d));
    return;
  }

  容器.innerHTML = `
    ${顶栏}
    <div class="卡片 趋势卡" id="日租趋势区"></div>
    <div class="卡片">
      <div class="工具栏"><span style="color:var(--次文字);font-size:var(--fs-sm);flex:1">共 ${d.房间.length} 间日租房</span>
        ${概.脏房 ? `<button class="btn 黄" onclick="一键全清()">全部脏房标记已清洁（${概.脏房}）</button>` : ''}
      </div>
      <div class="汇总网格">
        <div class="汇总项"><div class="标签"><i class="汇总圆点 收入"></i>在住</div><div class="数值">${概.在住} 间</div></div>
        <div class="汇总项"><div class="标签">脏房待清洁</div><div class="数值">${概.脏房} 间</div></div>
        <div class="汇总项"><div class="标签">可用</div><div class="数值">${概.可用} 间</div></div>
        <div class="汇总项"><div class="标签"><i class="汇总圆点 收入"></i>今日日租收入</div><div class="数值">${金额HTML(概.今日收入)}</div></div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:center;color:var(--次文字);font-size:var(--fs-xs);margin-top:12px">
        <span class="状态点标" style="color:var(--text-daily-occupied)"><i></i>在住</span>
        <span class="状态点标" style="color:var(--text-dirty)"><i></i>脏房待清洁</span>
        <span class="状态点标" style="color:var(--text-daily-label)"><i></i>空闲</span>
        <span>点卡片办理入住 / 退房 / 清洁，房费在办入住时记入日租账单</span>
      </div>
      ${d.房间.length ? `<div class="房态网格">${d.房间.map(房态卡).join('')}</div>`
        : '<p class="空">还没有日租房间。去「设置 → 高级设置 → 房源信息」把房间的房型切成「日租」。</p>'}
    </div>
    <div class="卡片">
      <div class="工具栏"><h2 style="margin:0;flex:1">今日入住记录（${中文日期(d.今日)}）　合计 ${金额HTML(概.今日收入)}</h2>
        <label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--次文字);cursor:pointer;white-space:nowrap"><input type="checkbox" ${启用删除?'checked':''} onchange="启用删除=this.checked;渲染()" style="cursor:pointer">删除模式</label>
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
  渲染日租本月趋势(日租趋势月, d.今日, Array.isArray(月流水) ? 月流水 : []);
}
window.切日租视图 = function(视图) {
  日租页视图 = 视图;
  渲染();
};
const 农历日名 = ['', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const 周名 = ['日', '一', '二', '三', '四', '五', '六'];
let _农历格式化 = null;
function 农历节日(日期, 农月, 农日) {
  const md = String(日期 || '').slice(5);
  if (md === '01-01') return '元旦';
  if (md === '05-01') return '劳动节';
  if (md === '10-01') return '国庆';
  if (md === '04-05') return '清明';
  if (农月 === '正月' && 农日 === '初一') return '春节';
  if (农月 === '正月' && 农日 === '十五') return '元宵';
  if (农月 === '五月' && 农日 === '初五') return '端午';
  if (农月 === '七月' && 农日 === '初七') return '七夕';
  if (农月 === '八月' && 农日 === '十五') return '中秋';
  if (农月 === '九月' && 农日 === '初九') return '重阳';
  if (农月 === '腊月' && (农日 === '廿九' || 农日 === '三十')) {
    const 次日 = 日租加天(日期, 1);
    const 次农 = 农历信息Raw(次日);
    if (次农.月 === '正月' && 次农.日 === '初一') return '除夕';
  }
  return '';
}
function 农历信息Raw(日期) {
  try {
    if (!_农历格式化) _农历格式化 = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'short', day: 'numeric' });
    const dt = new Date(日期 + 'T12:00:00');
    if (isNaN(dt)) return { 月: '', 日: '', 周: '' };
    const 周 = '周' + 周名[dt.getDay()];
    const str = _农历格式化.format(dt);
    const m = str.match(/^(.*?)(\d+)日?$/);
    if (!m) return { 月: '', 日: str, 周 };
    const 月 = m[1];
    const dNum = Number(m[2]);
    return { 月, 日: 农历日名[dNum] || String(dNum), 周 };
  } catch (e) {
    return { 月: '', 日: '', 周: '' };
  }
}
function 农历信息(日期) {
  const r = 农历信息Raw(日期);
  const 节 = 农历节日(日期, r.月, r.日);
  const 短标 = 节 || (r.日 === '初一' ? r.月 : r.日);
  return { 月: r.月, 日: r.日, 节, 短标, 全称: `${r.月}${r.日}`, 周: r.周 };
}

function 更新热力视口UI(d, 无动画 = false) {
  const 视口 = document.getElementById('热力视口');
  const 范围 = document.getElementById('热力范围');
  const 格位置 = Math.max(0, Math.min(未来总天数 - 时间线窗宽, 时间线起点偏移 + 回看天数));
  if (视口) {
    视口.style.transition = 无动画 ? 'none' : '';
    视口.style.left = `calc(${格位置} * (100% - ${(未来总天数 - 1) * 3}px) / ${未来总天数} + ${格位置 * 3}px)`;
    视口.style.width = `calc(${时间线窗宽} * (100% - ${(未来总天数 - 1) * 3}px) / ${未来总天数} + ${(时间线窗宽 - 1) * 3}px)`;
  }
  if (范围 && d) {
    const 今日 = d.今日 || 营业日();
    const 起 = 日租加天(今日, 时间线起点偏移);
    const 止 = 日租加天(今日, 时间线起点偏移 + 时间线窗宽 - 1);
    范围.textContent = `当前窗口 ${起.slice(5).replace('-', '/')} – ${止.slice(5).replace('-', '/')}`;
  }
}

window.切时间线偏移 = function(新偏移, 仅滑窗 = false) {
  const 下限 = -回看天数;
  const 上限 = Math.max(下限, 未来总天数 - 回看天数 - 时间线窗宽);
  const 目标 = Math.max(下限, Math.min(上限, Number(新偏移)));
  if (目标 === 时间线起点偏移 && 仅滑窗) return;
  时间线起点偏移 = 目标;
  if (!房态数据) return;
  更新热力视口UI(房态数据, 仅滑窗);
  if (仅滑窗) {
    if (!window._时间线raf) {
      window._时间线raf = requestAnimationFrame(() => {
        window._时间线raf = 0;
        const 板区 = document.getElementById('时间线主卡');
        if (板区) { 板区.outerHTML = 渲染时间线卡片HTML(房态数据); 绑定日历面板交互(房态数据); }
      });
    }
  } else {
    const 板区 = document.getElementById('时间线主卡');
    if (板区) { 板区.outerHTML = 渲染时间线卡片HTML(房态数据); 绑定日历面板交互(房态数据); }
  }
};
window.切时间线窗宽 = function(新宽) {
  时间线窗宽 = [7, 14, 30].includes(新宽) ? 新宽 : 14;
  const 下限 = -回看天数;
  const 上限 = Math.max(下限, 未来总天数 - 回看天数 - 时间线窗宽);
  if (时间线起点偏移 > 上限) 时间线起点偏移 = 上限;
  if (时间线起点偏移 < 下限) 时间线起点偏移 = 下限;
  if (!房态数据) return;
  更新热力视口UI(房态数据, false);
  const 板区 = document.getElementById('时间线主卡');
  if (板区) { 板区.outerHTML = 渲染时间线卡片HTML(房态数据); 绑定日历面板交互(房态数据); }
};
window.切日租趋势月 = async function(新月) {
  if (!新月) return;
  日租趋势月 = 新月;
  const 月流水 = await api(`/api/daily?month=${日租趋势月}`).catch(() => []);
  const 今日 = (房态数据 && 房态数据.今日) || 营业日();
  渲染日租本月趋势(日租趋势月, 今日, Array.isArray(月流水) ? 月流水 : []);
};
function 渲染日租本月趋势(月份, 今日日期, 月流水) {
  const 区 = document.getElementById('日租趋势区');
  if (!区) return;
  const [y, m] = 月份.split('-').map(Number);
  const 月末日 = new Date(y, m, 0).getDate();
  const 是当月 = !!(今日日期 && 今日日期.startsWith(月份));
  const 截止日 = 是当月 ? Math.min(月末日, Number(今日日期.slice(8, 10)) || 月末日) : 月末日;
  const 按日额 = new Map(), 按日单 = new Map();
  for (const x of 月流水) {
    const dt = String(x.日期 || '').slice(0, 10);
    按日额.set(dt, (按日额.get(dt) || 0) + (Number(x.金额) || 0));
    按日单.set(dt, (按日单.get(dt) || 0) + 1);
  }
  const 标签列表 = [], 金额序列 = [], 单数序列 = [];
  let 月累计 = 0;
  for (let day = 1; day <= 截止日; day++) {
    const dt = `${月份}-${String(day).padStart(2, '0')}`;
    const 额 = 按日额.get(dt) || 0;
    月累计 += 额;
    标签列表.push(`${m}-${String(day).padStart(2, '0')}`);
    金额序列.push(额);
    单数序列.push(按日单.get(dt) || 0);
  }
  const 日均 = 截止日 > 0 ? Math.round(月累计 / 截止日) : 0;
  const 开关HTML = `<div class="日期微调">
    <button type="button" onclick="切日租趋势月(加月('${月份}',-1))" title="上月">‹</button>
    <span class="日期微调字">${中文年月(月份)}<input type="month" value="${月份}" onchange="切日租趋势月(this.value)"></span>
    <button type="button" onclick="切日租趋势月(加月('${月份}',1))" title="下月">›</button>
  </div>`;
  绘制趋势图(区, {
    标题: `日租趋势（${m}月1日 – ${m}月${截止日}日）`,
    副标题: `累计 ¥${千分位(月累计)} · 日均 ¥${千分位(日均)}`,
    开关HTML,
    标签列表,
    序列们: [{ 名称: '日租收入', 颜色: '#6B5EA8', 数据: 金额序列 }],
    浮窗后缀: idx => `${单数序列[idx]} 笔`,
  });
}
// 一间房一张卡：颜色=状态，在住的把客人信息直接印在卡上
function 房态卡(r) {
  const 状态类 = r.状态 === '在住' ? '在住' : (r.状态 === '脏房' ? '脏房' : '空闲');
  let 正文 = '';
  if (r.状态 === '在住') {
    const 钟点 = r.房型 === '钟点';
    const 期 = 钟点
      ? (r.剩余分钟 != null && r.剩余分钟 <= 0 ? `<span class="房态行 警">已到点</span>` : `<span class="房态行${r.剩余分钟 != null && r.剩余分钟 <= 30 ? ' 警' : ''}">${时刻到点(r.预计退房)}到点</span>`)
      : (r.已超期 ? `<span class="房态行 警">已超期</span>` : (r.今日到期 ? `<span class="房态行 警">今天到期</span>` : `<span class="房态行">${短日期(r.到期日)}到期</span>`));
    const 人数 = (r.客人们 || []).length;
    正文 = `
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:6px">
        <div class="房态客人">${转义(r.客人 || '在住')}${人数 > 1 ? `<span class="房态人数">${人数}人</span>` : ''}</div>
        <div class="房态钱" style="margin:0">${金额HTML(r.金额)}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <span class="房态行">${短日期(r.入住日)} · ${钟点 ? `${r.时长小时}h` : `${r.天数}天`}</span>
        ${期}
      </div>`;
  } else if (r.状态 === '脏房') {
    正文 = `<div class="房态行">${r.退房时间 ? `${转义(时刻(r.退房时间))} 退房` : '待清洁'}</div>`;
  } else {
    const 未来订 = 有效预订列表().filter(b => b.房号 === r.房号).sort((a, b) => a.入住日.localeCompare(b.入住日))[0];
    if (未来订) {
      正文 = `<div class="房态行" style="color:${未来订.状态 === 'pending' ? 'var(--warn-text)' : 'var(--ok-text)'}">有${未来订.状态 === 'pending' ? '待确认' : ''}预订 ${未来订.入住日.slice(5)}</div>`;
    } else {
      正文 = `<div class="房态行 淡">${r.清洁时间 ? `${转义(时刻(r.清洁时间))} 已清洁` : '&nbsp;'}</div>`;
    }
  }
  return `<button class="房态卡 ${状态类}" onclick="点房间('${转义(r.房号)}')">
    <div class="房态卡头"><b>${转义(r.房号)}</b><span class="房态签 ${状态类}">${r.状态}</span></div>
    <div class="房态卡身">${正文}</div>
  </button>`;
}
// ISO 时间戳 → "8月26日 14:30"（房态记的是 new Date().toISOString()）。按北京时间读
function 时刻(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (isNaN(t)) return '';
  const b = 北京(t);
  return `${b.getUTCMonth() + 1}月${b.getUTCDate()}日 ${北京时分(t)}`;
}
function 找房态(房号) { return (房态数据 && 房态数据.房间.find(r => r.房号 === 房号)) || null; }
// 钟点房到点时刻，只要时分："18:30"（北京时间）
function 时刻到点(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  return isNaN(t) ? '' : 北京时分(t);
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
function 打开入住模态(r, 预订 = null) {
  const 预订id = 预订 ? 预订.id : 0;
  const 天数 = 预订 ? Math.max(1, 晚数差(预订.入住日, 预订.离店日)) : 1;
  const 金额 = 预订 ? 预订.金额 : '';
  const 入住日 = 预订 ? (预订.入住日 >= 营业日() ? 预订.入住日 : 营业日()) : 营业日();
  const 备注 = 预订 ? [预订.备注, 预订.定金 > 0 ? `预订已收定金 ¥${数字(预订.定金)}` : ''].filter(Boolean).join('；') : '';
  打开模态(`<h2>${预订 ? `预订转入住 —— ${转义(r.房号)}` : `办理入住 —— ${转义(r.房号)}`}</h2>
    <div class="房型区">
      <div class="房型选">
        <button class="房型卡 选中" data-房型="全天" onclick="选住房型('全天')">
          <span class="房型图"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg></span><span class="房型名">全日房</span>
        </button>
        <button class="房型卡" data-房型="钟点" onclick="选住房型('钟点')">
          <span class="房型图"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></span><span class="房型名">钟点房</span>
        </button>
      </div>
      <div class="字段" id="住时长区" style="display:none"><label>钟点时长（小时）</label><input id="住时长" type="number" min="0.5" step="0.5" value="3" style="width:130px"></div>
    </div>
    <div id="客人区">${
      预订 && Array.isArray(预订.客人们) && 预订.客人们.length
        ? 预订.客人们.map((g, i) => 客人行HTML(i === 0, g)).join('')
        : 客人行HTML(true, 预订 ? { 姓名: 预订.客户, 电话: 预订.电话, 身份证: 预订.身份证 } : null)
    }</div>
    <div class="行三" style="margin-top:10px">
      <div class="字段"><label>入住日期</label><input id="住日期" type="date" value="${入住日}"></div>
      <div class="字段"><label>入住天数 *</label><input id="住天数" type="number" min="1" value="${天数}"></div>
      <div class="字段"><label>金额 *</label><input id="住金额" type="number" min="0" value="${金额}" placeholder="总房费"></div>
    </div>
    <div class="字段" style="margin-top:10px"><label>备注信息</label><input id="住备注" value="${转义(备注)}" placeholder="选填"></div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <div class="分段操作栏">
        <button type="button" class="分段钮" onclick="请求关闭模态()">取消</button>
        <button type="button" class="分段钮 绿" onclick="办入住('${转义(r.房号)}',${预订id})">确认入住</button>
      </div>
    </div>`);
}
// 一位客人一行：姓名 / 电话 / 身份证。第一行末尾是「+」加人，后续行是「−」删掉这行
function 客人行HTML(首行, 预设 = null) {
  return `<div class="客人行">
    <div class="字段"><label>姓名</label><input class="客名" value="${转义(预设?.姓名 || '')}" placeholder="姓名" onchange="带出客人行(this)"></div>
    <div class="字段"><label>电话</label><input class="客话" value="${转义(预设?.电话 || '')}" placeholder="电话"></div>
    <div class="字段"><label>身份证</label><input class="客证" value="${转义(预设?.身份证 || '')}" placeholder="身份证"></div>
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
  // 钟点房带出默认价（可在「设置 → 参数 → 钟点房变量」改）。只在金额空着时填，不覆盖手输的数；切回全日房时再把自动填的那笔清掉
  const 金额框 = document.getElementById('住金额');
  if (钟点) {
    if (!金额框.value.trim()) { 金额框.value = Number(全局.settings.钟点房默认价) || 60; 金额框.dataset.自动 = '1'; }
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
  在住编辑中 = false;
  const 行 = (标, 值) => `<div class="详情项"><span>${标}</span><b>${转义(值 == null || 值 === '' ? '—' : String(值))}</b></div>`;
  const 钟点 = r.房型 === '钟点';
  const 客人们 = (r.客人们 && r.客人们.length) ? r.客人们 : [{ 姓名: r.客人, 电话: r.电话, 身份证: r.身份证 }];
  const 单价 = 钟点 ? 0 : Math.round((Number(r.金额) || 0) / Math.max(1, Number(r.天数) || 1));
  const 客人行们 = 客人们.map(g => `<div class="客人行">
      <div class="字段"><label>姓名</label><input class="客名" value="${转义(g.姓名 || '')}" disabled></div>
      <div class="字段"><label>电话</label><input class="客话" value="${转义(g.电话 || '')}" disabled></div>
      <div class="字段"><label>身份证</label><input class="客证" value="${转义(g.身份证 || '')}" disabled></div>
    </div>`).join('');
  打开模态(`<h2>${转义(r.房号)} —— 在住中${钟点 ? '（钟点房）' : ''}</h2>
    <div id="编辑区">
      ${客人行们}
      <div class="详情格三" style="margin-top:12px">
        ${行('入住日', r.入住日)}
        ${钟点 ? 行('到点时刻', 时刻(r.预计退房)) : 行('到期日', r.到期日)}
        ${行('办理时间', 时刻(r.入住时间))}
      </div>
      <div class="表单 两列" style="margin-top:12px">
        ${钟点
          ? `<div class="字段"><label>时长（小时）</label><input id="续时长" type="number" min="0.5" step="0.5" value="${r.时长小时 || 3}" disabled></div>`
          : `<div class="字段"><label>入住天数</label><input id="续天数" type="number" min="1" value="${r.天数 || 1}" disabled></div>`}
        <div class="字段"><label>金额（累计）</label><input id="续金额" type="number" min="0" value="${r.金额}" disabled></div>
        <div class="字段"><label>备注</label><input id="续备注" value="${转义(r.备注 || '')}" disabled></div>
      </div>
      <p style="color:var(--次文字);font-size:13px;margin-top:8px">默认只读，点「修改」解锁后可改客人、备注、${钟点 ? '时长' : '入住天数'}和金额，改完点「保存」生效；改成 <b>0 元会撤掉账单</b>，从 0 改成正数会补记一条。${r.日租id == null ? '（当前 0 元未入账）' : ''}</p>
    </div>
    ${r.已超期 ? '<p style="color:var(--红);font-size:13px;margin-top:10px">已超过到期日，点「续住」加天数。</p>' : ''}
    ${钟点 && r.剩余分钟 != null && r.剩余分钟 <= 0 ? '<p style="color:var(--红);font-size:13px;margin-top:10px">⏰ 已到点，刷新后会自动转成脏房；要延时请点「续住」。</p>' : ''}
    <div id="续住区" style="display:none;margin-top:16px;padding:12px;border:1px solid var(--主色);border-radius:8px;background:var(--灰)">
      <div style="font-weight:600;margin-bottom:8px">续住${钟点 ? '（延时）' : ''}</div>
      <div class="表单 两列">
        ${钟点
          ? `<div class="字段"><label>延时后总时长（小时）</label><input id="续住时长" type="number" min="0.5" step="0.5" value="${r.时长小时 || 3}"></div>`
          : `<div class="字段"><label>续住天数</label><input id="续住天数" type="number" min="1" value="1"></div>`}
        <div class="字段"><label>${钟点 ? '金额' : '本次缴纳金额'}</label><input id="续住金额" type="number" min="0" value="${钟点 ? (Number(r.金额) || 0) : 单价}"></div>
      </div>
      <p style="color:var(--次文字);font-size:13px;margin-top:8px">${钟点 ? '改成延时后的总时长和金额，点右下角「保存」按新时长重算到点时间。' : '只填<b>本次</b>续住的天数和钱，点右下角「保存」自动累加到上面的累计值。'}</p>
    </div>
    <div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <button type="button" class="文字链 危" onclick="撤销入住('${转义(r.房号)}')">撤销入住</button>
      <div class="分段操作栏" style="margin-left:auto">
        <button type="button" class="分段钮 紫" id="续住钮" onclick="切换续住区()">续住</button>
        <button type="button" class="分段钮 红" onclick="房间退房('${转义(r.房号)}')">退房</button>
        <button type="button" class="分段钮 黄" id="修改钮" onclick="切换编辑()">修改</button>
        <button type="button" class="分段钮" onclick="请求关闭模态()">关闭</button>
        <button type="button" class="分段钮 绿" id="保存钮" onclick="保存在住('${转义(r.房号)}')" disabled>保存</button>
      </div>
    </div>`);
}
function 同步在住保存钮() {
  const 续住开 = document.getElementById('续住区')?.style.display !== 'none';
  const 可保存 = 在住编辑中 || 续住开;
  const 保存钮 = document.getElementById('保存钮');
  if (保存钮) {
    保存钮.disabled = !可保存;
    保存钮.classList.toggle('激活', 可保存);
  }
}
// 点「修改」：解锁/锁定可编辑字段（默认只读锁定，改完点「保存」才生效）
let 在住编辑中 = false;
window.切换编辑 = function() {
  在住编辑中 = !在住编辑中;
  if (在住编辑中) {
    const 续区 = document.getElementById('续住区');
    if (续区) 续区.style.display = 'none';
    document.getElementById('续住钮')?.classList.remove('激活');
  }
  const 区 = document.getElementById('编辑区');
  if (区) 区.querySelectorAll('input').forEach(el => { el.disabled = !在住编辑中; });
  const 修改钮 = document.getElementById('修改钮');
  if (修改钮) {
    修改钮.textContent = 在住编辑中 ? '锁定' : '修改';
    修改钮.classList.toggle('激活', 在住编辑中);
  }
  同步在住保存钮();
};
// 点「续住」：展开/收起续住区（不点不显示）。展开后直接点右下角「保存」提交续住
window.切换续住区 = function() {
  const 区 = document.getElementById('续住区');
  if (!区) return;
  const 显示 = 区.style.display === 'none';
  if (显示 && 在住编辑中) 切换编辑();
  区.style.display = 显示 ? '' : 'none';
  document.getElementById('续住钮')?.classList.toggle('激活', 显示);
  同步在住保存钮();
  if (显示) {
    const 框 = document.getElementById('续住天数') || document.getElementById('续住时长');
    框 && 框.focus();
  }
};
function 打开脏房详情(r) {
  打开模态(`<h2>${转义(r.房号)} —— 脏房待清洁</h2>
    <p style="color:var(--次文字);font-size:14px">${r.客人 ? '上一位客人：<b style="color:var(--文字)">' + 转义(r.客人) + '</b>　' : ''}退房时间：<b style="color:var(--文字)">${转义(时刻(r.退房时间) || '—')}</b></p>
    <p style="color:var(--次文字);font-size:13px;margin-top:10px">确认清洁后房间恢复「可用」，并留一条清洁记录。</p>
    <div style="margin-top:16px">
      <div class="分段操作栏">
        <button type="button" class="分段钮 绿" onclick="确认清洁('${转义(r.房号)}')">确认清洁</button>
        <button type="button" class="分段钮" onclick="请求关闭模态()">关闭</button>
      </div>
    </div>`);
}
window.办入住 = async function(房号, 预订id = 0) {
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
  for (const 客 of 客人们) {
    const 话 = 校验手机号(客.电话);
    if (!话.有效) { 提示(`${客.姓名 || '客人'} 的手机号${话.原因}`); return; }
    const 证 = 校验身份证(客.身份证);
    if (!证.有效) { 提示(`${客.姓名 || '客人'} 的身份证${证.原因}`); return; }
  }
  const 名字 = 客人们.map(x => x.姓名).filter(Boolean).join('、');
  const 时长文 = 钟点 ? `钟点房 ${时长小时} 小时` : `${天数} 天`;
  if (!await 询问确认('确认办理入住？',
    `${转义(房号)}　${转义(名字 || '未留姓名')}${客人们.length > 1 ? `（${客人们.length} 人）` : ''}<br>${时长文}　¥${数字(金额)}${金额 > 0 ? '' : '（0 元只占房、不入账）'}`)) return;
  const r = await api('/api/roomstatus/checkin', { method: 'POST', body: {
    房号, 客人们, 入住日: document.getElementById('住日期').value,
    天数, 金额, 房型, 时长小时,
    备注: document.getElementById('住备注').value.trim(),
    预订id: 预订id || undefined
  } });
  if (r.错误) { 提示(r.错误); return; }
  if (预订id) 日租页视图 = '状态';
  提示(`${房号} 已入住`); 关闭模态(); 渲染();
};
// 保存：续住区展开时走续住提交，否则保存「修改」解锁后的编辑字段
window.保存在住 = async function(房号) {
  const 续住区 = document.getElementById('续住区');
  if (续住区 && 续住区.style.display !== 'none') return window.提交续住(房号);
  const 时长框 = document.getElementById('续时长');
  const 钟点 = !!时长框;
  const 时长小时 = 钟点 ? Number(时长框.value) || 0 : 0;
  const 天数 = 钟点 ? 1 : (Number(document.getElementById('续天数').value) || 0);
  const 金额值 = document.getElementById('续金额').value;
  if (钟点 && 时长小时 < 0.5) { 提示('钟点时长至少 0.5 小时'); return; }
  if (!钟点 && 天数 < 1) { 提示('入住天数要填 1 以上'); return; }
  if (金额值 === '') { 提示('请填金额'); return; }
  const 金额 = Number(金额值);
  if (!(金额 >= 0)) { 提示('金额不对'); return; }
  // 收集客人（姓名/电话/身份证），去掉整行全空的
  const 客人们 = [...document.querySelectorAll('#编辑区 .客人行')].map(行 => ({
    姓名: 行.querySelector('.客名').value.trim(),
    电话: 行.querySelector('.客话').value.trim(),
    身份证: 行.querySelector('.客证').value.trim()
  })).filter(x => x.姓名 || x.电话 || x.身份证);
  for (const 客 of 客人们) {
    const 话 = 校验手机号(客.电话);
    if (!话.有效) { 提示(`${客.姓名 || '客人'} 的手机号${话.原因}`); return; }
    const 证 = 校验身份证(客.身份证);
    if (!证.有效) { 提示(`${客.姓名 || '客人'} 的身份证${证.原因}`); return; }
  }
  const 备注 = document.getElementById('续备注').value.trim();
  const 名字 = 客人们.map(x => x.姓名).filter(Boolean).join('、');
  if (!await 询问确认('确认保存？',
    `${转义(房号)}　${转义(名字 || '未留姓名')}　改为 ${钟点 ? 时长小时 + ' 小时（从入住时刻起算）' : 天数 + ' 天'}　¥${数字(金额)}<br>对应的日租账单会一起改。`)) return;
  const r = await api('/api/roomstatus/extend', { method: 'POST', body: { 房号, 天数, 金额, 时长小时, 客人们, 备注 } });
  if (r.错误) { 提示(r.错误); return; }
  提示(r.提示 || '已保存'); 关闭模态(); 渲染();
};
// 续住：全天房只填本次增量（天数+金额）自动累加；钟点房填延时后的总时长+金额
window.提交续住 = async function(房号) {
  const r = 找房态(房号);
  if (!r) { 提示('房间信息已过期，正在刷新'); 渲染(); return; }
  const 钟点 = r.房型 === '钟点';
  const 金额值 = document.getElementById('续住金额').value;
  if (金额值 === '') { 提示('请填金额'); return; }
  const 金额 = Number(金额值);
  if (!(金额 >= 0)) { 提示('金额不对'); return; }
  if (钟点) {
    const 时长小时 = Number(document.getElementById('续住时长').value) || 0;
    if (时长小时 < 0.5) { 提示('延时时长至少 0.5 小时'); return; }
    if (!await 询问确认('确认延时？', `${转义(房号)}　延时后 ${时长小时} 小时　¥${数字(金额)}<br>对应的日租账单会一起改。`)) return;
    const res = await api('/api/roomstatus/extend', { method: 'POST', body: { 房号, 天数: 1, 金额, 时长小时 } });
    if (res.错误) { 提示(res.错误); return; }
    提示(res.提示 || '已延时'); 关闭模态(); 渲染();
    return;
  }
  const 续住天数 = Number(document.getElementById('续住天数').value) || 0;
  if (续住天数 < 1) { 提示('续住天数要填 1 以上'); return; }
  const 续住金额 = 金额;
  const 天数 = (Number(r.天数) || 0) + 续住天数;
  const 总金额 = (Number(r.金额) || 0) + 续住金额;
  if (!await 询问确认('确认续住？',
    `${转义(房号)}　续住 ${续住天数} 天，本次 ¥${数字(续住金额)}<br>累计后：${天数} 天　共 ¥${数字(总金额)}`)) return;
  const res = await api('/api/roomstatus/extend', { method: 'POST', body: { 房号, 天数, 金额: 总金额 } });
  if (res.错误) { 提示(res.错误); return; }
  提示(res.提示 || '续住成功'); 关闭模态(); 渲染();
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

// ============ 日租预订视图 v2（单行摘要 + 60 天热力导航 + 14/30 天拖拽时间线 + 渠道配色 + 预订列表） ============
function 预订渠道色类(渠道) {
  if (渠道 === '微信') return '渠微信';
  if (渠道 === '美团') return '渠美团';
  if (渠道 === '携程') return '渠携程';
  return '渠本地'; // 电话 / 到店
}

function 房间某日占用(房号, 日期, d) {
  const 有效 = 有效预订列表();
  if (有效.some(b => b.房号 === 房号 && 日期 >= b.入住日 && 日期 < b.离店日)) return true;
  const 态 = (d.房间 || []).find(r => r.房号 === 房号);
  if (态 && 态.状态 === '在住' && 态.入住日) {
    const 离店 = 态.房型 === '钟点' ? 日租加天(态.入住日, 1) : 日租加天(态.入住日, Math.max(1, Number(态.天数) || 1));
    if (日期 >= 态.入住日 && 日期 < 离店) return true;
  }
  return false;
}

function 区间冲突检查(房号, 入住日, 离店日, d) {
  if (!入住日 || !离店日) return false;
  const 有效 = 有效预订列表();
  if (有效.some(b => b.房号 === 房号 && 入住日 < b.离店日 && 离店日 > b.入住日)) return true;
  const 态 = (d.房间 || []).find(r => r.房号 === 房号);
  if (态 && 态.状态 === '在住' && 态.入住日) {
    const 离店 = 态.房型 === '钟点' ? 日租加天(态.入住日, 1) : 日租加天(态.入住日, Math.max(1, Number(态.天数) || 1));
    if (入住日 < 离店 && 离店日 > 态.入住日) return true;
  }
  return false;
}

function 按楼层分日租房(房间列表) {
  const 组 = new Map();
  for (const r of 房间列表) {
    const n = parseInt(r.房号);
    const 层 = r.房号 === '阁楼' ? '阁楼' : (isNaN(n) ? '其他' : `${Math.floor(n / 100)}F`);
    if (!组.has(层)) 组.set(层, []);
    组.get(层).push(r);
  }
  return [...组.entries()].sort((a, b) => (parseInt(a[0]) || 99) - (parseInt(b[0]) || 99));
}

function 渲染热力导航HTML(d) {
  const 今日 = d.今日 || 营业日();
  const 房数 = Math.max(1, (d.房间 || []).length);
  const 天列 = Array.from({ length: 未来总天数 }, (_, i) => 日租加天(今日, i - 回看天数));
  const 格位置 = Math.max(0, Math.min(未来总天数 - 时间线窗宽, 时间线起点偏移 + 回看天数));
  const 窗起 = 天列[格位置] || 今日;
  const 窗止 = 天列[Math.min(未来总天数 - 1, 格位置 + 时间线窗宽 - 1)] || 今日;

  const 格们 = 天列.map((dt, i) => {
    const 用数 = (d.房间 || []).filter(r => 房间某日占用(r.房号, dt, d)).length;
    const 比例 = Math.round((用数 / 房数) * 100);
    const 初一 = dt.endsWith('-01');
    return `<div class="热力格${初一 ? ' 月初' : ''}" data-hi="${i}" title="${dt.slice(5)} · 已占 ${用数}/${房数} 间（${比例}%）">${比例 > 0 ? `<span class="热力柱" style="height:${比例}%"></span>` : ''}</div>`;
  }).join('');

  const 刻度 = 天列.map((dt, i) => (i === 0 || dt.endsWith('-01')) ? `<span>${Number(dt.slice(5, 7))}月${Number(dt.slice(8, 10))}日</span>` : '').join('');
  const 左 = `calc(${格位置} * (100% - ${(未来总天数 - 1) * 3}px) / ${未来总天数} + ${格位置 * 3}px)`;
  const 宽 = `calc(${时间线窗宽} * (100% - ${(未来总天数 - 1) * 3}px) / ${未来总天数} + ${(时间线窗宽 - 1) * 3}px)`;

  return `
    <div class="卡片 热力导航卡" id="热力导航卡">
      <div class="热力头">
        <h2>近 ${未来总天数} 天房态占比</h2>
        <div class="热力图例"><i style="background:var(--surface-muted)"></i>空<i style="background:linear-gradient(to top, var(--daily-occupied-text) 50%, var(--surface-muted) 50%)"></i>按房数占比<i style="background:var(--daily-occupied-text)"></i>满房 · 顶金线为月初</div>
        <span class="热力范围" id="热力范围">当前窗口 ${窗起.slice(5).replace('-', '/')} – ${窗止.slice(5).replace('-', '/')}</span>
      </div>
      <div class="热力条" id="热力条">
        ${格们}
        <div class="热力视口" id="热力视口" style="left:${左};width:${宽}"></div>
      </div>
      <div class="热力刻度">${刻度}</div>
    </div>`;
}

function 渲染时间线卡片HTML(d) {
  const 今日 = d.今日 || 营业日();
  const cols = 时间线窗宽;
  const start = 时间线起点偏移;
  const winEnd = start + cols;
  const colTpl = `repeat(${cols}, minmax(0, 1fr))`;
  const 楼层们 = 按楼层分日租房(d.房间 || []);
  const 有效 = 有效预订列表();

  let 表头日期 = '';
  for (let i = start; i < winEnd; i++) {
    const dt = 日租加天(今日, i);
    const dtObj = new Date(dt + 'T12:00:00');
    const 周末 = dtObj.getDay() === 0 || dtObj.getDay() === 6;
    const 今天 = i === 0;
    const 农 = 农历信息(dt);
    const 初一 = 农.日 === '初一';
    const 月标 = (i === start || dt.endsWith('-01')) ? `<span class="月标">${Number(dt.slice(5, 7))}月</span>` : '';
    表头日期 += `<div class="日历头格${周末 ? ' 周末' : ''}${今天 ? ' 今天' : ''}${农.节 ? ' 有节日' : ''}" title="${dt} ${农.周} 农历${农.全称}${农.节 ? ' · ' + 农.节 : ''}">
      ${月标}
      <div class="周">${今天 ? '今天' : 农.周}</div>
      <div class="日">${Number(dt.slice(8, 10))}</div>
      <div class="农${农.节 ? ' 节日' : (初一 ? ' 初一' : '')}">${农.短标}</div>
    </div>`;
  }

  let 楼层行HTML = '';
  for (const [层, 房们] of 楼层们) {
    楼层行HTML += `<div class="日历楼层头"><b>${转义(层)}</b><span>${房们.length} 间</span></div>`;
    for (const r of 房们) {
      let 格们 = '';
      for (let i = start; i < winEnd; i++) {
        const dt = 日租加天(今日, i);
        const 周末 = [0, 6].includes(new Date(dt + 'T12:00:00').getDay());
        格们 += `<div class="日历格${周末 ? ' 周末' : ''}${i === 0 ? ' 今天' : ''}" data-i="${i}" data-dt="${dt}"></div>`;
      }
      // 叠加色块（在住 + 有效预订，支持已住斜纹比例 + 截断晚数提示）
      let 块们 = '';
      const 渲染色块 = ({ s, e, 类, 名字, 数据属性, 标题提示 }) => {
        const vs = Math.max(s, start), ve = Math.min(e, winEnd);
        if (ve <= vs) return;
        const left = ((vs - start) / cols) * 100;
        const width = ((ve - vs) / cols) * 100;
        const 总晚 = Math.max(1, e - s);
        const 已住晚 = Math.max(0, Math.min(总晚, 0 - s));
        const 剩晚 = Math.max(0, 总晚 - 已住晚);
        // 视图内落在「今天(0)」之前的部分占可见块的比例，渲染斜纹遮罩
        const 视图已过 = Math.max(0, Math.min(ve, 0) - vs);
        const 过比 = Math.round((视图已过 / (ve - vs)) * 100);
        const 截左 = s < start;
        const 截右 = e > winEnd;
        const 副文 = (截左 || 截右) && 已住晚 > 0
          ? `已住${已住晚}晚 · 剩${剩晚}晚`
          : `${总晚}晚`;
        块们 += `<div class="日历块 ${类}${截左 ? ' 截左' : ''}${截右 ? ' 截右' : ''}" ${数据属性} style="left:${left}%;width:calc(${width}% - 4px)" title="${标题提示}">
          ${过比 > 0 ? `<span class="已住斜纹" style="width:${过比}%"></span>` : ''}
          <span class="块文">${转义(名字)}<span class="晚">${副文}</span></span>
        </div>`;
      };

      if (r.状态 === '在住' && r.入住日) {
        const 离店 = r.房型 === '钟点' ? 日租加天(r.入住日, 1) : 日租加天(r.入住日, Math.max(1, Number(r.天数) || 1));
        const s = 晚数差(今日, r.入住日), e = 晚数差(今日, 离店);
        渲染色块({
          s, e, 类: '在住',
          名字: r.客人 || '在住',
          数据属性: `data-live-room="${转义(r.房号)}"`,
          标题提示: `${转义(r.房号)} · ${转义(r.客人 || '在住')}（在住 · ${r.入住日.slice(5)} → ${离店.slice(5)}）`
        });
      }
      for (const b of 有效.filter(x => x.房号 === r.房号)) {
        const s = 晚数差(今日, b.入住日), e = 晚数差(今日, b.离店日);
        const 渠类 = 预订渠道色类(b.渠道);
        const 待类 = b.状态 === 'pending' ? ' 待确认' : '';
        渲染色块({
          s, e, 类: `${渠类}${待类}`,
          名字: b.客户 || '预订',
          数据属性: `data-bid="${b.id}"`,
          标题提示: `${转义(b.房号)} · ${转义(b.客户)}（${转义(b.渠道 || '电话')} · ${b.状态 === 'pending' ? '待确认' : '已确认'}）`
        });
      }

      楼层行HTML += `
        <div class="日历房行" data-room="${转义(r.房号)}">
          <div class="日历房标"><span>${转义(r.房号)}</span>${r.状态 === '在住' ? '<small>在住</small>' : ''}</div>
          <div class="日历格行" style="grid-template-columns:${colTpl}">${格们}${块们}</div>
        </div>`;
    }
  }

  return `
    <div class="卡片 时间线主卡" id="时间线主卡">
      <div class="时间线工具头">
        <div>
          <h2 style="margin:0">房间时间线</h2>
          <div style="font-size:12px;color:var(--ink-3);margin-top:2px">双击空白格或拖拽多天创建预订 · 点击预订色块查看详情</div>
        </div>
        <div class="时间线控">
          <button type="button" class="微丸钮 步" onclick="切时间线偏移(${start - cols})" title="向前">‹</button>
          <button type="button" class="微丸钮" onclick="切时间线偏移(-${回看天数})">今天</button>
          <button type="button" class="微丸钮 步" onclick="切时间线偏移(${start + cols})" title="向后">›</button>
          <span style="width:4px"></span>
          <button type="button" class="微丸钮${cols === 7 ? ' 激活' : ''}" onclick="切时间线窗宽(7)">7 天</button>
          <button type="button" class="微丸钮${cols === 14 ? ' 激活' : ''}" onclick="切时间线窗宽(14)">14 天</button>
          <button type="button" class="微丸钮${cols === 30 ? ' 激活' : ''}" onclick="切时间线窗宽(30)">30 天</button>
        </div>
      </div>

      <div class="日历面板" id="日历面板">
        <div class="日历表头行">
          <div class="日历角">房间</div>
          <div class="日历日期列" style="grid-template-columns:${colTpl}">${表头日期}</div>
        </div>
        ${楼层行HTML || '<p class="空" style="padding:24px">暂无日租房间</p>'}
      </div>

      <div class="日历图例">
        <span><i class="图-住"></i>在住</span>
        <span><i class="图-wx"></i>微信</span>
        <span><i class="图-mt"></i>美团</span>
        <span><i class="图-xc"></i>携程</span>
        <span><i class="图-bd"></i>电话 / 到店</span>
        <span class="虚例">虚线框 = 待确认</span>
        <span class="提示">滚轮或鼠标拖选日期</span>
      </div>
    </div>`;
}

function 绑定预订交互(d) {
  // 1. 60 天热力条丝滑点击/拖动定位（不重建热力条 DOM，零延迟跟手）
  const 热条 = document.getElementById('热力条');
  if (热条 && !热条.dataset.bound) {
    热条.dataset.bound = '1';
    let 拖中 = false;
    const 算偏移 = cx => {
      const r = 热条.getBoundingClientRect();
      const x = Math.max(0, Math.min(r.width - 1, cx - r.left));
      return Math.floor((x / r.width) * 未来总天数) - 回看天数 - Math.floor(时间线窗宽 / 2);
    };
    热条.addEventListener('pointerdown', e => {
      拖中 = true;
      热条.setPointerCapture(e.pointerId);
      切时间线偏移(算偏移(e.clientX), true);
    });
    热条.addEventListener('pointermove', e => {
      if (!拖中) return;
      切时间线偏移(算偏移(e.clientX), true);
    });
    const 放开 = () => {
      if (!拖中) return;
      拖中 = false;
      更新热力视口UI(d, false);
    };
    热条.addEventListener('pointerup', 放开);
    热条.addEventListener('pointercancel', 放开);
  }
  绑定日历面板交互(d);
}

function 绑定日历面板交互(d) {
  const 今日 = d.今日 || 营业日();
  // 2. 日历面板拖拽选多天 + 滚轮翻页 + 点击色块定位
  const 面 = document.getElementById('日历面板');
  if (!面 || 面.dataset.bound) return;
  面.dataset.bound = '1';

  let 滚锁 = 0;
  面.addEventListener('wheel', e => {
    const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(dx) < 6) return;
    e.preventDefault();
    const now = performance.now();
    if (now - 滚锁 < 140) return;
    滚锁 = now;
    切时间线偏移(时间线起点偏移 + (dx > 0 ? 1 : -1));
  }, { passive: false });

  let 选 = null;
  const 染选区 = () => {
    面.querySelectorAll('.日历格.选中, .日历格.冲突').forEach(el => el.classList.remove('选中', '冲突'));
    if (!选) return;
    const lo = Math.min(选.a, 选.b), hi = Math.max(选.a, 选.b);
    const 行 = 面.querySelector(`.日历房行[data-room="${CSS.escape(选.room)}"]`);
    if (!行) return;
    const bad = 区间冲突检查(选.room, 日租加天(今日, lo), 日租加天(今日, hi + 1), d);
    行.querySelectorAll('.日历格').forEach(c => {
      const i = Number(c.dataset.i);
      if (i >= lo && i <= hi) c.classList.add(bad ? '冲突' : '选中');
    });
  };
  面.addEventListener('pointerdown', e => {
    if (e.target.closest('.日历块')) return;
    const c = e.target.closest('.日历格');
    const 行 = e.target.closest('.日历房行');
    if (!c || !行) return;
    选 = { room: 行.dataset.room, a: Number(c.dataset.i), b: Number(c.dataset.i) };
    染选区();
  });
  面.addEventListener('pointerover', e => {
    if (!选) return;
    const c = e.target.closest('.日历格');
    const 行 = e.target.closest('.日历房行');
    if (!c || !行 || 行.dataset.room !== 选.room) return;
    选.b = Number(c.dataset.i);
    染选区();
  });
  const 结束拖拽 = () => {
    if (!选) return;
    const s = 选; 选 = null;
    面.querySelectorAll('.日历格.选中, .日历格.冲突').forEach(el => el.classList.remove('选中', '冲突'));
    const lo = Math.min(s.a, s.b), hi = Math.max(s.a, s.b);
    if (hi > lo) {
      打开预订抽屉(s.room, 日租加天(今日, lo), hi - lo + 1);
    }
  };
  window.addEventListener('pointerup', 结束拖拽);

  面.addEventListener('dblclick', e => {
    if (e.target.closest('.日历块')) return;
    const c = e.target.closest('.日历格');
    const 行 = e.target.closest('.日历房行');
    if (!c || !行) return;
    打开预订抽屉(行.dataset.room, 日租加天(今日, Number(c.dataset.i)), 1);
  });

  面.addEventListener('click', e => {
    const 块 = e.target.closest('.日历块[data-bid]');
    if (块) { 打开预订详情弹窗(Number(块.dataset.bid)); return; }
    const 住块 = e.target.closest('.日历块[data-live-room]');
    if (住块) 打开在住日历详情(住块.dataset.liveRoom);
  });
}

window.打开在住日历详情 = function(房号) {
  const r = 找房态(房号);
  if (!r || r.状态 !== '在住') return;
  const 今日 = (房态数据 && 房态数据.今日) || 营业日();
  const 离店 = r.房型 === '钟点' ? 日租加天(r.入住日, 1) : 日租加天(r.入住日, Math.max(1, Number(r.天数) || 1));
  const 总晚 = Math.max(1, 晚数差(r.入住日, 离店));
  const 已住晚 = Math.max(0, Math.min(总晚, 晚数差(r.入住日, 今日)));
  const 剩晚 = Math.max(0, 总晚 - 已住晚);
  const 客人们 = (r.客人们 && r.客人们.length) ? r.客人们 : [{ 姓名: r.客人, 电话: r.电话, 身份证: r.身份证 }];
  const 农入 = 农历信息(r.入住日);
  const 农离 = 农历信息(离店);
  打开模态(`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <h2 style="margin:0">在住详情 · ${转义(r.房号)}</h2>
        <span class="徽章" style="background:var(--daily-occupied-bg);color:var(--daily-occupied-text)">在住中</span>
      </div>
      <span style="font-size:12.5px;color:var(--ink-3)">已住 ${已住晚} 晚 · 剩 ${剩晚} 晚</span>
    </div>
    <div class="详情格" style="margin-bottom:12px">
      <div class="详情项"><span class="详情键">入住日期</span><span class="详情值">${转义(r.入住日)} <small style="color:var(--ink-3);font-weight:400">农历${农入.全称}</small></span></div>
      <div class="详情项"><span class="详情键">预计离店</span><span class="详情值">${转义(离店)} <small style="color:var(--ink-3);font-weight:400">共${总晚}晚 · 农历${农离.全称}</small></span></div>
      <div class="详情项" style="grid-column:1 / -1"><span class="详情键">累计房费</span><span class="详情值">¥${数字(r.金额)}</span></div>
    </div>
    <div class="卡片" style="margin-bottom:12px;background:var(--surface-muted);padding:12px 14px">
      <div style="font-size:12px;color:var(--ink-3);margin-bottom:8px">在住客人（${客人们.length} 位）</div>
      ${客人们.map(g => `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:13.5px;flex-wrap:wrap">
        <b>${转义(g.姓名 || '—')}</b>
        <span style="color:var(--ink-2);font-variant-numeric:tabular-nums">${转义(g.电话 || '—')}${g.身份证 ? ` · ${转义(g.身份证)}` : ''}</span>
      </div>`).join('')}
      ${r.备注 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:13px;color:var(--ink-2)">备注：${转义(r.备注)}</div>` : ''}
    </div>
    <div style="display:flex;justify-content:flex-end">
      <div class="分段操作栏">
        <button type="button" class="分段钮 绿" onclick="关闭模态();点房间('${转义(r.房号)}')">续住 / 退房 / 修改</button>
        <button type="button" class="分段钮" onclick="请求关闭模态()">关闭</button>
      </div>
    </div>`);
};

window.打开预订详情弹窗 = function(id) {
  const b = (预订缓存.列表 || []).find(x => x.id === id);
  if (!b) return;
  const 今日 = (房态数据 && 房态数据.今日) || 营业日();
  const 未到入住日 = b.入住日 > 今日;
  const 晚 = Math.max(1, 晚数差(b.入住日, b.离店日));
  const 待补 = Math.max(0, (Number(b.金额) || 0) - (Number(b.定金) || 0));
  const 状态文 = { pending: '待确认', confirmed: '已确认', checkedin: '已入住', cancelled: '已取消' }[b.状态] || b.状态;
  const 客人们 = (Array.isArray(b.客人们) && b.客人们.length) ? b.客人们 : [{ 姓名: b.客户, 电话: b.电话, 身份证: b.身份证 }];
  const 农入 = 农历信息(b.入住日);
  const 农离 = 农历信息(b.离店日);
  打开模态(`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <h2 style="margin:0">预订详情 · ${转义(b.房号)}</h2>
        <span class="徽章 ${b.状态 === 'confirmed' ? '已核收' : (b.状态 === 'pending' ? '警告' : '灰')}">${状态文}</span>
      </div>
      <span style="font-size:12.5px;color:var(--ink-3)">${转义(b.渠道 || '电话')} · ${b.人数 || 1} 人</span>
    </div>
    <div class="详情格" style="margin-bottom:12px">
      <div class="详情项"><span class="详情键">入住日期</span><span class="详情值">${转义(b.入住日)} <small style="color:var(--ink-3);font-weight:400">农历${农入.全称}</small></span></div>
      <div class="详情项"><span class="详情键">离店日期</span><span class="详情值">${转义(b.离店日)} <small style="color:var(--ink-3);font-weight:400">${晚}晚 · 农历${农离.全称}</small></span></div>
      <div class="详情项" style="grid-column:1 / -1"><span class="详情键">预订金额（预付款）</span><span class="详情值">¥${数字(b.金额)}</span></div>
    </div>
    <div class="卡片" style="margin-bottom:12px;background:var(--surface-muted);padding:12px 14px">
      <div style="font-size:12px;color:var(--ink-3);margin-bottom:8px">登记客人（${客人们.length} 位）</div>
      ${客人们.map(g => `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:13.5px;flex-wrap:wrap">
        <b>${转义(g.姓名 || '—')}</b>
        <span style="color:var(--ink-2);font-variant-numeric:tabular-nums">${转义(g.电话 || '—')}${g.身份证 ? ` · ${转义(g.身份证)}` : ''}</span>
      </div>`).join('')}
      ${b.备注 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);font-size:13px;color:var(--ink-2)">备注：${转义(b.备注)}</div>` : ''}
    </div>
    ${未到入住日 && b.状态 === 'confirmed' ? `<div style="font-size:12.5px;color:var(--warn-text);margin-bottom:10px">提示：未到预订入住日（${转义(b.入住日)}），暂不可办理入住</div>` : ''}
    <div style="display:flex;justify-content:flex-end">
      <div class="分段操作栏">
        ${b.状态 === 'pending' ? `<button type="button" class="分段钮 绿" onclick="关闭模态();改预订状态(${b.id},'confirmed')">确认预订</button>` : ''}
        ${b.状态 === 'confirmed' && !未到入住日 ? `<button type="button" class="分段钮 绿" onclick="关闭模态();预订办理入住(${b.id})">办理入住</button>` : ''}
        ${(b.状态 === 'pending' || b.状态 === 'confirmed') ? `<button type="button" class="分段钮 红" onclick="关闭模态();取消预订(${b.id})">取消预订</button>` : ''}
        <button type="button" class="分段钮" onclick="请求关闭模态()">关闭</button>
      </div>
    </div>`);
};

function 渲染日租预订HTML(d) {
  const 今日 = d.今日 || 营业日();
  const 六十日止 = 日租加天(今日, 未来总天数);
  const 有效 = 有效预订列表();
  const 近两月 = 有效.filter(b => b.入住日 <= 六十日止);
  const 待确认数 = 近两月.filter(b => b.状态 === 'pending').length;
  const 金额合计 = 近两月.reduce((s, b) => s + (Number(b.金额) || 0), 0);
  const 定金合计 = 近两月.reduce((s, b) => s + (Number(b.定金) || 0), 0);
  let 空置房晚7 = 0;
  for (let i = 0; i < 7; i++) {
    const dt = 日租加天(今日, i);
    for (const r of (d.房间 || [])) if (!房间某日占用(r.房号, dt, d)) 空置房晚7++;
  }

  const 状态映射 = {
    pending:   { 文: '待确认', 类: '警告' },
    confirmed: { 文: '已确认', 类: '已核收' },
    checkedin: { 文: '已入住', 类: '灰' },
    cancelled: { 文: '已取消', 类: '欠款' }
  };
  const 显示列表 = (预订缓存.列表 || []).filter(b => b.状态 !== 'cancelled');

  return `
    <div class="预订摘要条">
      <div class="摘要格"><div class="k">未来 60 天预订</div><div class="v">${近两月.length}<small>单</small></div></div>
      <div class="摘要格"><div class="k"><i class="点" style="background:var(--warn-text)"></i>待确认</div><div class="v">${待确认数}<small>单</small></div></div>
      <div class="摘要格"><div class="k">预订金额</div><div class="v"><span class="币">¥</span>${千分位(金额合计)}</div></div>
      <div class="摘要格"><div class="k">空置房晚（未来 7 天）</div><div class="v">${空置房晚7}<small>晚</small></div></div>
    </div>

    ${渲染热力导航HTML(d)}
    ${渲染时间线卡片HTML(d)}

    <div class="卡片">
      <div class="工具栏"><h2 style="margin:0;flex:1">预订列表</h2><span style="font-size:12px;color:var(--次文字)">按入住日期排序</span></div>
      <div class="表格容器"><table>
        <tr><th>入住 → 离店</th><th>房间</th><th>客户</th><th class="数字">金额</th><th>状态</th><th>备注</th><th class="操作列">操作</th></tr>
        ${显示列表.map(b => {
          const s = 状态映射[b.状态] || 状态映射.pending;
          const 晚 = Math.max(1, 晚数差(b.入住日, b.离店日));
          const 待补 = Math.max(0, (Number(b.金额) || 0) - (Number(b.定金) || 0));
          return `<tr data-booking-id="${b.id}">
            <td><b>${b.入住日.slice(5).replace('-', '/')} → ${b.离店日.slice(5).replace('-', '/')}</b><div style="font-size:12px;color:var(--次文字)">${晚} 晚 · ${b.人数 || 2} 人</div></td>
            <td><b>${转义(b.房号)}</b></td>
            <td><b>${转义(b.客户)}</b><div style="font-size:12px;color:var(--次文字)">${转义(b.电话)} · ${转义(b.渠道 || '电话')}</div></td>
            <td class="数字"><b>¥${数字(b.金额)}</b><div style="font-size:12px;color:var(--次文字)">预付款</div></td>
            <td><span class="徽章 ${s.类}">${s.文}</span></td>
            <td style="color:var(--次文字);font-size:13px">${b.备注 ? 转义(b.备注) : '—'}</td>
            <td class="操作列" style="white-space:nowrap">
              ${b.状态 === 'pending' ? `<button type="button" class="文字链 绿" onclick="改预订状态(${b.id},'confirmed')">确认</button>` : ''}
              ${b.状态 === 'confirmed' ? (b.入住日 > 今日 ? `<span style="font-size:12px;color:var(--ink-3);margin-right:6px" title="未到入住日（${b.入住日}）不可提前办理">未到入住日</span>` : `<button type="button" class="文字链 主" onclick="预订办理入住(${b.id})">办理入住</button>`) : ''}
              ${(b.状态 === 'pending' || b.状态 === 'confirmed') ? `<button type="button" class="文字链 危" onclick="取消预订(${b.id})">取消</button>` : `<button type="button" class="文字链" onclick="删除预订(${b.id})">删除</button>`}
            </td>
          </tr>`;
        }).join('')}
        ${显示列表.length ? '' : '<tr><td colspan="7" class="空">暂无预订，点右上角「+ 新增预订」登记</td></tr>'}
      </table></div>
    </div>`;
}

window.改预订状态 = async function(id, 状态) {
  const r = await api(`/api/bookings/${id}`, { method: 'PUT', body: { 状态 } });
  if (r.错误) { 提示(r.错误); return; }
  提示(状态 === 'confirmed' ? '预订已确认' : '已更新');
  渲染();
};
window.取消预订 = async function(id) {
  if (!await 询问确认('取消预订？', '确定要取消这笔预订吗？取消后房间日期将释放。')) return;
  const r = await api(`/api/bookings/${id}`, { method: 'PUT', body: { 状态: 'cancelled' } });
  if (r.错误) { 提示(r.错误); return; }
  提示('预订已取消');
  渲染();
};
window.删除预订 = async function(id) {
  if (!await 询问确认('删除记录？', '确认从列表移除这条历史预订记录？')) return;
  const r = await api(`/api/bookings/${id}`, { method: 'DELETE' });
  if (r.错误) { 提示(r.错误); return; }
  提示('已删除');
  渲染();
};
window.预订办理入住 = function(id) {
  const b = (预订缓存.列表 || []).find(x => x.id === id);
  if (!b) return;
  const 今日 = (房态数据 && 房态数据.今日) || 营业日();
  if (b.入住日 > 今日) { 提示(`未到预订入住日（${b.入住日}），暂不能办理入住`); return; }
  const 态 = 找房态(b.房号);
  if (!态) { 提示(`${b.房号} 不是有效的日租房`); return; }
  if (态.状态 === '在住') { 提示(`${b.房号} 当前还在住人，请先退房再办理入住`); return; }
  if (态.状态 === '脏房') { 提示(`${b.房号} 还是脏房，请先到「当前状态」确认清洁`); return; }
  打开入住模态(态, b);
};

// ============ 右侧滑出抽屉（新增预订） ============
function 渲染预订客户组() {
  const 人数 = Math.max(1, Number(document.getElementById('订人数')?.value) || 1);
  const 容器 = document.getElementById('订客户组容器');
  if (!容器) return;
  const 旧值 = [...容器.querySelectorAll('.订客户行')].map(行 => ({
    姓名: 行.querySelector('.订名').value,
    电话: 行.querySelector('.订话').value,
    身份证: 行.querySelector('.订证').value
  }));
  容器.innerHTML = Array.from({ length: 人数 }, (_, i) => {
    const v = 旧值[i] || {};
    const 主 = i === 0;
    return `<div class="订客户行">
      ${人数 > 1 ? `<div class="订客户标">第 ${i + 1} 位客人${主 ? '（主联系人）' : ''}</div>` : ''}
      <div class="抽屉网">
        <div class="字段"><label>客户姓名${主 ? ' *' : ''}</label><input class="订名" value="${转义(v.姓名 || '')}" placeholder="姓名或称呼"></div>
        <div class="字段"><label>联系电话${主 ? ' *' : ''}</label><input class="订话" value="${转义(v.电话 || '')}" inputmode="tel" placeholder="11 位手机号"></div>
        <div class="字段 整行"><label>身份证号</label><input class="订证" value="${转义(v.身份证 || '')}" placeholder="18 位身份证号"></div>
      </div>
    </div>`;
  }).join('');
}
window.切预订人数 = function() { 渲染预订客户组(); };

function 确保预订抽屉() {
  if (document.getElementById('预订抽屉')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="预订遮罩" id="预订遮罩" onclick="关闭预订抽屉()"></div>
    <aside class="预订抽屉" id="预订抽屉" aria-hidden="true">
      <div class="抽屉头">
        <div>
          <h2>新增预订</h2>
          <p>登记未来订房，日期与在住或已有预订冲突时自动拦截</p>
        </div>
        <button type="button" class="btn 次 小" onclick="关闭预订抽屉()">关闭</button>
      </div>
      <div class="抽屉正文">
        <div class="抽屉节">住宿信息</div>
        <div class="抽屉网">
          <div class="字段"><label>房间 *</label><select id="订房号"></select></div>
          <div class="字段"><label>人数</label><select id="订人数" onchange="切预订人数()"><option value="1" selected>1 人</option><option value="2">2 人</option><option value="3">3 人</option><option value="4">4 人</option></select></div>
          <div class="字段"><label>入住日期 * <span id="订入住农历" style="color:var(--ink-3);font-weight:400;margin-left:4px"></span></label><input type="date" id="订入住" onchange="重算预订()"></div>
          <div class="字段"><label>预订天数 *</label><input type="number" id="订天数" min="1" value="1" oninput="重算预订()"></div>
          <div class="抽屉试算" style="grid-template-columns: 1fr 1fr">
            <div>预计离店<b id="订离店显">—</b></div>
            <div>预订金额（预付款）<b id="订总额">¥0</b></div>
          </div>
          <div class="抽屉错" id="订错误"></div>
        </div>

        <div class="抽屉节">客户信息</div>
        <div id="订客户组容器"></div>
        <div class="字段" style="margin-top:10px">
          <label>预订渠道</label>
          <div class="渠道组" id="订渠道组">
            ${['电话', '微信', '美团', '携程', '到店'].map((c, i) =>
              `<button type="button" class="渠道钮" aria-pressed="${i === 0}" onclick="选预订渠道(this)">${c}</button>`
            ).join('')}
          </div>
        </div>

        <div class="抽屉节">金额与备注</div>
        <div class="抽屉网">
          <div class="字段 整行"><label>预订金额（预付款） *</label><input id="订金额" type="number" min="0" placeholder="0" oninput="重算预订()"></div>
          <div class="字段 整行"><label>备注</label><input id="订备注" placeholder="例如：需要加床、晚到、特殊要求"></div>
        </div>
      </div>
      <div class="抽屉底">
        <button type="button" class="btn 次" onclick="关闭预订抽屉()">取消</button>
        <button type="button" class="btn" onclick="保存预订()">保存预订</button>
      </div>
    </aside>`);
}

window.打开预订抽屉 = function(预设房号 = '', 预设入住 = '', 预设天数 = 1) {
  确保预订抽屉();
  const 房下拉 = document.getElementById('订房号');
  const 房们 = (房态数据 && 房态数据.房间) ? 房态数据.房间.map(r => r.房号) : [];
  房下拉.innerHTML = `<option value="">请选择房间</option>${房们.map(f => `<option value="${转义(f)}">${转义(f)}</option>`).join('')}`;
  房下拉.value = 预设房号 || '';
  const 今日 = (房态数据 && 房态数据.今日) || 营业日();
  document.getElementById('订入住').value = 预设入住 || 今日;
  document.getElementById('订天数').value = String(Math.max(1, Number(预设天数) || 1));
  document.getElementById('订人数').value = '1';
  const 容器 = document.getElementById('订客户组容器');
  if (容器) 容器.innerHTML = '';
  渲染预订客户组();
  document.getElementById('订金额').value = '';
  document.getElementById('订备注').value = '';
  const 错 = document.getElementById('订错误');
  错.textContent = ''; 错.classList.remove('开');
  重算预订();
  document.getElementById('预订遮罩').classList.add('开');
  const 抽 = document.getElementById('预订抽屉');
  抽.classList.add('开');
  抽.setAttribute('aria-hidden', 'false');
};
window.关闭预订抽屉 = function() {
  document.getElementById('预订遮罩')?.classList.remove('开');
  const 抽 = document.getElementById('预订抽屉');
  if (抽) { 抽.classList.remove('开'); 抽.setAttribute('aria-hidden', 'true'); }
};
window.选预订渠道 = function(btn) {
  document.querySelectorAll('#订渠道组 .渠道钮').forEach(x => x.setAttribute('aria-pressed', 'false'));
  btn.setAttribute('aria-pressed', 'true');
};
window.重算预订 = function() {
  const inD = document.getElementById('订入住')?.value;
  const 天数 = Math.max(0, Number(document.getElementById('订天数')?.value) || 0);
  const amt = parseFloat(document.getElementById('订金额')?.value) || 0;
  const 农el = document.getElementById('订入住农历');
  if (农el) 农el.textContent = inD ? `农历${农历信息(inD).全称}` : '';
  const 离店 = (inD && 天数 > 0) ? 日租加天(inD, 天数) : '';
  const 离el = document.getElementById('订离店显');
  if (离el) 离el.textContent = 离店 ? `${离店.slice(5).replace('-', '/')} (${天数}晚)` : '—';
  const 总el = document.getElementById('订总额');
  if (总el) 总el.textContent = `¥${数字(amt)}`;
};
window.保存预订 = async function() {
  const 错 = document.getElementById('订错误');
  const 房号 = document.getElementById('订房号').value;
  const 人数 = Math.max(1, Number(document.getElementById('订人数').value) || 1);
  const 入住日 = document.getElementById('订入住').value;
  const 天数 = Number(document.getElementById('订天数').value) || 0;
  const 离店日 = 入住日 && 天数 > 0 ? 日租加天(入住日, 天数) : '';
  const 客人们 = [...document.querySelectorAll('#订客户组容器 .订客户行')].map(行 => ({
    姓名: 行.querySelector('.订名').value.trim(),
    电话: 行.querySelector('.订话').value.trim(),
    身份证: 行.querySelector('.订证').value.trim()
  }));
  const 主 = 客人们[0] || { 姓名: '', 电话: '', 身份证: '' };
  const 渠道 = document.querySelector('#订渠道组 .渠道钮[aria-pressed="true"]')?.textContent || '电话';
  const 金额 = Number(document.getElementById('订金额').value);
  const 定金 = 金额;
  const 备注 = document.getElementById('订备注').value.trim();

  const 缺 = [];
  if (!房号) 缺.push('房间');
  if (!入住日) 缺.push('入住日期');
  if (!(天数 >= 1)) 缺.push('预订天数');
  if (!主.姓名) 缺.push('客户姓名');
  if (!主.电话) 缺.push('联系电话');
  if (!(金额 > 0)) 缺.push('预订金额');
  if (缺.length) { 错.textContent = '请填写：' + 缺.join('、'); 错.classList.add('开'); return; }

  for (let i = 0; i < 客人们.length; i++) {
    const 客 = 客人们[i];
    const 话 = 校验手机号(客.电话);
    if (!话.有效) { 错.textContent = `${客.姓名 || `第 ${i + 1} 位客人`} 手机号${话.原因}`; 错.classList.add('开'); return; }
    const 证 = 校验身份证(客.身份证);
    if (!证.有效) { 错.textContent = `${客.姓名 || `第 ${i + 1} 位客人`} 身份证${证.原因}`; 错.classList.add('开'); return; }
  }

  const r = await api('/api/bookings', {
    method: 'POST',
    body: {
      房号, 人数, 天数, 入住日, 离店日,
      客户: 主.姓名, 电话: 主.电话, 身份证: 主.身份证,
      客人们: 客人们.filter(x => x.姓名 || x.电话 || x.身份证),
      渠道, 金额, 定金, 备注
    }
  });
  if (r.错误) { 错.textContent = r.错误; 错.classList.add('开'); return; }
  错.classList.remove('开');
  关闭预订抽屉();
  日租页视图 = '预订';
  提示(`${房号} 预订已登记`);
  渲染();
};


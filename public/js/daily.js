// ============ 日租房态图（EBK 式：空闲 → 在住 → 脏房 → 空闲） ============
// 钱只在「办入住」那一步记进 daily（账单页/总账单的口径没变），退房和清洁只改房间状态。
let 房态数据 = null;   // 最近一次 /api/roomstatus 的结果，弹窗里要用
let 日租趋势月 = '';
async function 渲染日租(容器) {
  const 当前月 = 全局.settings.当前月份 || 营业日().slice(0, 7);
  if (!日租趋势月) 日租趋势月 = 当前月;
  const [d, 月流水] = await Promise.all([
    api('/api/roomstatus'),
    api(`/api/daily?month=${日租趋势月}`).catch(() => [])
  ]);
  房态数据 = d;
  const 概 = d.概览;
  容器.innerHTML = `
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
        : '<p class="空">还没有日租房间。去「设置 → 参数 → 房源信息」把房间的房型切成「日租」。</p>'}
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
    正文 = `<div class="房态行 淡">${r.清洁时间 ? `${转义(时刻(r.清洁时间))} 已清洁` : '&nbsp;'}</div>`;
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
function 打开入住模态(r) {
  打开模态(`<h2>办理入住 —— ${转义(r.房号)}</h2>
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
    <div id="客人区">${客人行HTML(true)}</div>
    <div class="行三" style="margin-top:10px">
      <div class="字段"><label>入住日期</label><input id="住日期" type="date" value="${营业日()}"></div>
      <div class="字段"><label>入住天数 *</label><input id="住天数" type="number" min="1" value="1"></div>
      <div class="字段"><label>金额 *</label><input id="住金额" type="number" min="0" placeholder="总房费"></div>
    </div>
    <div class="字段" style="margin-top:10px"><label>备注信息</label><input id="住备注" placeholder="选填"></div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <div class="分段操作栏">
        <button type="button" class="分段钮" onclick="请求关闭模态()">取消</button>
        <button type="button" class="分段钮 绿" onclick="办入住('${转义(r.房号)}')">确认入住</button>
      </div>
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
      <p style="color:var(--次文字);font-size:13px;margin-top:8px">${钟点 ? '改成延时后的总时长和金额，确认后按新时长重算到点时间。' : '只填<b>本次</b>续住的天数和钱，确认后自动累加到上面的累计值。'}</p>
      <div style="margin-top:10px;display:flex;justify-content:flex-end">
        <div class="分段操作栏">
          <button type="button" class="分段钮 绿" onclick="提交续住('${转义(r.房号)}')">确认续住</button>
        </div>
      </div>
    </div>
    <div style="margin-top:16px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <button type="button" class="文字链 危" onclick="撤销入住('${转义(r.房号)}')">撤销入住</button>
      <div class="分段操作栏" style="margin-left:auto">
        <button type="button" class="分段钮 紫" onclick="切换续住区()">续住</button>
        <button type="button" class="分段钮 红" onclick="房间退房('${转义(r.房号)}')">退房</button>
        <button type="button" class="分段钮 黄" id="修改钮" onclick="切换编辑()">修改</button>
        <button type="button" class="分段钮" onclick="请求关闭模态()">关闭</button>
        <button type="button" class="分段钮 绿" id="保存钮" onclick="保存在住('${转义(r.房号)}')" disabled>保存</button>
      </div>
    </div>`);
}
// 点「修改」：解锁/锁定可编辑字段（默认只读锁定，改完点「保存」才生效）
let 在住编辑中 = false;
window.切换编辑 = function() {
  在住编辑中 = !在住编辑中;
  const 区 = document.getElementById('编辑区');
  if (区) 区.querySelectorAll('input').forEach(el => { el.disabled = !在住编辑中; });
  const 修改钮 = document.getElementById('修改钮');
  if (修改钮) {
    修改钮.textContent = 在住编辑中 ? '锁定' : '修改';
    修改钮.classList.toggle('激活', 在住编辑中);
  }
  const 保存钮 = document.getElementById('保存钮');
  if (保存钮) {
    保存钮.disabled = !在住编辑中;
    保存钮.classList.toggle('激活', 在住编辑中);
  }
};
// 点「续住」：展开/收起续住区（不点不显示）。展开后聚焦续住天数/时长框
window.切换续住区 = function() {
  const 区 = document.getElementById('续住区');
  if (!区) return;
  const 显示 = 区.style.display === 'none';
  区.style.display = 显示 ? '' : 'none';
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
  for (const 客 of 客人们) {
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
    备注: document.getElementById('住备注').value.trim()
  } });
  if (r.错误) { 提示(r.错误); return; }
  提示(`${房号} 已入住`); 关闭模态(); 渲染();
};
// 保存：把「修改」解锁后改的客人/备注/入住天数/金额（钟点房是时长/金额）存进去，等于原来的改价
window.保存在住 = async function(房号) {
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


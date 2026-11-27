// ============ 总览（左侧楼层房态工作台 + 右侧总收支与备忘录） ============
let 总览筛选集 = new Set();
let 总览待办缓存 = { 房源列表: [], 账单Map: new Map(), 日租Map: new Map(), 空置Map: new Map() };

function 房号归层(房号) {
  const n = parseInt(房号);
  return 房号 === '阁楼' ? '阁楼' : (isNaN(n) ? '其他' : Math.floor(n / 100) + ' 层');
}
function 房号层序(层) {
  const 序 = { '阁楼': 99, '其他': 98 };
  return 序[层] ?? parseInt(层);
}
function 构建总览房源卡片数据(dAll, 账单列表, 日租态, s) {
  const 账单Map = new Map((账单列表 || []).map(b => [b.房号, b]));
  const 房间Map = new Map((dAll.rooms || []).map(r => [r.房号, r]));
  const 日租Map = new Map(((日租态 && 日租态.房间) || []).map(r => [r.房号, r]));
  const 空置Map = new Map((s.空置 || []).map(x => [typeof x === 'object' ? x.房号 : x, typeof x === 'object' ? !!x.脏 : false]));
  const 房源表 = (dAll.房源 && dAll.房源.length) ? dAll.房源 : [];
  const 已见 = new Set();
  const 卡片列表 = [];

  for (const 源 of 房源表) {
    const 房号 = 源.房号;
    已见.add(房号);
    if (源.房型 === '自住房') {
      卡片列表.push({ 房号, 分类: '自住', 状态标签: '自住', 样式类: '自住', 金额文: '', 左侧文: '' });
      continue;
    }
    if (源.房型 === '日租') {
      const dr = 日租Map.get(房号);
      if (dr) {
        const 状态类 = dr.状态 === '在住' ? '日租在住' : (dr.状态 === '脏房' ? '日租脏房' : '日租空闲');
        const 金额文 = dr.状态 === '在住' ? `¥${千分位(dr.金额)}` : '';
        const 左侧文 = dr.状态 === '在住' ? [dr.入住日 ? 短日期(dr.入住日) : '', dr.客人 || ''].filter(Boolean).join(' · ') : '';
        卡片列表.push({ 房号, 分类: '日租', 状态标签: dr.状态, 样式类: 状态类, 金额文, 左侧文, 日租: dr });
      } else {
        卡片列表.push({ 房号, 分类: '日租', 状态标签: '空闲', 样式类: '日租空闲', 金额文: '', 左侧文: '' });
      }
      continue;
    }
    const 房 = 房间Map.get(房号);
    const b = 账单Map.get(房号);
    const 交租日文 = 房 && 房.入住日 ? `每月${Number(String(房.入住日).split('-')[2])}号` : '';
    const 租客名 = (房 && 房.租客姓名) ? String(房.租客姓名).trim() : '';
    const 左侧文 = [交租日文, 租客名].filter(Boolean).join(' · ');
    if (房 && b) {
      let 样式类 = '未抄';
      let 状态标签 = '待抄表';
      let 金额文 = '';
      if (b.状态 === '欠款') {
        样式类 = '欠费';
        状态标签 = '欠款';
        金额文 = `¥${千分位(b.欠款)}`;
      } else if (b.状态 === '未交' && (b.可计算 || (b.结转 || 0) > 0)) {
        样式类 = '未交';
        状态标签 = '未交';
        const 金额 = b.可计算 ? b.应付租金 : b.结转;
        金额文 = `¥${千分位(金额)}`;
      } else if (b.待发送) {
        样式类 = '待发';
        状态标签 = '待发单';
        金额文 = b.应付租金 != null ? `¥${千分位(b.应付租金)}` : '';
      } else if (b.状态 === '已核收') {
        样式类 = '已核收';
        状态标签 = b.全免 ? '已预缴' : '已核收';
        金额文 = b.实收 > 0 ? `¥${千分位(b.实收)}` : (b.全免 ? '已预缴' : '');
      }
      卡片列表.push({ 房号, 分类: '月租', 状态标签, 样式类, 金额文, 左侧文, 房, 账单: b });
    } else {
      const 脏 = 空置Map.get(房号) || false;
      卡片列表.push({
        房号, 分类: '空置', 状态标签: 脏 ? '脏房' : '空房',
        样式类: 脏 ? '空置脏' : '空置净',
        金额文: '',
        左侧文: '', 脏
      });
    }
  }
  // 兜底：若存在不在房源表里的在租房间也一并展示
  for (const [房号, 房] of 房间Map.entries()) {
    if (已见.has(房号)) continue;
    const b = 账单Map.get(房号);
    const 交租日文 = 房.入住日 ? `每月${Number(String(房.入住日).split('-')[2])}号` : '';
    const 左侧文 = [交租日文, (房.租客姓名 || '').trim()].filter(Boolean).join(' · ');
    卡片列表.push({
      房号, 分类: '月租',
      状态标签: b ? b.状态 : '在租',
      样式类: b && b.状态 === '已核收' ? '已核收' : (b && b.状态 === '欠款' ? '欠费' : (b && b.可计算 ? '未交' : '未抄')),
      金额文: b && b.应付租金 != null ? `¥${千分位(b.应付租金)}` : '',
      左侧文,
      房, 账单: b
    });
  }
  总览待办缓存 = { 房源列表: 卡片列表, 账单Map, 日租Map, 空置Map };
  return 卡片列表;
}

function 过滤工作台卡片(列表, 筛选) {
  if (筛选 === '全部') return 列表;
  if (筛选 === '欠费') return 列表.filter(x => x.样式类 === '欠费' || x.样式类 === '未交');
  if (筛选 === '待发') return 列表.filter(x => x.样式类 === '待发');
  if (筛选 === '已核收') return 列表.filter(x => x.样式类 === '已核收');
  if (筛选 === '空置') return 列表.filter(x => x.分类 === '空置');
  if (筛选 === '脏房') return 列表.filter(x => x.样式类 === '空置脏' || x.样式类 === '日租脏房');
  if (筛选 === '日租') return 列表.filter(x => x.分类 === '日租');
  return 列表;
}

function 楼层短标(层) {
  if (层 === '阁楼' || 层 === '其他') return 层;
  const n = parseInt(层);
  return isNaN(n) ? 层 : `${n}F`;
}

function 取房卡金额数(c) {
  if (!c) return 0;
  if (c.样式类 === '欠费') return Number(c.账单?.欠款) || 0;
  if (c.样式类 === '未交') return Number(c.账单?.可计算 ? c.账单?.应付租金 : c.账单?.结转) || 0;
  if (c.样式类 === '待发') return Number(c.账单?.应付租金) || 0;
  return 0;
}

function 取房卡日期数(c) {
  const 日串 = c?.房?.入住日 || c?.账单?.交租日期 || '';
  const d = Number(String(日串).split('-')[2]);
  return Number.isFinite(d) && d > 0 ? d : 99;
}

function 按日期排房卡(a, b) {
  return 取房卡日期数(a) - 取房卡日期数(b) || String(a.房号).localeCompare(String(b.房号), 'zh-CN', { numeric: true });
}

function 渲染楼层工作台HTML(卡片列表) {
  const 欠款们 = 卡片列表.filter(x => x.样式类 === '欠费').sort(按日期排房卡);
  const 未交们 = 卡片列表.filter(x => x.样式类 === '未交').sort(按日期排房卡);
  const 待发们 = 卡片列表.filter(x => x.样式类 === '待发').sort(按日期排房卡);
  const 空净们 = 卡片列表.filter(x => x.样式类 === '空置净');
  const 脏房们 = 卡片列表.filter(x => x.样式类 === '空置脏' || x.样式类 === '日租脏房');
  const 欠款总额 = 欠款们.reduce((s, c) => s + 取房卡金额数(c), 0);
  const 未交总额 = 未交们.reduce((s, c) => s + 取房卡金额数(c), 0);

  const 组 = {};
  for (const c of 卡片列表) {
    const 层 = 房号归层(c.房号);
    (组[层] = 组[层] || []).push(c);
  }
  // 阁楼置顶，其余按 2F -> 10F 升序排列
  const 全景层序 = 层 => 层 === '阁楼' ? 0 : 房号层序(层);
  const 排序层 = Object.entries(组).sort((a, b) => 全景层序(a[0]) - 全景层序(b[0]));

  const 命中筛选 = c => {
    if (总览筛选集.size === 0) return true;
    if (总览筛选集.has('欠款') && c.样式类 === '欠费') return true;
    if (总览筛选集.has('未交') && c.样式类 === '未交') return true;
    if (总览筛选集.has('空房') && c.样式类 === '空置净') return true;
    if (总览筛选集.has('脏房') && (c.样式类 === '空置脏' || c.样式类 === '日租脏房')) return true;
    return false;
  };

  const 简左 = c => {
    const 房 = c.房;
    const 日 = 房 && 房.入住日 ? `${Number(String(房.入住日).split('-')[2])}号` : '';
    const 名 = (房 && 房.租客姓名) ? String(房.租客姓名).trim() : '';
    return [日, 名].filter(Boolean).join(' · ') || '—';
  };

  const 渲染发送状态 = c => {
    const b = c.账单;
    if (!b || !b.可计算) return '<span class="待办未抄">未抄表</span>';
    const 房 = 转义(c.房号);
    const 日 = 转义(b.交租日期 || '');
    if (b.待发送) {
      return `<button type="button" class="待办钮 待发送钮" onclick="event.stopPropagation();发送跳转('${房}','${日}')">发送</button>`;
    }
    return `<button type="button" class="待办钮 已发送钮" onclick="event.stopPropagation();发送跳转('${房}','${日}')" title="点击查看租客账单">已发送 ✓</button>`;
  };

  const 渲染待处理组 = (标题, 点色类, 列表, 总额) => {
    if (!列表.length) return '';
    return `
      <div class="待办组">
        <div class="待办组头">
          <span class="待办组名"><i class="${点色类}"></i>${标题}</span>
          <span class="待办组数">${列表.length} 间${总额 > 0 ? ` · ¥${千分位(总额)}` : ''}</span>
        </div>
        ${列表.map(c => {
          const 额 = 取房卡金额数(c);
          return `<div class="待办行" onclick="点工作台房间('${转义(c.房号)}')" onmouseenter="高亮全景房('${转义(c.房号)}')" onmouseleave="高亮全景房('')">
            <b class="待办房">${转义(c.房号)}</b>
            <span class="待办副">${转义(简左(c))}</span>
            <span class="待办钱 ${点色类 === '红' ? '红' : ''}">${额 > 0 ? '¥' + 千分位(额) : ''}</span>
            ${渲染发送状态(c)}
          </div>`;
        }).join('')}
      </div>`;
  };

  const 待处理内容 =
    渲染待处理组('欠款', '红', 欠款们, 欠款总额) +
    渲染待处理组('未交', '浅红', 未交们, 未交总额) +
    渲染待处理组('待发单', '蓝', 待发们, 0);

  return `
    <div class="总览指标四格">
      <button type="button" class="指标小卡${总览筛选集.has('欠款') ? ' 选中' : ''}" onclick="切换总览筛选('欠款')">
        <div class="指标主"><b class="红"><span class="币">¥</span>${千分位(欠款总额)}</b><span>${欠款们.length} 间</span></div>
        <div class="指标标"><i class="红"></i>欠款</div>
      </button>
      <button type="button" class="指标小卡${总览筛选集.has('未交') ? ' 选中' : ''}" onclick="切换总览筛选('未交')">
        <div class="指标主"><b><span class="币">¥</span>${千分位(未交总额)}</b><span>${未交们.length} 间</span></div>
        <div class="指标标"><i class="浅红"></i>未交</div>
      </button>
      <button type="button" class="指标小卡${总览筛选集.has('空房') ? ' 选中' : ''}" onclick="切换总览筛选('空房')">
        <div class="指标主"><b>${空净们.length}</b><span>间</span></div>
        <div class="指标标"><i class="灰"></i>空房</div>
      </button>
      <button type="button" class="指标小卡${总览筛选集.has('脏房') ? ' 选中' : ''}" onclick="切换总览筛选('脏房')">
        <div class="指标主"><b>${脏房们.length}</b><span>间</span></div>
        <div class="指标标"><i class="黄"></i>待保洁</div>
      </button>
    </div>

    <div class="总览全景双栏">
      <div class="卡片 全景卡">
        <div class="全景卡头">
          <h3>楼层全景</h3>
          ${总览筛选集.size === 0 ? '' : `<span><button type="button" class="淡操作链" onclick="切换总览筛选('全部')">清除筛选</button></span>`}
        </div>
        <div class="全景楼层表">
          ${排序层.map(([层, 房们]) => `
            <div class="全景楼层行">
              <span class="全景层标">${转义(楼层短标(层))}</span>
              <div class="全景房格行">
                ${房们.map(c => {
                  const 淡化 = !命中筛选(c);
                  return `<button type="button" class="全景房格 ${c.样式类}${淡化 ? ' 淡化' : ''}" data-room="${转义(c.房号)}" onclick="点工作台房间('${转义(c.房号)}')" title="${转义(c.房号)} · ${转义(c.状态标签 || '空闲')}${c.金额文 ? ' ' + c.金额文 : ''}">${转义(c.房号)}</button>`;
                }).join('')}
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="卡片 待处理卡">
        <div class="全景卡头">
          <h3>待处理</h3>
        </div>
        <div class="待处理表">
          ${待处理内容 || '<div class="空" style="padding:36px 0">本月账单已全部处理完毕</div>'}
        </div>
      </div>
    </div>`;
}

window.高亮全景房 = function(房号) {
  document.querySelectorAll('.全景房格.联动高亮').forEach(el => el.classList.remove('联动高亮'));
  if (!房号) return;
  const 目标 = document.querySelector(`.全景房格[data-room="${CSS.escape(房号)}"]`);
  if (目标) 目标.classList.add('联动高亮');
};

window.切换总览筛选 = function(筛选) {
  if (筛选 === '全部') {
    总览筛选集.clear();
  } else if (总览筛选集.has(筛选)) {
    总览筛选集.delete(筛选);
  } else {
    总览筛选集.add(筛选);
  }
  const 区 = document.getElementById('总览工作台容器');
  if (区) 区.innerHTML = 渲染楼层工作台HTML(总览待办缓存.房源列表);
};

window.点工作台房间 = async function(房号) {
  const 项 = 总览待办缓存.房源列表.find(x => x.房号 === 房号);
  if (!项) return;
  if (项.分类 === '自住') { 提示(`${房号} 为自住房`); return; }
  if (项.分类 === '日租') { 点房间(房号); return; }
  if (项.分类 === '空置') {
    打开模态(`
      <h2>空置房间 · ${转义(房号)}</h2>
      <p style="color:var(--次文字);margin-bottom:16px">当前状态：<b style="color:var(--文字)">${项.脏 ? '空置脏房（待清洁）' : '空置净房（可出租）'}</b></p>
      <div class="分段操作栏">
        <button type="button" class="分段钮 ${项.脏 ? '绿' : '黄'}" onclick="关闭模态();切换空置脏净('${转义(房号)}')">${项.脏 ? '标记净房' : '标记脏房'}</button>
        ${项.脏 ? '' : `<button type="button" class="分段钮 绿" onclick="打开房间模态(undefined,'${转义(房号)}')">添加租客</button>`}
        <button type="button" class="分段钮" onclick="请求关闭模态()">关闭</button>
      </div>`);
    return;
  }
  // 月租房：三段式详情（档案 + 本月账单与快捷操作 + 租客全面历史累计）
  const 房 = 项.房 || {};
  const b = 项.账单 || {};
  const 月份 = 全局.settings.当前月份;
  const 入住月 = 房.入住日 ? String(房.入住日).slice(0, 7) : '';
  // 纯只读汇总该租客自入住以来的全部历史账单（优先取已锁月度快照，再补充全局 bills 与当月）
  const 历史map = new Map();
  for (const 快照 of (全局.月度快照 || [])) {
    if (入住月 && 快照.月份 < 入住月) continue;
    const hit = (快照.账单 || []).find(x => x.房号 === 房号);
    if (hit) {
      const 房租额 = (hit.房租已预缴 || hit.房租免) ? 0 : (Number(hit.房租) || 0);
      const 管理额 = (hit.管理费已预缴 || hit.管理免) ? 0 : (Number(hit.管理费) || 0);
      历史map.set(快照.月份, {
        月份: 快照.月份,
        房租管理: 房租额 + 管理额,
        水电: (Number(hit.水费) || 0) + (Number(hit.电费) || 0),
        应收: hit.应付租金,
        其它: Number(hit.房间损耗) || 0,
        实收: (Number(hit.实收) || 0) + (Number(hit.补缴) || 0),
        欠款: Number(hit.欠款) || 0,
        状态: hit.状态
      });
    }
  }
  for (const x of (全局.bills || [])) {
    if (x.房号 !== 房号) continue;
    if (入住月 && x.月份 < 入住月) continue;
    if (!历史map.has(x.月份)) {
      历史map.set(x.月份, {
        月份: x.月份,
        房租管理: null,
        水电: null,
        应收: null,
        其它: Number(x.房间损耗) || 0,
        实收: (Number(x.实收) || 0) + (Number(x.补缴) || 0),
        欠款: 0,
        状态: x.平账 || x.强制 ? '已核收' : (x.实收 > 0 ? '已收' : '记录')
      });
    }
  }
  if (b.月份) {
    const 房租额 = (b.房租已预缴 || b.房租免) ? 0 : (Number(b.房租) || 0);
    const 管理额 = (b.管理费已预缴 || b.管理免) ? 0 : (Number(b.管理费) || 0);
    历史map.set(b.月份, {
      月份: b.月份,
      房租管理: 房租额 + 管理额,
      水电: b.可计算 ? ((Number(b.水费) || 0) + (Number(b.电费) || 0)) : null,
      应收: b.应付租金,
      其它: Number(b.房间损耗) || 0,
      实收: (Number(b.实收) || 0) + (Number(b.补缴) || 0),
      欠款: Number(b.欠款) || 0,
      状态: b.状态
    });
  }
  const 历史列表 = [...历史map.values()].sort((a, b2) => b2.月份.localeCompare(a.月份));
  const 总月数 = 历史列表.length;
  const 已交月数 = 历史列表.filter(x => x.实收 > 0 || x.状态 === '已核收').length;
  const 累计实收 = 历史列表.reduce((s, x) => s + (Number(x.实收) || 0), 0);
  const 累计水电 = 历史列表.reduce((s, x) => s + (Number(x.水电) || 0), 0);
  const 累计房租 = 历史列表.reduce((s, x) => s + (Number(x.房租管理) || 0), 0);

  const 未抄 = !b.可计算;
  const 有结转 = (b.结转 || 0) > 0;
  const 可操作 = b.可计算 || 有结转;
  const 水价 = (房.水费单价 !== '' && 房.水费单价 != null) ? 房.水费单价 : 全局.settings.水价;
  const 电价 = (房.电费单价 !== '' && 房.电费单价 != null) ? 房.电费单价 : 全局.settings.电价;
  const 交租号 = 房.入住日 ? `每月 ${Number(String(房.入住日).split('-')[2])} 号` : '—';

  打开模态(`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px">
      <h2 style="margin:0">房间详情 · ${转义(房号)} ${状态徽章(b.状态 || '未交')}</h2>
      <button type="button" class="btn 次 小" onclick="请求关闭模态()">关闭</button>
    </div>
    <div class="详情格" style="margin-bottom:14px">
      <div class="详情项"><span class="详情键">租客姓名</span><span class="详情值">${转义(房.租客姓名 || '—')}</span></div>
      <div class="详情项"><span class="详情键">联系电话</span><span class="详情值">${房.电话 ? `<a href="tel:${转义(房.电话)}" style="color:var(--主色)">${转义(房.电话)}</a>` : '—'}</span></div>
      <div class="详情项"><span class="详情键">入住日期 / 交租日</span><span class="详情值">${转义(房.入住日 || '—')} · ${交租号}</span></div>
      <div class="详情项"><span class="详情键">月租 / 管理费</span><span class="详情值">¥${数字(房.月租金)} / ¥${数字(房.管理费)}</span></div>
      <div class="详情项"><span class="详情键">押金 / 房卡押金</span><span class="详情值">¥${数字(房.押金)} / ¥${数字(房.房卡押金)}</span></div>
      <div class="详情项"><span class="详情键">水电单价</span><span class="详情值">水 ¥${水价} · 电 ¥${电价}</span></div>
    </div>

    <div class="卡片" style="margin-bottom:14px;background:var(--灰)">
      <h3 style="margin-top:0">本月账单（${月份}）</h3>
      <div class="详情格">
        <div class="详情项" style="background:var(--卡片)"><span class="详情键">房租 + 管理费</span><span class="详情值">${b.房租免 ? '<span class="已预缴">已预缴</span>' : '¥' + 数字(b.房租)} + ${b.管理免 ? '<span class="已预缴">已预缴</span>' : '¥' + 数字(b.管理费)}</span></div>
        <div class="详情项" style="background:var(--卡片)"><span class="详情键">水电费</span><span class="详情值">${未抄 ? '未抄表' : `水 ¥${精金额(b.水费)} + 电 ¥${精金额(b.电费)}`}</span></div>
        <div class="详情项" style="background:var(--卡片)"><span class="详情键">本月应付</span><span class="详情值" style="color:var(--主色)">${未抄 ? (有结转 ? '¥' + 数字(b.结转) + '（结转）' : '未抄表') : '¥' + 数字(b.应付租金)}</span></div>
        <div class="详情项" style="background:var(--卡片)"><span class="详情键">已收 / 欠款</span><span class="详情值">实收 ¥${数字((b.实收 || 0) + (b.补缴 || 0))}${b.欠款 > 0 ? ` · <span style="color:var(--红)">欠 ¥${数字(b.欠款)}</span>` : ''}</span></div>
      </div>
      <div class="工具栏" style="margin:12px 0 0">
        ${b.待发送 ? `<button class="btn 成功 小" onclick="关闭模态();发送跳转('${转义(房号)}','${转义(b.交租日期 || '')}')">去发送账单</button>` : ''}
        ${可操作 || b.可计算 ? `<div class="分段操作栏">
          ${可操作 ? `<button type="button" class="分段钮" onclick="核收('${转义(房号)}',true)">核收</button>` : ''}
          ${可操作 ? `<button type="button" class="分段钮 红" onclick="平账('${转义(房号)}',true)">平账</button>` : ''}
          ${可操作 ? `<button type="button" class="分段钮 绿" onclick="追缴('${转义(房号)}',true)">追缴</button>` : ''}
          ${b.可计算 ? `<button type="button" class="分段钮 黄" onclick="欠费滚存('${转义(房号)}',true)">欠费滚存</button>` : ''}
        </div>` : ''}
      </div>
    </div>

    <div class="卡片" style="margin-bottom:0">
      <h3 style="margin-top:0">租客历史累计（${入住月 ? 入住月 + ' 至今' : '全部记录'} · 共 ${总月数} 期）</h3>
      <div class="详情格" style="margin-bottom:10px">
        <div class="详情项"><span class="详情键">已交/结清月数</span><span class="详情值">${已交月数} / ${总月数} 个月</span></div>
        <div class="详情项"><span class="详情键">累计实收总额</span><span class="详情值" style="color:var(--绿)">¥${数字(累计实收)}</span></div>
        <div class="详情项"><span class="详情键">累计房租+管理费</span><span class="详情值">¥${数字(累计房租)}</span></div>
        <div class="详情项"><span class="详情键">累计水电费</span><span class="详情值">¥${精金额(累计水电)}</span></div>
      </div>
      ${历史列表.length ? `<div class="表格容器" style="max-height:240px;overflow-y:auto"><table class="斑马 居中表">
        <tr><th>月份</th><th>房租/管理费</th><th>水电</th><th>应收</th><th>其它</th><th>实收</th><th>状态</th></tr>
        ${历史列表.map(h => `<tr>
          <td>${h.月份}</td>
          <td>${h.房租管理 != null ? '¥' + 数字(h.房租管理) : '—'}</td>
          <td>${h.水电 != null ? '¥' + 精金额(h.水电) : '—'}</td>
          <td>${h.应收 != null ? '¥' + 数字(h.应收) : '—'}</td>
          <td>${h.其它 ? '¥' + 数字(h.其它) : '¥0'}</td>
          <td>¥${数字(h.实收)}</td>
          <td>${h.状态 === '欠款' && h.欠款 > 0 ? `<span class="徽章 欠款">欠 ¥${数字(h.欠款)}</span>` : 状态徽章(h.状态)}</td>
        </tr>`).join('')}
      </table></div>` : '<p class="空" style="padding:8px 0">暂无历史账单记录</p>'}
    </div>`);
};

window.跳转去房间档案 = function() {
  const btn = document.querySelector('.导航 button[data-page="房间"]');
  if (btn) btn.click();
};

async function 渲染总览(容器) {
  const 月份 = 全局.settings.当前月份;
  const [s, 账单列表, 日租态, 备忘, dAll] = await Promise.all([
    api(`/api/summary?month=${月份}`),
    api(`/api/bills?month=${月份}`),
    api('/api/roomstatus').catch(() => null),
    api('/api/memos').catch(() => null),
    api('/api/all').catch(() => 全局)
  ]);
  if (dAll && dAll.房源) 全局 = dAll;
  if (日租态) 房态数据 = 日租态;

  const 卡片列表 = 构建总览房源卡片数据(全局, 账单列表, 日租态, s);

  const 不齐条 = s.数据不齐.length ? 折叠卡片('数据不齐', `<h3 style="margin:0;font-size:var(--fs-base);color:var(--红)">数据不齐（${s.数据不齐.length} 间）</h3>`, `
    <div class="表格容器" style="margin-top:10px"><table><tr><th>房号</th><th>缺失项</th></tr>${s.数据不齐.map(x => `<tr><td><b>${转义(x.房号)}</b></td><td style="color:var(--红)">缺：${x.缺失.join('、')}</td></tr>`).join('')}</table></div>`, true) : '';

  const 总收入 = (Number(s.月租已收) || 0) + (Number(s.日租已收) || 0);
  const 总支出 = (Number(s.支出) || 0) + (Number(s.工资) || 0);
  const 支出比 = 总收入 > 0 ? Math.min(100, Math.round(总支出 / 总收入 * 100)) : (总支出 > 0 ? 100 : 0);
  const 结余比 = Math.max(0, 100 - 支出比);

  容器.innerHTML = `
    <div class="总览双栏">
      <div class="总览左栏">
        ${不齐条}
        <div id="总览工作台容器">${渲染楼层工作台HTML(卡片列表)}</div>
      </div>
      <div class="总览右栏">
        <div class="卡片">
          <div class="收支卡头"><h2>当月收支</h2><span>${月份}</span></div>
          <div class="净收支主数"><span class="币">¥</span><b>${千分位(s.合计)}</b></div>
          <div class="净收支副标">净收支</div>
          <div class="收支比例条"><span class="段绿" style="width:${结余比}%"></span><span class="段红" style="width:${支出比}%"></span></div>
          <div class="收支比例注"><span>净结余 ${结余比}%</span><span>支出占收入 ${支出比}%</span></div>
          <div class="收支两列">
            <div>
              <div class="收支列头"><span class="列名"><i class="绿"></i>收入</span><b>${千分位(总收入)}</b></div>
              <div class="收支明细行"><span>月租已收</span><span>${千分位(s.月租已收)}</span></div>
              <div class="收支明细行"><span>日租已收</span><span>${千分位(s.日租已收)}</span></div>
            </div>
            <div>
              <div class="收支列头"><span class="列名"><i class="红"></i>支出</span><b>${千分位(总支出)}</b></div>
              <div class="收支明细行"><span>支出</span><span>${千分位(s.支出)}</span></div>
              <div class="收支明细行"><span>工资</span><span>${千分位(s.工资)}</span></div>
            </div>
          </div>
        </div>
        ${备忘录卡片(备忘)}
      </div>
    </div>`;
}
function 空置按楼层(空置列表) {
  const 组 = {};
  for (const 项 of 空置列表) {
    const 房号 = typeof 项 === 'object' ? 项.房号 : 项;
    const 脏 = typeof 项 === 'object' ? !!项.脏 : false;
    const n = parseInt(房号);
    const 层 = 房号 === '阁楼' ? '阁楼' : (isNaN(n) ? '其他' : Math.floor(n / 100) + ' 层');
    (组[层] = 组[层] || []).push({ 房号, 脏 });
  }
  const 序 = { '阁楼': 99, '其他': 98 };
  return Object.entries(组)
    .sort((a, b) => ((序[a[0]] ?? parseInt(a[0])) - (序[b[0]] ?? parseInt(b[0]))))
    .map(([层, 房们]) => `<div class="楼层行"><span class="楼层名">${层}</span>${房们.map(f => `<span class="空置房${f.脏 ? ' 脏' : ''}" onclick="切换空置脏净('${转义(f.房号)}')" title="${f.脏 ? '脏房 · 点一下变净房' : '净房 · 点一下变脏房'}">${转义(f.房号)}${f.脏 ? ' 🧹' : ''}</span>`).join('')}</div>`)
    .join('');
}
window.切换空置脏净 = async function(房号) {
  await api('/api/vacant/toggle', { method: 'POST', body: { 房号 } });
  渲染();
};
// 核收：弹窗输入实收金额，默认=当前欠款（有欠款用欠款，没欠款用本月应付）
window.核收 = async function(房号, 来自详情 = false) {
  const 月份 = 全局.settings.当前月份;
  const 账单 = await api(`/api/bills?month=${月份}`);
  const b = 账单.find(x => x.房号 === 房号);
  if (!b) return;
  const 默认 = b.欠款 > 0 ? b.欠款 : (b.可计算 ? (b.应付租金 || 0) : (b.结转 || 0));
  const 开窗 = 来自详情 ? 打开子模态 : 打开模态;
  开窗(`<h2>核收</h2>
    <p style="font-size:var(--fs-md)">房号 <b>${转义(房号)}</b></p>
    <p style="color:var(--次文字);font-size:var(--fs-sm);margin:8px 0">核收金额默认 = 当前一共还欠的钱；没欠款时默认 = 本月应付金额。</p>
    <label style="display:flex;align-items:center;gap:10px;font-size:var(--fs-md);font-weight:var(--fw-semibold)">核收金额
      <input type="number" id="核收金额" class="大号输入" value="${数字(默认)}">
    </label>
    <div class="模态底栏">
      <div class="分段操作栏">
        <button type="button" class="分段钮" onclick="请求关闭模态()">取消</button>
        <button type="button" class="分段钮 绿" onclick="确认核收('${转义(房号)}')">确认核收</button>
      </div>
    </div>`, '窄');
};
window.确认核收 = async function(房号) {
  const 金额 = document.getElementById('核收金额').value;
  if (!(await 询问确认('确认核收？', `${转义(房号)}　实收 ¥${数字(金额 || 0)}`))) return;
  const r = await api('/api/bills/collect', { method: 'POST', body: { 房号, 月份: 全局.settings.当前月份, 实收: 金额, 强制: true, 收款日期: 今天() } });
  if (r.错误) { 提示(r.错误); return; }
  提示('已核收'); 关闭模态(); 渲染();
};
window.平账 = async function(房号, 来自详情 = false) {
  if (!(await 询问确认('确认平账？', `${转义(房号)}　将标记为已核收（不改实收金额）`))) return;
  await api('/api/bills/collect', { method: 'POST', body: { 房号, 月份: 全局.settings.当前月份, 平账: true } });
  提示('已平账');
  if (来自详情) 关闭模态();
  渲染();
};
// 追缴：手动输入金额，累加到本月账单（不改变核收状态、不碰历史月）
window.追缴 = async function(房号, 来自详情 = false) {
  const 开窗 = 来自详情 ? 打开子模态 : 打开模态;
  开窗(`<h2>追缴</h2>
    <p style="font-size:var(--fs-md)">房号 <b>${转义(房号)}</b></p>
    <p style="color:var(--次文字);font-size:var(--fs-sm);margin:8px 0">追缴金额累加到本月账单，冲减欠费。金额可手动修改。</p>
    <label style="display:flex;align-items:center;gap:10px;font-size:var(--fs-md);font-weight:var(--fw-semibold)">追缴金额
      <input type="number" id="追缴金额" class="大号输入" placeholder="输入金额">
    </label>
    <div class="模态底栏">
      <div class="分段操作栏">
        <button type="button" class="分段钮" onclick="请求关闭模态()">取消</button>
        <button type="button" class="分段钮 绿" onclick="确认追缴('${转义(房号)}')">确认追缴</button>
      </div>
    </div>`, '窄');
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
window.欠费滚存 = async function(房号, 来自详情 = false) {
  const 月份 = 全局.settings.当前月份;
  const 账单 = await api(`/api/bills?month=${月份}`);
  const b = 账单.find(x => x.房号 === 房号);
  const 未抄 = b.应付租金 == null;
  const 拖欠 = 未抄 ? 0 : Math.max(0, (b.应付租金 || 0) - (b.实收 || 0) - (b.补缴 || 0) - (b.转下月 || 0));
  const 开窗 = 来自详情 ? 打开子模态 : 打开模态;
  开窗(`<h2>欠费滚存</h2>
    <p style="font-size:var(--fs-md)">房号 <b>${转义(房号)}</b>${未抄 ? '　<span style="color:var(--红)">本月未抄表</span>' : `　本月拖欠 <b style="color:var(--红)">¥${数字(拖欠)}</b>`}</p>
    <p style="color:var(--次文字);font-size:var(--fs-sm);margin:8px 0">欠费滚存（${加月(月份, 1)}）后，本月仍显示欠费，下月账单计入该金额。金额可手动修改。</p>
    <label style="display:flex;align-items:center;gap:10px;font-size:var(--fs-md);font-weight:var(--fw-semibold)">滚存金额
      <input type="number" id="滚存金额" class="大号输入" value="${数字(拖欠)}">
    </label>
    <div class="模态底栏">
      <div class="分段操作栏">
        <button type="button" class="分段钮" onclick="请求关闭模态()">取消</button>
        <button type="button" class="分段钮 黄" onclick="确认欠费滚存('${转义(房号)}')">确认滚存</button>
      </div>
    </div>`, '窄');
};
window.确认欠费滚存 = async function(房号) {
  const 金额 = document.getElementById('滚存金额').value;
  if (!(await 询问确认('确认欠费滚存？', `${转义(房号)}　结转 ¥${数字(金额 || 0)} 到下月`))) return;
  const 月份 = 全局.settings.当前月份;
  const r = await api('/api/bills/carry', { method: 'POST', body: { 房号, 月份, 金额 } });
  if (r.错误) { 提示(r.错误); return; }
  提示('已欠费滚存'); 关闭模态(); 渲染();
};
// 待发送账单：点「发送」跳到租客账单这间房、这个交租日的账单（方便截图发租客）
window.发送跳转 = function(房号, 交租日期) {
  账单搜索房号 = 房号;
  账单搜索范围 = '本月';
  账单日期 = 交租日期 || 今天();
  当前页 = '账单';
  document.querySelectorAll('.导航 button').forEach(b => b.classList.toggle('激活', b.dataset.page === '账单'));
  渲染();
};
// 标记账单已发送给租客（租客账单页账单卡下方的「发送账单」按钮）
window.标记已发送 = async function(房号, 月份) {
  if (!(await 询问确认('确认发送账单？', `${转义(房号)}　${月份} 账单标记为已发送给租客`))) return;
  const r = await api('/api/bills/sent', { method: 'POST', body: { 房号, 月份 } });
  if (r.错误) { 提示(r.错误); return; }
  提示('已标记发送'); 渲染();
};
// 撤销发送：回到待发送（账单内容恢复实时计算），改错后重新发送再定格
window.撤销发送 = async function(房号, 月份) {
  if (!(await 询问确认('撤销发送？', `${转义(房号)}　${月份} 账单撤销发送，回到待发送（可重新改账单再发送）`))) return;
  const r = await api('/api/bills/unsent', { method: 'POST', body: { 房号, 月份 } });
  if (r.错误) { 提示(r.错误); return; }
  提示('已撤销发送'); 渲染();
};
// ============ 备忘录（总览卡片，全局常驻不分月份） ============
let 备忘缓存 = [];            // 本地缓存，勾选/切模式时直接重绘，不用每次都请求后端
let 备忘删除模式 = false;      // 默认关闭：平时不显示删除图标，防手机误触
const 备忘选中 = new Set();    // 删除模式下多选的 id
let 备忘展开 = new Set();      // 展开显示全文的备忘 id（长内容点开/收起）

function 备忘录卡片(列表) {
  if (!Array.isArray(列表)) return '<div class="卡片"><h2 style="margin:0">备忘录</h2><div class="空">备忘录加载失败，刷新页面重试（服务端可能未重启）</div></div>';
  备忘缓存 = 列表;
  const 待办 = 列表.filter(m => !m.完成).length;
  const 标题 = `<div class="备忘紧凑头"><h2>备忘录</h2><span class="备忘紧凑数" id="备忘待办数" style="${待办 ? '' : 'display:none'}">${待办} 条待办</span></div>`;
  const 内容 = `<div class="备忘紧凑输">
      <input id="备忘输入" placeholder="记点什么，回车添加" onkeydown="if(event.key==='Enter'&&!event.isComposing)添加备忘()">
      <button type="button" class="备忘回车钮" onclick="添加备忘()" title="回车添加">↵</button>
    </div>
    <div id="备忘列表">${备忘录列表HTML(列表)}</div>`;
  return 折叠卡片('备忘录', 标题, 内容);
}
// Markdown 渲染：先转义 HTML 防 XSS，再把 MD 标记转成安全 HTML（标题/加粗/斜体/列表/代码/链接/删除线）
function 内联MD(文本) {
  let s = 文本;
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (全, 文, 址) => (/^https?:\/\//i.test(址) ? `<a href="${址}" target="_blank" rel="noopener">${文}</a>` : 文));
  return s;
}
function 渲染MD(文本) {
  let 列表 = null, 代码块 = false, html = '';
  for (const 原始行 of String(文本 ?? '').split(/\r?\n/)) {
    const 行 = 转义(原始行); // 先转义，内联MD 在其上再处理
    if (/^```/.test(行)) { 代码块 = !代码块; continue; }
    if (代码块) { html += `<pre><code>${行}</code></pre>`; continue; }
    const 标题 = 行.match(/^(#{1,6})\s+(.*)$/);
    if (标题) { const 级 = 标题[1].length; html += `<h${级}>${内联MD(标题[2])}</h${级}>`; continue; }
    const 无序 = 行.match(/^\s*[-*+]\s+(.*)$/);
    if (无序) { if (列表 !== 'ul') { if (列表) html += `</${列表}>`; 列表 = 'ul'; html += '<ul>'; } html += `<li>${内联MD(无序[1])}</li>`; continue; }
    const 有序 = 行.match(/^\s*\d+[.)]\s+(.*)$/);
    if (有序) { if (列表 !== 'ol') { if (列表) html += `</${列表}>`; 列表 = 'ol'; html += '<ol>'; } html += `<li>${内联MD(有序[1])}</li>`; continue; }
    if (列表) { html += `</${列表}>`; 列表 = null; }
    html += 行 ? `<p>${内联MD(行)}</p>` : '';
  }
  if (列表) html += `</${列表}>`;
  return html;
}
// 折叠预览：取第一行、剥掉常见 MD 标记，纯文本显示
function 备忘预览(内容) {
  const 首行 = String(内容 || '').split(/\r?\n/)[0].trim();
  return 首行.replace(/^#{1,6}\s+/, '').replace(/^[-*+>]\s+/, '').replace(/[`*_~]/g, '').slice(0, 40);
}
function 备忘内容HTML(m) {
  const 内容 = m.内容 || '';
  const 需要折叠 = 内容.includes('\n') || 内容.length > 40; // 多行/长内容才折叠，短内容整条直接显示
  const 展开 = 备忘展开.has(m.id);
  const 折叠钮 = 需要折叠 ? `<button class="备忘折叠钮" onclick="切换备忘展开(${m.id})">${展开 ? '▴ 收起' : '▾ 展开'}</button>` : '';
  // 展开/收起只用独立按钮触发，内容区不绑点击 → 鼠标选中复制文字不会误触折叠
  if (展开) return `<div class="备忘内容 备忘展开">${渲染MD(内容)}</div>${折叠钮}`;
  if (需要折叠) return `<div class="备忘内容 备忘可折叠">${转义(备忘预览(内容))}</div>${折叠钮}`;
  return `<div class="备忘内容">${渲染MD(内容)}</div>`;
}
window.切换备忘展开 = function(id) { 备忘展开.has(id) ? 备忘展开.delete(id) : 备忘展开.add(id); 重绘备忘列表(); };
function 备忘录列表HTML(列表) {
  const 行 = 列表.map(m => `<div class="备忘项${m.完成 ? ' 已完成' : ''}${备忘展开.has(m.id) ? ' 备忘项展开' : ''}">
      <input type="checkbox" class="备忘圆勾" ${m.完成 ? 'checked' : ''} onchange="切换备忘完成(${m.id}, this.checked)" title="标记完成">
      ${备忘内容HTML(m)}
      <span class="备忘日期">${转义((m.日期 || '').slice(5))}</span>
      <button type="button" class="备忘行删" onclick="删除备忘(${m.id})" title="删除">×</button>
    </div>`).join('');
  return (行 || '<div class="空">还没有备忘，用上面的输入框记一条</div>') + 备忘底栏HTML(列表);
}
function 备忘底栏HTML(列表) {
  const 已完成数 = 列表.filter(m => m.完成).length;
  return 已完成数 ? `<div class="备忘底栏"><button type="button" class="备忘清已完" onclick="清除已完成备忘()">清除已完成（${已完成数}）</button></div>` : '';
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
  if (!await 询问确认('批量删除备忘', `确定删除选中的 ${备忘选中.size} 条备忘？`)) return;
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
  if (!await 询问确认('删除备忘', '确定删除这条备忘？')) return;
  await api('/api/memos/' + id, { method: 'DELETE' });
  await 刷新备忘列表(); 提示('已删除');
};
window.清除已完成备忘 = async function() {
  if (!await 询问确认('清除已完成备忘', '确定清除全部已完成的备忘？')) return;
  const r = await api('/api/memos/done', { method: 'DELETE' });
  await 刷新备忘列表(); 提示(`已清除 ${r.删除数 || 0} 条`);
};

// 身份证校验：18 位 + 前 17 位数字 + 末位数字/X + 出生日期合法 + 末位校验码（GB 11643-1999）
function 校验身份证(号) {
  const s = String(号 || '').trim().toUpperCase();
  if (!s) return { 有效: true }; // 空值不拦（可选字段）
  if (!/^\d{17}[\dX]$/.test(s)) return { 有效: false, 原因: '应为 18 位，前 17 位数字、末位数字或 X' };
  const 年 = Number(s.slice(6, 10)), 月 = Number(s.slice(10, 12)), 日 = Number(s.slice(12, 14));
  if (年 < 1900 || 年 > 2100) return { 有效: false, 原因: '出生年份不合理' };
  const 生日 = new Date(Date.UTC(年, 月 - 1, 日));
  if (生日.getUTCFullYear() !== 年 || 生日.getUTCMonth() !== 月 - 1 || 生日.getUTCDate() !== 日) return { 有效: false, 原因: '出生日期不合法' };
  const 权重 = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const 码表 = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let 和 = 0;
  for (let i = 0; i < 17; i++) 和 += Number(s[i]) * 权重[i];
  if (码表[和 % 11] !== s[17]) return { 有效: false, 原因: '校验码不正确' };
  return { 有效: true };
}


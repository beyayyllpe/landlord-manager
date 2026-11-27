// ============ 租客账单 ============
let 账单日期 = 今天(); let 账单搜索房号 = ''; let 账单搜索范围 = '本月'; let 账单指定月 = '';
function 加日(日期, 偏移) {
  const [y, m, d] = String(日期).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 偏移));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
async function 渲染租客账单(容器) {
  const 全部 = 账单搜索范围 === '全部';
  const 查询月 = 账单搜索范围 === '指定' ? (账单指定月 || 全局.settings.当前月份) : 全局.settings.当前月份;
  const 非今天 = 账单日期 !== 今天();
  容器.innerHTML = `
    <div class="卡片 账单筛选卡">
      <div class="账单筛选行">
        <div class="账单筛选左">
          <div class="分段操作栏">
            <button type="button" class="分段钮 ${账单搜索范围==='本月'?'激活':''}" onclick="切账单范围('本月')">本月</button>
            <button type="button" class="分段钮 ${账单搜索范围==='全部'?'激活':''}" onclick="切账单范围('全部')">全部历史</button>
            <button type="button" class="分段钮 ${账单搜索范围==='指定'?'激活':''}" onclick="切账单范围('指定')">选月份</button>
          </div>
          ${账单搜索范围 === '指定' ? `<input type="month" value="${查询月}" onchange="账单指定月=this.value;加载租客账单列表()" style="padding:5px 10px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--ink);font-size:var(--fs-sm)">` : ''}
          ${!全部 ? `<span id="账单日期区" style="display:${账单搜索房号.trim()?'none':'inline-flex'};align-items:center;gap:8px"><div class="日期微调">
            <button type="button" onclick="账单日期=加日('${账单日期}',-1);渲染()" title="前一天">‹</button>
            <span class="日期微调字">${账单日期}<input type="date" value="${账单日期}" onchange="账单日期=this.value;渲染()"></span>
            <button type="button" onclick="账单日期=加日('${账单日期}',1);渲染()" title="后一天">›</button>
          </div>
          ${非今天 ? `<button type="button" class="淡操作链" onclick="账单日期=今天();渲染()">今天</button>` : ''}</span>` : ''}
        </div>
        <div class="账单筛选右">
          <div class="搜房盒">
            <input id="账单搜房号" placeholder="搜房号（跨日直达）" value="${转义(账单搜索房号)}" oninput="clearTimeout(window._搜防抖);window._搜防抖=setTimeout(()=>{账单搜索房号=this.value;加载租客账单列表();更新搜房UI();},220)">
            <button type="button" id="搜房清除钮" class="搜房清" style="${账单搜索房号?'':'display:none'}" onclick="账单搜索房号='';渲染()" title="清空">×</button>
          </div>
        </div>
      </div>
    </div>
    <div id="租客账单列表">加载中…</div>`;
  await 加载租客账单列表();
}
window.切账单范围 = function(范围) { 账单搜索范围 = 范围; 渲染(); };
window.更新搜房UI = function() {
  const 清 = document.getElementById('搜房清除钮');
  if (清) 清.style.display = 账单搜索房号 ? '' : 'none';
  const 日区 = document.getElementById('账单日期区');
  if (日区) 日区.style.display = 账单搜索房号.trim() ? 'none' : 'inline-flex';
};
async function 加载租客账单列表() {
  const 房号词 = 账单搜索房号.trim();
  const 日 = Number(账单日期.slice(8, 10));
  const 全部 = 账单搜索范围 === '全部';
  const 查询月 = 账单搜索范围 === '指定' ? (账单指定月 || 全局.settings.当前月份) : 全局.settings.当前月份;
  const 参数 = new URLSearchParams();
  if (房号词) 参数.set('房号', 房号词);
  if (全部) 参数.set('全部', '1');
  else {
    参数.set('month', 查询月);
    if (!房号词 && 日) 参数.set('day', 日);
  }
  const 账单 = await api(`/api/bills?${参数.toString()}`);
  const el = document.getElementById('租客账单列表');
  if (!el) return;
  el.classList.toggle('单张', 账单.length === 1);
  if (!账单.length) { el.innerHTML = '<div class="空" style="grid-column:1/-1">没有匹配的账单</div>'; return; }
  window._当前账单列表 = 账单;
  el.innerHTML = 账单.map((原始, idx) => {
    // 已发送且定格：账单内容读发送快照（应付/结转/明细/损耗定格），欠款/滚存/发送状态仍用实时
    const 锁定发送 = 原始.已发送 && 原始.发送快照;
    const b = 锁定发送 ? { ...原始.发送快照, 欠款: 原始.欠款, 转下月: 原始.转下月, 状态: 原始.状态, 已发送: 原始.已发送, 待发送: 原始.待发送, 可计算: 原始.可计算, 当月新租: 原始.当月新租, 房间备注: 原始.房间备注 } : 原始;
    const 未抄 = b.状态 === '未交' && !b.可计算;
    const 免算 = b.当月新租 && b.本月水底 == null; // 当月新租且无本月抄表：水电免算
    const 水电可用 = !未抄 && !免算; // 有抄表读数才显示水电底度明细
    const 结转 = Number(b.结转) || 0;       // 上月滚存进来的拖欠（原值，不动）
    const 补缴 = Number(b.补缴) || 0;       // 本月追缴补收（只冲欠款，不动应付口径）
    const 已追缴结转 = Math.min(结转, 补缴);  // 结转里已被追缴清掉的部分
    const 结转剩余 = 结转 - 已追缴结转;       // 结转里还没追缴清的部分
    const 状态色类 = 未抄 ? '状态-未抄' : (b.状态 === '已核收' ? '状态-已核收' : (b.状态 === '欠款' || b.状态 === '未交' ? '状态-欠款' : ''));
    return `<div class="账单卡 ${状态色类}">
      <div class="账单卡头">
        <b class="房号">房号：${转义(b.房号)}</b>
        <span class="单标题">（房租缴纳单）${锁定徽章(b.月份)}</span>
        <span class="头日期">${中文日期(b.交租日期)}</span>
      </div>

      <div class="房租单明细">
        <div class="明细行">
          <span class="明细标签"><span class="标签名">水费<small class="单价">${精金额(b.水费单价)}元/方</small></span></span>
          <span class="明细底度">${b.上月水底 ?? '—'} → ${b.本月水底 ?? '—'}</span>
          <span class="明细用量">${水电可用 ? `${精金额(b.用水量)} 方` : ''}</span>
          <span class="明细金额"><b class="钱数">${水电可用 ? '¥' + 精金额(b.水费) : '—'}</b></span>
        </div>
        <div class="明细行">
          <span class="明细标签"><span class="标签名">电费<small class="单价">${精金额(b.电费单价)}元/度</small></span></span>
          <span class="明细底度">${b.上月电底 ?? '—'} → ${b.本月电底 ?? '—'}</span>
          <span class="明细用量">${水电可用 ? `${精金额(b.用电量)} 度` : ''}</span>
          <span class="明细金额"><b class="钱数">${水电可用 ? '¥' + 精金额(b.电费) : '—'}</b></span>
        </div>
        <div class="明细行">
          <span class="明细标签"><span class="标签名">其它</span></span>
          <span class="明细底度"><input id="损${转义(b.房号)}说明" class="抄表输入" value="${转义(b.损耗说明||'')}" placeholder="${(月份锁定(b.月份) || 锁定发送) ? '已锁定' : '备注说明'}" ${(月份锁定(b.月份) || 锁定发送) ? 'disabled' : ''} onchange="改损耗说明('${转义(b.房号)}','${b.月份}',this.value)"></span>
          <span class="明细用量"></span>
          <span class="明细金额"><input id="损${转义(b.房号)}金额" type="number" class="抄表输入 钱数" value="${b.房间损耗 || ''}" placeholder="其它金额" ${(月份锁定(b.月份) || 锁定发送) ? 'disabled' : ''} onchange="改损耗('${转义(b.房号)}','${b.月份}',this.value)"></span>
        </div>
      </div>

      <div class="汇总行">
        <div class="汇总明细">
          <span>租金 <b>${b.房租已预缴 ? '已预缴' : '¥' + 数字(b.房租)}</b></span>
          <span>管理费 <b>${b.管理费已预缴 ? '已预缴' : '¥' + 数字(b.管理费)}</b></span>
          <span>水费 <b>${水电可用 ? '¥' + 数字(b.水费) : '—'}</b></span>
          <span>电费 <b>${水电可用 ? '¥' + 数字(b.电费) : '—'}</b></span>
          <span>其它 <b>¥${数字(b.房间损耗)}</b></span>
          ${结转 ? `<span>上月结转 <b>¥${数字(结转)}</b>${已追缴结转 >= 结转 ? ' <span class="已追缴">已追缴</span>' : (已追缴结转 > 0 ? ` <span class="已追缴">已追缴 ¥${数字(已追缴结转)}，尚欠 ¥${数字(结转剩余)}</span>` : '')}</span>` : ''}
        </div>
        <span class="应付"><span class="金额词">应付：</span><b class="钱数">${未抄 ? '—' : '¥' + 数字((Number(b.应付租金) || 0) - 已追缴结转)}</b></span>
      </div>

      ${未抄 ? '<div class="账单底度">水电未抄，无法计算</div>' : ''}
      ${免算 ? '<div class="账单底度">当月新租，水电免算</div>' : ''}
      ${b.转下月 ? `<div class="账单底度" style="color:var(--红)">本月已欠费滚存 ¥${数字(b.转下月)} 到下月</div>` : ''}
      ${b.状态==='欠款' ? `<div class="账单底度" style="color:var(--红)">欠 ¥${数字(b.欠款)}</div>` : ''}
      ${b.房间备注 ? `<div class="账单备注">房间备注：${转义(b.房间备注)}</div>` : ''}
      <div style="margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        ${!月份锁定(b.月份) && b.可计算 && !b.已发送 ? `<button class="btn 成功" onclick="标记已发送('${转义(b.房号)}','${b.月份}')">发送账单</button>` : ''}
        ${b.可计算 ? `<button class="btn 次 小" onclick="复制租客账单(${idx})">复制文本</button>` : ''}
        ${!月份锁定(b.月份) && b.可计算 && !b.已发送 ? `<span style="font-size:var(--fs-xs);color:var(--次文字)">发给租客后点「发送账单」定格</span>` : ''}
        ${b.可计算 && b.已发送 ? `<span style="font-size:var(--fs-sm);color:var(--绿)">已发送给租客（账单已定格）</span>${!月份锁定(b.月份) ? `<button class="btn 次 小" onclick="撤销发送('${转义(b.房号)}','${b.月份}')">撤销发送</button>` : ''}` : ''}
      </div>
    </div>`;
  }).join('');
}
window.复制租客账单 = async function(idx) {
  const 原始 = (window._当前账单列表 || [])[idx];
  if (!原始) return;
  const 锁定发送 = 原始.已发送 && 原始.发送快照;
  const b = 锁定发送 ? { ...原始.发送快照, 欠款: 原始.欠款, 转下月: 原始.转下月, 状态: 原始.状态, 可计算: 原始.可计算, 当月新租: 原始.当月新租 } : 原始;
  const 未抄 = b.状态 === '未交' && !b.可计算;
  const 免算 = b.当月新租 && b.本月水底 == null;
  const 水电可用 = !未抄 && !免算;
  const 结转 = Number(b.结转) || 0;
  const 补缴 = Number(b.补缴) || 0;
  const 已追缴结转 = Math.min(结转, 补缴);
  const 应付 = 未抄 ? '—' : ('¥' + 数字((Number(b.应付租金) || 0) - 已追缴结转));
  const 行们 = [
    `【房租缴纳单】房号：${b.房号}（${中文日期(b.交租日期) || b.月份}）`,
    `租金：${b.房租已预缴 ? '已预缴' : '¥' + 数字(b.房租)}　管理费：${b.管理费已预缴 ? '已预缴' : '¥' + 数字(b.管理费)}`,
    水电可用 ? `水费：${b.上月水底 ?? '—'} → ${b.本月水底 ?? '—'}（用 ${精金额(b.用水量)} 方 × ${精金额(b.水费单价)} = ¥${精金额(b.水费)}）` : `水费：${免算 ? '当月新租免算' : '未抄表'}`,
    水电可用 ? `电费：${b.上月电底 ?? '—'} → ${b.本月电底 ?? '—'}（用 ${精金额(b.用电量)} 度 × ${精金额(b.电费单价)} = ¥${精金额(b.电费)}）` : `电费：${免算 ? '当月新租免算' : '未抄表'}`,
  ];
  if (Number(b.房间损耗) || b.损耗说明) 行们.push(`其它：¥${数字(b.房间损耗)}${b.损耗说明 ? '（' + b.损耗说明 + '）' : ''}`);
  if (结转) 行们.push(`上月结转：¥${数字(结转)}${已追缴结转 >= 结转 ? '（已追缴）' : (已追缴结转 > 0 ? `（已追缴 ¥${数字(已追缴结转)}）` : '')}`);
  行们.push(`合计应付：${应付}`);
  const 文本 = 行们.join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(文本);
    } else {
      const ta = document.createElement('textarea');
      ta.value = 文本; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    提示(`已复制 ${b.房号} 账单文本`);
  } catch (e) { 提示('复制失败，请手动截图'); }
};
window.改损耗说明 = async function(房号, 月份, 值) {
  await api('/api/bills/collect', { method: 'POST', body: { 房号, 月份, 损耗说明: 值 } });
};
window.改损耗 = async function(房号, 月份, 值) {
  await api('/api/bills/collect', { method: 'POST', body: { 房号, 月份, 房间损耗: 值 } });
  渲染租客账单(document.getElementById('内容'));
};


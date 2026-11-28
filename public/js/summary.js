// ============ 账单（总账单 + 月度账单） ============
let 账单tab = '月度账单'; let 汇总类型 = '月租'; let 汇总月份 = null; let 账单状态筛选 = '全部';
const 汇总趋势项集 = new Set(['月租', '日租', '支出']); let 汇总趋势跨度 = 6;
let 日租视图 = '表格'; let 日租搜索日 = '';
let 日租姓名筛选 = ''; let 日租房号筛选 = '';   // 只作用在日租的「表格模式」，图表模式按天汇总金额、不看客人
async function 渲染账单(容器) {
  if (!汇总月份) 汇总月份 = 全局.settings.当前月份;
  const 月 = 汇总月份;
  容器.innerHTML = `<div id="账单tab内容"></div>`;
  const el = document.getElementById('账单tab内容');
  const [s, 账单, daily, 支出, 历史汇总] = await Promise.all([
    api(`/api/summary?month=${月}`),
    汇总类型 === '月租' ? api(`/api/bills?month=${月}`) : Promise.resolve(null),
    汇总类型 === '日租' ? api(`/api/daily?month=${月}`) : Promise.resolve(null),
    汇总类型 === '支出' ? api(`/api/transactions?month=${月}`) : Promise.resolve(null),
    api('/api/history').catch(() => [])
  ]);

  const 子筛选HTML = `<div class="工具栏" style="margin-bottom:12px">
    <select onchange="汇总类型=this.value;渲染()">
      <option ${汇总类型==='月租'?'selected':''}>月租</option>
      <option ${汇总类型==='日租'?'selected':''}>日租</option>
      <option ${汇总类型==='支出'?'selected':''}>支出</option>
    </select>
    ${汇总类型 === '日租'
      ? `<input type="date" value="${日租搜索日}" onchange="选日租日(this.value)" title="按天搜索，留空看整月">
         ${日租搜索日 ? `<button class="btn 次" onclick="日租搜索日='';渲染()">清除</button>` : ''}
         ${日租视图 === '表格' ? `
           <input value="${转义(日租姓名筛选)}" placeholder="客人姓名" style="width:110px" oninput="日租姓名筛选=this.value" onchange="渲染()" onkeydown="if(event.key==='Enter'&&!event.isComposing)渲染()">
           <input value="${转义(日租房号筛选)}" placeholder="房号" style="width:90px" oninput="日租房号筛选=this.value" onchange="渲染()" onkeydown="if(event.key==='Enter'&&!event.isComposing)渲染()">
           ${(日租姓名筛选 || 日租房号筛选) ? `<button class="btn 次" onclick="日租姓名筛选='';日租房号筛选='';渲染()">清空筛选</button>` : ''}` : ''}
         <button class="btn 次" style="margin-left:auto" onclick="日租视图='${日租视图==='表格'?'图表':'表格'}';渲染()">${日租视图==='表格'?'图表模式':'表格模式'}</button>` : ''}
    ${汇总类型 === '月租' ? `<select onchange="账单状态筛选=this.value;渲染()">
      <option value="全部" ${账单状态筛选==='全部'?'selected':''}>全部状态</option>
      <option value="已核收" ${账单状态筛选==='已核收'?'selected':''}>已核收</option>
      <option value="未交" ${账单状态筛选==='未交'?'selected':''}>未交</option>
      <option value="欠款" ${账单状态筛选==='欠款'?'selected':''}>欠款</option>
      <option value="未出租" ${账单状态筛选==='未出租'?'selected':''}>未出租</option>
    </select>` : ''}
  </div>`;

  let 明细卡片HTML = '';
  if (汇总类型 === '月租') {
    明细卡片HTML = 月租表HTML(账单, 月, true, 子筛选HTML);
  } else if (汇总类型 === '日租') {
    let dList = daily || [];
    if (日租搜索日) dList = dList.filter(d => d.日期 === 日租搜索日);
    const 姓 = 日租姓名筛选.trim(), 房 = 日租房号筛选.trim();
    const 有筛选 = 日租视图 === '表格' && (姓 || 房);
    const 表格数据 = 有筛选
      ? dList.filter(d => (!姓 || String(d.客人 || '').includes(姓)) && (!房 || String(d.房号 || '').includes(房)))
      : dList;
    const 合计 = (日租视图 === '表格' ? 表格数据 : dList).reduce((sum, d) => sum + (Number(d.金额) || 0), 0);
    const 筛选说明 = 有筛选 ? ` · 筛选${姓 ? ' 客人「' + 转义(姓) + '」' : ''}${房 ? ' 房号「' + 转义(房) + '」' : ''}（${表格数据.length} 条）` : '';
    明细卡片HTML = `<div class="卡片">
      <div class="月租表头行"><h2 style="margin:0">日租（${日租搜索日 ? 中文日期(日租搜索日) : 中文年月(月)}${筛选说明}）${锁定徽章(月)}</h2><div class="月租表统计"><span>合计 <b>${金额HTML(合计)}</b></span></div></div>
      ${子筛选HTML}
      ${日租视图 === '表格' ? 日租表格(表格数据, 月, 日租搜索日, !有筛选) : 日租图表(dList, 月, 日租搜索日)}
    </div>`;
  } else {
    const tList = 支出 || [];
    const 合计 = tList.reduce((sum, t) => sum + (Number(t.金额) || 0), 0);
    明细卡片HTML = `<div class="卡片">
      <div class="月租表头行"><h2 style="margin:0">支出（${月}）${锁定徽章(月)}</h2><div class="月租表统计"><span>合计 <b>${金额HTML(合计)}</b></span></div></div>
      ${子筛选HTML}
      <div class="表格容器"><table><tr><th>日期</th><th>事项</th><th class="数字">金额</th><th>备注</th></tr>
        ${tList.map(t => `<tr><td>${转义(t.日期)}</td><td>${转义(t.事项)}</td><td class="数字">${数字(t.金额)}</td><td>${转义(t.备注||'')}</td></tr>`).join('') || '<tr><td colspan="4" class="空">暂无支出</td></tr>'}
      </table></div></div>`;
  }

  const 总收入 = (Number(s.月租已收) || 0) + (Number(s.日租已收) || 0);
  const 总支出 = (Number(s.支出) || 0) + (Number(s.工资) || 0);
  const 占比 = (v, 基准) => 基准 > 0 ? Math.min(100, Math.round((Number(v) || 0) / 基准 * 100)) : 0;
  const 支出基准 = 总收入 > 0 ? 总收入 : 总支出;

  el.innerHTML = `
    <div class="总账单主卡">
      <div class="总账单左">
        <div class="总账单左顶">
          <div class="总账单左标"><span>总账单</span>${锁定徽章(月)}</div>
          <div class="深色月切">
            <button type="button" onclick="汇总月份=加月('${月}',-1);渲染()" title="上月">‹</button>
            <span class="深色月字">${中文年月(月)}<input type="month" value="${月}" onchange="汇总月份=this.value;渲染()"></span>
            <button type="button" onclick="汇总月份=加月('${月}',1);渲染()" title="次月">›</button>
          </div>
        </div>
        <div class="总账单净区">
          <div class="净标">净收支</div>
          <div class="净数"><span class="币">¥</span><b>${千分位(s.合计)}</b></div>
          <div class="净副">收入 ${千分位(总收入)}　支出 ${千分位(总支出)}</div>
        </div>
      </div>
      <div class="总账单右">
        <div class="总账单右顶">
          <button type="button" class="淡操作链" onclick="汇总月份=全局.settings.当前月份;渲染()">本月</button>
          <button type="button" class="黑胶囊钮" onclick="显示全部账单()">全部账单</button>
        </div>
        <div class="总账单两列">
          <div class="总账单列">
            <div class="总账单列头"><span>收入</span><b>¥${千分位(总收入)}</b></div>
            <div class="总账单细项">
              <div class="总账单细名">月租已收</div>
              <div class="总账单细数"><span class="币">¥</span><b>${千分位(s.月租已收)}</b></div>
              <div class="细比例轨"><i class="绿" style="width:${占比(s.月租已收, 总收入)}%"></i></div>
            </div>
            <div class="总账单细项">
              <div class="总账单细名">日租已收</div>
              <div class="总账单细数"><span class="币">¥</span><b>${千分位(s.日租已收)}</b></div>
              <div class="细比例轨"><i class="绿" style="width:${占比(s.日租已收, 总收入)}%"></i></div>
            </div>
          </div>
          <div class="总账单列">
            <div class="总账单列头"><span>支出</span><b>¥${千分位(总支出)}</b></div>
            <div class="总账单细项">
              <div class="总账单细名">支出</div>
              <div class="总账单细数"><span class="币">¥</span><b>${千分位(s.支出)}</b></div>
              <div class="细比例轨"><i class="红" style="width:${占比(s.支出, 支出基准)}%"></i></div>
            </div>
            <div class="总账单细项">
              <div class="总账单细名">工资</div>
              <div class="总账单细数"><span class="币">¥</span><b>${千分位(s.工资)}</b></div>
              <div class="细比例轨"><i class="红" style="width:${占比(s.工资, 支出基准)}%"></i></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="卡片 趋势卡" id="汇总对比趋势区"></div>
    ${明细卡片HTML}`;
  const 历史map = new Map((Array.isArray(历史汇总) ? 历史汇总 : []).map(r => [r.月份, r]));
  // 确保当前正在看的基准月也在对比数据集里（尚未切月的当月直接用实时 summary s）
  if (!历史map.has(月)) {
    历史map.set(月, { 月份: 月, 月租总收: s.月租已收 || 0, 日租总收: s.日租已收 || 0, 支出原始: s.支出 || 0, 工资: s.工资 || 0 });
  }
  window._汇总历史缓存 = [...历史map.values()];
  window._汇总基准月 = 月;
  渲染汇总对比图();
}
window.切汇总趋势项 = function(项) {
  if (汇总趋势项集.has(项)) {
    if (汇总趋势项集.size <= 1) { 提示('至少保留一条曲线'); return; }
    汇总趋势项集.delete(项);
  } else {
    汇总趋势项集.add(项);
  }
  渲染汇总对比图();
};
window.切汇总趋势跨度 = function(跨度) { 汇总趋势跨度 = 跨度; 渲染汇总对比图(); };
function 渲染汇总对比图() {
  const 区 = document.getElementById('汇总对比趋势区');
  if (!区) return;
  const 基准月 = window._汇总基准月 || 全局.settings.当前月份;
  const 按月全 = [...(window._汇总历史缓存 || [])].sort((a, b) => String(a.月份).localeCompare(String(b.月份)));
  const 截取 = 汇总趋势跨度 > 0 ? 按月全.filter(r => r.月份 <= 基准月).slice(-汇总趋势跨度) : 按月全.filter(r => r.月份 <= 基准月);
  const 全部序列 = [
    { 键: '月租', 名称: '月租总收', 颜色: '#2D6A4F', 数据: 截取.map(r => Number(r.月租总收) || 0) },
    { 键: '日租', 名称: '日租总收', 颜色: '#6B5EA8', 数据: 截取.map(r => Number(r.日租总收) || 0) },
    { 键: '支出', 名称: '支出（含工资）', 颜色: '#C94A6A', 数据: 截取.map(r => (Number(r.支出原始) || 0) + (Number(r.工资) || 0)) },
  ];
  const 序列们 = 全部序列.filter(s => 汇总趋势项集.has(s.键));
  const 标题 = 序列们.length === 1 ? `${序列们[0].名称}趋势` : '月度收支趋势';

  const 开关HTML = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px">
    <div class="分段操作栏">
      <button type="button" class="分段钮 绿 ${汇总趋势项集.has('月租')?'激活':''}" onclick="切汇总趋势项('月租')">月租</button>
      <button type="button" class="分段钮 紫 ${汇总趋势项集.has('日租')?'激活':''}" onclick="切汇总趋势项('日租')">日租</button>
      <button type="button" class="分段钮 红 ${汇总趋势项集.has('支出')?'激活':''}" onclick="切汇总趋势项('支出')">支出</button>
    </div>
    <div class="分段操作栏">
      <button type="button" class="分段钮 ${汇总趋势跨度===3?'激活':''}" onclick="切汇总趋势跨度(3)">3月</button>
      <button type="button" class="分段钮 ${汇总趋势跨度===6?'激活':''}" onclick="切汇总趋势跨度(6)">6月</button>
      <button type="button" class="分段钮 ${汇总趋势跨度===12?'激活':''}" onclick="切汇总趋势跨度(12)">12月</button>
      <button type="button" class="分段钮 ${汇总趋势跨度===0?'激活':''}" onclick="切汇总趋势跨度(0)">全部</button>
    </div>
  </div>`;

  绘制趋势图(区, {
    标题,
    开关HTML,
    标签列表: 截取.map(r => r.月份),
    序列们,
  });
}
let 账单月份筛选 = ''; let 账单盈亏筛选 = '全部'; let 账单排序字段 = ''; let 全部趋势模式 = '累计';
window.显示全部账单 = async function() {
  const el = document.getElementById('账单tab内容');
  el.innerHTML = '<div class="空">加载中…</div>';
  // 实时历史汇总：改历史数据后自动联动（后端 /api/history 按 summary 同一口径现算，不再读切月固化的快照）
  const 结果 = await api('/api/history');
  // 房租支出：每半年 150000（2023-03~2026-08）月摊 25000；2026-09 起每半年 110000，前 5 月各 18333、第 6 月 18335 补齐差额
  const 半年第几月 = m => { const 月 = Number(m.slice(5, 7)); return (月 >= 3 && 月 <= 8) ? 月 - 2 : (月 >= 9 ? 月 - 8 : 月 + 4); };
  const 月房租 = m => m >= '2026-09' ? (半年第几月(m) <= 5 ? 18333 : 18335) : (m >= '2023-03' ? 25000 : 0);
  for (const r of 结果) {
    r.支出 = r.支出原始 || 0; // 支出（写死月已在后端减掉工资 4000，实时月为流水真实支出）
    r.利润 = (r.月租总收 || 0) + (r.日租总收 || 0) - r.支出 - (r.工资 || 0); // 利润（毛利）= 月租 + 日租 − 支出 − 工资
    r.房租支出 = 月房租(r.月份);
    r.净利润 = r.利润 - r.房租支出; // 净利润（纯利润）= 利润 − 房租支出
  }
  window.全部账单数据 = 结果;
  el.innerHTML = `<div class="卡片 利润总览卡" id="全部账单透视区"></div>
    <div class="卡片 趋势卡" id="全部账单趋势区"></div>
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
      <tr><th>月份</th><th class="数字">月租总收</th><th class="数字">日租总收</th><th class="数字">支出</th><th class="数字">工资</th><th class="数字">利润</th><th class="数字">房租支出</th><th class="数字">净利润</th></tr>
      ${列表.map(r => `<tr><td><b>${r.月份}</b></td><td class="数字">¥${数字(r.月租总收)}</td><td class="数字">¥${数字(r.日租总收)}</td><td class="数字">¥${数字(r.支出)}</td><td class="数字">¥${数字(r.工资)}</td><td class="数字">¥${数字(r.利润)}</td><td class="数字">¥${数字(r.房租支出)}</td><td class="数字">¥${数字(r.净利润)}</td></tr>`).join('')}
      ${列表.length?'':'<tr><td colspan="8" class="空">无匹配数据</td></tr>'}
    </table></div>`;
  }
  const 透视区 = document.getElementById('全部账单透视区');
  if (透视区) {
    const 总利润 = 列表.reduce((s, r) => s + r.利润, 0);
    const 房租支出之和 = 列表.reduce((s, r) => s + r.房租支出, 0);
    const 总净利润 = 列表.reduce((s, r) => s + r.净利润, 0);
    const 净利正 = Math.max(0, 总净利润);
    const 构成基数 = 净利正 + Math.max(0, 房租支出之和);
    const 净利比 = 构成基数 > 0 ? Math.round(净利正 / 构成基数 * 1000) / 10 : 0;
    const 房租比 = 构成基数 > 0 ? Math.round((100 - 净利比) * 10) / 10 : 0;
    透视区.innerHTML = `
      <div class="利润总览头">利润总览（累计）</div>
      <div class="利润三栏">
        <div class="利润栏">
          <div class="利润栏标">净利润</div>
          <div class="利润主数"><span class="币">¥</span><b>${千分位(总净利润)}</b></div>
          <div class="利润占比字">占总利润 ${净利比.toFixed(1)}%</div>
        </div>
        <div class="利润栏">
          <div class="利润栏标"><i class="深"></i>总利润</div>
          <div class="利润副数"><span class="币">¥</span><b>${千分位(总利润)}</b></div>
        </div>
        <div class="利润栏">
          <div class="利润栏标"><i class="浅"></i>房租支出之和</div>
          <div class="利润副数"><span class="币">¥</span><b>${千分位(房租支出之和)}</b></div>
        </div>
      </div>
      <div class="通栏比例条">
        <span class="主段" style="width:${净利比}%"></span>
        <span class="副段" style="width:${房租比}%"></span>
      </div>
      <div class="通栏图例">
        <span class="项" style="width:${Math.max(18, Math.min(82, 净利比))}%"><i class="深"></i>净利润 ${净利比.toFixed(1)}%</span>
        <span class="项"><i class="浅"></i>房租支出 ${房租比.toFixed(1)}%</span>
      </div>`;
  }
  渲染全部账单趋势图(列表);
};

function 渲染全部账单趋势图(列表) {
  const 区 = document.getElementById('全部账单趋势区');
  if (!区) return;
  const 按月 = [...列表].sort((a, b) => String(a.月份).localeCompare(String(b.月份)));
  let 线1名, 线2名, 序列1 = [], 序列2 = [];
  if (全部趋势模式 === '累计') {
    线1名 = '累计总利润'; 线2名 = '累计净利润';
    let 累1 = 0, 累2 = 0;
    for (const r of 按月) {
      累1 += r.利润 || 0;
      累2 += r.净利润 || 0;
      序列1.push(累1);
      序列2.push(累2);
    }
  } else {
    线1名 = '月总收入'; 线2名 = '月总支出';
    for (const r of 按月) {
      序列1.push((r.月租总收 || 0) + (r.日租总收 || 0));
      序列2.push((r.支出 || 0) + (r.工资 || 0) + (r.房租支出 || 0));
    }
  }
  const 开关HTML = `<div class="分段操作栏">
    <button type="button" class="分段钮 绿 ${全部趋势模式==='累计'?'激活':''}" onclick="切全部趋势('累计')">累计利润</button>
    <button type="button" class="分段钮 ${全部趋势模式==='月度'?'激活':''}" onclick="切全部趋势('月度')">月度收支</button>
  </div>`;
  绘制趋势图(区, {
    标题: '收支与利润趋势',
    开关HTML,
    标签列表: 按月.map(r => r.月份),
    序列们: [
      { 名称: 线1名, 颜色: '#2D6A4F', 数据: 序列1 },
      { 名称: 线2名, 颜色: '#C94A6A', 数据: 序列2 },
    ],
  });
}
window.切全部趋势 = function(模式) { 全部趋势模式 = 模式; 渲染全部账单表(); };
// 日租按天搜索：选了哪天就把月份一起跳过去，免得选的日子不在当前月、结果一条都搜不出来
window.选日租日 = function(值) {
  日租搜索日 = 值 || '';
  if (日租搜索日) 汇总月份 = 日租搜索日.slice(0, 7);
  渲染();
};
window.删除账单 = async function(房号, 月份) {
  if (!await 询问确认('删除账单', `确定删除 ${转义(房号)} ${月份} 的账单记录？<br>若有上月结转欠款，会保留结转、只清空本月操作（追缴/核收/滚存/损耗）。`)) return;
  const r = await api(`/api/bills?房号=${房号}&月份=${月份}`, { method: 'DELETE' });
  提示(r.保留结转 ? '已清空本月操作（保留上月结转）' : '已删除'); 渲染();
};
// 月租表（独立导航页「月租」可编辑；「汇总」页引用为只读）
function 月租表HTML(账单, 月, 只读, 嵌入工具栏 = '') {
  const 在租账单 = 账单.filter(b => b.状态 !== '未出租');
  const 应收 = 在租账单.reduce((s, b) => s + (b.应付租金 || 0), 0);
  const 实收 = 在租账单.reduce((s, b) => s + (b.实收 || 0) + (b.补缴 || 0) + (b.新收押金 || 0) + (b.预缴 || 0), 0);
  const 未收 = Math.max(0, 应收 - 实收);
  const 进度 = 应收 > 0 ? Math.min(100, Math.round((实收 / 应收) * 100)) : 0;
  const 显示账单 = 账单状态筛选 === '全部' ? 账单 : 账单.filter(b => b.状态 === 账单状态筛选);
  const 有押金 = 显示账单.some(b => (b.新收押金 || 0) > 0);
  const 显示操作列 = !只读 && 启用删除;
  const 总列数 = 9 + (有押金 ? 1 : 0) + (显示操作列 ? 1 : 0);
  return `<div class="卡片">
    <div class="月租表头行">
      <h2 style="margin:0">月租账单（${月}）${锁定徽章(月)} <span style="font-size:var(--fs-xs);font-weight:400;color:var(--次文字);margin-left:6px">单位：元</span></h2>
      <div class="月租表统计">
        <span>应付 <b>${数字(应收)}</b></span>
        <span>已收 <b style="color:var(--绿)">${数字(实收)}</b></span>
        <span>未收 <b style="color:${未收 > 0 ? 'var(--红)' : 'var(--次文字)'}">${数字(未收)}</b></span>
        <span>${进度}%</span>
      </div>
    </div>
    ${嵌入工具栏}
    <div class="进度条底"><div class="进度条填" style="width:${进度}%"></div></div>
    <div class="表格容器"><table>
      <tr><th>房号</th><th>状态</th><th>交租日期</th><th class="数字">房租</th>${有押金 ? '<th class="数字">新收押金</th>' : ''}<th class="数字">管理费</th><th class="数字">水费</th><th class="数字">电费</th><th class="数字">欠费滚存</th><th class="数字">实收</th>${显示操作列 ? '<th></th>' : ''}</tr>
    ${显示账单.map(b => {
      const 未出租 = b.状态 === '未出租';
      if (未出租) {
        return `<tr><td><b style="color:var(--次文字)">${转义(b.房号)}</b></td><td colspan="${总列数 - 1}" style="color:var(--次文字)">${状态徽章('未出租')}</td></tr>`;
      }
      const 已退房 = b.状态 === '已退房';
      const 空列 = 已退房;
      const 操作 = !显示操作列 ? '' : (空列 ? '<td></td>' : `<td class="操作列"><button class="btn 行内 危险" onclick="删除账单('${转义(b.房号)}','${月}')">删</button></td>`);
      const 房租列 = 空列 ? '—' : (b.房租已预缴 ? '<span class="已预缴">已预缴</span>' : 数字(b.房租));
      const 管理费列 = 空列 ? '—' : (b.管理费已预缴 ? '<span class="已预缴">已预缴</span>' : 数字(b.管理费));
      const 当月实收 = (b.实收 || 0) + (b.补缴 || 0) + (b.新收押金 || 0) + (b.预缴 || 0);
      return `<tr><td><b>${转义(b.房号)}</b></td><td>${状态徽章(b.状态)}${!空列 && b.欠款 > 0 ? ` <span style="color:var(--红);font-size:var(--fs-xs);font-variant-numeric:tabular-nums">欠${数字(b.欠款)}</span>` : ''}</td><td style="color:var(--次文字);font-variant-numeric:tabular-nums">${空列 ? '—' : 转义(b.交租日期 || '')}</td><td class="数字">${房租列}</td>${有押金 ? `<td class="数字">${空列 ? '—' : (b.新收押金 ? 数字(b.新收押金) : '')}</td>` : ''}<td class="数字">${管理费列}</td><td class="数字">${空列 ? '—' : 数字(b.水费)}</td><td class="数字">${空列 ? '—' : 数字(b.电费)}</td><td class="数字">${空列 ? '—' : (b.结转 ? 数字(b.结转) : '')}</td><td class="数字">${当月实收 > 0 ? 数字(当月实收) : '<span style="color:var(--次文字)">—</span>'}</td>${操作}</tr>`;
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


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
    ${未抄表列表.length ? `<div class="卡片">
      <h2>未抄表（${未抄表列表.length}）</h2>
      <div class="表格容器"><table>
        <tr><th rowspan="2">房号</th><th rowspan="2">租客</th><th rowspan="2">交租日</th><th colspan="2" style="text-align:center">水表</th><th colspan="2" style="text-align:center">电表</th><th rowspan="2"></th></tr>
        <tr><th class="数字">上月</th><th class="数字">本月</th><th class="数字">上月</th><th class="数字">本月</th></tr>
        ${未抄表列表.map((x, idx) => {
          const 下一房 = 未抄表列表[idx + 1] ? 未抄表列表[idx + 1].房号 : '';
          return `<tr><td><b>${转义(x.房号)}</b></td><td>${转义(x.租客)}</td><td style="color:var(--次文字)">${x.交租日 ? x.交租日 + '号' : '—'}</td>
          <td class="数字">
            <span id="只读上月水${转义(x.房号)}" class="抄表只读">${x.上月水表 ?? '—'} <button type="button" class="抄表改" onclick="解锁上月读数('水','${转义(x.房号)}')">改</button></span>
            <input type="hidden" id="快上月水${转义(x.房号)}" value="${x.上月水表 ?? ''}">
          </td>
          <td class="数字"><input type="number" class="抄表输入" id="快水${转义(x.房号)}" placeholder="本月底数" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('快电${转义(x.房号)}')?.focus();}"></td>
          <td class="数字">
            <span id="只读上月电${转义(x.房号)}" class="抄表只读">${x.上月电表 ?? '—'} <button type="button" class="抄表改" onclick="解锁上月读数('电','${转义(x.房号)}')">改</button></span>
            <input type="hidden" id="快上月电${转义(x.房号)}" value="${x.上月电表 ?? ''}">
          </td>
          <td class="数字"><input type="number" class="抄表输入" id="快电${转义(x.房号)}" placeholder="本月底数" onkeydown="if(event.key==='Enter'){event.preventDefault();window.抄表下个焦点='${转义(下一房)}';快速抄表('${转义(x.房号)}');}"></td>
          <td class="操作列"><button class="btn 行内" onclick="快速抄表('${转义(x.房号)}')">记录</button></td></tr>`;
        }).join('')}</table></div>
    </div>` : `<div class="卡片" style="padding:12px 18px;display:flex;align-items:center;gap:8px;color:var(--绿);font-size:var(--fs-sm)"><span class="状态点标" style="color:var(--ok-text)"><i></i>本月全部已抄表</span></div>`}
    <div class="卡片">
      <h2>抄表记录（搜索）</h2>
      <div class="工具栏"><input id="抄表搜房号" placeholder="按房号搜索" style="width:140px"><input type="month" id="抄表搜日期" style="width:150px"><label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--次文字);cursor:pointer;white-space:nowrap"><input type="checkbox" ${启用删除?'checked':''} onchange="启用删除=this.checked;渲染()" style="cursor:pointer">删除模式</label><span id="抄表计数" style="color:var(--次文字);font-size:13px"></span></div>
      <div class="表格容器"><table id="抄表记录表">
        <tr><th>房号</th><th>日期</th><th>水表</th><th>实用</th><th class="抄表分组">电表</th><th>实用</th><th></th></tr>
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
  const 读数列 = (前, 现, 单位, 组类 = '') => {
    const 差 = (前 !== '' && 前 != null && 现 !== '' && 现 != null) ? Math.max(0, Number(现) - Number(前)) : null;
    const 前文 = (前 !== '' && 前 != null) ? 前 : '—';
    const 现文 = (现 !== '' && 现 != null) ? 现 : '—';
    return `<td class="${组类}" style="color:var(--次文字);font-variant-numeric:tabular-nums">${前文} → ${现文}</td><td style="color:var(--文字);font-weight:500;font-variant-numeric:tabular-nums">${差 != null ? `${精金额(差)} ${单位}` : '—'}</td>`;
  };
  表.innerHTML = `<tr><th>房号</th><th>日期</th><th>水表</th><th>实用</th><th class="抄表分组">电表</th><th>实用</th><th></th></tr>` +
    (列表.length ? 列表.map(m => `<tr><td><b>${转义(m.房号)}</b></td><td style="color:var(--次文字);font-variant-numeric:tabular-nums">${转义(m.日期)}</td>${读数列((上月[m.id] || {}).水, m.水表, '方')}${读数列((上月[m.id] || {}).电, m.电表, '度', '抄表分组')}<td class="操作列">${启用删除 && !月份锁定(m.日期) ? `<button class="btn 行内 危险" onclick="撤销抄表记录('${转义(m.房号)}','${转义(m.日期)}')">撤销</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="7" class="空">无记录</td></tr>');
  const 计数 = document.getElementById('抄表计数');
  if (计数) 计数.textContent = (房号词 || 日期词) ? `匹配 ${列表.length} 条` : '';
};
window.解锁上月读数 = function(类型, 房号) {
  const 跨 = document.getElementById(`只读上月${类型}${房号}`);
  const 框 = document.getElementById(`快上月${类型}${房号}`);
  if (!框) return;
  框.type = 'number';
  框.className = '抄表输入';
  框.placeholder = '上月底度';
  if (跨) 跨.style.display = 'none';
  框.focus();
};
window.快速抄表 = async function(房号) {
  const 水 = document.getElementById('快水' + 房号).value, 电 = document.getElementById('快电' + 房号).value;
  const 上月水 = document.getElementById('快上月水' + 房号)?.value ?? '', 上月电 = document.getElementById('快上月电' + 房号)?.value ?? '';
  if (水 === '' && 电 === '') { 提示('请填读数'); return; }
  await api('/api/meters', { method: 'POST', body: { 房号, 水表: 水 === '' ? null : 水, 电表: 电 === '' ? null : 电, 上月水表: 上月水, 上月电表: 上月电 } });
  提示('已记录');
  const 下房 = window.抄表下个焦点 || '';
  window.抄表下个焦点 = '';
  await 渲染();
  if (下房) document.getElementById('快水' + 下房)?.focus();
};
window.撤销抄表记录 = async function(房号, 日期) {
  const 月份 = String(日期 || '').slice(0, 7);
  if (!await 询问确认('撤销抄表', `确定撤销 ${转义(房号)} ${月份} 最后一条抄表记录？`)) return;
  await api(`/api/meters/undo?房号=${房号}&月份=${月份}`, { method: 'DELETE' });
  提示('已撤销'); 渲染();
};


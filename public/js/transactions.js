// ============ 收支 ============
async function 渲染收支(容器) {
  const 月份 = 全局.settings.当前月份;
  const 锁 = 月份锁定(月份);
  const list = await api(`/api/transactions?month=${月份}`);
  const 合计 = list.reduce((s, t) => s + (Number(t.金额) || 0), 0);
  容器.innerHTML = `
    <div class="卡片">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <h2 style="margin:0">支出流水（${月份}）${锁定徽章(月份)}</h2>
        <div style="display:flex;align-items:center;gap:14px">
          <label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--次文字);cursor:pointer;white-space:nowrap"><input type="checkbox" ${启用删除?'checked':''} onchange="启用删除=this.checked;渲染()" style="cursor:pointer">删除模式</label>
          <span style="font-size:var(--fs-sm);color:var(--次文字)">本月合计 <b style="color:var(--红);font-size:var(--fs-md);font-variant-numeric:tabular-nums">−¥${数字(合计)}</b></span>
        </div>
      </div>
      ${锁 ? '' : `<div class="工具栏" style="padding:10px 12px;background:var(--surface-muted);border-radius:10px;margin-bottom:14px">
        <input id="收日期" type="date" value="${今天()}">
        <input id="收事项" placeholder="支出事项（如：维修水龙头）" style="flex:1;min-width:160px" onkeydown="if(event.key==='Enter')document.getElementById('收金额').focus()">
        <input id="收金额" type="number" placeholder="金额" style="width:110px" onkeydown="if(event.key==='Enter')新增收支()">
        <button class="btn" onclick="新增收支()">记一笔</button>
      </div>`}
      <div class="表格容器"><table>
        <tr><th>日期</th><th>事项</th><th class="数字">金额</th><th class="操作列"></th></tr>
        ${list.map(t => `<tr><td>${转义(t.日期)}</td><td>${转义(t.事项)}</td><td class="数字" style="color:var(--红)">−¥${数字(t.金额)}</td><td class="操作列">${启用删除 && !锁 ? `<button class="文字链 危" onclick="删除收支(${t.id})">删</button>` : ''}</td></tr>`).join('')}
        ${list.length ? `<tr style="background:var(--surface-muted)"><td colspan="2" style="font-weight:var(--fw-semibold)">合计（${list.length} 笔）</td><td class="数字" style="color:var(--红);font-weight:var(--fw-semibold)">−¥${数字(合计)}</td><td></td></tr>` : '<tr><td colspan="4" class="空">本月无支出记录</td></tr>'}
      </table></div>
    </div>`;
}
window.新增收支 = async function() {
  const 日期 = document.getElementById('收日期').value, 事项 = document.getElementById('收事项').value, 金额 = document.getElementById('收金额').value;
  if (!日期 || !事项 || 金额 === '') { 提示('请填完整'); return; }
  await api('/api/transactions', { method: 'POST', body: { 日期, 事项, 金额 } }); 提示('已记录'); 渲染();
};
window.删除收支 = async function(id) { await api(`/api/transactions/${id}`, { method: 'DELETE' }); 提示('已删除'); 渲染(); };


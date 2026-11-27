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
      <td class="数字" style="color:var(--红);font-weight:var(--fw-semibold)">¥${数字(r.退入金额)}</td>
      <td class="操作列"><button class="文字链 主" onclick="打开退房详情(${r.id})">详细</button></td>
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
  const 应退还 = Math.round(应收 - 应扣); // 与后端退入金额取整一致
  const 对不上 = Math.abs(应退还 - 数(r.退入金额)) > 0.5; // 旧版本漏减水电写下的老记录会在这里露馅（取整后按整数比较）
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
      ${对不上 ? `<div class="退租警告">提示：退还金额 ¥${数字(r.退入金额)} 与「应退 − 应扣」= ¥${数字(应退还)} 对不上，这是旧版本漏减水电费留下的老记录</div>` : ''}
    </div>
    <div style="margin-top:14px;display:flex;align-items:center;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      ${月份锁定(r.日期)
        ? `<span style="color:var(--次文字);font-size:13px;margin-right:auto">该月已锁定，不可修改（在设置里解锁后可编辑）</span>`
        : (距今天数(r.日期) > 3
          ? `<span style="color:var(--次文字);font-size:13px;margin-right:auto">退房已超过 3 天，不可撤销</span>`
          : '')}
      <div class="分段操作栏">
        ${!月份锁定(r.日期) && 距今天数(r.日期) <= 3 ? `<button type="button" class="分段钮 红" onclick="撤销退房(${r.id})">撤销退房</button>` : ''}
        ${启用删除 && !月份锁定(r.日期) ? `<button type="button" class="分段钮 红" onclick="删除退房(${r.id})">删除记录</button>` : ''}
        <button type="button" class="分段钮" onclick="请求关闭模态()">关闭</button>
      </div>
    </div>`);
};
window.撤销退房 = async function(id) {
  const r = (window.退房数据 || []).find(x => x.id === id);
  if (!await 询问确认('撤销退房', `确定撤销「${转义(r?.房号 || '')}」的退房？房间将恢复为在租状态，退还流水一并删除。`)) return;
  const 结果 = await api(`/api/checkouts/undo/${id}`, { method: 'POST' });
  if (结果.错误) { 提示(结果.错误); return; }
  提示(`已撤销 ${结果.房号} 的退房`); 关闭模态(); 渲染();
};
window.删除退房 = async function(id) { if (!await 询问确认('删除退房记录', '确定删除这条退房记录？')) return; await api(`/api/checkouts/${id}`, { method: 'DELETE' }); 提示('已删除'); 渲染(); };


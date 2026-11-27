// ============ 房间档案 ============
async function 渲染房间(容器) {
  const rooms = await api('/api/rooms');
  const 在租列表 = rooms.filter(r => r.月租金 !== '' && r.月租金 != null);
  容器.innerHTML = `
    <div class="卡片">
      <div class="工具栏"><span style="color:var(--次文字);font-size:var(--fs-sm);flex:1">共 ${在租列表.length} 间在租</span><button class="btn" onclick="打开房间模态()">+ 添加租户</button></div>
      <div class="表格容器"><table class="固定首列">
        <tr><th>房号</th><th>租客</th><th>电话</th><th class="数字">月租</th><th class="数字">押金</th><th class="数字">房卡押金</th><th>入住日</th><th class="操作列">操作</th></tr>
        ${在租列表.map(r => `<tr>
          <td><b>${转义(r.房号)}</b></td>
          <td>${转义(r.租客姓名||'')}</td><td style="color:var(--次文字);font-variant-numeric:tabular-nums">${转义(r.电话||'')}</td>
          <td class="数字">${数字(r.月租金)}</td>
          <td class="数字">${数字(r.押金)}</td>
          <td class="数字">${数字(r.房卡押金)}</td>
          <td style="color:var(--次文字);font-variant-numeric:tabular-nums">${转义(r.入住日||'—')}</td>
          <td class="操作列" style="white-space:nowrap">
            <button type="button" class="文字链 主" onclick="打开详情('${转义(r.房号)}')">详情</button>
            <button type="button" class="文字链 黄" onclick="打开换房模态('${转义(r.房号)}')">换房</button>
            ${(r.预缴笔数 || 0) > 0 ? `<button type="button" class="文字链 绿" onclick="打开预缴模态('${转义(r.房号)}')" title="预缴余额 ¥${数字(r.预缴余额 || 0)}">预缴</button>` : ''}
            <button type="button" class="文字链 危" onclick="打开退房模态('${转义(r.房号)}')">退房</button>
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
    <h2>硬账目（${在租列表.length} 间在租）</h2>
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
function 房间表单HTML(r = {}, 编辑 = false) {
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
    <div class="行">${数('月租金', 'f月租', '月租金 *')}${数('预缴金', 'f预缴金', 编辑 ? '追加预缴（房租）' : '预缴金（房租）')}</div>
    <div class="行">${数('管理费', 'f管理费', '管理费 *')}${数('管理费预缴金', 'f管理费预缴金', 编辑 ? '追加预缴（管理费）' : '预缴金（管理费）')}</div>
    <div class="字段"><label>从哪个月开始抵 *</label><input id="f预缴月份" type="month" value="${r.入住日 && !编辑 ? String(r.入住日).slice(0,7) : (全局.settings.当前月份 || '')}"></div>
    <p style="color:var(--次文字);font-size:13px;margin:-4px 0 10px">
      预缴金填<b>客人实际交的总额</b>，能抵几个月由月租金自动算：月租 1000 + 预缴 6000 = 抵 6 个月。<br>
      「从哪个月开始抵」= 这笔钱要管的第一个月。新租客填入住月；住了很久今天才预缴的，本月房租还没收就填本月，已经收过了就填下个月。
      ${编辑 ? '<br>编辑里填的是<b>追加</b>一笔，不会覆盖已有的。留空金额就不追加，已有的在列表页绿色「预缴」按钮里查看和删除。' : ''}
    </p>
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
    预缴月份: document.getElementById('f预缴月份')?.value || '',
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
    <div style="margin-top:16px;display:flex;justify-content:flex-end">
      <div class="分段操作栏">
        <button type="button" class="分段钮" onclick="请求关闭模态()">取消</button>
        <button type="button" class="分段钮 绿" onclick="保存房间()">保存</button>
      </div>
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
  const 证 = 校验身份证(数据.身份证);
  if (!证.有效) { 提示('身份证' + 证.原因); return; }
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
    <div style="display:flex;justify-content:flex-end;gap:6px;margin-bottom:12px">
      <button class="btn 行内 ${房间模式==='正常'?'':'次'}" onclick="切编辑模式('正常','${转义(房号)}')">正常模式</button>
      <button class="btn 行内 ${房间模式==='预缴'?'':'次'}" onclick="切编辑模式('预缴','${转义(房号)}')">预缴模式</button>
    </div>
    <div class="表单块">
      <div class="字段"><label>房号</label><input id="f房号" value="${转义(房号)}" disabled></div>
      ${房间表单HTML(r, true)}
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn" onclick="保存编辑('${转义(房号)}')">保存</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
};
// 编辑弹窗里切模式：没预缴的租客改成预缴模式，就是在这里切
window.切编辑模式 = function(模式, 房号) { 房间模式 = 模式; 关闭模态(); 打开编辑模态(房号); };
window.保存编辑 = async function(房号) {
  const rooms = await api('/api/rooms');
  const r = rooms.find(x => x.房号 === 房号);
  if (!r) return;
  const 证 = 校验身份证(document.getElementById('f身份证')?.value || '');
  if (!证.有效) { 提示('身份证' + 证.原因); return; }
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
      ${(r.预缴笔数 || 0) > 0 ? 行('预缴余额', '¥' + 数字(r.预缴余额 || 0) + `（房租还能抵 ${r.预缴剩余月数 || 0} 个月）`) : ''}
      ${行('备注', r.备注)}
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      ${(r.预缴笔数 || 0) > 0 ? `<button class="btn 成功" onclick="关闭模态();打开预缴模态('${转义(房号)}')">预缴明细</button>` : ''}
      <button class="btn" onclick="关闭模态();打开编辑模态('${转义(房号)}')">编辑</button>
      <button class="btn 次" onclick="请求关闭模态()">关闭</button>
    </div>`);
};
window.删除房源 = async function(id) { if (!await 询问确认('删除房源', '确定删除这个房源？')) return; const r = await api(`/api/houses/${id}`, { method: 'DELETE' }); if (r.错误) { 提示(r.错误); return; } 提示('已删除'); 渲染(); };

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
  // 预缴房间退房时显示「留存金额」，默认填剩余预缴余额（住满就是 0），可手改
  const 预缴 = 房 ? await api(`/api/prepay?房号=${encodeURIComponent(房号)}`) : null;
  const 预缴房 = !!(预缴 && !预缴.错误 && 预缴.笔数 > 0);
  const 默认留存 = 预缴房 ? 预缴.余额 : 0;
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
      ${预缴房 ? `<div class="字段"><label>留存金额（预缴剩余，已自动算好，可改）</label><input id="退留存" type="number" value="${精金额(默认留存)}"></div>` : ''}
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
      <div class="字段"><label>备注</label><input id="退备注" placeholder="选填，如：押金抵扣、水电争议等"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn 危险" onclick="确认退房('${转义(房号)}')">确认退房</button>
      <button class="btn 次" onclick="请求关闭模态()">取消</button>
    </div>`);
};
window.确认退房 = async function(房号) {
  const body = { 房号, 日期: document.getElementById('退日期').value, 上月水底: document.getElementById('退上月水').value, 上月电底: document.getElementById('退上月电').value, 退房水底: document.getElementById('退水底').value, 退房电底: document.getElementById('退电底').value, 退房卫生费: document.getElementById('退卫生费').value, 房间损耗: document.getElementById('退损耗').value, 损耗说明: document.getElementById('退损耗说明').value, 退押金: document.getElementById('退押金')?.checked ?? true, 退房卡押金: document.getElementById('退房卡押金')?.checked ?? true, 留存金额: document.getElementById('退留存')?.value || 0, 电话: document.getElementById('退电话')?.value || '', 身份证: document.getElementById('退身份证')?.value || '', 备注: document.getElementById('退备注')?.value || '' };
  if (!(await 询问确认('确认退房？', `${转义(房号)}　退房后房间变空置，结算结果见退租结算单`))) return;
  const r = await api('/api/checkout', { method: 'POST', body });
  if (r.错误) { 提示(r.错误); return; }
  // 退还流水已由后端 /api/checkout 自动写入（含流水 id 关联，撤销退房时一并删除）
  提示(`退房完成，退入 ¥${数字(r.退入金额)}`); 关闭模态(); 渲染();
};
// ============ 预缴明细 ============
// 唯一数据源是后端的 预缴记录，这里加一笔/删一笔之后整页重渲染，
// 房间档案、月度账单、退房结算、总账单都会跟着一起变（数据联动）
window.打开预缴模态 = async function(房号) {
  const g = await api(`/api/prepay?房号=${encodeURIComponent(房号)}`);
  if (g.错误) { 提示(g.错误); return; }
  const 行 = (p) => `<tr>
    <td>${转义(p.月份)}</td>
    <td>${转义(p.类型)}</td>
    <td class="数字">¥${数字(p.金额)}</td>
    <td>${转义(p.备注 || '')}</td>
    <td><button class="btn 行内 危险" onclick="删除预缴(${p.id},'${转义(房号)}')">删</button></td>
  </tr>`;
  打开模态(`<h2>预缴 —— ${转义(房号)}　${转义(g.租客 || '')}</h2>
    <div class="汇总网格">
      <div class="汇总项 收入"><div class="标签">房租预缴余额</div><div class="数值">¥${数字(g.余额房租)}</div></div>
      <div class="汇总项 收入"><div class="标签">管理费预缴余额</div><div class="数值">¥${数字(g.余额管理费)}</div></div>
      <div class="汇总项"><div class="标签">房租还能抵</div><div class="数值">${g.剩余月数房租} 个月</div></div>
    </div>
    <p style="color:var(--次文字);font-size:13px;margin:10px 0">月租 ¥${数字(g.月租金)}／管理费 ¥${数字(g.管理费)}。每个月按单价从余额里扣一次，扣完自动恢复收租；涨价后按新价扣。</p>
    <div class="表格容器"><table>
      <tr><th>月份</th><th>类型</th><th class="数字">金额</th><th>备注</th><th></th></tr>
      ${g.明细.map(行).join('') || '<tr><td colspan="5" class="空">还没有预缴记录</td></tr>'}
    </table></div>
    <div class="表单块" style="margin-top:14px">
      <h3 style="margin:0 0 10px">追加一笔预缴</h3>
      <div class="行三">
        <div class="字段"><label>从哪个月开始抵</label><input id="预缴月份" type="month" value="${转义(全局.settings.当前月份)}"></div>
        <div class="字段"><label>类型</label><select id="预缴类型"><option value="房租">房租</option><option value="管理费">管理费</option></select></div>
        <div class="字段"><label>金额（客人实际交的）</label><input id="预缴金额" type="number" placeholder="如 6000"></div>
      </div>
      <div class="字段"><label>备注</label><input id="预缴备注" placeholder="选填，如：续交半年"></div>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn 成功" onclick="确认追加预缴('${转义(房号)}')">确认追加</button>
      <button class="btn 次" onclick="请求关闭模态()">关闭</button>
    </div>`);
};
window.确认追加预缴 = async function(房号) {
  const body = {
    房号, 月份: document.getElementById('预缴月份').value,
    类型: document.getElementById('预缴类型').value,
    金额: document.getElementById('预缴金额').value,
    备注: document.getElementById('预缴备注').value
  };
  if (!(Number(body.金额) > 0)) { 提示('请填预缴金额'); return; }
  if (!(await 询问确认('确认追加预缴？', `${转义(房号)}　${转义(body.类型)} ¥${数字(body.金额)}，从 ${转义(body.月份)} 开始抵`))) return;
  const r = await api('/api/prepay', { method: 'POST', body });
  if (r.错误) { 提示(r.错误); return; }
  提示('已追加'); 关闭模态(); 渲染(); 打开预缴模态(房号);
};
window.删除预缴 = async function(id, 房号) {
  if (!(await 询问确认('确认删除这笔预缴？', '删除后账单会立即重算'))) return;
  const r = await api('/api/prepay/' + id, { method: 'DELETE' });
  if (r.错误) { 提示(r.错误); return; }
  提示('已删除'); 关闭模态(); 渲染(); 打开预缴模态(房号);
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


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
// 房间表单（新增/编辑共用；r 为空则空表单，有值则预填；预缴模式实时试算可抵月数与期间）
function 房间表单HTML(r = {}, 编辑 = false, 房号控件HTML = '') {
  const 预缴开 = 房间模式 === '预缴';
  const 字 = (k, id, 标, 占位 = '', 额外 = '') => `<div class="房表字段"><label>${标}</label><input id="${id}" value="${转义(r[k] ?? '')}" placeholder="${占位}" ${额外}></div>`;
  const 数 = (k, id, 标, 占位 = '0', 额外 = '') => `<div class="房表字段"><label>${标}</label><input id="${id}" type="number" value="${r[k] ?? ''}" placeholder="${占位}" ${额外}></div>`;
  const 默认月 = r.入住日 && !编辑 ? String(r.入住日).slice(0, 7) : (全局.settings.当前月份 || '');
  return `
    ${房号控件HTML ? `<div class="房表选房">${房号控件HTML}</div>` : ''}

    <section class="房表节">
      <div class="房表节头"><span class="条"></span><h2>租客信息</h2></div>
      <div class="房表网 三">
        ${字('租客姓名', 'f租客', '租客姓名', '请输入姓名', `onchange="带出客人('f租客','f身份证','f电话')"`)}
        ${字('电话', 'f电话', '电话', '手机号码', 'inputmode="tel"')}
        ${字('身份证', 'f身份证', '身份证', '身份证号码')}
      </div>
    </section>

    <section class="房表节">
      <div class="房表节头"><span class="条"></span><h2>租期</h2><span class="注">几号入住 = 每月几号交租</span></div>
      <div class="房表网">
        <div class="房表字段"><label>入住日</label><input id="f入住" type="date" value="${r.入住日 || ''}"></div>
        <div class="房表字段"><label>到期日</label><input id="f到期" type="date" value="${r.到期日 || ''}"></div>
      </div>
    </section>

    <section class="房表节">
      <div class="房表节头"><span class="条"></span><h2>费用</h2></div>
      <div class="房表网">
        ${数('月租金', 'f月租', '月租金<span class="req">*</span>', '0', 'oninput="更新预缴试算()"')}
        ${数('管理费', 'f管理费', '管理费<span class="req">*</span>', '0')}
        ${数('押金', 'f押金', '押金', '0')}
        ${数('房卡押金', 'f房卡押金', '房卡押金', '0')}
      </div>
    </section>

    ${预缴开 ? `
    <section class="房表节">
      <div class="房表节头"><span class="条"></span><h2>预缴信息</h2><span class="注">${编辑 ? '填追加金额，不覆盖已有记录' : '预缴金按实际交的总额填写'}</span></div>
      <div class="房表网">
        <div class="房表字段"><label>${编辑 ? '追加预缴（房租）' : '预缴金（房租）'}</label><input id="f预缴金" type="number" value="${r.预缴金 ?? ''}" placeholder="0" oninput="更新预缴试算()"></div>
        <div class="房表字段"><label>${编辑 ? '追加预缴（管理费）' : '预缴金（管理费）'}</label><input id="f管理费预缴金" type="number" value="${r.管理费预缴金 ?? ''}" placeholder="0"></div>
        <div class="房表字段 整行"><label>从哪个月开始抵<span class="req">*</span></label><input id="f预缴月份" type="month" value="${默认月}" oninput="更新预缴试算()"></div>
      </div>
      <div class="房表试算" id="预缴试算卡">
        <div class="大数" id="预缴试算月数">0<small>个月</small></div>
        <div class="文" id="预缴试算范围">请填写月租金与预缴金额</div>
        <div class="文 副">能抵月数 = 预缴金 ÷ 月租金，向下取整</div>
      </div>
    </section>` : ''}

    <section class="房表节">
      <div class="房表节头"><span class="条"></span><h2>单价与抄表</h2><span class="注">空白则使用默认单价</span></div>
      <div class="房表网">
        <div class="房表字段"><label>水费单价<span class="默认标">默认 ${全局.settings.水价}</span></label><input id="f水单价" type="number" value="${r.水费单价 ?? ''}" placeholder="留空使用默认"></div>
        <div class="房表字段"><label>电费单价<span class="默认标">默认 ${全局.settings.电价}</span></label><input id="f电单价" type="number" value="${r.电费单价 ?? ''}" placeholder="留空使用默认"></div>
        ${数('水表底度', 'f水底', '水表底度', '0')}
        ${数('电表底度', 'f电底', '电表底度', '0')}
      </div>
    </section>

    <section class="房表节">
      <div class="房表字段"><label>备注</label><textarea id="f备注" rows="1" placeholder="例如：电费下调、特殊约定等">${转义(r.备注 ?? '')}</textarea></div>
    </section>`;
}
window.更新预缴试算 = function() {
  const 月数el = document.getElementById('预缴试算月数');
  const 范围el = document.getElementById('预缴试算范围');
  if (!月数el || !范围el) return;
  const 月租 = parseFloat(document.getElementById('f月租')?.value);
  const 预缴 = parseFloat(document.getElementById('f预缴金')?.value);
  const 起始 = document.getElementById('f预缴月份')?.value;
  if (!(月租 > 0) || !(预缴 > 0) || !起始) {
    月数el.innerHTML = '0<small>个月</small>';
    范围el.textContent = '请填写月租金与预缴金额';
    return;
  }
  const 月数 = Math.floor(预缴 / 月租);
  月数el.innerHTML = `${月数}<small>个月</small>`;
  const [y, m] = 起始.split('-').map(Number);
  const 止 = new Date(y, m - 1 + Math.max(0, 月数 - 1), 1);
  const fmt = d => `${d.getFullYear()}年${d.getMonth() + 1}月`;
  范围el.textContent = 月数 > 0 ? `抵扣期间：${fmt(new Date(y, m - 1, 1))} – ${fmt(止)}` : '预缴金不足一个月租金';
};
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
  // 从空置房「出租」进入时锁定房号；点「+ 添加租户」时下拉选空置房号
  const 房号控件 = 预设房号
    ? `<div class="标">出租房间<br><b>房号已选定</b></div><input id="f房号" class="选房框" value="${转义(预设房号)}" disabled>`
    : `<div class="标">选择房间<br><b>房号必选</b></div><select id="f房号" class="选房框"><option value="">请选择房号</option>${空置房号.map(f => `<option ${f === (已选房号 || '') ? 'selected' : ''}>${转义(f)}</option>`).join('')}</select>`;
  打开模态(`
    <div class="房表外卡">
      <header class="房表头">
        <div>
          <h1>${预设房号 ? `出租房间 ${转义(预设房号)}` : '添加租户'}</h1>
          <p>填写租客信息、租期与费用，带 <span class="req">*</span> 为必填</p>
        </div>
        <div class="房表分段" role="group" aria-label="录入模式">
          <button type="button" aria-pressed="${房间模式 === '正常'}" onclick="切房间模式('正常')">正常模式</button>
          <button type="button" aria-pressed="${房间模式 === '预缴'}" onclick="切房间模式('预缴')">预缴模式</button>
        </div>
      </header>
      <div class="房表正文">
        ${房间表单HTML({}, false, 房号控件)}
      </div>
      <footer class="房表底栏">
        <button type="button" class="btn 次" onclick="请求关闭模态()">取消</button>
        <button type="button" class="btn" onclick="保存房间()">保存</button>
      </footer>
    </div>`);
  if (房间模式 === '预缴') 更新预缴试算();
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
  const 话 = 校验手机号(数据.电话);
  if (!话.有效) { 提示('手机号' + 话.原因); return; }
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
  const 房号控件 = `<div class="标">当前房间<br><b>房号锁定</b></div><input id="f房号" class="选房框" value="${转义(房号)}" disabled>`;
  打开模态(`
    <div class="房表外卡">
      <header class="房表头">
        <div>
          <h1>编辑房间 ${转义(房号)}</h1>
          <p>修改租客信息、租期或费用，带 <span class="req">*</span> 为必填</p>
        </div>
        <div class="房表分段" role="group" aria-label="录入模式">
          <button type="button" aria-pressed="${房间模式 === '正常'}" onclick="切编辑模式('正常','${转义(房号)}')">正常模式</button>
          <button type="button" aria-pressed="${房间模式 === '预缴'}" onclick="切编辑模式('预缴','${转义(房号)}')">预缴模式</button>
        </div>
      </header>
      <div class="房表正文">
        ${房间表单HTML(r, true, 房号控件)}
      </div>
      <footer class="房表底栏">
        <button type="button" class="btn 次" onclick="请求关闭模态()">取消</button>
        <button type="button" class="btn" onclick="保存编辑('${转义(房号)}')">保存</button>
      </footer>
    </div>`);
  if (房间模式 === '预缴') 更新预缴试算();
};
// 编辑弹窗里切模式：没预缴的租客改成预缴模式，就是在这里切
window.切编辑模式 = function(模式, 房号) { 房间模式 = 模式; 关闭模态(); 打开编辑模态(房号); };
window.保存编辑 = async function(房号) {
  const rooms = await api('/api/rooms');
  const r = rooms.find(x => x.房号 === 房号);
  if (!r) return;
  const 话 = 校验手机号(document.getElementById('f电话')?.value || '');
  if (!话.有效) { 提示('手机号' + 话.原因); return; }
  const 证 = 校验身份证(document.getElementById('f身份证')?.value || '');
  if (!证.有效) { 提示('身份证' + 证.原因); return; }
  if (!(await 询问确认('确认保存？', `${转义(房号)}　房间信息修改`))) return;
  await api(`/api/rooms/${r.id}`, { method: 'PUT', body: 收集房间数据() }); // 房号由 URL 定位，不可改
  提示('已保存'); 关闭模态(); 渲染();
};
// 房间详情弹框（Hero + 三核心指标 + 分节明细 + 备注提示卡 + 底部操作）
window.打开详情 = async function(房号) {
  const rooms = await api('/api/rooms');
  const r = rooms.find(x => x.房号 === 房号);
  if (!r) return;
  const 金额 = v => (v !== '' && v != null) ? 数字(v) : '0';
  const 字段 = (k, v, 空字 = '暂无', html = false) => {
    const 无值 = v == null || v === '';
    const 内容 = 无值 ? 空字 : (html ? v : 转义(v));
    return `<div class="房详字段"><span class="k">${k}</span><span class="v${无值 ? ' 房详空' : ''}">${内容}</span></div>`;
  };
  const 交租号 = 交租日显示(r);
  const 入住展示 = r.入住日 ? `${转义(r.入住日)}${交租号 !== '—' ? ` · ${交租号}` : ''}` : '';
  const 电话Html = r.电话 ? `<a href="tel:${转义(r.电话)}" style="color:inherit;text-decoration:none">${转义(r.电话)}</a>` : '';
  const 水价展示 = (r.水费单价 !== '' && r.水费单价 != null) ? `${精金额(r.水费单价)} 元/方` : `默认（${全局.settings.水价} 元/方）`;
  const 电价展示 = (r.电费单价 !== '' && r.电费单价 != null) ? `${精金额(r.电费单价)} 元/度` : `默认（${全局.settings.电价} 元/度）`;
  const 有预缴 = (r.预缴笔数 || 0) > 0;

  打开模态(`
    <div class="房详外卡">
      <header class="房详卡头">
        <div>
          <div class="房详眉标">Room Detail</div>
          <div class="房详标题">${转义(r.房号)}<small>房间详情</small></div>
        </div>
        <span class="房详状态">${有预缴 ? '已预缴 · 在租' : '在租中'}</span>
      </header>

      <section class="房详四指标">
        <div class="房详指标 主">
          <div class="标">月租金</div>
          <div class="数">${金额(r.月租金)}<em>元/月</em></div>
        </div>
        <div class="房详指标">
          <div class="标">管理费</div>
          <div class="数">${金额(r.管理费)}<em>元/月</em></div>
        </div>
        <div class="房详指标">
          <div class="标">押金</div>
          <div class="数">${金额(r.押金)}<em>元</em></div>
        </div>
        <div class="房详指标">
          <div class="标">房卡押金</div>
          <div class="数">${金额(r.房卡押金)}<em>元</em></div>
        </div>
      </section>

      <div class="房详正文">
        <section class="房详节">
          <div class="房详节头"><span class="条"></span><h2>租客信息</h2></div>
          <div class="房详网格">
            ${字段('租客', r.租客姓名)}
            ${字段('联系电话', 电话Html, '暂无', true)}
            ${r.身份证 ? 字段('身份证', r.身份证) : ''}
          </div>
        </section>

        <section class="房详节">
          <div class="房详节头"><span class="条"></span><h2>租期</h2></div>
          <div class="房详网格">
            ${字段('入住日期', 入住展示, '暂无', true)}
            ${字段('到期日期', r.到期日)}
          </div>
        </section>

        <section class="房详节">
          <div class="房详节头"><span class="条"></span><h2>费用标准</h2></div>
          <div class="房详网格">
            ${字段('水费单价', 水价展示)}
            ${字段('电费单价', 电价展示)}
          </div>
        </section>

        <section class="房详节">
          <div class="房详节头"><span class="条"></span><h2>抄表读数</h2></div>
          <div class="房详网格">
            ${字段('水表底度', r.水表底度)}
            ${字段('电表底度', r.电表底度)}
          </div>
        </section>

        ${有预缴 ? `
        <section class="房详节">
          <div class="房详节头"><span class="条"></span><h2>预缴抵扣</h2></div>
          <div class="房详网格">
            ${字段('预缴余额', `¥${数字(r.预缴余额 || 0)}`)}
            ${字段('房租可抵', `${r.预缴剩余月数 || 0} 个月`)}
          </div>
        </section>` : ''}

        ${r.备注 ? `
        <section class="房详节">
          <div class="房详备注">
            <span class="标">!</span>
            <div>
              <div class="名">备注</div>
              <div class="文">${转义(r.备注)}</div>
            </div>
          </div>
        </section>` : ''}
      </div>

      <footer class="房详底栏">
        ${有预缴 ? `<button type="button" class="btn 成功" onclick="关闭模态();打开预缴模态('${转义(房号)}')">预缴明细</button>` : ''}
        <button type="button" class="btn 次" onclick="请求关闭模态()">关闭</button>
        <button type="button" class="btn" onclick="关闭模态();打开编辑模态('${转义(房号)}')">编辑</button>
      </footer>
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
  const 退电话 = document.getElementById('退电话')?.value || '';
  const 话 = 校验手机号(退电话);
  if (!话.有效) { 提示('手机号' + 话.原因); return; }
  const 退证 = document.getElementById('退身份证')?.value || '';
  const 证 = 校验身份证(退证);
  if (!证.有效) { 提示('身份证' + 证.原因); return; }
  const body = { 房号, 日期: document.getElementById('退日期').value, 上月水底: document.getElementById('退上月水').value, 上月电底: document.getElementById('退上月电').value, 退房水底: document.getElementById('退水底').value, 退房电底: document.getElementById('退电底').value, 退房卫生费: document.getElementById('退卫生费').value, 房间损耗: document.getElementById('退损耗').value, 损耗说明: document.getElementById('退损耗说明').value, 退押金: document.getElementById('退押金')?.checked ?? true, 退房卡押金: document.getElementById('退房卡押金')?.checked ?? true, 留存金额: document.getElementById('退留存')?.value || 0, 电话: 退电话, 身份证: 退证, 备注: document.getElementById('退备注')?.value || '' };
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


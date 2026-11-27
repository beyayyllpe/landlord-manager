// ============ 设置（左侧目录树 + 右侧详情） ============
let 设置节点 = '主题';   // 当前选中的目录项，本次会话内保留（刷新页面回到主题模式）
let 主题 = localStorage.getItem('主题') || '明亮';   // 每台设备各自记（localStorage），不占用数据文件
let 房源删除模式 = false; const 房源选中 = new Set();

// 设置目录树：加项 / 改顺序只动这张表，各项的详情由对应的 设置_xxx() 返回 HTML
const 设置目录 = [
  { 键: '主题', 图标: '🎨', 名: '主题模式', 渲染: 设置_主题 },
  { 键: '安全', 图标: '🔒', 名: '安全设置', 渲染: 设置_安全 },
  { 键: '导出', 图标: '📦', 名: '导出', 渲染: 设置_导出 },
  { 键: '参数', 图标: '⚙️', 名: '参数', 渲染: 设置_参数 },
  { 键: '关于', 图标: 'ℹ️', 名: '关于', 渲染: 设置_关于 }
];
function 当前设置项() { return 设置目录.find(x => x.键 === 设置节点) || 设置目录[0]; }

function 应用主题() {
  document.documentElement.setAttribute('data-theme', 主题 === '暗黑' ? 'dark' : 'light');
}
async function 渲染设置(容器) {
  应用主题();
  同步导航高亮();
  更新当前页标题();
  容器.innerHTML = `<div class="设置详情" id="设置详情"></div>`;
  await 刷新设置详情();
}
// 只重绘右侧详情，不动左边目录（保存后刷新、在线更新轮询都走这里）
async function 刷新设置详情() {
  const el = document.getElementById('设置详情');
  if (!el) return;
  el.innerHTML = await 当前设置项().渲染();
}
window.选设置项 = async function(键) {
  if (设置节点 === 键) return;
  设置节点 = 键;
  房源删除模式 = false; 房源选中.clear();   // 换页时退出删除模式，避免残留勾选
  同步导航高亮();
  更新当前页标题();
  window.scrollTo(0, 0);
  await 刷新设置详情();
};
// 「在线更新」卡片：检查更新 / 一键更新 / 更新日志（看各版本）。放在设置 tab 最底部
function 在线更新卡片() {
  const v = 当前版本信息 || { 版本: '未知', 提交: '', 日期: '', 仓库: '' };
  const 版本行 = `<p style="color:var(--次文字);font-size:13px;margin-bottom:10px">
    当前版本 <b style="color:var(--文字)">v${转义(v.版本)}</b> · <code>${转义(v.提交 || '—')}</code>${v.日期 ? ' · ' + 转义(v.日期) : ''}${v.仓库 ? `<br>更新源 <code>${转义(v.仓库)}</code>` : ''}
  </p>`;

  const 结果 = 更新检查结果;
  let 状态区 = '';

  if (更新执行中) {
    状态区 = `<div class="更新日志区">${(更新日志缓存 || []).map(l => `<div>${转义(l)}</div>`).join('')}</div>
      <p style="color:var(--次文字);font-size:13px;margin-top:8px">服务重启中，请稍候，完成后页面会自动刷新…</p>`;
  } else if (更新检查中) {
    状态区 = `<p style="color:var(--次文字);font-size:13px">正在检查…</p>`;
  } else if (结果 && 结果.错误) {
    状态区 = `<p style="color:var(--红);font-size:13px">${转义(结果.错误)}</p>`;
  } else if (结果 && 结果.当前提交 === undefined) {
    // /api/update/check 对「非 git 仓库」只返回 可更新/不可更新原因 两个字段
    状态区 = `<p style="color:var(--次文字);font-size:13px">${转义(结果.不可更新原因 || '当前无法在线更新。')}</p>`;
  } else if (结果 && !结果.有更新) {
    状态区 = `<p style="color:var(--绿);font-size:14px">已是最新版本 v${转义(结果.当前版本)}</p>`;
  } else if (结果) {
    const 日志段 = (结果.更新日志 || []).slice(0, 3);
    const 日志HTML = 日志段.length
      ? 日志段.map(段 => `<div style="margin-bottom:8px">
          <b>${转义(段.版本)}</b>${段.日期 ? ` <span style="color:var(--次文字);font-size:12px">— ${转义(段.日期)}</span>` : ''}
          <ul style="margin:4px 0 0 18px;font-size:13px">${(段.条目 || []).map(条 => `<li>${转义(条)}</li>`).join('')}</ul>
        </div>`).join('')
      : `<div style="font-size:13px;color:var(--次文字)">${(结果.提交列表 || []).map(c => `<div>${转义(c)}</div>`).join('')}</div>`;

    // 统一显示后端给的「不可更新原因」（工作区脏 / 本地已分叉），脏工作区再把具体文件列出来
    const 阻止提示 = 结果.可更新 ? '' : `<p style="color:var(--红);font-size:13px;margin-top:8px">${转义(结果.不可更新原因 || '当前无法更新')}${(结果.本地改动 && 结果.本地改动.length) ? '。改动文件：' + 转义(结果.本地改动.join('、')) : ''}。</p>`;

    // 分叉时提供「强制同步到远程版本」按钮，丢弃本地旧提交、对齐远程（部署机常用）
    const 强制同步按钮 = 结果.可强制同步
      ? `<button class="btn 危险" onclick="强制同步()">强制同步到远程版本</button>`
      : '';

    状态区 = `
      <p style="color:var(--主色);font-weight:var(--fw-semibold);margin-bottom:8px">发现新版本 v${转义(结果.最新版本)}（落后 ${结果.落后提交数} 个提交）</p>
      <div class="更新日志区">${日志HTML}</div>
      ${阻止提示}
      <div class="工具栏" style="margin-top:12px">
        <button class="btn 成功" ${结果.可更新 ? '' : 'disabled'} onclick="立即更新()">立即更新</button>
        ${强制同步按钮}
      </div>`;
  }

  return `<div class="卡片">
    <h2>在线更新</h2>
    ${版本行}
    <div class="工具栏">
      <button class="btn" ${更新执行中 || 更新检查中 ? 'disabled' : ''} onclick="检查更新()">检查更新</button>
      <button class="btn 次" ${更新执行中 ? 'disabled' : ''} onclick="看更新日志()">更新日志</button>
    </div>
    ${状态区}
  </div>`;
}
window.检查更新 = async function() {
  更新检查中 = true;
  await 刷新设置详情();
  // 必须兜底：服务端返回非 JSON（重启中拿到 HTML 错误页等）时 r.json() 会抛错，
  // 不catch 的话 更新检查中 永远停在 true，按钮一直灰着，只能刷新页面才能恢复
  try {
    更新检查结果 = await api('/api/update/check');
  } catch (e) {
    更新检查结果 = { 错误: '检查更新失败：' + (e && e.message ? e.message : '服务无响应') };
  } finally {
    更新检查中 = false;
  }
  刷新设置详情();
};
window.立即更新 = async function() {
  if (!更新检查结果 || !更新检查结果.可更新) return;
  const ok = await 询问确认('确认更新', `将从 GitHub 拉取 v${更新检查结果.最新版本}（落后 ${更新检查结果.落后提交数} 个提交）并自动重启服务，期间页面会短暂无法访问。数据已自动备份。`);
  if (!ok) return;
  const 旧提交 = (当前版本信息 && 当前版本信息.提交) || '';
  更新执行中 = true; 更新日志缓存 = ['⏳ 正在拉取更新…'];
  刷新设置详情();
  const r = await api('/api/update/apply', { method: 'POST' });
  if (r.错误) {
    更新执行中 = false; 更新日志缓存 = r.日志 || [];
    提示('更新失败：' + r.错误);
    刷新设置详情();
    return;
  }
  更新日志缓存 = r.日志 || [];
  刷新设置详情();
  await 等服务重启(旧提交);
};
window.强制同步 = async function() {
  if (!更新检查结果 || !更新检查结果.可强制同步) return;
  const ok = await 询问确认('确认强制同步', `将丢弃本地 ${更新检查结果.领先提交数} 个未推送的提交，强制对齐到远程最新版 v${更新检查结果.最新版本}。期间服务会重启，数据已自动备份。`);
  if (!ok) return;
  const 旧提交 = (当前版本信息 && 当前版本信息.提交) || '';
  更新执行中 = true; 更新日志缓存 = ['⏳ 正在强制同步…'];
  刷新设置详情();
  const r = await api('/api/update/force-sync', { method: 'POST' });
  if (r.错误) {
    更新执行中 = false; 更新日志缓存 = r.日志 || [];
    提示('强制同步失败：' + r.错误);
    刷新设置详情();
    return;
  }
  更新日志缓存 = r.日志 || [];
  刷新设置详情();
  await 等服务重启(旧提交);
};
// 更新日志：弹模态框看，日志长了在框内滚动，不把设置页撑长
window.看更新日志 = async function() {
  if (!版本日志缓存) {
    打开模态(`<h2>更新日志</h2>
      <p style="color:var(--次文字);font-size:13px">正在读取…</p>`);
    版本日志缓存 = await api('/api/update/changelog').catch(() => []);
  }
  const 段落 = 版本日志缓存 || [];
  const 正文 = 段落.length
    ? 段落.map(段 => `<div class="日志段">
        <div class="日志段头"><b>${转义(段.版本)}</b>${段.日期 ? `<span>${转义(段.日期)}</span>` : ''}</div>
        <ul>${(段.条目 || []).map(条 => `<li>${转义(条)}</li>`).join('') || '<li style="color:var(--次文字)">（本版本无条目）</li>'}</ul>
      </div>`).join('')
    : '<div style="color:var(--次文字);padding:8px 0">暂无更新日志</div>';
  打开模态(`<h2>更新日志</h2>
    <div class="日志滚动区">${正文}</div>
    <div style="margin-top:14px;display:flex;gap:8px">
      <button class="btn 次" onclick="关闭模态()">关闭</button>
    </div>`);
};
// 更新/回滚成功后轮询 /api/version，等新进程真的起来了（提交号变化）再刷新页面。
// 重启期间连不上是预期行为，不弹错误提示。
async function 等服务重启(旧提交) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const v = await api('/api/version');
      if (v.提交 && v.提交 !== 旧提交) {
        更新执行中 = false;
        提示('更新完成，正在刷新');
        location.reload();
        return;
      }
    } catch (e) { /* 重启中连不上是正常的，继续等 */ }
  }
  更新执行中 = false;
  提示('服务重启超时，请手动刷新页面或检查服务端窗口');
  刷新设置详情();
}
// 主题模式：明亮 / 暗黑，存 localStorage，每台设备各记各的
async function 设置_主题() {
  const meta = await fetch('/api/login-bg/meta').then(r => r.json()).catch(() => ({ hasBg: false }));
  const 预览 = meta && meta.hasBg
    ? `<div class="背景预览盒">${meta.kind === 'video'
        ? `<video src="/api/login-bg?t=${Date.now()}" autoplay muted loop playsinline></video>`
        : `<img src="/api/login-bg?t=${Date.now()}" alt="登录背景预览">`}</div>`
    : `<p style="color:var(--次文字);font-size:13px;margin:10px 0">当前未上传背景，使用默认渐变背景。</p>`;
  return `
    <div class="卡片">
      <h2>主题模式</h2>
      <div class="工具栏">
        <button class="btn ${主题==='明亮'?'':'次'}" onclick="切换主题('明亮')">明亮</button>
        <button class="btn ${主题==='暗黑'?'':'次'}" onclick="切换主题('暗黑')">暗黑</button>
      </div>
      <p style="color:var(--次文字);font-size:13px">主题选择存在本浏览器，手机和电脑各自记忆、互不影响。</p>
    </div>
    <div class="卡片">
      <h2>登录页自定义背景</h2>
      <p style="color:var(--次文字);font-size:13px">支持 JPG / PNG / WebP 静态图、GIF 动态图或 MP4 / WebM 短视频（最大 20MB），自动铺满不同尺寸屏幕并搭配毛玻璃登录框。</p>
      ${预览}
      <div class="工具栏" style="margin-bottom:0">
        <label class="btn" style="cursor:pointer">上传图片 / 动态图 / 视频<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" style="display:none" onchange="上传登录背景(this)"></label>
        ${meta && meta.hasBg ? `<button class="btn 次" onclick="恢复默认登录背景()">恢复默认背景</button>` : ''}
      </div>
    </div>`;
}
window.上传登录背景 = async function(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { 提示('文件不能超过 20MB'); return; }
  提示('正在上传背景...');
  try {
    const r = await fetch('/api/login-bg', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (r.status === 401) { location.replace('/login'); return; }
    if (r.status === 413) { 提示('文件超过服务器 Nginx 上传限制（413），请在反代配置添加 client_max_body_size 25m;'); return; }
    const res = await r.json().catch(() => ({}));
    if (!r.ok || res.错误) { 提示(res.错误 || '上传失败'); return; }
    提示('登录背景已更新');
    刷新设置详情();
  } catch (e) { 提示('上传失败：' + e.message); }
};
window.恢复默认登录背景 = async function() {
  if (!await 询问确认('恢复默认背景', '确定要移除自定义背景并恢复默认吗？')) return;
  const r = await api('/api/login-bg', { method: 'DELETE' });
  if (r.错误) { 提示(r.错误); return; }
  提示('已恢复默认背景');
  刷新设置详情();
};
// 安全设置：登录密码（改密要验当前密码，新密码输两遍）
async function 设置_安全() {
  const 账号 = await api('/api/account').catch(() => ({ 用户名: '' }));
  const s = 全局.settings || {};
  const 已开 = !!(s.TurnstileSiteKey && s.TurnstileSecretKey);
  return `
    <div class="卡片">
      <h2>登录密码</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">当前登录用户名：<b style="color:var(--文字)">${转义(账号.用户名 || '—')}</b>。改密后需重新登录（浏览器会重新弹出登录框）。</p>
      <div class="表单">
        <div class="字段"><label>当前密码</label><input id="密当前" type="password" autocomplete="current-password"></div>
        <div class="字段"><label>新用户名（留空则不变）</label><input id="密用户" autocomplete="username"></div>
        <div class="字段"><label>新密码（至少 6 位）</label><input id="密新" type="password" autocomplete="new-password"></div>
        <div class="字段"><label>确认新密码（再输一次）</label><input id="密新2" type="password" autocomplete="new-password"></div>
      </div>
      <div style="margin-top:12px"><button class="btn" onclick="修改密码()">修改登录密码</button></div>
    </div>
    <div class="卡片">
      <h2>人机验证（Cloudflare Turnstile）${已开 ? ' <span class="徽章 已核收">已开启</span>' : ''}</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">在 Cloudflare 后台申请 Turnstile 小组件（推荐选「不可见」模式，静默防爆破且不遮挡壁纸），填入下方两个密钥即生效；清空保存即可关闭。仅存本地数据文件，不会上传到代码仓库。</p>
      <div class="表单">
        <div class="字段"><label>Site Key（站点密钥）</label><input id="设TS站点" placeholder="0x4AAAAAAA..." value="${转义(s.TurnstileSiteKey || '')}"></div>
        <div class="字段"><label>Secret Key（密钥）</label><input id="设TS密钥" type="password" placeholder="0x4AAAAAAA..." value="${转义(s.TurnstileSecretKey || '')}"></div>
      </div>
      <div class="工具栏" style="margin:12px 0 0">
        <button class="btn" onclick="保存Turnstile()">保存人机验证</button>
        ${已开 ? `<button class="btn 次" onclick="关闭Turnstile()">清空并关闭</button>` : ''}
      </div>
    </div>`;
}
window.保存Turnstile = async function() {
  const TurnstileSiteKey = (document.getElementById('设TS站点')?.value || '').trim();
  const TurnstileSecretKey = (document.getElementById('设TS密钥')?.value || '').trim();
  if ((TurnstileSiteKey && !TurnstileSecretKey) || (!TurnstileSiteKey && TurnstileSecretKey)) {
    提示('Site Key 和 Secret Key 需要同时填写，或同时留空关闭');
    return;
  }
  const r = await api('/api/settings', { method: 'POST', body: { TurnstileSiteKey, TurnstileSecretKey } });
  if (r.错误) { 提示(r.错误); return; }
  全局.settings = r;
  提示(TurnstileSiteKey ? '人机验证已开启（下次登录生效）' : '人机验证已关闭');
  刷新设置详情();
};
window.关闭Turnstile = async function() {
  if (!await 询问确认('关闭人机验证', '确定清空密钥并关闭登录人机验证吗？')) return;
  const r = await api('/api/settings', { method: 'POST', body: { TurnstileSiteKey: '', TurnstileSecretKey: '' } });
  if (r.错误) { 提示(r.错误); return; }
  全局.settings = r;
  提示('人机验证已关闭');
  刷新设置详情();
};
// 导出：整库备份 / 迁移 + 按月按类型导 CSV
function 设置_导出() {
  const s = 全局.settings;
  return `
    <div class="卡片">
      <h2>数据备份 / 迁移</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">导出：下载一份完整备份（数据 + 登录密码 + 客人档案，合并成一个文件）；导入：上传该备份即可一键恢复全部（用于换设备、迁移）。备份里含登录密码哈希，请妥善保管。</p>
      <div class="工具栏">
        <a class="btn" href="/api/export" download>导出数据备份</a>
        <input type="file" id="导入文件" accept=".json,application/json" style="display:none" onchange="导入数据(this.files[0])">
        <button class="btn 次" onclick="document.getElementById('导入文件').click()">导入数据备份</button>
      </div>
    </div>
    <div class="卡片">
      <h2>账单导出</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">选择月份和账单类型导出（CSV，可用 Excel 打开；日租按天汇总、没客人的天也占一行）。</p>
      <div class="工具栏">
        <input type="month" id="导月份" value="${s.当前月份}">
        <select id="导类型" style="width:150px">
          <option value="月租" selected>月租账单</option>
          <option value="日租">日租账单</option>
          <option value="支出">支出账单</option>
          <option value="总账单">总账单</option>
          <option value="全部">全部账单</option>
        </select>
        <button class="btn" onclick="导出账单()">导出</button>
      </div>
    </div>`;
}
// 参数：当前月份 + 房源清单 + 水电变量 + 工资变量（全楼公用的那些值都在这）
async function 设置_参数() {
  const s = 全局.settings;
  const [房源, rooms] = await Promise.all([api('/api/houses'), api('/api/rooms')]);
  const 在租集合 = new Set(rooms.filter(r => r.月租金 !== '' && r.月租金 != null).map(r => r.房号));
  const 分段 = (s.工资分段 || []).slice().sort((a, b) => String(a.起始月份).localeCompare(String(b.起始月份)));
  const 房源表 = `<div class="工具栏">
      <input id="新房号" placeholder="房号，如 1101" style="width:160px">
      <select id="新房型"><option>月租</option><option>日租</option><option>自住房</option></select>
      <button class="btn" onclick="添加房源()">添加房源</button>
      <button class="btn 次" onclick="切换房源删除模式()">删除模式</button>
    </div>
    <div class="表格容器"><table>
      <tr><th>房号</th><th>房型</th><th>状态</th>${房源删除模式 ? '<th>选择</th>' : '<th></th>'}</tr>
      ${房源.map(h => {
        const 在租 = 在租集合.has(h.房号);
        const 房型 = h.房型 || '月租';
        const 房型类 = 房型 === '日租' ? '黄' : (房型 === '自住房' ? '紫' : '次');
        return `<tr><td><b>${转义(h.房号)}</b></td><td><button class="btn 行内 ${房型类}" onclick="切换房型(${h.id},'${房型}')">${房型}</button></td>
          <td>${在租 ? '在租' : '<span style="color:var(--次文字)">空置</span>'}</td>
          <td>${房源删除模式 && !在租 ? `<input type="checkbox" data-id="${h.id}" ${房源选中.has(h.id) ? 'checked' : ''} onchange="房源选中切换(${h.id}, this.checked)">` : ''}</td></tr>`;
      }).join('')}
      ${房源.length ? '' : '<tr><td colspan="4" class="空">暂无房源，请先添加</td></tr>'}
    </table></div>
    ${房源删除模式 ? `<div class="备忘底栏">
      ${房源.length ? `<label class="备忘全选"><input type="checkbox" onchange="房源全选(this.checked)">全选空置</label>` : ''}
      <button class="btn 小 危险" onclick="批量删除房源()">删除选中（${房源选中.size}）</button>
      <button class="btn 小 次" onclick="切换房源删除模式()">退出删除模式</button>
    </div>` : ''}`;

  return `
    <div class="卡片">
      <h2>当前月份</h2>
      <div class="工具栏">
        <input id="设月份" type="month" value="${s.当前月份}">
        <button class="btn" onclick="保存设置()">保存</button>
        <button class="btn 次" onclick="切下月()">一键切到下月</button>
      </div>
      <p style="color:var(--次文字);font-size:13px;margin-top:8px">一键切月会先把本月固化进历史总账单，再把当前月份 +1。</p>
    </div>
    ${(全局.月度快照 || []).length ? 折叠卡片('已锁定月', `<h2 style="margin:0">已锁定月份（${(全局.月度快照 || []).length}）</h2>`, `<p style="color:var(--次文字);font-size:13px;margin-bottom:12px">切月后上月账单会锁死成快照，之后怎么改都不影响历史。要修正某个已锁定的月，先「解锁」，改完再「重新锁定」重新固化。</p><div class="表格容器"><table><tr><th>月份</th><th>锁定时间</th><th></th></tr>${(全局.月度快照 || []).slice().sort((a, b) => String(a.月份).localeCompare(String(b.月份))).map(k => `<tr><td><b>${转义(k.月份)}</b></td><td style="color:var(--次文字)">${转义((k.锁定时间 || '').slice(0, 10))}</td><td style="white-space:nowrap"><button class="btn 行内" onclick="解锁月('${转义(k.月份)}')">解锁</button><button class="btn 行内 次" onclick="锁定月('${转义(k.月份)}')">重新锁定</button></td></tr>`).join('')}</table></div>`) : ''}
    ${折叠卡片('房源', `<h2 style="margin:0">房源信息（${房源.length} 间）</h2>`, `<p style="color:var(--次文字);font-size:13px;margin-bottom:12px">这里是楼里全部房号的清单，总览空置房间、房间档案都以它为准；出租前先在此添加房源。在租/日租/自住房不能被删除。</p>` + 房源表)}
    <div class="卡片">
      <h2>水电变量</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">全楼默认单价。房间档案、水电抄表、退房结算里的单价<b>留空就跟随这里</b>；哪间房要单独定价，就在「房间档案」里填数字覆盖，只影响那一间。改动只影响之后新算的账单，已生成的历史账单不变。</p>
      <div class="表单 两列">
        <div class="字段"><label>水费单价（元/方）</label><input id="设水价" type="number" step="0.01" min="0" value="${s.水价}"></div>
        <div class="字段"><label>电费单价（元/度）</label><input id="设电价" type="number" step="0.01" min="0" value="${s.电价}"></div>
      </div>
      <div style="margin-top:12px"><button class="btn" onclick="保存水电单价()">保存水电单价</button></div>
    </div>
    <div class="卡片">
      <h2>钟点房变量</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">日租办入住选「钟点房」时，金额框留空会自动带出这个默认房费（手输的金额不被覆盖）。</p>
      <div class="表单 两列">
        <div class="字段"><label>默认房费（元）</label><input id="设钟点价" type="number" step="0.01" min="0" value="${s.钟点房默认价 ?? 60}"></div>
      </div>
      <div style="margin-top:12px"><button class="btn" onclick="保存钟点房默认价()">保存钟点房默认价</button></div>
    </div>
    <div class="卡片">
      <h2>工资变量</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">按起始月份分段生效，影响「总账单」和总览的工资/利润/净利润计算；改动的分段只影响它之后的历史月份，之前的历史数字不变。起始月份之前、以及没有匹配分段的月份按 0 算。</p>
      <div class="表格容器"><table>
        <tr><th>起始月份</th><th class="数字">月工资（元）</th><th></th></tr>
        ${分段.map(x => `<tr><td>${转义(x.起始月份)}</td><td class="数字">¥${数字(x.金额)}</td><td><button class="btn 行内 危险" onclick="删除工资分段('${转义(x.起始月份)}')">删</button></td></tr>`).join('')}
        ${分段.length ? '' : '<tr><td colspan="3" class="空">还没有分段（工资按 0 算）</td></tr>'}
      </table></div>
      <div class="工具栏" style="margin-top:12px">
        <input id="新工资起始" type="month" value="${s.当前月份}">
        <input id="新工资金额" type="number" placeholder="金额，如 4000" style="width:150px">
        <button class="btn" onclick="添加工资分段()">+ 添加分段</button>
      </div>
    </div>
    <div class="卡片">
      <h2>网站底部备案信息</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">填写后将自动展示在<b>登录页底部</b>和<b>主界面底部</b>（留空则不显示）。仅保存在本机/服务器数据文件中，不会提交到代码仓库。</p>
      <div class="表单 两列">
        <div class="字段"><label>ICP 备案号</label><input id="设ICP备案" placeholder="如：粤ICP备2025487295号" value="${转义(s.ICP备案 || '')}"></div>
        <div class="字段"><label>公安联网备案号</label><input id="设公安备案" placeholder="如：粤公网安备44051302000259号" value="${转义(s.公安备案 || '')}"></div>
      </div>
      <div style="margin-top:12px"><button class="btn" onclick="保存备案信息()">保存备案信息</button></div>
    </div>`;
}
window.保存备案信息 = async function() {
  const ICP备案 = (document.getElementById('设ICP备案')?.value || '').trim();
  const 公安备案 = (document.getElementById('设公安备案')?.value || '').trim();
  const r = await api('/api/settings', { method: 'POST', body: { ICP备案, 公安备案 } });
  if (r.错误) { 提示(r.错误); return; }
  全局.settings = r;
  if (typeof 更新备案底栏 === 'function') 更新备案底栏();
  提示('备案信息已保存');
};
// 关于：版本号 + 在线更新 + 数据文件在哪
async function 设置_关于() {
  const v = await api('/api/version').catch(() => null);
  if (v) 当前版本信息 = v;   // 拉不到（更新重启中）就沿用上一次的，别把版本号抹成「未知」
  return 在线更新卡片();
}
window.切换主题 = function(新主题) {
  主题 = 新主题; localStorage.setItem('主题', 主题); 应用主题();
  刷新设置详情();   // 只刷新右侧详情，按钮高亮跟着变
};
window.修改密码 = async function() {
  const 当前 = document.getElementById('密当前').value;
  const 用户名 = document.getElementById('密用户').value.trim();
  const 新密码 = document.getElementById('密新').value;
  const 确认密码 = document.getElementById('密新2').value;
  if (!当前) { 提示('请输入当前密码'); return; }
  if (!新密码 || 新密码.length < 6) { 提示('新密码至少 6 位'); return; }
  if (确认密码 !== 新密码) { 提示('两次输入的新密码不一致'); return; }   // 防打错，后端也再校验一次
  if (!await 询问确认('修改登录密码', `确定要把登录密码改掉吗？<br>改完将跳转到登录页面，需要用新密码重新登录。`)) return;
  const r = await api('/api/password', { method: 'POST', body: { 当前密码: 当前, 新用户名: 用户名, 新密码, 确认密码 } });
  if (r.错误) { 提示(r.错误); return; }
  提示('密码已修改，请使用新密码重新登录');
  setTimeout(() => location.replace('/login'), 900);
};
// 设置页里的操作一律只重绘右侧详情（别整页 渲染()，否则目录树跟着重建、页面会跳）
window.切换房源删除模式 = function() { 房源删除模式 = !房源删除模式; 房源选中.clear(); 刷新设置详情(); };
window.房源选中切换 = function(id, 选中) { 选中 ? 房源选中.add(id) : 房源选中.delete(id); 刷新设置详情(); };
window.房源全选 = function(全选) { 房源选中.clear(); if (全选) document.querySelectorAll('#设置详情 input[type="checkbox"][data-id]').forEach(c => 房源选中.add(Number(c.dataset.id))); 刷新设置详情(); };
window.批量删除房源 = async function() {
  if (!房源选中.size) { 提示('请先选中要删除的房源'); return; }
  if (!await 询问确认('批量删除房源', `确定删除选中的 ${房源选中.size} 间房源？（仅限空置房源）`)) return;
  let 成功 = 0;
  for (const id of [...房源选中]) {
    const r = await api(`/api/houses/${id}`, { method: 'DELETE' });
    if (!r.错误) 成功++;
  }
  房源选中.clear(); 提示(`已删除 ${成功} 间`); 刷新设置详情();
};
// 保存全楼默认水电单价（房间档案里留空的房间跟着变）
window.保存水电单价 = async function() {
  const 水价 = Number(document.getElementById('设水价').value);
  const 电价 = Number(document.getElementById('设电价').value);
  if (!(水价 > 0)) { 提示('水费单价要填大于 0 的数字'); return; }
  if (!(电价 > 0)) { 提示('电费单价要填大于 0 的数字'); return; }
  if (!await 询问确认('保存水电单价', `水费 ${精金额(水价)} 元/方、电费 ${精金额(电价)} 元/度。<br>房间档案里单价留空的房间，往后都按这个价算。`)) return;
  const s = await api('/api/settings', { method: 'POST', body: { 水价, 电价 } });
  if (s.错误) { 提示(s.错误); return; }
  全局.settings = s; 提示('已保存'); 刷新设置详情();
};
// 保存钟点房默认房费（日租办入住选钟点房时自动带出的金额）
window.保存钟点房默认价 = async function() {
  const 价 = Number(document.getElementById('设钟点价').value);
  if (!(价 > 0)) { 提示('默认房费要填大于 0 的数字'); return; }
  if (!await 询问确认('保存钟点房默认价', `日租办入住选「钟点房」时，金额框留空会自动带出 ${精金额(价)} 元。`)) return;
  const s = await api('/api/settings', { method: 'POST', body: { 钟点房默认价: 价 } });
  if (s.错误) { 提示(s.错误); return; }
  全局.settings = s; 提示('已保存'); 刷新设置详情();
};
window.添加工资分段 = async function() {
  const 起始 = document.getElementById('新工资起始').value;
  const 金额 = Number(document.getElementById('新工资金额').value);
  if (!起始) { 提示('请选起始月份'); return; }
  if (!金额 || 金额 <= 0) { 提示('请输入有效的工资额'); return; }
  const 分段 = 全局.settings.工资分段 || [];
  const 已有 = 分段.find(x => x.起始月份 === 起始);
  const 新分段 = 已有 ? 分段.map(x => x.起始月份 === 起始 ? { 起始月份: 起始, 金额 } : x)
                     : [...分段, { 起始月份: 起始, 金额 }];
  const s = await api('/api/settings', { method: 'POST', body: { 工资分段: 新分段 } });
  全局.settings = s; 提示('已保存'); 刷新设置详情();
};
window.删除工资分段 = async function(起始) {
  if (!await 询问确认('删除工资分段', `确定删除「${转义(起始)}」这个工资分段？`)) return;
  const 新分段 = (全局.settings.工资分段 || []).filter(x => x.起始月份 !== 起始);
  const s = await api('/api/settings', { method: 'POST', body: { 工资分段: 新分段 } });
  全局.settings = s; 提示('已删除'); 刷新设置详情();
};
window.导出账单 = async function() {
  const 月 = document.getElementById('导月份').value;
  const 类型值 = document.getElementById('导类型').value;
  if (!月) { 提示('请选月份'); return; }
  if (!类型值) { 提示('请选导出类型'); return; }
  const 类型 = 类型值 === '全部' ? ['月租', '日租', '支出', '总账单'] : [类型值];
  const 块 = [];
  if (类型.includes('月租')) {
    const 账单 = await api(`/api/bills?month=${月}`);
    const 在租 = 账单.filter(b => b.状态 !== '未出租');
    const 表头 = ['房号', '交租日期', '房租', '新收押金', '管理费', '水费', '电费', '欠费滚存', '实收', '欠款', '状态'];
    const 行们 = 在租.map(b => [b.房号, b.交租日期 || '', b.房租已预缴 ? '已预缴' : b.房租, b.新收押金 || 0, b.管理费已预缴 ? '已预缴' : b.管理费, b.水费, b.电费, b.结转 || 0, (b.实收 || 0) + (b.补缴 || 0) + (b.新收押金 || 0) + (b.预缴 || 0), b.欠款 || 0, b.状态]);
    块.push([['月租账单'], 表头, ...行们]);
  }
  if (类型.includes('日租')) {
    const daily = await api(`/api/daily?month=${月}`);
    // 图表模式：每行一天，横向每个单元格一个客户金额，末尾当日合计
    const 按日 = {};
    for (const d of daily) (按日[d.日期] = 按日[d.日期] || []).push(Number(d.金额) || 0);
    // 整月每天都出一行，没客人的那天后面各列留空（与页面显示一致）
    const 日期列表 = 月内日期们(月);
    const 最大客户数 = Math.max(1, ...日期列表.map(日 => (按日[日] || []).length));
    const 表头 = ['日期', ...Array.from({ length: 最大客户数 }, (_, i) => '客户' + (i + 1)), '当日合计'];
    const 行们 = 日期列表.map(日 => {
      const 金额们 = 按日[日] || [];
      if (!金额们.length) return [日, ...Array(最大客户数).fill(''), ''];
      return [日, ...金额们, ...Array(最大客户数 - 金额们.length).fill(''), 金额们.reduce((s, x) => s + x, 0)];
    });
    块.push([['日租账单（明细）'], 表头, ...行们]);
  }
  if (类型.includes('支出')) {
    const 支出 = await api(`/api/transactions?month=${月}`);
    const 行们 = 支出.map(t => [t.日期, t.事项, t.金额]);
    块.push([['支出账单'], ['日期', '事项', '金额'], ...行们]);
  }
  if (类型.includes('总账单')) {
    const s = await api(`/api/summary?month=${月}`);
    块.push([['总账单'], ['月份', '月租总收', '日租总收', '支出', '合计'], [月, s.月租已收, s.日租已收, s.支出, s.合计]]);
  }
  const csv = '﻿' + 块.map(b => b.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')).join('\n\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `账单导出_${月}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
  提示('已导出 ' + 月);
};
window.导入数据 = async function(文件) {
  if (!文件) return;
  if (!await 询问确认('导入覆盖确认', '导入会覆盖当前所有数据，确定继续？建议先「导出」留个备份。')) return;
  const 内容 = await 文件.text();
  let 数据;
  try { 数据 = JSON.parse(内容); } catch (e) { 提示('文件不是有效的 JSON'); return; }
  const r = await api('/api/import', { method: 'POST', body: 数据 });
  if (r.错误) { 提示(r.错误); return; }
  提示('数据已导入'); 全局 = await api('/api/all'); 渲染();
};
window.保存设置 = async function() {
  const s = await api('/api/settings', { method: 'POST', body: { 当前月份: document.getElementById('设月份').value } });
  全局.settings = s; 提示('已保存'); 渲染();
};
// 一键切到下月（当前月份 +1）
window.切下月 = async function() {
  const 当前月 = 全局.settings.当前月份;
  const r = await api('/api/settle', { method: 'POST', body: { 月份: 当前月 } }); // 固化本月到历史总账单 + 账单明细快照
  if (r.错误) {
    // 有欠款未滚存：列出欠款房，阻止切月
    const 清单 = (r.欠款房 || []).map(x => `${x.房号}：欠 ¥${数字(x.欠)}`).join('<br>');
    打开模态(`<h2>还有欠款未滚存，不能切月</h2>
      <p style="color:var(--次文字);font-size:15px;margin:10px 0">下面这些房间本月还有欠款没处理，请先到总览状态页「欠费滚存」或收清，再切月：</p>
      <div style="background:var(--灰);padding:12px 16px;border-radius:10px;font-size:15px;line-height:1.9">${清单 || '（无明细）'}</div>
      <div style="margin-top:14px;display:flex;gap:8px"><button class="btn 次" onclick="关闭模态()">知道了</button></div>`);
    return;
  }
  const 下月 = 加月(当前月, 1);
  await api('/api/settings', { method: 'POST', body: { 当前月份: 下月 } });
  全局 = await api('/api/all'); 提示('已切到 ' + 下月 + '，上月已锁定'); 渲染();
};
// 解锁某月：删掉快照，该月回到可编辑（设置 → 参数 → 已锁定月份）
window.解锁月 = async function(月份) {
  if (!(await 询问确认('解锁这个月？', `解锁 ${月份} 后，该月账单回到「现算、可编辑」状态，可以修改数据；改完记得「重新锁定」。`))) return;
  await api('/api/unlock', { method: 'POST', body: { 月份 } });
  全局 = await api('/api/all'); 提示(`已解锁 ${月份}`); 刷新设置详情();
};
// 重新锁定某月：按当前数据重算该月账单并固化成快照（不改变当前月份）
window.锁定月 = async function(月份) {
  if (!(await 询问确认('重新锁定这个月？', `会按当前数据重新计算 ${月份} 的账单，固化成快照并写入历史总账单。`))) return;
  await api('/api/settle', { method: 'POST', body: { 月份 } });
  全局 = await api('/api/all'); 提示(`已重新锁定 ${月份}`); 刷新设置详情();
};
window.添加房源 = async function() {
  const 房号 = document.getElementById('新房号').value.trim();
  const 房型 = document.getElementById('新房型').value;
  if (!房号) { 提示('请填房号'); return; }
  const r = await api('/api/houses', { method: 'POST', body: { 房号, 房型 } });
  if (r.错误) { 提示(r.错误); return; }
  提示('已添加'); 刷新设置详情();
};
window.切换房型 = async function(id, 当前) {
  const 顺序 = ['月租', '日租', '自住房'];
  const i = 顺序.indexOf(当前 || '月租');
  const 新 = 顺序[(i + 1) % 顺序.length];
  await api(`/api/houses/${id}`, { method: 'PUT', body: { 房型: 新 } });
  提示('已切换为' + 新); 刷新设置详情();
};


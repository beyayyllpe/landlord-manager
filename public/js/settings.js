// ============ 设置（左侧目录树 + 右侧详情） ============
let 设置节点 = '主题';   // 当前选中的目录项，本次会话内保留（刷新页面回到主题模式）
let 高级设置页签 = '账单与月份';
let 日志筛选 = '全部';
let 日志搜索 = '';
let 日志每页 = 50;
let 日志页码 = 1;
const 日志展开集 = new Set();
let 日志原始缓存 = { 操作日志: [], 系统错误日志: [], 用户名: '管理员' };
let 主题 = localStorage.getItem('主题') || '跟随系统';   // 明亮 / 暗黑 / 跟随系统（每台设备各自记）
let 房源删除模式 = false; const 房源选中 = new Set();
let ts密钥显隐定时器 = null;

// 设置目录树：加项 / 改顺序只动这张表，各项的详情由对应的 设置_xxx() 返回 HTML
const 设置目录 = [
  { 键: '主题', 图标: '🎨', 名: '主题模式', 渲染: 设置_主题 },
  { 键: '安全', 图标: '🔒', 名: '安全设置', 渲染: 设置_安全 },
  { 键: '参数', 图标: '⚙️', 名: '高级设置', 渲染: 设置_参数 },
  { 键: '关于', 图标: 'ℹ️', 名: '关于', 渲染: 设置_关于 }
];
function 当前设置项() { return 设置目录.find(x => x.键 === 设置节点) || 设置目录[0]; }

function 系统暗黑中() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
function 解析实际暗黑() {
  if (主题 === '暗黑') return true;
  if (主题 === '明亮') return false;
  return 系统暗黑中();
}
function 更新顶栏主题图标() {
  const btn = document.getElementById('顶栏主题钮');
  if (!btn) return;
  const 暗 = 解析实际暗黑();
  btn.title = 暗 ? '切换到明亮模式' : '切换到暗黑模式';
  btn.innerHTML = 暗
    ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>'
    : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
}
function 应用主题() {
  document.documentElement.setAttribute('data-theme', 解析实际暗黑() ? 'dark' : 'light');
  更新顶栏主题图标();
}
if (window.matchMedia) {
  const 媒体监听 = window.matchMedia('(prefers-color-scheme: dark)');
  const 监听回调 = () => { if (主题 === '跟随系统') { 应用主题(); if (设置节点 === '主题') 刷新设置详情(); } };
  if (媒体监听.addEventListener) 媒体监听.addEventListener('change', 监听回调);
  else if (媒体监听.addListener) 媒体监听.addListener(监听回调);
}
window.快捷切主题 = function() {
  切换主题(解析实际暗黑() ? '明亮' : '暗黑');
};
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
function 背景槽HTML(标题, 说明, target, hasBg, kind) {
  const qs = target === 'desktop' ? '' : `target=${target}&`;
  const src = `/api/login-bg?${qs}t=${Date.now()}`;
  const 盒样式 = target === 'logo'
    ? 'cursor:zoom-in;background:#1e2024;padding:14px;max-width:240px'
    : 'cursor:zoom-in';
  const 图样式 = target === 'logo' ? ' style="object-fit:contain;max-height:90px"' : '';
  const accept = target === 'logo'
    ? 'image/jpeg,image/png,image/webp,image/gif'
    : 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm';
  const 钮字 = target === 'logo' ? '上传标题图' : (target === 'mobile' ? '上传手机端背景' : '上传电脑端背景');
  const 预览 = hasBg
    ? `<div class="背景预览盒${target === 'mobile' ? ' 竖屏预览' : ''}" title="点击放大预览" style="${盒样式}" onclick="放大预览登录背景('${kind}','${target}')">${kind === 'video'
        ? `<video src="${src}" autoplay muted loop playsinline></video>`
        : `<img src="${src}" alt="${标题}预览"${图样式}>`}</div>`
    : `<p style="color:var(--次文字);font-size:13px;margin:10px 0">${说明}</p>`;
  return `
    <div style="flex:1;min-width:240px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px;color:var(--文字)">${标题}</div>
      ${预览}
      <div class="工具栏" style="margin-bottom:0">
        <label class="btn" style="cursor:pointer">${钮字}<input type="file" accept="${accept}" style="display:none" onchange="上传登录背景(this,'${target}')"></label>
        ${hasBg ? `<button class="btn 次" onclick="恢复默认登录背景('${target}')">恢复默认</button>` : ''}
      </div>
    </div>`;
}
const 外设强调色列表 = ['#18181b', '#2563eb', '#0d9488', '#d97706', '#e11d48'];
let 外设草稿 = null;
let 外设快照 = null;
let 外设预览设备 = 'phone';
let 外设meta = { hasBg: false, mobileHasBg: false, logoHasBg: false, kind: 'image', mobileKind: 'image' };
let 外设图版本 = Date.now();

function 默认外观配置() {
  return {
    theme: 主题 || '跟随系统',
    accent: '#18181b',
    radius: 'medium',
    card: 'solid',
    density: 'normal',
    reduceMotion: false,
    bgFit: 'fill',
    overlay: 35,
    blur: 10,
    autoContrast: true,
    logoSize: 100,
    titleY: 28,
    formY: 62,
    formStyle: 'glass',
    textTone: 'auto',
    subtitle: 'Rental Keeper',
    showSub: true,
    showFoot: true
  };
}

function 读外观配置() {
  const saved = (typeof 全局 !== 'undefined' && 全局 && 全局.settings && 全局.settings.外观 && typeof 全局.settings.外观 === 'object')
    ? 全局.settings.外观 : {};
  return Object.assign(默认外观配置(), saved);
}

function 应用全局外观(cfg) {
  const c = Object.assign(默认外观配置(), cfg || 读外观配置());
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  if (root && root.style && typeof root.style.setProperty === 'function') {
    if (c.accent) root.style.setProperty('--accent', c.accent);
    const radMap = { sharp: '6px', medium: '14px', round: '20px' };
    root.style.setProperty('--app-radius', radMap[c.radius] || '14px');
  }
  if (typeof document !== 'undefined' && document.body) {
    if (document.body.dataset) {
      document.body.dataset.card = c.card || 'solid';
      document.body.dataset.density = c.density || 'normal';
    }
    if (document.body.classList) document.body.classList.toggle('still', Boolean(c.reduceMotion));
  }
}

function 外设是否未保存() {
  if (!外设草稿 || !外设快照) return false;
  return JSON.stringify(外设草稿) !== JSON.stringify(外设快照);
}

function 更新外设状态条() {
  const el = document.getElementById('外设状态条');
  if (!el) return;
  const 脏 = 外设是否未保存();
  el.textContent = 脏 ? '有未保存的更改' : '已同步';
  el.classList.toggle('脏', 脏);
}

function 更新外设预览() {
  const stage = document.getElementById('外设预览舞台');
  if (!stage || !外设草稿) return;
  const c = 外设草稿;
  const 是电脑 = 外设预览设备 === 'desktop';
  stage.className = '外设预览舞台' + (是电脑 ? ' 电脑' : '') + (c.bgFit === 'fit' ? ' 完整图' : '');
  stage.style.setProperty('--preview-accent', c.accent || '#18181b');

  const 有底图 = 是电脑 ? 外设meta.hasBg : (外设meta.mobileHasBg || 外设meta.hasBg);
  const 底图地址 = 有底图
    ? `/api/login-bg?${(!是电脑 && 外设meta.mobileHasBg) ? 'target=mobile&' : ''}t=${外设图版本}`
    : '';
  const imgMain = document.getElementById('外设预览底图');
  const imgBlur = document.getElementById('外设预览底模糊');
  if (imgMain && imgBlur) {
    if (底图地址) {
      if (imgMain.getAttribute('src') !== 底图地址) imgMain.src = 底图地址;
      if (imgBlur.getAttribute('src') !== 底图地址) imgBlur.src = 底图地址;
      imgMain.style.display = 'block';
    } else {
      imgMain.style.display = 'none';
      imgBlur.style.display = 'none';
    }
  }

  const mask = document.getElementById('外设预览遮罩');
  if (mask) mask.style.background = `rgba(10, 12, 14, ${(Number(c.overlay) || 0) / 100})`;

  const toneColor = c.textTone === 'dark' ? '#1f2329' : '#ffffff';
  const titleBox = document.getElementById('外设预览标题区');
  if (titleBox) {
    titleBox.style.top = `${c.titleY}%`;
    titleBox.style.color = toneColor;
  }
  const logoImg = document.getElementById('外设预览Logo');
  if (logoImg) {
    const scale = (Number(c.logoSize) || 100) / 100;
    logoImg.style.transform = `scale(${scale})`;
    logoImg.style.transformOrigin = 'center center';
  }
  const subBox = document.getElementById('外设预览双线');
  const subTxt = document.getElementById('外设预览双线字');
  if (subBox) subBox.style.display = c.showSub ? 'flex' : 'none';
  if (subTxt) subTxt.textContent = (c.subtitle || 'Rental Keeper').trim() || 'Rental Keeper';

  const formBox = document.getElementById('外设预览表单');
  if (formBox) {
    formBox.style.top = `${c.formY}%`;
    formBox.className = `外设预览表单 样式-${c.formStyle || 'glass'}`;
    formBox.style.backdropFilter = `blur(${Number(c.blur) || 0}px)`;
    formBox.style.webkitBackdropFilter = `blur(${Number(c.blur) || 0}px)`;
    if (c.formStyle !== 'solid') formBox.style.color = toneColor;
    else formBox.style.color = '#1f2329';
  }

  const foot = document.getElementById('外设预览备案');
  if (foot) {
    foot.style.display = c.showFoot ? 'block' : 'none';
    foot.style.color = toneColor;
  }
  const tip = document.getElementById('外设预览尺寸提示');
  if (tip) tip.textContent = 是电脑 ? '16:10 桌面视图' : '9:16 手机视图';
  更新外设状态条();
}

function 外设选(键, 值) {
  if (!外设草稿) return;
  外设草稿[键] = 值;
  if (键 === 'theme') 切换主题(值);
  if (['accent', 'radius', 'card', 'density'].includes(键)) 应用全局外观(外设草稿);
  渲染设置页();
}

function 外设滑(键, 值) {
  if (!外设草稿) return;
  外设草稿[键] = Number(值);
  const lab = document.getElementById(`外设值_${键}`);
  if (lab) lab.textContent = 键 === 'blur' ? `${值}px` : `${值}%`;
  更新外设预览();
}

function 外设开(键, checked) {
  if (!外设草稿) return;
  外设草稿[键] = Boolean(checked);
  if (键 === 'reduceMotion') 应用全局外观(外设草稿);
  更新外设预览();
}

function 外设字(键, 值) {
  if (!外设草稿) return;
  外设草稿[键] = String(值 || '');
  更新外设预览();
}

function 外设切预览(设备) {
  外设预览设备 = 设备 === 'desktop' ? 'desktop' : 'phone';
  渲染设置页();
}

function 外设撤销() {
  if (!外设快照) return;
  外设草稿 = Object.assign({}, 外设快照);
  if (外设草稿.theme && 外设草稿.theme !== 主题) 切换主题(外设草稿.theme);
  应用全局外观(外设草稿);
  渲染设置页();
  提示('已撤销未保存的更改');
}

function 外设恢复默认() {
  外设草稿 = 默认外观配置();
  应用全局外观(外设草稿);
  渲染设置页();
  提示('已恢复默认外观预览，请点击“保存设置”生效');
}

async function 外设保存() {
  if (!外设草稿) return;
  const 新设置 = await api('/api/settings', 'POST', { 外观: 外设草稿 });
  if (typeof 全局 === 'object' && 全局) 全局.settings = 新设置;
  if (外设草稿.theme && 外设草稿.theme !== 主题) 切换主题(外设草稿.theme);
  应用全局外观(外设草稿);
  外设快照 = Object.assign({}, 外设草稿);
  更新外设状态条();
  提示('外观与登录页设置已保存');
}

function 外设磁贴HTML(标题, target, has, kind, cls) {
  const url = `/api/login-bg?target=${target}&t=${外设图版本}`;
  const 预览内容 = !has
    ? `<span class="外设磁贴空">未上传，点击上传</span>`
    : (kind === 'video'
      ? `<video src="${url}" muted loop autoplay playsinline></video>`
      : `<img src="${url}" alt="${标题}">`);
  return `
    <div class="外设磁贴">
      <div class="外设磁贴框 ${cls || ''}" onclick="${has ? `放大预览登录背景('${target}','${kind || 'image'}')` : `document.getElementById('外设传_${target}').click()`}">
        ${预览内容}
      </div>
      <div class="外设磁贴脚">
        <span class="外设磁贴名">${标题}</span>
        <div class="外设磁贴钮组">
          <input type="file" id="外设传_${target}" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" style="display:none" onchange="上传登录背景(this,'${target}')">
          <button type="button" class="外设小钮" onclick="document.getElementById('外设传_${target}').click()">${has ? '更换' : '上传'}</button>
          ${has ? `<button type="button" class="外设小钮 危" onclick="恢复默认登录背景('${target}')">清除</button>` : ''}
        </div>
      </div>
    </div>`;
}

function 外设分段HTML(键, 选项列表, 当前值) {
  return `<div class="外设分段">${选项列表.map(([v, t]) =>
    `<button type="button" class="外设分段钮 ${当前值 === v ? '选中' : ''}" onclick="外设选('${键}','${v}')">${t}</button>`
  ).join('')}</div>`;
}

async function 设置_主题() {
  外设meta = await fetch('/api/login-bg/meta').then(r => r.json()).catch(() => ({ hasBg: false, mobileHasBg: false, logoHasBg: false, kind: 'image', mobileKind: 'image' }));
  外设图版本 = Date.now();
  if (!外设快照) {
    外设快照 = 读外观配置();
    外设草稿 = Object.assign({}, 外设快照);
  }
  const c = 外设草稿;
  const logoSrc = 外设meta.logoHasBg ? `/api/login-bg?target=logo&t=${外设图版本}` : 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="44"><text x="90" y="31" text-anchor="middle" fill="#ffffff" font-size="28" font-family="serif" letter-spacing="4">租房管家</text></svg>');

  setTimeout(更新外设预览, 0);

  return `
  <div class="外设页">
    <div class="外设顶栏">
      <div class="外设顶栏标题">
        <h2>外观与登录页</h2>
        <p>全局界面风格与登录页视觉排版，右侧实时预览效果</p>
      </div>
      <div class="外设顶栏操作">
        <span id="外设状态条" class="外设状态">${外设是否未保存() ? '有未保存的更改' : '已同步'}</span>
        <button type="button" class="btn 次" onclick="外设撤销()">撤销</button>
        <button type="button" class="btn 次" onclick="外设恢复默认()">恢复默认</button>
        <button type="button" class="btn" onclick="外设保存()">保存设置</button>
      </div>
    </div>

    <div class="外设双栏">
      <div class="外设左列">
        <div class="外设卡">
          <div class="外设卡头"><h3>外观（全局）</h3><small>作用于后台全部页面</small></div>
          <div class="外设行">
            <div class="外设标签">主题模式<small>本设备独立记忆</small></div>
            <div class="外设控件">${外设分段HTML('theme', [['明亮','明亮'],['暗黑','暗黑'],['跟随系统','跟随系统']], c.theme)}</div>
          </div>
          <div class="外设行">
            <div class="外设标签">强调色</div>
            <div class="外设控件">
              <div class="外设色板">
                ${外设强调色列表.map(col => `<button type="button" class="外设色点 ${c.accent === col ? '选中' : ''}" style="background:${col}" onclick="外设选('accent','${col}')" title="${col}"></button>`).join('')}
                <input type="color" class="外设取色" value="${c.accent || '#18181b'}" oninput="外设选('accent',this.value)" title="自定义颜色">
              </div>
            </div>
          </div>
          <div class="外设行">
            <div class="外设标签">圆角风格</div>
            <div class="外设控件">${外设分段HTML('radius', [['sharp','方正'],['medium','适中'],['round','圆润']], c.radius)}</div>
          </div>
          <div class="外设行">
            <div class="外设标签">卡片样式</div>
            <div class="外设控件">${外设分段HTML('card', [['solid','实色'],['glass','玻璃'],['outline','描边']], c.card)}</div>
          </div>
          <div class="外设行">
            <div class="外设标签">界面密度</div>
            <div class="外设控件">${外设分段HTML('density', [['compact','紧凑'],['normal','标准'],['loose','宽松']], c.density)}</div>
          </div>
          <div class="外设行">
            <div class="外设标签">减少动效</div>
            <div class="外设控件">
              <label class="外设开关"><input type="checkbox" ${c.reduceMotion ? 'checked' : ''} onchange="外设开('reduceMotion',this.checked)"><span class="外设开关轨"></span></label>
            </div>
          </div>
        </div>

        <div class="外设卡">
          <div class="外设卡头"><h3>登录页背景</h3><small>支持图片 / GIF / 短视频 (≤20MB)</small></div>
          <div class="外设行 顶对齐">
            <div class="外设标签">背景图与标题<small>电脑 / 手机独立配置</small></div>
            <div class="外设控件">
              <div class="外设磁贴列">
                ${外设磁贴HTML('16:9 电脑端', 'desktop', Boolean(外设meta.hasBg), 外设meta.kind, '')}
                ${外设磁贴HTML('9:16 手机端', 'mobile', Boolean(外设meta.mobileHasBg), 外设meta.mobileKind, '竖')}
                ${外设磁贴HTML('标题图 Logo', 'logo', Boolean(外设meta.logoHasBg), 'image', 'Logo框')}
              </div>
            </div>
          </div>
          <div class="外设行">
            <div class="外设标签">背景填充</div>
            <div class="外设控件">${外设分段HTML('bgFit', [['fill','铺满裁切'],['fit','完整显示']], c.bgFit)}</div>
          </div>
          <div class="外设行">
            <div class="外设标签">遮罩强度</div>
            <div class="外设控件">
              <div class="外设滑块组">
                <input type="range" min="0" max="80" value="${c.overlay}" oninput="外设滑('overlay',this.value)">
                <span class="外设滑块值" id="外设值_overlay">${c.overlay}%</span>
              </div>
            </div>
          </div>
          <div class="外设行">
            <div class="外设标签">表单模糊</div>
            <div class="外设控件">
              <div class="外设滑块组">
                <input type="range" min="0" max="16" value="${c.blur}" oninput="外设滑('blur',this.value)">
                <span class="外设滑块值" id="外设值_blur">${c.blur}px</span>
              </div>
            </div>
          </div>
          <div class="外设行">
            <div class="外设标签">自动对比度<small>依据背景明暗微调</small></div>
            <div class="外设控件">
              <label class="外设开关"><input type="checkbox" ${c.autoContrast ? 'checked' : ''} onchange="外设开('autoContrast',this.checked)"><span class="外设开关轨"></span></label>
            </div>
          </div>
        </div>

        <div class="外设卡">
          <div class="外设卡头"><h3>标题与表单</h3><small>微调登录页排版位置与风格</small></div>
          <div class="外设行">
            <div class="外设标签">标题大小</div>
            <div class="外设控件">
              <div class="外设滑块组">
                <input type="range" min="60" max="140" value="${c.logoSize}" oninput="外设滑('logoSize',this.value)">
                <span class="外设滑块值" id="外设值_logoSize">${c.logoSize}%</span>
              </div>
            </div>
          </div>
          <div class="外设行">
            <div class="外设标签">标题位置</div>
            <div class="外设控件">
              <div class="外设滑块组">
                <input type="range" min="4" max="40" value="${c.titleY}" oninput="外设滑('titleY',this.value)">
                <span class="外设滑块值" id="外设值_titleY">${c.titleY}%</span>
              </div>
            </div>
          </div>
          <div class="外设行">
            <div class="外设标签">表单位置</div>
            <div class="外设控件">
              <div class="外设滑块组">
                <input type="range" min="40" max="86" value="${c.formY}" oninput="外设滑('formY',this.value)">
                <span class="外设滑块值" id="外设值_formY">${c.formY}%</span>
              </div>
            </div>
          </div>
          <div class="外设行">
            <div class="外设标签">表单样式</div>
            <div class="外设控件">${外设分段HTML('formStyle', [['glass','透明玻璃'],['solid','实色卡片'],['outline','极简描边']], c.formStyle)}</div>
          </div>
          <div class="外设行">
            <div class="外设标签">文字颜色</div>
            <div class="外设控件">${外设分段HTML('textTone', [['auto','自动'],['light','浅色'],['dark','深色']], c.textTone)}</div>
          </div>
          <div class="外设行">
            <div class="外设标签">英文副标题</div>
            <div class="外设控件" style="flex-wrap:nowrap">
              <label class="外设开关"><input type="checkbox" ${c.showSub ? 'checked' : ''} onchange="外设开('showSub',this.checked)"><span class="外设开关轨"></span></label>
              <input type="text" class="外设输入框" value="${转义(c.subtitle || 'Rental Keeper')}" maxlength="40" oninput="外设字('subtitle',this.value)" placeholder="Rental Keeper">
            </div>
          </div>
          <div class="外设行">
            <div class="外设标签">底部备案信息</div>
            <div class="外设控件">
              <label class="外设开关"><input type="checkbox" ${c.showFoot ? 'checked' : ''} onchange="外设开('showFoot',this.checked)"><span class="外设开关轨"></span></label>
            </div>
          </div>
        </div>
      </div>

      <div class="外设预览区">
        <div class="外设预览卡">
          <div class="外设预览顶">
            <span>实时预览</span>
            <div class="外设分段">
              <button type="button" class="外设分段钮 ${外设预览设备 === 'phone' ? '选中' : ''}" onclick="外设切预览('phone')">手机</button>
              <button type="button" class="外设分段钮 ${外设预览设备 === 'desktop' ? '选中' : ''}" onclick="外设切预览('desktop')">电脑</button>
            </div>
          </div>
          <div class="外设预览舞台" id="外设预览舞台">
            <img class="外设预览底模糊" id="外设预览底模糊" alt="">
            <img class="外设预览底图" id="外设预览底图" alt="">
            <div class="外设预览遮罩" id="外设预览遮罩"></div>
            <div class="外设预览标题区" id="外设预览标题区">
              <img class="外设预览Logo" id="外设预览Logo" src="${logoSrc}" alt="标题图">
              <div class="外设预览双线" id="外设预览双线"><i></i><em id="外设预览双线字">${转义(c.subtitle || 'Rental Keeper')}</em><i></i></div>
            </div>
            <div class="外设预览表单 样式-${c.formStyle || 'glass'}" id="外设预览表单">
              <div class="外设预览假框">账号 / Account</div>
              <div class="外设预览假框">密码 / Password</div>
              <div class="外设预览假钮">登 录</div>
            </div>
            <div class="外设预览备案" id="外设预览备案">备案号示例 · 租房管家</div>
          </div>
          <div class="外设预览提示">
            <span id="外设预览尺寸提示">${外设预览设备 === 'desktop' ? '16:10 桌面视图' : '9:16 手机视图'}</span>
            <span>保存后即刻同步登录页</span>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
window.放大预览登录背景 = function(kind, target = 'desktop') {
  const qs = target === 'desktop' ? '' : `target=${target}&`;
  const src = `/api/login-bg?${qs}t=${Date.now()}`;
  const 遮罩 = document.createElement('div');
  遮罩.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.82);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out';
  const 内容 = kind === 'video'
    ? `<video src="${src}" autoplay muted loop playsinline controls style="max-width:92vw;max-height:88vh;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.45);cursor:default" onclick="event.stopPropagation()"></video>`
    : `<img src="${src}" alt="登录背景放大预览" style="max-width:92vw;max-height:88vh;object-fit:contain;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,0.45);cursor:default" onclick="event.stopPropagation()">`;
  遮罩.innerHTML = `${内容}<button type="button" aria-label="关闭预览" style="position:fixed;top:16px;right:20px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,0.28);background:rgba(20,20,22,0.7);color:#fff;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>`;
  const 关闭 = () => { 遮罩.remove(); document.removeEventListener('keydown', 键关); };
  const 键关 = (e) => { if (e.key === 'Escape') 关闭(); };
  遮罩.addEventListener('click', 关闭);
  遮罩.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); 关闭(); });
  document.addEventListener('keydown', 键关);
  document.body.appendChild(遮罩);
};
window.上传登录背景 = async function(input, target = 'desktop') {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { 提示('文件不能超过 20MB'); return; }
  提示('正在上传背景...');
  try {
    const url = target === 'desktop' ? '/api/login-bg' : `/api/login-bg?target=${target}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file
    });
    if (r.status === 401) { location.replace('/login'); return; }
    if (r.status === 413) { 提示('文件超过服务器 Nginx 上传限制（413），请在反代配置添加 client_max_body_size 25m;'); return; }
    const res = await r.json().catch(() => ({}));
    if (!r.ok || res.错误) { 提示(res.错误 || '上传失败'); return; }
    const 名 = target === 'logo' ? '登录页标题图' : ((target === 'mobile' ? '手机端' : '电脑端') + '登录背景');
    提示(名 + '已更新');
    刷新设置详情();
  } catch (e) { 提示('上传失败：' + e.message); }
};
window.恢复默认登录背景 = async function(target = 'desktop') {
  const 文 = target === 'logo' ? '登录页标题图' : (target === 'mobile' ? '手机端背景' : '电脑端背景');
  if (!await 询问确认(`恢复${文}默认`, `确定要移除自定义${文}吗？`)) return;
  const url = target === 'desktop' ? '/api/login-bg' : `/api/login-bg?target=${target}`;
  const r = await api(url, { method: 'DELETE' });
  if (r.错误) { 提示(r.错误); return; }
  提示(`已移除自定义${文}`);
  刷新设置详情();
};
// 安全设置：登录密码 + Turnstile 人机验证（Secret Key 默认圆点隐藏，点眼睛按需显示 30 秒自动收起）
const TS眼睛图标 = {
  闭: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>',
  开: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>'
};
function 密码框HTML(id, autocomplete) {
  return `<div style="position:relative;display:flex;align-items:center">
    <input id="${id}" type="password" autocomplete="${autocomplete}" style="width:100%;padding-right:38px">
    <button type="button" onclick="切换密码框显隐('${id}', this)" aria-label="显示或隐藏密码" title="显示或隐藏密码" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;padding:4px;cursor:pointer;color:var(--次文字);display:flex;align-items:center;justify-content:center">${TS眼睛图标.闭}</button>
  </div>`;
}
window.切换密码框显隐 = function(id, btn) {
  const input = document.getElementById(id);
  if (!input || !btn) return;
  const 显 = input.type === 'password';
  input.type = 显 ? 'text' : 'password';
  btn.innerHTML = 显 ? TS眼睛图标.开 : TS眼睛图标.闭;
};
function 清理TS密钥定时() {
  if (ts密钥显隐定时器) { clearTimeout(ts密钥显隐定时器); ts密钥显隐定时器 = null; }
}
async function 设置_安全() {
  清理TS密钥定时();
  const 账号 = await api('/api/account').catch(() => ({ 用户名: '' }));
  const s = 全局.settings || {};
  const 密钥已配 = Boolean(s.TurnstileSecret已配置);
  const 站点由环境 = s.TurnstileSite来源 === 'env';
  const 密钥由环境 = s.TurnstileSecret来源 === 'env';
  const 已开 = Boolean(s.TurnstileSiteKey && 密钥已配);
  const 密钥占位 = 密钥由环境
    ? '已通过服务端环境变量配置（TURNSTILE_SECRET_KEY）'
    : (密钥已配 ? '••••••••••••••••••••••••' : '0x4AAAAAAA...');
  return `
    <div class="卡片">
      <h2>登录密码</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">当前登录用户名：<b style="color:var(--文字)">${转义(账号.用户名 || '—')}</b>。改密后需重新登录（浏览器会重新弹出登录框）。</p>
      <div class="表单">
        <div class="字段"><label>当前密码</label>${密码框HTML('密当前', 'current-password')}</div>
        <div class="字段"><label>新用户名（留空则不变）</label><input id="密用户" autocomplete="username"></div>
        <div class="字段"><label>新密码（至少 6 位）</label>${密码框HTML('密新', 'new-password')}</div>
        <div class="字段"><label>确认新密码（再输一次）</label>${密码框HTML('密新2', 'new-password')}</div>
      </div>
      <div style="margin-top:12px"><button class="btn" onclick="修改密码()">修改登录密码</button></div>
    </div>
    <div class="卡片">
      <h2>人机验证（Cloudflare Turnstile）${已开 ? ' <span class="徽章 已核收">已开启</span>' : ''}${密钥由环境 ? ' <span class="徽章">环境变量</span>' : ''}</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:12px">在 Cloudflare 后台申请 Turnstile 小组件（推荐选「不可见」模式，静默防爆破且不遮挡壁纸）。推荐通过服务端环境变量 <code>TURNSTILE_SITE_KEY</code> / <code>TURNSTILE_SECRET_KEY</code> 注入，其次存本地数据文件。</p>
      <div class="表单">
        <div class="字段">
          <label>Site Key（站点密钥）${站点由环境 ? ' · 已由环境变量注入' : ''}</label>
          <div style="position:relative;display:flex;align-items:center">
            <input id="设TS站点" type="password" placeholder="0x4AAAAAAA..." value="${转义(s.TurnstileSiteKey || '')}" autocomplete="new-password" data-lpignore="true" ${站点由环境 ? 'disabled' : ''} style="width:100%;padding-right:38px">
            <button type="button" onclick="切换密码框显隐('设TS站点', this)" aria-label="显示或隐藏 Site Key" title="显示或隐藏 Site Key" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;padding:4px;cursor:pointer;color:var(--次文字);display:flex;align-items:center;justify-content:center">${TS眼睛图标.闭}</button>
          </div>
        </div>
        <div class="字段">
          <label>Secret Key（密钥）${密钥已配 && !密钥由环境 ? ' · 已配置' : ''}${密钥由环境 ? ' · 已由环境变量注入' : ''}</label>
          <div style="position:relative;display:flex;align-items:center">
            <input id="设TS密钥" type="password" placeholder="${密钥占位}" value="" autocomplete="new-password" data-lpignore="true" ${密钥由环境 ? 'disabled' : ''} style="width:100%;padding-right:38px">
            ${(!密钥由环境 && 密钥已配) ? `<button type="button" id="显TS密钥钮" onclick="切换显示TS密钥()" title="点击查看 Secret Key（30秒后自动隐藏）" aria-label="显示或隐藏密钥" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;padding:4px;cursor:pointer;color:var(--次文字);display:flex;align-items:center;justify-content:center">${TS眼睛图标.闭}</button>` : ''}
          </div>
          <div id="设TS密钥提示" style="font-size:12px;color:var(--次文字);margin-top:4px;min-height:16px"></div>
        </div>
      </div>
      <div class="工具栏" style="margin:12px 0 0">
        ${!(站点由环境 && 密钥由环境) ? `<button class="btn" onclick="保存Turnstile()">保存人机验证</button>` : ''}
        <button class="btn 次" id="测TS连接钮" onclick="测试Turnstile()">测试连接</button>
        ${(已开 && !(站点由环境 && 密钥由环境)) ? `<button class="btn 次" onclick="关闭Turnstile()">清空并关闭</button>` : ''}
      </div>
    </div>`;
}
window.切换显示TS密钥 = async function() {
  const input = document.getElementById('设TS密钥');
  const btn = document.getElementById('显TS密钥钮');
  const tip = document.getElementById('设TS密钥提示');
  if (!input || !btn) return;
  if (input.type === 'text' && input.value) {
    清理TS密钥定时();
    input.type = 'password';
    input.value = '';
    btn.innerHTML = TS眼睛图标.闭;
    if (tip) tip.textContent = '';
    return;
  }
  const r = await api('/api/settings/turnstile-secret').catch(e => ({ 错误: e.message }));
  if (r.错误) { 提示(r.错误); return; }
  if (r.source === 'env') { 提示('当前由服务端环境变量提供，页面不展示明文'); return; }
  if (!r.secretKey) { 提示('尚未配置 Secret Key'); return; }
  input.value = r.secretKey;
  input.type = 'text';
  btn.innerHTML = TS眼睛图标.开;
  let 剩余 = 30;
  if (tip) tip.textContent = `已显示，${剩余} 秒后自动隐藏`;
  清理TS密钥定时();
  ts密钥显隐定时器 = setInterval(() => {
    剩余 -= 1;
    const elInput = document.getElementById('设TS密钥');
    const elBtn = document.getElementById('显TS密钥钮');
    const elTip = document.getElementById('设TS密钥提示');
    if (!elInput || !elBtn) { 清理TS密钥定时(); return; }
    if (剩余 <= 0) {
      清理TS密钥定时();
      elInput.type = 'password';
      elInput.value = '';
      elBtn.innerHTML = TS眼睛图标.闭;
      if (elTip) elTip.textContent = '';
    } else if (elTip) {
      elTip.textContent = `已显示，${剩余} 秒后自动隐藏`;
    }
  }, 1000);
};
window.测试Turnstile = async function() {
  const btn = document.getElementById('测TS连接钮');
  const 临时密钥 = (document.getElementById('设TS密钥')?.value || '').trim();
  if (btn) { btn.disabled = true; btn.textContent = '测试中...'; }
  try {
    const r = await api('/api/settings/turnstile-test', {
      method: 'POST',
      body: 临时密钥 ? { secretKey: 临时密钥 } : {}
    });
    if (r.ok) 提示(r.消息 || 'Turnstile 连接测试通过');
    else 提示(r.错误 || 'Turnstile 连接测试失败');
  } catch (e) {
    提示('测试请求失败：' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '测试连接'; }
  }
};
window.保存Turnstile = async function() {
  const s = 全局.settings || {};
  const 站点由环境 = s.TurnstileSite来源 === 'env';
  const 密钥由环境 = s.TurnstileSecret来源 === 'env';
  const TurnstileSiteKey = 站点由环境 ? undefined : (document.getElementById('设TS站点')?.value || '').trim();
  const 输入密钥 = 密钥由环境 ? '' : (document.getElementById('设TS密钥')?.value || '').trim();
  const 已有密钥 = Boolean(s.TurnstileSecret已配置);
  if (!站点由环境 && TurnstileSiteKey && !输入密钥 && !已有密钥) {
    提示('首次开启需同时填写 Site Key 和 Secret Key');
    return;
  }
  if (!站点由环境 && !TurnstileSiteKey && 输入密钥) {
    提示('Site Key 和 Secret Key 需要同时填写，或同时留空关闭');
    return;
  }
  const body = {};
  if (TurnstileSiteKey !== undefined) body.TurnstileSiteKey = TurnstileSiteKey;
  if (!密钥由环境) {
    if (输入密钥) body.TurnstileSecretKey = 输入密钥;
    else if (!TurnstileSiteKey) body.TurnstileSecretKey = '';
  }
  const r = await api('/api/settings', { method: 'POST', body });
  if (r.错误) { 提示(r.错误); return; }
  清理TS密钥定时();
  全局.settings = r;
  提示((r.TurnstileSiteKey && r.TurnstileSecret已配置) ? '人机验证已保存（下次登录生效）' : '人机验证已关闭');
  刷新设置详情();
};
window.关闭Turnstile = async function() {
  if (!await 询问确认('关闭人机验证', '确定清空密钥并关闭登录人机验证吗？')) return;
  const r = await api('/api/settings', { method: 'POST', body: { TurnstileSiteKey: '', TurnstileSecretKey: '' } });
  if (r.错误) { 提示(r.错误); return; }
  清理TS密钥定时();
  全局.settings = r;
  提示('人机验证已关闭');
  刷新设置详情();
};
// 导出：整库备份 / 迁移 + 按月按类型导 CSV
function 设置_导出() {
  const s = 全局.settings;
  const 上次 = s.上次手动备份 ? `上次手动下载：${转义(s.上次手动备份)}` : '尚未手动下载过完整备份';
  return `
    <div class="卡片">
      <h2>数据备份 / 迁移</h2>
      <p style="color:var(--次文字);font-size:13px;margin-bottom:8px">导出：下载一份完整备份（数据 + 登录密码 + 客人档案，合并成一个文件）；导入：上传该备份即可一键恢复全部（用于换设备、迁移）。备份里含登录密码哈希，请妥善保管。</p>
      <p style="color:var(--次文字);font-size:12.5px;margin-bottom:12px">${上次}</p>
      <div class="工具栏">
        <a class="btn" href="/api/export" download onclick="if(typeof 触发手动备份下载==='function')触发手动备份下载()">导出数据备份</a>
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
window.切换高级页签 = function(页签) { 高级设置页签 = 页签; if (typeof 写入当前路由 === 'function') 写入当前路由(); 刷新设置详情(); };
function 规范日志项() {
  const ops = (日志原始缓存.操作日志 || []).map((x, idx) => ({
    uid: `op-${x.id || idx}-${x.时间 || ''}`,
    type: 'op',
    t: String(x.时间 || ''),
    action: String(x.动作 || '操作'),
    target: String(x.对象 || ''),
    summary: String(x.详情 || `${x.动作 || '操作'}${x.对象 ? '：' + x.对象 : ''}`),
    chips: [x.操作人 || '管理员'].filter(Boolean),
    detail: { 操作人: x.操作人 || '管理员', 对象: x.对象 || '—', 动作: x.动作 || '—' },
    raw: x.详情 || ''
  }));
  const errs = (日志原始缓存.系统错误日志 || []).map((x, idx) => {
    const info = String(x.信息 || '');
    const ipM = info.match(/IP:([^,\s)]+)/);
    const uaM = info.match(/UA:([^)]+)/);
    const chips = [x.来源 || 'server'];
    if (uaM && uaM[1]) {
      const ua = uaM[1];
      const os = /Android/i.test(ua) ? 'Android' : (/iPhone|iPad/i.test(ua) ? 'iOS' : (/Windows|Win/i.test(ua) ? 'Windows' : (/Linux/i.test(ua) ? 'Linux' : '')));
      const br = /Edg/i.test(ua) ? 'Edge' : (/Chrome/i.test(ua) ? 'Chrome' : (/Safari/i.test(ua) ? 'Safari' : ''));
      if (os || br) chips.push([os, br].filter(Boolean).join(' · '));
    }
    if (ipM && ipM[1]) chips.push(ipM[1]);
    const 次数 = Number(x.次数) || 1;
    if (次数 > 1) chips.push(`已合并 ${次数} 次`);
    return {
      uid: `err-${x.id || idx}-${x.时间 || ''}`,
      type: 'err',
      t: String(x.时间 || ''),
      action: x.来源 === 'turnstile-fe' ? '人机验证超时' : (x.来源 === 'login' ? '登录失败' : '系统报错'),
      target: String(x.路由 || ''),
      summary: info.split(' (IP:')[0] || info,
      chips,
      detail: {
        来源: x.来源 || 'server',
        路由: x.路由 || '—',
        ...(次数 > 1 ? { 累计次数: `${次数} 次`, 首次时间: x.首次时间 || x.时间 || '—' } : {}),
        ...(ipM ? { IP: ipM[1] } : {})
      },
      raw: [info, x.堆栈].filter(Boolean).join('\n')
    };
  });
  return [...errs, ...ops].sort((a, b) => b.t.localeCompare(a.t));
}
function 过滤后日志(all) {
  const q = 日志搜索.trim().toLowerCase();
  return all.filter(e => {
    if (日志筛选 === '操作日志' && e.type !== 'op') return false;
    if (日志筛选 === '系统报错' && e.type !== 'err') return false;
    if (!q) return true;
    return [e.action, e.target, e.summary, e.t, ...(e.chips || []), ...Object.values(e.detail || {}), e.raw].join(' ').toLowerCase().includes(q);
  });
}
window.切日志筛选 = function(类) { 日志筛选 = 类; 日志页码 = 1; 重绘日志视图(); };
window.搜日志 = function(val) { 日志搜索 = val || ''; 日志页码 = 1; 重绘日志视图(); };
window.改日志每页 = function(sz) {
  const firstIdx = (日志页码 - 1) * 日志每页;
  日志每页 = Number(sz) || 50;
  日志页码 = Math.floor(firstIdx / 日志每页) + 1;
  重绘日志视图();
};
window.跳日志页 = function(p) {
  const rows = 过滤后日志(规范日志项());
  const pages = Math.max(1, Math.ceil(rows.length / 日志每页));
  日志页码 = Math.min(Math.max(1, Number(p) || 1), pages);
  重绘日志视图();
};
window.切日志展开 = function(uid, ev) {
  if (ev && ev.target && ev.target.closest('.日志详情')) return;
  const sel = typeof window !== 'undefined' && window.getSelection ? String(window.getSelection() || '') : '';
  if (sel) return;
  if (日志展开集.has(uid)) 日志展开集.delete(uid);
  else 日志展开集.add(uid);
  const el = document.querySelector(`.日志条[data-uid="${CSS.escape ? CSS.escape(uid) : uid}"]`);
  if (el) el.classList.toggle('展开', 日志展开集.has(uid));
};
window.切日志菜单 = function(ev) {
  if (ev) ev.stopPropagation();
  const m = document.getElementById('日志更多菜单');
  if (!m) return;
  const 要开 = !m.classList.contains('开');
  m.classList.toggle('开', 要开);
  if (要开) {
    const 关 = () => { m.classList.remove('开'); document.removeEventListener('click', 关); };
    setTimeout(() => document.addEventListener('click', 关), 0);
  }
};
window.清空报错日志 = async function() {
  if (!await 询问确认('清空系统报错', '确定清空当前记录的所有系统报错日志吗？（操作审计日志不受影响）')) return;
  const r = await api('/api/logs/clear-errors', { method: 'POST' });
  if (r.错误) { 提示(r.错误); return; }
  提示('系统报错日志已清空');
  刷新设置详情();
};
window.清空操作日志 = async function() {
  if (!await 询问确认('清空操作日志', '确定清空所有操作审计日志吗？（系统报错日志不受影响）')) return;
  const r = await api('/api/logs/clear-ops', { method: 'POST' });
  if (r.错误) { 提示(r.错误); return; }
  提示('操作日志已清空');
  刷新设置详情();
};
window.清空全部日志 = async function() {
  if (!await 询问确认('清空全部日志', '确定清空所有操作审计日志和系统报错日志吗？清空后无法恢复。')) return;
  const r = await api('/api/logs/clear-all', { method: 'POST' });
  if (r.错误) { 提示(r.错误); return; }
  提示('全部日志已清空');
  刷新设置详情();
};
window.导出日志文件 = function(格式) {
  const rows = 过滤后日志(规范日志项());
  const m = document.getElementById('日志更多菜单');
  if (m) m.classList.remove('开');
  let blob, ext;
  if (格式 === 'csv') {
    const 转CSV = v => `"${String(v || '').replace(/"/g, '""')}"`;
    const 头 = ['时间', '类型', '动作', '对象/路由', '摘要', '原始详情'].map(转CSV).join(',');
    const 行 = rows.map(r => [r.t, r.type === 'err' ? '系统报错' : '操作日志', r.action, r.target, r.summary, r.raw].map(转CSV).join(','));
    blob = new Blob(['\uFEFF' + [头, ...行].join('\n')], { type: 'text/csv;charset=utf-8' });
    ext = 'csv';
  } else {
    blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json;charset=utf-8' });
    ext = 'json';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `租房管家-日志-${今天()}.${ext}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
function 渲染日志HTML() {
  const all = 规范日志项();
  const ops = all.filter(x => x.type === 'op');
  const errs = all.filter(x => x.type === 'err');
  const 今日 = 今天();
  const 今日报错 = errs.filter(x => x.t.startsWith(今日)).length;
  const 最近报错 = errs.length ? errs[0].t.slice(11, 16) : '—';
  const rows = 过滤后日志(all);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / 日志每页));
  if (日志页码 > pages) 日志页码 = pages;
  const start = (日志页码 - 1) * 日志每页;
  const slice = rows.slice(start, start + 日志每页);

  let 列表HTML = '';
  if (slice.length) {
    const groups = [];
    let lastDay = null;
    for (const e of slice) {
      const day = e.t.slice(0, 10) || '未知日期';
      if (day !== lastDay) { groups.push({ day, items: [] }); lastDay = day; }
      groups[groups.length - 1].items.push(e);
    }
    列表HTML = groups.map(g => {
      const label = g.day === 今日 ? '今天' : g.day.slice(5);
      const 条们 = g.items.map(e => {
        const isOpen = 日志展开集.has(e.uid);
        const badge = e.type === 'err' ? '<span class="日志标 err">系统报错</span>' : '<span class="日志标 op">操作</span>';
        const kv = Object.entries(e.detail || {}).map(([k, v]) => `<dt>${转义(k)}</dt><dd>${转义(v)}</dd>`).join('');
        return `<article class="日志条${isOpen ? ' 展开' : ''}" data-uid="${转义(e.uid)}" onclick="切日志展开('${转义(e.uid)}', event)">
          <div class="日志时">${转义(e.t.slice(11, 16))}<small>${转义(e.t.slice(5, 10))}</small></div>
          <div>
            <div class="日志头">${badge}<span class="日志动">${转义(e.action)}</span><span class="日志对">${转义(e.target)}</span></div>
            <div class="日志摘">${转义(e.summary)}</div>
            <div class="日志标贴">${(e.chips || []).map(c => `<span class="日志贴">${转义(c)}</span>`).join('')}</div>
          </div>
          <div class="日志详情">
            ${kv ? `<dl class="日志键表">${kv}</dl>` : ''}
            ${e.raw ? `<div class="日志原文">${转义(e.raw)}</div>` : ''}
          </div>
        </article>`;
      }).join('');
      return `<div class="日志日分"><span>${转义(label)} · ${g.items.length} 条</span><span></span></div>${条们}`;
    }).join('');
  } else {
    列表HTML = '<div class="日志空">没有符合条件的日志</div>';
  }

  const nums = [...new Set([1, pages, 日志页码 - 1, 日志页码, 日志页码 + 1].filter(n => n >= 1 && n <= pages))].sort((a, b) => a - b);
  let 页码HTML = '';
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) 页码HTML += '<span style="color:var(--ink-3);padding:0 2px">…</span>';
    页码HTML += `<button type="button" class="日志页钮${n === 日志页码 ? ' 选中' : ''}" onclick="跳日志页(${n})">${n}</button>`;
    prev = n;
  }

  return `
    <div class="日志概览四格">
      <div class="日志概卡"><div class="键"><i class="点" style="background:var(--info-text)"></i>操作日志</div><div class="值">${ops.length}<small>条 · 保留 300 条</small></div></div>
      <div class="日志概卡"><div class="键"><i class="点" style="background:var(--danger-text)"></i>系统报错</div><div class="值">${今日报错}<small>条 · 今天</small></div></div>
      <div class="日志概卡"><div class="键"><i class="点" style="background:var(--warn-text)"></i>最近报错</div><div class="值 文">${转义(最近报错)}</div></div>
      <div class="日志概卡"><div class="键"><i class="点" style="background:var(--ok-text)"></i>当前管理员</div><div class="值 文">${转义(日志原始缓存.用户名 || '管理员')}</div></div>
    </div>
    <div class="日志主卡">
      <div class="日志工具栏">
        <div class="日志顶行">
          <div class="日志分段">
            ${[['全部', all.length], ['操作日志', ops.length], ['系统报错', errs.length]].map(([k, n]) =>
              `<button type="button" class="${日志筛选 === k ? '选中' : ''}" onclick="切日志筛选('${k}')">${k === '操作日志' ? '操作' : (k === '系统报错' ? '报错' : '全部')} <span class="数">${n}</span></button>`
            ).join('')}
          </div>
          <div class="日志操作群">
            <button type="button" class="btn 次 行内" onclick="刷新设置详情()">刷新</button>
            <div class="日志更多">
              <button type="button" class="btn 次 行内" onclick="切日志菜单(event)">更多 ▾</button>
              <div class="日志菜单" id="日志更多菜单">
                <button type="button" onclick="导出日志文件('csv')">导出为 CSV</button>
                <button type="button" onclick="导出日志文件('json')">导出为 JSON</button>
                <hr>
                <button type="button" class="危" onclick="清空报错日志()">清空报错日志…</button>
                <button type="button" class="危" onclick="清空操作日志()">清空操作日志…</button>
                <button type="button" class="危" onclick="清空全部日志()">清空全部日志…</button>
              </div>
            </div>
          </div>
        </div>
        <label class="日志搜索盒">
          <span style="color:var(--ink-3);font-size:13px">⌕</span>
          <input id="日志搜框" placeholder="搜索房号、路径、动作、操作人或报错内容" value="${转义(日志搜索)}" oninput="搜日志(this.value)">
        </label>
      </div>
      <div>${列表HTML}</div>
      <div class="日志分页">
        <div class="日志页尺">
          每页
          <div class="日志分段 小">
            ${[20, 50, 100].map(sz => `<button type="button" class="${日志每页 === sz ? '选中' : ''}" onclick="改日志每页(${sz})">${sz}</button>`).join('')}
          </div>
          条
        </div>
        <div class="日志页导">
          <span class="日志页讯">${total === 0 ? '0 条' : `${start + 1}–${start + slice.length} / ${total} 条`}</span>
          <button type="button" class="日志页钮" ${日志页码 <= 1 ? 'disabled' : ''} onclick="跳日志页(1)" title="第一页">«</button>
          <button type="button" class="日志页钮" ${日志页码 <= 1 ? 'disabled' : ''} onclick="跳日志页(${日志页码 - 1})" title="上一页">‹</button>
          ${页码HTML}
          <button type="button" class="日志页钮" ${日志页码 >= pages ? 'disabled' : ''} onclick="跳日志页(${日志页码 + 1})" title="下一页">›</button>
          <button type="button" class="日志页钮" ${日志页码 >= pages ? 'disabled' : ''} onclick="跳日志页(${pages})" title="最后一页">»</button>
        </div>
      </div>
    </div>`;
}
function 重绘日志视图() {
  const 盒 = document.getElementById('日志视图容器');
  if (!盒) { 刷新设置详情(); return; }
  const active = document.activeElement && document.activeElement.id === '日志搜框';
  const pos = active ? document.activeElement.selectionStart : null;
  盒.innerHTML = 渲染日志HTML();
  if (active) {
    const inp = document.getElementById('日志搜框');
    if (inp) { inp.focus(); if (pos != null) inp.setSelectionRange(pos, pos); }
  }
}

// 高级设置：五分页卡片布局（账单与月份 / 变量设置 / 房源信息 / 备案信息 / 日志）
async function 设置_参数() {
  const s = 全局.settings;
  const [房源, rooms] = await Promise.all([api('/api/houses'), api('/api/rooms')]);
  const 在租集合 = new Set(rooms.filter(r => r.月租金 !== '' && r.月租金 != null).map(r => r.房号));
  const 分段 = (s.工资分段 || []).slice().sort((a, b) => String(a.起始月份).localeCompare(String(b.起始月份)));
  const 锁定列表 = (全局.月度快照 || []).slice().sort((a, b) => String(a.月份).localeCompare(String(b.月份)));

  const 页签列表 = ['账单与月份', '变量设置', '房源信息', '备案信息', '日志'];
  if (!页签列表.includes(高级设置页签)) 高级设置页签 = '账单与月份';
  const 页头 = `
    <div class="高设页头">
      <div class="高设面包屑">设置 / 高级设置</div>
      <h1>高级设置</h1>
      <p>这里的修改会影响账单计算，请谨慎操作。</p>
    </div>
    <div class="高设页签栏">
      ${页签列表.map(t => `<button type="button" class="高设页签${高级设置页签 === t ? ' 激活' : ''}" onclick="切换高级页签('${t}')">${t}</button>`).join('')}
    </div>`;

  let 主体 = '';
  if (高级设置页签 === '账单与月份') {
    主体 = `
      <div class="高设卡">
        <div class="高设卡头">
          <div><h2>当前月份</h2><p>账单默认录入的月份</p></div>
        </div>
        <div class="高设月行">
          <input id="设月份" class="高设月框" type="month" value="${s.当前月份}">
          <button class="btn" onclick="保存设置()">保存</button>
          <span class="高设竖线"></span>
          <button class="btn 次" onclick="切下月()">切到下月</button>
        </div>
        <div class="高设卡底 仅注"><span class="注">切到下月时，本月账单会先固化进历史，之后不再随数据变动。</span></div>
      </div>

      ${锁定列表.length ? 折叠卡片('已锁定月', `
        <div style="display:flex;flex-direction:column;gap:2px">
          <h2 style="margin:0">已锁定月份 <span style="color:var(--ink-3);font-weight:500">${锁定列表.length}</span></h2>
          <span style="font-size:12.5px;color:var(--ink-3);font-weight:400">锁定后账单固化为历史快照。要修改，请先解锁，修改完再重新锁定。</span>
        </div>`, `
        <div class="高设表框"><table>
          <tr><th>月份</th><th>锁定时间</th><th class="高设操头">操作</th></tr>
          ${锁定列表.map(k => `<tr>
            <td><b style="font-variant-numeric:tabular-nums">${转义(k.月份)}</b></td>
            <td style="color:var(--ink-3);font-variant-numeric:tabular-nums">${转义((k.锁定时间 || '').slice(0, 10))}</td>
            <td class="高设操列">
              <button class="btn 行内 黄" onclick="解锁月('${转义(k.月份)}')">解锁</button>
              <button class="btn 行内 次" onclick="锁定月('${转义(k.月份)}')">重新锁定</button>
            </td>
          </tr>`).join('')}
        </table></div>`) : ''}`;
  } else if (高级设置页签 === '变量设置') {
    主体 = `
      <div class="高设卡">
        <div class="高设卡头">
          <div><h2>水电与钟点房默认价</h2><p>房间档案或钟点房留空时，自动使用以下默认值</p></div>
        </div>
        <div class="表单 三列">
          <div class="字段"><label>水费单价 <span class="高设单位">元/方</span></label><input id="设水价" type="number" step="0.01" min="0" value="${s.水价}"></div>
          <div class="字段"><label>电费单价 <span class="高设单位">元/度</span></label><input id="设电价" type="number" step="0.01" min="0" value="${s.电价}"></div>
          <div class="字段"><label>钟点房默认房费 <span class="高设单位">元</span></label><input id="设钟点价" type="number" step="0.01" min="0" value="${s.钟点房默认价 ?? 60}"></div>
        </div>
        <div class="高设卡底">
          <span class="注">修改后仅影响之后新录入的数据</span>
          <button class="btn" onclick="保存参数变量()">保存默认价</button>
        </div>
      </div>

      <div class="高设卡">
        <div class="高设卡头">
          <div><h2>工资变量</h2><p>按起始月份分段生效，仅影响该月及之后的利润计算</p></div>
          <div class="高设卡右">未匹配到的月份按 0 计算</div>
        </div>
        <div class="高设表框"><table>
          <tr><th>起始月份</th><th class="数字">月工资</th><th class="高设操头">操作</th></tr>
          ${分段.map(x => `<tr>
            <td><b style="font-variant-numeric:tabular-nums">${转义(x.起始月份)}</b></td>
            <td class="数字" style="font-variant-numeric:tabular-nums">¥${数字(x.金额)}</td>
            <td class="高设操列"><button class="btn 行内 危险" onclick="删除工资分段('${转义(x.起始月份)}')">删除</button></td>
          </tr>`).join('')}
          ${分段.length ? '' : '<tr><td colspan="3" class="空">还没有分段（工资按 0 算）</td></tr>'}
        </table></div>
        <div class="高设添行">
          <div class="字段"><label>起始月份</label><input id="新工资起始" type="month" value="${s.当前月份}"></div>
          <div class="字段"><label>月工资（元）</label><input id="新工资金额" type="number" placeholder="例如 4000"></div>
          <button class="btn 次" onclick="添加工资分段()">添加</button>
        </div>
      </div>`;
  } else if (高级设置页签 === '备案信息') {
    主体 = `
      <div class="高设卡">
        <div class="高设卡头">
          <div><h2>网站底部备案信息</h2><p>填写后自动展示在登录页和主界面底部（留空则不显示），仅保存在服务器数据文件中</p></div>
        </div>
        <div class="表单 两列">
          <div class="字段"><label>ICP 备案号</label><input id="设ICP备案" placeholder="如：粤ICP备2025487295号" value="${转义(s.ICP备案 || '')}"></div>
          <div class="字段"><label>公安联网备案号</label><input id="设公安备案" placeholder="如：粤公网安备44051302000259号" value="${转义(s.公安备案 || '')}"></div>
        </div>
        <div class="高设卡底">
          <span class="注">不提交到代码仓库</span>
          <button class="btn" onclick="保存备案信息()">保存备案信息</button>
        </div>
      </div>`;
  } else if (高级设置页签 === '日志') {
    const [日志数据, 账号] = await Promise.all([
      api('/api/logs').catch(() => ({ 操作日志: [], 系统错误日志: [] })),
      api('/api/account').catch(() => ({ 用户名: '管理员' }))
    ]);
    日志原始缓存 = {
      操作日志: 日志数据.操作日志 || [],
      系统错误日志: 日志数据.系统错误日志 || [],
      用户名: (账号 && 账号.用户名) || '管理员'
    };
    主体 = `<div id="日志视图容器">${渲染日志HTML()}</div>`;
  } else {
    主体 = `
      <div class="高设卡">
        <div class="高设卡头">
          <div><h2>房源信息 <span style="color:var(--ink-3);font-weight:500">${房源.length}</span></h2><p>全楼房号唯一清单，总览空置与房间档案均以此为准；在租、日租、自住房不可删除</p></div>
        </div>
        <div class="工具栏" style="margin-bottom:12px">
          <input id="新房号" placeholder="房号，如 1101" style="width:150px">
          <select id="新房型"><option>月租</option><option>日租</option><option>自住房</option></select>
          <button class="btn" onclick="添加房源()">添加房源</button>
          <button class="btn 次" onclick="切换房源删除模式()">${房源删除模式 ? '退出删除模式' : '删除模式'}</button>
        </div>
        <div class="高设表框"><table>
          <tr><th>房号</th><th>房型</th><th>状态</th>${房源删除模式 ? '<th class="高设操头">选择</th>' : '<th class="高设操头"></th>'}</tr>
          ${房源.map(h => {
            const 在租 = 在租集合.has(h.房号);
            const 房型 = h.房型 || '月租';
            const 房型类 = 房型 === '日租' ? '黄' : (房型 === '自住房' ? '紫' : '次');
            return `<tr>
              <td><b>${转义(h.房号)}</b></td>
              <td><button class="btn 行内 ${房型类}" onclick="切换房型(${h.id},'${房型}')">${房型}</button></td>
              <td>${在租 ? '在租' : '<span style="color:var(--ink-3)">空置</span>'}</td>
              <td class="高设操列">${房源删除模式 && !在租 ? `<input type="checkbox" data-id="${h.id}" ${房源选中.has(h.id) ? 'checked' : ''} onchange="房源选中切换(${h.id}, this.checked)">` : ''}</td>
            </tr>`;
          }).join('')}
          ${房源.length ? '' : '<tr><td colspan="4" class="空">暂无房源，请先添加</td></tr>'}
        </table></div>
        ${房源删除模式 ? `<div class="备忘底栏" style="margin-top:12px">
          ${房源.length ? `<label class="备忘全选"><input type="checkbox" onchange="房源全选(this.checked)">全选空置</label>` : ''}
          <button class="btn 小 危险" onclick="批量删除房源()">删除选中（${房源选中.size}）</button>
          <button class="btn 小 次" onclick="切换房源删除模式()">退出删除模式</button>
        </div>` : ''}
      </div>`;
  }

  return `<div class="高设容器">${页头}${主体}</div>`;
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
// 关于：数据备份迁移/导出 + 版本号与在线更新
async function 设置_关于() {
  const v = await api('/api/version').catch(() => null);
  if (v) 当前版本信息 = v;   // 拉不到（更新重启中）就沿用上一次的，别把版本号抹成「未知」
  return 设置_导出() + 在线更新卡片();
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
// 保存全楼默认水电单价与钟点房默认房费
window.保存参数变量 = async function() {
  const 水价 = Number(document.getElementById('设水价').value);
  const 电价 = Number(document.getElementById('设电价').value);
  const 钟点房默认价 = Number(document.getElementById('设钟点价').value);
  if (!(水价 > 0)) { 提示('水费单价要填大于 0 的数字'); return; }
  if (!(电价 > 0)) { 提示('电费单价要填大于 0 的数字'); return; }
  if (!(钟点房默认价 > 0)) { 提示('钟点房默认房费要填大于 0 的数字'); return; }
  if (!await 询问确认('保存参数变量', `水费 ${精金额(水价)} 元/方、电费 ${精金额(电价)} 元/度、钟点房默认 ${精金额(钟点房默认价)} 元。`)) return;
  const s = await api('/api/settings', { method: 'POST', body: { 水价, 电价, 钟点房默认价 } });
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


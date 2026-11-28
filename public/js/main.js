function 关闭抽屉() { document.body.classList.remove('抽屉开'); }
function 同步导航高亮() {
  document.querySelectorAll('.侧边栏 button[data-page]').forEach(b => {
    const 匹配 = b.dataset.page === 当前页 && (当前页 !== '设置' || b.dataset.setting === 设置节点);
    b.classList.toggle('激活', 匹配);
  });
  const 组 = document.getElementById('设置菜单组');
  if (组 && 当前页 === '设置') 组.classList.add('展开');
}
function 更新当前页标题() {
  const 激活 = document.querySelector('.侧边栏 button[data-page].激活 .菜单字');
  const 标题 = document.getElementById('当前页标题');
  if (标题 && 激活) 标题.textContent = 当前页 === '设置' ? `设置 · ${激活.textContent}` : 激活.textContent;
}

const 页面渲染 = { '总览': 渲染总览, '房间': 渲染房间, '抄表': 渲染抄表, '账单': 渲染租客账单, '月租': 渲染月租, '月度账单': 渲染账单, '日租': 渲染日租, '退房': 渲染退房, '收支': 渲染收支, '设置': 渲染设置 };
function 写入当前路由() {
  try {
    const 片段 = 当前页 === '设置'
      ? (设置节点 === '参数' ? `设置/${设置节点}/${高级设置页签}` : `设置/${设置节点}`)
      : 当前页;
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('当前路由', 片段);
    if (typeof location !== 'undefined') {
      const 目标 = '#' + encodeURIComponent(片段);
      if (location.hash !== 目标 && typeof history !== 'undefined' && history.replaceState) {
        history.replaceState(null, '', 目标);
      }
    }
  } catch (e) {}
}
function 恢复当前路由() {
  try {
    const rawHash = (typeof location !== 'undefined' && location.hash) ? decodeURIComponent(location.hash.slice(1)) : '';
    const saved = rawHash || (typeof sessionStorage !== 'undefined' ? (sessionStorage.getItem('当前路由') || '') : '');
    if (!saved) return;
    const [页, 子, 页签] = saved.split('/');
    if (页 && 页面渲染[页]) {
      当前页 = 页;
      if (页 === '设置' && 子) 设置节点 = 子;
      if (页 === '设置' && 子 === '参数' && 页签) 高级设置页签 = 页签;
    }
  } catch (e) {}
}
const 页面滚动位置 = {};
document.getElementById('侧边栏').addEventListener('click', e => {
  const 组头 = e.target.closest('#设置折叠钮');
  if (组头) {
    document.getElementById('设置菜单组')?.classList.toggle('展开');
    return;
  }
  const btn = e.target.closest('button[data-page]');
  if (!btn) return;
  页面滚动位置[当前页] = window.scrollY || 0;
  const 目标页 = btn.dataset.page;
  当前页 = 目标页;
  if (btn.dataset.setting) 设置节点 = btn.dataset.setting;
  写入当前路由();
  同步导航高亮(); 更新当前页标题(); 关闭抽屉();
  渲染().then(() => {
    const y = 页面滚动位置[目标页] || 0;
    window.scrollTo(0, y);
  });
});

function 获取农历与节日(d) {
  let 农历 = '';
  try {
    const fmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).format(d);
    农历 = fmt;
  } catch (e) {}
  const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const 公历节 = {
    '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '03-12': '植树节',
    '05-01': '劳动节', '05-04': '青年节', '06-01': '儿童节', '07-01': '建党节',
    '08-01': '建军节', '09-10': '教师节', '10-01': '国庆节', '12-25': '圣诞节'
  };
  const 农历节 = {
    '正月初一': '春节', '正月十五': '元宵节', '五月初五': '端午节',
    '七月初七': '七夕', '八月十五': '中秋节', '九月初九': '重阳节', '腊月初八': '腊八节'
  };
  let 节 = 公历节[mmdd] || '';
  for (const [k, v] of Object.entries(农历节)) {
    if (农历.includes(k)) { 节 = 节 ? `${节}/${v}` : v; break; }
  }
  if (!节 && typeof 计算节气 === 'function') {
    const jq = 计算节气(d);
    if (jq) 节 = jq === '清明' ? '清明节' : jq;
  }
  // 除夕判断：明天是正月初一
  try {
    const 明日 = new Date(d.getTime() + 86400000);
    const 明农 = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { month: 'long', day: 'numeric' }).format(明日);
    if (明农.includes('正月初一')) 节 = '除夕';
  } catch (e) {}
  return { 农历, 节 };
}

// 顶栏时钟：北京时间到分 + 农历 + 节假日/节气；凌晨 0–6 点时额外标出当前营业日
function 更新顶栏时间() {
  const el = document.getElementById('月份显示');
  if (!el) return;
  const 业 = 营业日();
  const { 农历, 节 } = 获取农历与节日(new Date());
  const 附加 = [农历 ? `农历${农历}` : '', 节].filter(Boolean).join(' · ');
  el.textContent = `${北京日期()} ${北京时分()}` + (附加 ? ` · ${附加}` : '') + (业 === 今天() ? '' : `　营业日 ${业.slice(5)}`);
}
async function 渲染() {
  const 容器 = document.getElementById('内容');
  if (容器) 容器.dataset.page = 当前页;
  更新顶栏时间();
  await 页面渲染[当前页](容器);
}


(function 绑定壳层交互() {
  const 开关 = document.getElementById('菜单开关');
  const 关 = document.getElementById('抽屉关');
  const 遮罩 = document.getElementById('侧边遮罩');
  const 退出 = document.getElementById('退出登录');
  if (开关) 开关.addEventListener('click', () => document.body.classList.add('抽屉开'));
  if (关) 关.addEventListener('click', 关闭抽屉);
  if (遮罩) 遮罩.addEventListener('click', 关闭抽屉);
  if (退出) 退出.addEventListener('click', async () => {
    if (!await 询问确认('退出登录', '确定要退出当前登录状态吗？')) return;
    try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
    location.replace('/login');
  });
})();

function 更新备案底栏() {
  const box = document.getElementById('主站备案底栏');
  if (!box) return;
  const s = (全局 && 全局.settings) || {};
  const icp = String(s.ICP备案 || '').trim();
  const ga = String(s.公安备案 || '').trim();
  if (!icp && !ga) { box.innerHTML = ''; box.style.display = 'none'; return; }
  const 项 = [];
  if (icp) 项.push(`<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">${转义(icp)}</a>`);
  if (ga) {
    const 码 = (ga.match(/\d+/) || [''])[0];
    const 址 = 码 ? `https://beian.mps.gov.cn/#/query/webSearch?code=${码}` : 'https://beian.mps.gov.cn/';
    项.push(`<a href="${址}" target="_blank" rel="noreferrer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>${转义(ga)}</a>`);
  }
  box.innerHTML = 项.join('');
  box.style.display = 'flex';
}

(async function 初始化() {
  恢复当前路由();
  应用主题();
  同步导航高亮();
  更新当前页标题();
  await 校准时间();                                   // 先对表，再按北京时间渲染
  全局 = await api('/api/all');
  if (typeof 应用全局外观 === 'function') 应用全局外观();
  更新备案底栏();
  渲染();
  setInterval(更新顶栏时间, 20000);                    // 顶栏时钟：20 秒刷一次，分钟跳变不会迟到
  setInterval(校准时间, 6 * 3600 * 1000);              // 每 6 小时跟服务器校准一次时钟
})();


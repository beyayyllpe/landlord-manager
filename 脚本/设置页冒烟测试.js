// 设置页改版冒烟测试：用 DOM stub 在 Node 里跑 public/app.js，实测五个设置详情函数 + 硬账目 + 更新日志模态
// 用法：node 脚本\设置页冒烟测试.js     （只读，不碰任何真实数据）
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
process.on('unhandledRejection', () => {});   // 初始化 IIFE 会跑 渲染()，stub 环境下失败属正常

// ---------- 假数据（不读真实 data\数据.json） ----------
const 假 = {
  '/api/all': { settings: { 水价: 5, 电价: 1.3, 当前月份: '2026-08', 工资分段: [{ 起始月份: '2024-03', 金额: 4000 }] } },
  '/api/houses': [{ id: 1, 房号: '301', 房型: '月租' }, { id: 2, 房号: '302', 房型: '日租' }],
  '/api/rooms': [
    { 房号: '301', 租客姓名: '张三', 月租金: 1000, 管理费: 20, 押金: 1000, 房卡押金: 50, 入住日: '2025-05-26' },
    { 房号: '303', 租客姓名: '李四', 月租金: 2000, 管理费: 30, 押金: 2000, 房卡押金: 50, 入住日: '2025-06-01' },
    { 房号: '302', 月租金: '', 管理费: '' }   // 空置，不该进硬账目
  ],
  '/api/account': { 用户名: 'admin' },
  '/api/version': { 版本: '1.0.5', 提交: 'abc1234', 日期: '2026-08-26', 仓库: 'github.com/beyayyllpe/tianhui' },
  '/api/update/changelog': [{ 版本: '1.0.5', 日期: '2026-08-26', 条目: ['新增水电变量', '改密要输两遍'] }],
  '/api/summary': { 月租已收: 0, 日租已收: 0, 支出: 0, 工资: 0, 合计: 0 },
  '/api/memos': []
};

// ---------- DOM stub ----------
const 创建的元素 = [];
function 造元素() {
  return {
    innerHTML: '', textContent: '', style: {}, dataset: {}, value: '', type: '',
    classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => []
  };
}
const 详情元素 = 造元素();
global.document = {
  documentElement: { setAttribute() {} },
  body: { appendChild() {} },
  // 详情容器返回同一个对象（好断言内容），其它 id 一律给个新元素，避免顶层 addEventListener 炸掉
  getElementById: id => (id === '设置详情' ? 详情元素 : 造元素()),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => { const e = 造元素(); 创建的元素.push(e); return e; },
  addEventListener() {}
};
global.window = {};
global.localStorage = { getItem: () => null, setItem() {} };
global.alert = () => {}; global.confirm = () => true;
global.location = { reload() {} };
global.fetch = async 地址 => ({
  json: async () => {
    for (const 前缀 of Object.keys(假)) if (String(地址).startsWith(前缀)) return 假[前缀];
    return {};
  }
});

// ---------- 加载 app.js，并把要测的函数导出来 ----------
const 源 = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8') + `
;globalThis.__测 = { 设置目录, 设置_主题, 设置_安全, 设置_导出, 设置_参数, 设置_关于,
  硬账目卡片, 渲染设置, 刷新设置详情, 在线更新卡片, 全局 };`;
vm.runInThisContext(源, { filename: 'app.js' });
const T = globalThis.__测;

// ---------- 断言 ----------
let 通过 = 0, 失败 = 0;
function 断言(说明, 条件, 附加) {
  if (条件) { 通过++; console.log('  ✅ ' + 说明); }
  else { 失败++; console.log('  ❌ ' + 说明 + (附加 ? '\n     ' + 附加 : '')); }
}
function 含(文本, 片段) { return String(文本).includes(片段); }

(async () => {
  T.全局.settings = 假['/api/all'].settings;   // 初始化是异步的，这里直接注入，避免时序不确定

  console.log('\n【1】目录树顺序与项名');
  const 键序 = T.设置目录.map(x => x.键).join(',');
  断言('五项且顺序为 主题→安全→导出→参数→关于', 键序 === '主题,安全,导出,参数,关于', '实际：' + 键序);
  断言('每项都有对应的渲染函数', T.设置目录.every(x => typeof x.渲染 === 'function'));

  console.log('\n【2】各详情面板内容归位');
  const 主题HTML = await T.设置_主题();
  断言('主题：有明亮/暗黑按钮', 含(主题HTML, '☀ 明亮') && 含(主题HTML, '🌙 暗黑'));
  断言('主题：不含其它模块', !含(主题HTML, '登录密码') && !含(主题HTML, '当前月份'));

  const 安全HTML = await T.设置_安全();
  断言('安全：显示用户名 admin', 含(安全HTML, 'admin'));
  断言('安全：有「确认新密码」输入框', 含(安全HTML, '密新2') && 含(安全HTML, '确认新密码'));

  const 导出HTML = await T.设置_导出();
  断言('导出：含数据备份/迁移', 含(导出HTML, '数据备份 / 迁移'));
  断言('导出：含账单导出', 含(导出HTML, '账单导出') && 含(导出HTML, '导月份'));

  const 参数HTML = await T.设置_参数();
  断言('参数：含当前月份 + 一键切月', 含(参数HTML, '当前月份') && 含(参数HTML, '一键切月'));
  断言('参数：含房源信息（2 间）', 含(参数HTML, '房源信息（2 间）'));
  断言('参数：含水电变量，水价 5 / 电价 1.3 已回填', 含(参数HTML, '水电变量') && 含(参数HTML, 'value="5"') && 含(参数HTML, 'value="1.3"'));
  断言('参数：含工资变量分段 4000', 含(参数HTML, '工资变量') && 含(参数HTML, '4000'));

  const 关于HTML = await T.设置_关于();
  断言('关于：含在线更新卡片', 含(关于HTML, '在线更新') && 含(关于HTML, '检查更新'));
  断言('关于：显示版本号 1.0.5 与提交号', 含(关于HTML, '1.0.5') && 含(关于HTML, 'abc1234'));
  断言('关于：更新日志按钮改为弹模态（不再是展开 ▼）', 含(关于HTML, '看更新日志()') && !含(关于HTML, '切换版本日志'));
  断言('关于：只剩在线更新卡片（「关于本机」按要求已删）', !含(关于HTML, '关于本机'));

  console.log('\n【3】旧的二级导航已删除');
  const 容器 = 造元素();
  await T.渲染设置(容器);
  断言('设置页不再有 tab栏', !含(容器.innerHTML, 'tab栏'));
  断言('设置页有目录树 + 详情容器', 含(容器.innerHTML, '设置目录') && 含(容器.innerHTML, 'id="设置详情"'));
  断言('目录树含全部五项名称',
    ['主题模式', '安全设置', '导出', '参数', '关于'].every(名 => 含(容器.innerHTML, 名)));
  断言('默认选中项高亮', 含(容器.innerHTML, '设置项 激活'));
  断言('目录项只有名称、没有小字说明', !含(容器.innerHTML, '<i>') && !T.设置目录.some(x => x.说明));
  断言('参数页里房源信息默认折叠', 含(详情元素.innerHTML, '展开 ▼') || (await T.设置_参数()).includes('display:none'));
  断言('详情已渲染进 #设置详情', 含(详情元素.innerHTML, '主题模式'));

  console.log('\n【3.5】切目录项不整页重渲染（目录树不跳的关键）');
  const 切前 = 容器.innerHTML;
  let 滚动过 = false;
  global.window.scrollTo = () => { 滚动过 = true; };
  const 高亮记录 = [];
  global.document.querySelectorAll = 选择器 => 选择器 === '.设置项'
    ? T.设置目录.map(x => ({ dataset: { 键: x.键 }, classList: { toggle: (类, 开) => 高亮记录.push(x.键 + ':' + 开) } }))
    : [];
  await window.选设置项('参数');
  断言('容器（目录树所在 DOM）没被重建', 容器.innerHTML === 切前);
  断言('高亮改为「参数」，其余取消', 高亮记录.join(',') === '主题:false,安全:false,导出:false,参数:true,关于:false',
    '实际：' + 高亮记录.join(','));
  断言('切换后滚回顶部（吃掉长页→短页的回滚抖动）', 滚动过);
  断言('右侧详情换成了参数页', 含(详情元素.innerHTML, '水电变量') && 含(详情元素.innerHTML, '房源信息'));
  await window.选设置项('参数');
  断言('重复点同一项直接返回、不做无谓重绘', 高亮记录.length === 5);
  global.document.querySelectorAll = () => [];

  console.log('\n【4】硬账目（房租 + 管理费）');
  const 在租 = 假['/api/rooms'].filter(r => r.月租金 !== '' && r.月租金 != null);
  const 硬HTML = T.硬账目卡片(在租);
  断言('只算在租的 2 间（302 空置不计）', 含(硬HTML, '硬账目（2 间在租）'));
  断言('房租合计 = 1000 + 2000 = 3000', 含(硬HTML, '¥3000'));
  断言('管理费合计 = 20 + 30 = 50', 含(硬HTML, '¥50'));
  断言('硬账目合计 = 3050', 含(硬HTML, '¥3050'));
  断言('空列表不炸、合计为 0', 含(T.硬账目卡片([]), '¥0'));

  console.log('\n【5】更新日志弹模态 + 可滚动');
  创建的元素.length = 0;
  await window.看更新日志();
  const 模态HTML = 创建的元素.map(e => e.innerHTML).join('');
  断言('确实弹出了模态框', 含(模态HTML, '模态框') && 含(模态HTML, '更新日志'));
  断言('日志内容在可滚动区里', 含(模态HTML, '日志滚动区'));
  断言('日志条目已渲染', 含(模态HTML, '新增水电变量') && 含(模态HTML, '改密要输两遍'));
  断言('有关闭按钮', 含(模态HTML, '关闭模态()'));

  console.log('\n【6】CSS 配套样式存在');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  ['.设置布局', '.设置目录', '.设置项', '.日志滚动区'].forEach(选择器 =>
    断言('style.css 有 ' + 选择器, 含(css, 选择器 + ' ')));
  断言('窄屏有响应式（目录转横向）', 含(css, '@media (max-width: 760px)'));

  console.log(`\n================  通过 ${通过} 项，失败 ${失败} 项  ================\n`);
  process.exit(失败 ? 1 : 0);
})();

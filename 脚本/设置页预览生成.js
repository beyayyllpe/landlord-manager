// 生成设置页静态预览 HTML（内联 style.css + 假数据渲染出的设置页），供 Chrome headless 截图看布局
// 用法：node 脚本\设置页预览生成.js [输出路径] [目录项键]   例：node 脚本\设置页预览生成.js 预览.html 参数
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
process.on('unhandledRejection', () => {});

const 输出 = process.argv[2] || path.join(require('os').tmpdir(), '设置页预览.html');
const 目标项 = process.argv[3] || '主题';

const 假 = {
  '/api/all': { settings: { 水价: 5, 电价: 1.3, 当前月份: '2026-08', 工资分段: [{ 起始月份: '2024-03', 金额: 4000 }] } },
  '/api/houses': [{ id: 1, 房号: '301', 房型: '月租' }, { id: 2, 房号: '302', 房型: '日租' }, { id: 3, 房号: '303', 房型: '自住房' }],
  '/api/rooms': [{ 房号: '301', 月租金: 1000, 管理费: 20 }, { 房号: '303', 月租金: 2000, 管理费: 30 }],
  '/api/account': { 用户名: 'admin' },
  '/api/version': { 版本: '1.0.5', 提交: 'abc1234', 日期: '2026-08-26', 仓库: 'github.com/beyayyllpe/tianhui' },
  '/api/update/changelog': [{ 版本: '1.0.5', 日期: '2026-08-26', 条目: ['新增水电变量', '改密要输两遍'] }]
};

function 造元素() {
  return { innerHTML: '', textContent: '', style: {}, dataset: {}, value: '', type: '',
    classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [] };
}
const 详情元素 = 造元素();
global.document = {
  documentElement: { setAttribute() {} }, body: { appendChild() {} },
  getElementById: id => (id === '设置详情' ? 详情元素 : 造元素()),
  querySelector: () => null, querySelectorAll: () => [], createElement: () => 造元素(), addEventListener() {}
};
global.window = {}; global.localStorage = { getItem: () => null, setItem() {} };
global.alert = () => {}; global.confirm = () => true; global.location = { reload() {} };
global.fetch = async 地址 => ({ json: async () => {
  for (const 前缀 of Object.keys(假)) if (String(地址).startsWith(前缀)) return 假[前缀];
  return {};
} });

const 根 = path.join(__dirname, '..');
const 源 = fs.readFileSync(path.join(根, 'public', 'app.js'), 'utf8') + `
;globalThis.__测 = { 渲染设置, 硬账目卡片, 全局, 设置节点变量: () => 设置节点, 设 (键) { 设置节点 = 键; } };`;
vm.runInThisContext(源, { filename: 'app.js' });
const T = globalThis.__测;

(async () => {
  T.全局.settings = 假['/api/all'].settings;
  T.设(目标项);
  const 容器 = 造元素();
  await T.渲染设置(容器);
  // 渲染设置 把详情写进了 #设置详情（stub 里是 详情元素），塞回容器占位处
  const 页面 = 容器.innerHTML.replace('<div class="设置详情" id="设置详情"></div>',
    `<div class="设置详情" id="设置详情">${详情元素.innerHTML}</div>`);

  const css = fs.readFileSync(path.join(根, 'public', 'style.css'), 'utf8');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>设置页预览 — ${目标项}</title><style>${css}</style></head>
<body><div class="顶栏"><div class="顶栏左"><span class="logo">🏠</span><h1>租房管家</h1>
<span class="月份显示">2026-08</span></div>
<div class="导航"><button>总览</button><button>房间档案</button><button>水电抄表</button><button class="激活">设置</button></div></div>
<main>${页面}</main></body></html>`;
  fs.writeFileSync(输出, html, 'utf8');
  console.log('已生成预览：' + 输出);
})();

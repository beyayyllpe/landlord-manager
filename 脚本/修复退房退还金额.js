/**
 * 一次性数据修复：重算历史退房记录的「退还金额」，并同步对应的支出流水
 *
 * 背景：旧版本 server.js 的退房公式漏减了水电费——
 *   旧：退入金额 = 押金 + 房卡押金 + 留存 − 损耗 − 卫生费
 *   新：退入金额 = 押金 + 房卡押金 + 留存 − 水电总额 − 卫生费 − 损耗   ← 正确
 * 结果是旧代码跑出来的退房记录多退了一笔水电钱，支出流水也跟着记多了。
 *
 * 本脚本扫描全部退房记录，凡是「应退 − 应扣 ≠ 已存退还金额」的就重算，
 * 并把自动生成的那条「XXX退房退还」支出流水改成同一个数、补上 流水id 关联。
 *
 * 用法（先停服务，改完再启动）：
 *   node 修复退房退还金额.js          预览要改什么，不写盘
 *   node 修复退房退还金额.js --写入    真正写进 data\数据.json
 */

const fs = require('fs');
const path = require('path');

const 数据路径 = path.join(__dirname, '..', 'data', '数据.json');
const 真写入 = process.argv.includes('--写入');

const 数 = v => Number(v) || 0;
const 舍入 = n => Math.round((Number(n) || 0) * 100) / 100; // 与 server.js 同款，避免浮点尾巴

const data = JSON.parse(fs.readFileSync(数据路径, 'utf8'));
const 待改 = [];

for (const 记录 of data.退房记录 || []) {
  const 应收 = 数(记录.押金) + 数(记录.房卡押金) + 数(记录.留存金额);
  const 应扣 = 数(记录.水电总额) + 数(记录.退房卫生费) + 数(记录.房间损耗);
  const 正确金额 = 舍入(应收 - 应扣);
  if (Math.abs(正确金额 - 数(记录.退入金额)) < 0.01) continue; // 本来就对，跳过

  // 找这条退房自动生成的支出流水：优先认 流水id，认不到就按「房号+事项+旧金额」反查
  let 流水 = 记录.流水id ? (data.transactions || []).find(t => t.id === 记录.流水id) : null;
  if (!流水) {
    流水 = (data.transactions || []).find(t =>
      String(t.事项 || '') === `${记录.房号}退房退还` && Math.abs(数(t.金额) - 数(记录.退入金额)) < 0.01);
  }

  待改.push({ 记录, 旧金额: 数(记录.退入金额), 正确金额, 应收, 应扣, 流水 });
}

if (!待改.length) {
  console.log('✓ 全部退房记录的退还金额都对得上，无需修复');
  process.exit(0);
}

console.log(`发现 ${待改.length} 条退还金额算错的退房记录：\n`);
for (const x of 待改) {
  const r = x.记录;
  console.log(`  房号 ${r.房号}（${r.日期}，记录 id=${r.id}）`);
  console.log(`    应退：押金 ${数(r.押金)} + 房卡 ${数(r.房卡押金)} + 留存 ${数(r.留存金额)} = ${x.应收}`);
  console.log(`    应扣：水电 ${数(r.水电总额)} + 卫生 ${数(r.退房卫生费)} + 损耗 ${数(r.房间损耗)} = ${x.应扣}`);
  console.log(`    退还金额：${x.旧金额}  →  ${x.正确金额}   （差 ${舍入(x.旧金额 - x.正确金额)}）`);
  console.log(`    支出流水：${x.流水 ? `id=${x.流水.id}「${x.流水.事项}」${数(x.流水.金额)} → ${x.正确金额}` : '⚠ 没找到对应流水，需手动核对支出页'}`);
  console.log('');
}

if (!真写入) {
  console.log('以上仅为预览。确认无误后执行：node 修复退房退还金额.js --写入');
  process.exit(0);
}

for (const x of 待改) {
  x.记录.退入金额 = x.正确金额;
  if (x.流水) {
    x.流水.金额 = x.正确金额;
    x.记录.流水id = x.流水.id; // 补上关联，撤销退房时才能连流水一起删
  }
}

fs.writeFileSync(数据路径, JSON.stringify(data, null, 2), 'utf8');
console.log(`✓ 已写入 ${数据路径}，共修复 ${待改.length} 条。记得重启服务再刷新页面。`);

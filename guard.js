// 守护.js —— 拉起 server.js，退出码 88 视为「请求重启」，其余退出码则一起退出
// 仅在没有 pm2 的场景下需要（比如 Windows 开发机）。生产服务器如果已用 pm2 管理，
// 直接 `pm2 start server.js --name rent-manager` 即可，不需要这个文件。
const { spawn } = require('child_process');
const path = require('path');

let 子进程 = null;

function 启动服务() {
  子进程 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    stdio: 'inherit',
    windowsHide: false
  });
  子进程.on('exit', (码) => {
    if (码 === 88) {
      console.log('\n检测到更新，正在重启服务...\n');
      启动服务();
    } else {
      console.log(`服务已退出（退出码 ${码}）`);
      process.exit(码 ?? 0);
    }
  });
}

// Ctrl+C 时把子进程一起 kill，避免留下孤儿 node 进程占着端口
process.on('SIGINT', () => {
  if (子进程) 子进程.kill('SIGINT');
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (子进程) 子进程.kill('SIGTERM');
  process.exit(0);
});

启动服务();

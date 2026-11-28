# 租房管家

自托管的轻量级长短租房源、水电抄表、月度账单与日租预订管理系统（Node.js + Express + 原生前端）。

## 本地运行

```bash
npm install
node guard.js
# 或直接双击 Windows 下的 启动.bat
```

默认监听 `http://127.0.0.1:3000`。首次访问 `/login` 会引导使用或修改管理员凭据。

## 生产环境部署建议

### 1. 使用 PM2 守护进程

```bash
npm install --omit=dev
pm2 start server.js --name rent-manager
pm2 save
```

### 2. 环境变量说明

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口（固定绑定 `127.0.0.1`，建议配合 Nginx 反代） |
| `DATA_DIR` | `./data` | 数据目录（包含 `数据.json`、自动备份、`error-logs.json` 等） |
| `TURNSTILE_SITE_KEY` | 空 | Cloudflare Turnstile 站点密钥（优先级高于界面设置） |
| `TURNSTILE_SECRET_KEY` | 空 | Cloudflare Turnstile 服务端密钥（优先级高于界面设置，建议生产环境通过环境变量注入） |

### 3. Nginx 反向代理参考

生产环境开启 HTTPS 时，务必透传 `X-Forwarded-Proto`，以确保登录会话 Cookie 的 `Secure` 属性与反代链路正确匹配：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    client_max_body_size 25m; # 支持自定义登录背景与整库备份导入

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 自动化测试

项目内置 14 项核心财务、状态机与安全回归测试（在临时目录隔离运行，不触碰真实业务数据）：

```bash
node test/finance.test.js
```

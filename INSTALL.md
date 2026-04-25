# Lite Codex CE 安装与启动（Windows 唯一推荐路径）

## 0) 先确认你不在 Node.js REPL
必须在 **PowerShell / CMD / Windows Terminal** 执行命令。

如果你看到下面任一特征，说明你在 Node.js REPL，先退出再继续：
- 顶部出现 `Welcome to Node.js`
- 提示符是 `>`

退出方式：
- 输入 `.exit` 回车，或按 `Ctrl + C` 两次

## 1) 前置条件
- Windows
- Node.js 20+（建议 22 LTS）
- Git

## 2) 克隆并进入仓库根目录
```powershell
git clone https://github.com/agnocore/litecodex-public.git
cd litecodex-public
```
预期：`pwd`/当前路径位于 `.../litecodex-public`，且能看到 `package.json`。

## 3) 一键安装+启动+校验（推荐）
```powershell
npm run entry:onekey
```
该命令会自动执行：
- `npm install`
- ledger 初始化与 contract 校验（`run-ledger/install.mjs`）
- entry 安装启动（`entry install`）
- `127.0.0.1:43985` 和 `127.0.0.1:4317` 健康检查
- 最小用户链路验证（workspace/session/turn/run）

## 4) 分步模式（可选）
```powershell
npm install
npm run ledger:install
npm run entry:install
npm run ledger:status
npm run entry:status
```
预期输出中至少包含：
- `"ok": true`
- `entry.listen = "127.0.0.1:43985"`
- host 健康可达 `http://127.0.0.1:4317/health`

## 5) 验证入口可访问
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:43985/health | Select-Object -ExpandProperty Content
```
预期：
- `{"ok":true,"service":"litecodex-entry","listen":"127.0.0.1:43985"}`（等价 JSON）

浏览器打开：
- `http://127.0.0.1:43985`

## 6) 私有能力与私有 ledger overlay（可选）
- 社区功能默认无需 token/license。
- 若要启用官方私有能力，请配置 entitlement 与私有 provider（参见 `docs/PRODUCT_BOUNDARY.md`）。
- 若你持有私有 ledger overlay 产物，设置环境变量：
```powershell
$env:LITECODEX_LEDGER_PRIVATE_BUNDLE_SQL = "D:\\path\\to\\private-ledger.bundle.sql"
npm run ledger:install
```
- 未配置 overlay 时不会静默走“假成功”；`ledger:status` 会明确展示当前 contract 状态。

## 7) 常用维护命令
```powershell
npm run entry:start
npm run entry:stop
npm run entry:restart
npm run entry:open
npm run ledger:status
```

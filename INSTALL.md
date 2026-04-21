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

## 3) 安装依赖
```powershell
npm install
```
预期：出现 `added ... packages` 或 `up to date`，且命令退出码为 0。

## 4) 安装并启动本地入口服务（唯一推荐命令）
```powershell
npm run entry:install
```
预期输出 JSON 中至少包含：
- `"ok": true`
- `"action": "install"`
- `"service": "litecodex-entry"`
- `"listen": "127.0.0.1:43985"`

## 5) 检查状态
```powershell
npm run entry:status
```
预期：
- `"status": "online"`（或安装后短暂启动阶段再转 online）
- `remote.body.service = "litecodex-entry"`
- `remote.body.listen = "127.0.0.1:43985"`

## 6) 验证入口可访问
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:43985/health | Select-Object -ExpandProperty Content
```
预期返回：
```json
{"ok":true,"service":"litecodex-entry","listen":"127.0.0.1:43985"}
```

然后浏览器打开：
- `http://127.0.0.1:43985`

## 7) 常用维护命令
```powershell
npm run entry:start
npm run entry:stop
npm run entry:restart
npm run entry:open
```

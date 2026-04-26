# Lite Codex Product Boundary (Community Edition vs Private Control Plane)

Status: Frozen  
Effective date: 2026-04-22

## 1. Boundary Statement
- Lite Codex 不是全量开源形态。
- 公开仓只发布 Community Edition（CE）。
- 开发者控制面、商业能力、官方高级能力全部属于 Private Control Plane（PCP），不进入 CE 仓库。

## 2. CE Boundary (公开可见、可安装、可运行)
- 本地入口：`litecodex-entry`，固定 `127.0.0.1:43985`。
- 本地主链：现有 `entry/`、`agent-host/`、`local-ui/` 的 CE 子集保持可运行。
- 本地 API 能力（当前链路）：
  - `/runs`、`/events`、`/runs/:id/hydrate`、`/runs/:id/compact`
  - `/entry/preflight`
  - `/entry/workspaces*`
  - `/entry/sessions*`
  - `/entry/byo/openai/*`
  - `/access/*`（及 `/entry/access/*` 镜像）
  - `/session/byo-key`（legacy 兼容）
- entitlement：仅客户端验签与状态执行，不含签发私钥。
- update：仅客户端验签与更新执行，不含官方签名私钥。

## 3. PCP Boundary (私有，不进入公开仓)
- entitlement 签发、续期、撤销。
- 官方 release 签名、发布审批、回滚控制。
- 官方高级能力与官方插件分发。
- 组织/租户、计费、运营控制、审计后台。
- 密钥托管与安全策略编排。

## 4. Interface-Seam Policy
- CE 只保留 PCP 对接接口壳（协议与客户端校验逻辑）。
- CE 不包含任何 PCP 内部实现、私有 API 控制逻辑、私有密钥材料。
- PCP 仅通过签名产物和公开契约与 CE 交互。

## 5. Security Boundary Rules
- CE 仓库中禁止出现：
  - entitlement 签发私钥。
  - 更新签名私钥。
  - 私有插件仓地址及凭据。
  - 运营后台管理接口源码。
- CE 对官方能力必须以 entitlement 验签结果为准，禁止“本地硬开关绕过”。

## 6. Runtime Boundary Rules
- `127.0.0.1:43985` 作为唯一本地入口，不被临时 dev server 抢占。
- 4318 继续 Developer Lab 工装定位，不升格为正式用户产品页。
- 不改变既有运行主链与路由兼容口径。

## 6.1 Run-Ledger SQL Boundary
- `run-ledger/init.sql` 在 CE 侧仅保留 bootstrap contract（非完整私有 schema 源）。
- CE 通过 `community-ledger.bundle.sql + community-ledger.manifest.v1.json + install.mjs` 完成可执行初始化与校验。
- PCP 保留完整 SQL 源、迁移治理和私有 overlay 产物；CE 仅消费受控产物，不直接暴露完整私有实现。
- 不允许假初始化：`npm run ledger:status` 必须真实校验 `required_tables` 与迁移状态。

## 6.2 Entry Frontend Runtime Boundary
- CE 公开仓只发布浏览器可执行 runtime artifacts（`app.js`、`styles.css`、`index.html`）及其 checksum manifest。
- 私有仓保留 canonical frontend artifacts 与发布脚本；通过受控发布将 runtime artifacts 同步到 CE。
- 浏览器 runtime artifacts 禁止包含 secrets、tokens、私有 provider 源码、授权绕过逻辑。
- `npm run frontend:verify` 必须校验 runtime artifacts 与 manifest 一致。

## 7. Violation Handling
- 任何将 PCP 代码或密钥放入公开仓的变更，视为发布阻断。
- 任何改变 43985 入口定位或破坏既有路由兼容的变更，视为发布阻断。


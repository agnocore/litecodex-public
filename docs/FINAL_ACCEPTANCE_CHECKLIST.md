# Final Acceptance Checklist (CE + PCP Boundary Launch)

Status: Frozen  
Effective date: 2026-04-22

## 1. Community Edition Installability
- [ ] `node entry/cli.mjs entry install` 执行成功。
- [ ] `node entry/cli.mjs entry status` 返回可解析状态。
- [ ] 无需手动启动前端 dev server 也可访问入口页。

## 2. Local Entry Runtime (127.0.0.1:43985)
- [ ] `GET http://127.0.0.1:43985/health` 返回：
  - `ok: true`
  - `service: litecodex-entry`
  - `listen: 127.0.0.1:43985`
- [ ] `GET /status` 返回 `service/listen` 一致。
- [ ] `GET /` 返回非空占位页（真实前端未挂载时）。

## 3. CE First-Release Usability
- [ ] `/entry/preflight` 返回稳定字段：
  - `host_connected`
  - `full_access_granted`
  - `openai_byo_bound`
  - `workspace_available`
  - `selected_workspace`
  - `last_session_available`
- [ ] workspace/session/attachment 契约路由可调用。
- [ ] OpenAI BYO 路由可调用，legacy `/session/byo-key` 仍可兼容访问。

## 4. Private Capability Isolation
- [ ] 公开仓不包含 entitlement 签发实现。
- [ ] 公开仓不包含更新签名私钥与签名服务实现。
- [ ] 公开仓不包含私有插件分发与组织/租户后台实现。

## 5. Entitlement Verification Boundary
- [ ] CE 仅执行 entitlement 验签，不执行签发。
- [ ] entitlement 校验失败时，官方高级能力不可用。
- [ ] entitlement 缺失不应破坏 CE 基础本地能力。

## 6. Update Signature Verification Boundary
- [ ] 客户端对 release manifest 执行强制验签。
- [ ] artifact 必须校验 hash 才允许安装。
- [ ] 验签失败或 hash 不匹配时 fail-closed（拒绝更新）。

## 7. Admin Bypass Risk Check
- [ ] 无硬编码管理员后门或绕过 entitlement 的本地开关。
- [ ] 无私钥落盘在公开仓。
- [ ] 无默认高权限远程控制入口暴露。

## 8. Scope Discipline (本轮执行纪律)
- [ ] 本轮未进行无关海量证据扫描。
- [ ] 本轮仅处理 `litecodex/` 内与入口、发布边界、签名策略相关内容。

## 9. Release Decision
- [ ] 上述所有硬性项通过 -> 允许进入 CE 对外发布实施。
- [ ] 任一硬性项失败 -> 发布阻断，必须先修复。


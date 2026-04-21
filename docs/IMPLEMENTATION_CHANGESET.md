# Implementation Changeset (Minimum, Non-Destructive)

Status: Frozen  
Effective date: 2026-04-22

## 1. Objective
- 以“无损改造”方式把当前 Lite Codex 收口为 CE + PCP 架构。
- 不推倒现有主链，不改变 127.0.0.1:43985 入口定位。

## 2. Keep-As-Is (禁止重构)
- `entry/` 入口生命周期与端口绑定策略。
- `agent-host/src/server.mjs` 现有主链路由兼容性（尤其 `/runs`、`/events`、`/runs/:id/hydrate`、`/runs/:id/compact`）。
- `/auth/sessions/:id/submit`、`/byo/openai/*`、`/session/byo-key` 的既有兼容口径。
- 4318 的 Developer Lab 定位。

## 3. Minimal Additions (需实施的最小增量点)
1. entitlement 客户端验签接缝：
   - 新增验签模块（示例路径：`agent-host/src/foundation/entitlement-verify.mjs`）。
   - 新增公钥集合（示例路径：`shared/entitlement-public-keys.v1.json`）。
   - 在 preflight 输出中加入 entitlement 状态字段（不破坏既有字段）。
2. 更新签名客户端验签接缝：
   - 新增 manifest 验签模块（示例路径：`entry/service/update-verify.mjs`）。
   - 新增公钥集合（示例路径：`shared/update-public-keys.v1.json`）。
3. 发布切分接缝：
   - 新增 CE 打包白名单/黑名单清单（可放 `docs/` 或 `shared/` 的 release manifest）。

## 4. Private Control Plane Seams (只定义接口，不落公开实现)
- entitlement issuance API：私有。
- update signing API：私有。
- plugin distribution API：私有。
- CE 仅消费签名产物，不直连私有管理操作接口。

## 5. Do-Not-Touch List (阻断级)
- 不改 `entry` 服务名：`litecodex-entry`。
- 不改监听地址：`127.0.0.1:43985`。
- 不引入 0.0.0.0 默认监听。
- 不移除 legacy 兼容入口 `/session/byo-key`。
- 不引入完整 TUF/SLSA 复杂链作为首发阻塞项。

## 6. Data/Runtime Compatibility
- 旧 run/session/compact/attachment 数据不做破坏性迁移。
- 仅新增校验字段与签名验证逻辑，不覆盖既有数据真相源。

## 7. Acceptance Gate
- 通过 `FINAL_ACCEPTANCE_CHECKLIST.md` 全部硬性检查后才允许对外发布 CE。


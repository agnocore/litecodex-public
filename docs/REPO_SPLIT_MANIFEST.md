# Repository Split Manifest (CE Public vs PCP Private)

Status: Frozen  
Effective date: 2026-04-22

## 1. Split Rule
- 公开仓只包含 CE 运行所需代码、契约、文档。
- PCP 代码、密钥、运营控制与商业能力不进入公开仓。
- 只保留 CE 对 PCP 的接口壳与验签逻辑。

## 2. Public Repository Scope (GitHub CE)

| Path | Decision | Reason |
|---|---|---|
| `entry/` | PUBLIC | 本地真实入口 `127.0.0.1:43985` 必需 |
| `agent-host/` | PUBLIC | CE 本地 host/runtime 主链 |
| `local-ui/` | PUBLIC | Developer Lab 工装台与基础静态资源 |
| `shared/` | PUBLIC (CE-needed contracts only) | CE 协议契约与验证规则 |
| `contracts/` | PUBLIC | 协议文本与接口约束 |
| `run-ledger/init.sql` + `run-ledger/migrations/` | PUBLIC | CE 数据层初始化与增量迁移 |
| `docs/`（含本次 10 份） | PUBLIC | 发布边界、许可证、签名规范 |

## 3. Private Control Plane Scope (NOT in GitHub CE)

| Capability | Private Repository Placement |
|---|---|
| entitlement issuance/revocation | `pcp-entitlement-service` |
| official update signing/publishing | `pcp-release-signer` |
| official plugin distribution | `pcp-plugin-distribution` |
| org/tenant/ops console | `pcp-admin-console` |
| signing private keys/HSM integration | `pcp-security` |

## 4. Interface-Shell-Only Scope (留在 CE，但仅接口壳)

| Path/Module | CE Role |
|---|---|
| `shared/entry-preflight-contract.v1.json` | 前端 preflight 稳定字段 |
| `shared/entry-workspace-contract.v1.json` | workspace 契约 |
| `shared/entry-session-contract.v1.json` | session 契约 |
| `shared/entry-attachment-contract.v1.json` | attachment 契约 |
| `shared/entry-byo-openai-contract.v1.json` | OpenAI BYO 契约 |
| `shared/entry-access-contract.v1.json` | access 契约 |
| `shared/frontend-event-contract.v1.json` | SSE 稳定子契约 |

## 5. Must-Exclude From Public Release Bundle
- `evidence/`
- `runs/`
- `entry/logs/`
- `entry/state/`
- `tmp/`
- `tmp_chrome_headless_phase1/`
- `run-ledger/*.db`
- 任意本机生成快照、截图、历史导出 JSON

## 6. Hard Security Rule
- 公共仓中禁止出现：
  - 私钥
  - 签发令牌
  - 私有控制面 URL 凭据
  - 管理员 bypass 密钥

## 7. Publish Cut Procedure (single-track)
1. 从 `litecodex/` 生成 CE 发布分支。
2. 按本 Manifest 执行 include/exclude。
3. 执行 `FINAL_ACCEPTANCE_CHECKLIST.md`。
4. 验收通过后推送 GitHub CE 仓。


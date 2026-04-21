# Community Feature Matrix

Status: Frozen  
Effective date: 2026-04-22

## 1. Edition Definitions
- CE: Community Edition（公开仓，可安装可运行）
- PCP: Private Control Plane（私有，不公开）

## 2. Feature Ownership Matrix

| Feature | CE | PCP | Frozen Notes |
|---|---|---|---|
| 本地入口服务 `litecodex-entry` | Yes | No | 固定 `127.0.0.1:43985` |
| `entry install/start/stop/status/open` 生命周期 | Yes | No | CE 内完整可用 |
| `/health` `/status` `/` 占位入口页 | Yes | No | CE 必须可访问 |
| `/runs` `/events` `/runs/:id/hydrate` `/runs/:id/compact` | Yes | No | 既有主链保留 |
| Workspace/Session/Attachment 基础契约 | Yes | No | 通过 `/entry/*` 路由 |
| OpenAI BYO (`/entry/byo/openai/*`) | Yes | No | v1 仅对齐 OpenAI BYO |
| `/session/byo-key` legacy | Yes | No | 兼容口径保留 |
| entitlement 客户端验签 | Yes | No | 仅验签，不签发 |
| entitlement 签发与撤销 | No | Yes | 私有控制面能力 |
| 官方更新签名验签 | Yes | No | 客户端强制验签 |
| 官方更新签名生产 | No | Yes | 私钥与发布审批私有 |
| 官方高级能力开关 | No | Yes | 受 entitlement 控制 |
| 私有插件分发 | No | Yes | 不进入 CE 仓 |
| 组织/租户/运营控制 | No | Yes | 不进入 CE 仓 |

## 3. CE 首发可用能力定义
- 本地安装启动与自动恢复。
- 本地任务运行与事件流。
- OpenAI BYO 驱动的基础使用能力。
- 附件、autocontext、compact 等现有可用链路。

## 4. CE 首发不可用能力定义
- 官方托管模型额度与官方私有增强功能。
- 官方插件市场和私有分发通道。
- 组织级运营与租户管理。

## 5. Compatibility Rule
- CE 对上只消费 PCP 的签名产物与公开契约。
- PCP 升级不得破坏 CE 既有最小契约字段。


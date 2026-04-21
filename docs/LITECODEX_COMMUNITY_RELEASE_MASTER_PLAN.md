# Lite Codex Community Release Master Plan

Status: Frozen (single-track)  
Effective date: 2026-04-22  
Scope: `GPT5-codex/litecodex/` only

## 1. Release Goal
- 将 Lite Codex 收紧为非全量开源产品形态。
- 对外发布可见、可安装、可正常使用的 Community Edition（CE）。
- 开发者控制面与商业能力保留在 Private Control Plane（PCP），不进入公开仓。
- 保持本地真实入口不变：`http://127.0.0.1:43985`。

## 2. Frozen Product Shape
- 发布形态：`Community Edition + Private Control Plane`。
- CE 公开仓职责：
  - 本地入口服务 `litecodex-entry`（127.0.0.1:43985）。
  - 本地运行与开发者工装主链（现有 `agent-host` 与 `local-ui` 的 CE 子集）。
  - BYO OpenAI（`/entry/byo/openai/*` + `/session/byo-key` legacy）。
  - entitlement 验签客户端（仅验签，不签发）。
  - 官方更新验签客户端（仅验签，不签名）。
- PCP 私有职责：
  - entitlement 签发与撤销。
  - 官方更新签名与发布控制。
  - 私有插件分发、组织/租户控制、运营控制、官方高级能力。

## 3. Out Of Scope (首发明确不做)
- 完整 TUF。
- 完整 SLSA。
- 重型运营后台。
- 多版本产品矩阵和 SaaS 多租户扩张。

## 4. Non-Negotiable Invariants
- 本地入口唯一固定为 `127.0.0.1:43985`。
- 不改 Lite Codex 既有 runtime/worker/orchestration 主链。
- 不把 4318 改成用户产品页。
- 不将 PCP 代码或密钥放入 CE 公开仓。

## 5. Release Deliverables (本轮冻结)
- `PRODUCT_BOUNDARY.md`
- `LICENSE_STRATEGY.md`
- `TRADEMARK_POLICY.md`
- `COMMUNITY_FEATURE_MATRIX.md`
- `ENTITLEMENT_SPEC.md`
- `UPDATE_SIGNING_SPEC.md`
- `REPO_SPLIT_MANIFEST.md`
- `IMPLEMENTATION_CHANGESET.md`
- `FINAL_ACCEPTANCE_CHECKLIST.md`

## 6. One-Pass Execution Order
1. 冻结产品边界与功能矩阵（CE/PCP 分界唯一化）。
2. 冻结许可证与商标规则（source-available/community license + trademark）。
3. 冻结 entitlement 最小闭环（签名文件 + 客户端验签）。
4. 冻结更新签名最小闭环（release manifest 签名 + 客户端强制验签）。
5. 冻结仓库拆分清单（公开/私有/接口壳三分法）。
6. 冻结无损改造点与禁止改动点。
7. 通过最终验收清单判定是否进入实施开工。

## 7. Definition Of Ready (可开干条件)
- 边界、许可证、商标、能力矩阵、签名规范、拆仓清单、改造清单、验收清单全部冻结为唯一答案。
- 不存在“多方案并列”或“以后再定”的关键决策项。
- 127.0.0.1:43985 入口定位在全部文档中一致。

## 8. Definition Of Done (首发完成判定)
- CE 仓可公开发布，安装命令可用，入口可访问。
- entitlement 与更新签名都为“客户端强制验签”。
- PCP 职责未泄露到公开仓。
- 无关键管理员越权入口。


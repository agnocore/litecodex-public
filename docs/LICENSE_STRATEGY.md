# Lite Codex License Strategy

Status: Frozen  
Effective date: 2026-04-22

## 1. License Model (唯一口径)
- 首发采用 source-available/community license 路线。
- 不采用 MIT/Apache/GPL/AGPL 作为整体产品许可证。
- 许可证名称固定为：`Lite Codex Community License v1.0`（简称 `LCCL-1.0`）。

## 2. Grant Scope (LCCL-1.0)
- 允许查看源码、下载、编译、个人与团队内部使用 CE。
- 允许在许可证约束下进行修改与二次分发。
- 允许在 CE 边界内构建插件与扩展。

## 3. Restricted Scope (LCCL-1.0)
- 禁止将 Lite Codex 作为托管服务（managed service）对外商业提供。
- 禁止绕过 entitlement 与更新验签链路以冒充官方能力。
- 禁止移除或篡改版权、许可证、商标声明。
- 禁止将私有控制面能力伪装为官方 Lite Codex 服务。

## 4. Third-Party Licensing
- 第三方依赖继续遵循各自许可证。
- LCCL-1.0 仅作用于 Lite Codex 自有代码与文档，不覆盖第三方依赖许可权利。

## 5. Repository Required Files (发布必备)
- `COMMUNITY_LICENSE.txt`（LCCL-1.0 正文）
- `NOTICE.md`（版权与第三方声明）
- `TRADEMARK_POLICY.md`（品牌使用边界）

## 6. Enforcement Coupling
- 法务边界：LCCL-1.0 + 商标政策。
- 技术边界：entitlement 客户端验签 + 更新客户端强制验签。
- 结果：即使源码可见，官方受控能力仍受发行方控制。

## 7. Change Control
- 许可证版本升级必须同步更新：
  - `PRODUCT_BOUNDARY.md`
  - `COMMUNITY_FEATURE_MATRIX.md`
  - `ENTITLEMENT_SPEC.md`
  - `UPDATE_SIGNING_SPEC.md`
- 未同步上述文档不得发版。


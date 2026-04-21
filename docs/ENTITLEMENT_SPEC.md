# Entitlement Spec (Minimum v1)

Status: Frozen  
Effective date: 2026-04-22

## 1. Goal
- 首发只实现最小 entitlement 闭环：`签名 entitlement 文件 + 客户端验签`。
- 不在 CE 中实现 entitlement 签发器。

## 2. Trust Model
- 签发方：PCP（私有）。
- 消费方：CE 客户端（公开）。
- CE 只持有公钥，不持有私钥。

## 3. File Format
- 文件名：`entitlement.v1.json`
- 建议落盘：`<workspace>/.litecodex/entitlement/current.entitlement.v1.json`

```json
{
  "version": "v1",
  "issuer": "litecodex-official",
  "issuedAt": "2026-04-22T00:00:00Z",
  "expiresAt": "2027-04-22T00:00:00Z",
  "payload": {
    "entitlementId": "ent_1234567890",
    "subject": {
      "installationId": "inst_abcdef",
      "workspaceId": "ws_default"
    },
    "plan": "community",
    "features": {
      "community_core": true,
      "official_advanced": false,
      "official_plugin_channel": false
    },
    "constraints": {
      "maxSeats": 1,
      "offlineGraceHours": 72
    }
  },
  "signature": {
    "alg": "Ed25519",
    "keyId": "ent-ed25519-2026-01",
    "sig": "base64url-signature-over-canonical-payload"
  }
}
```

## 4. Canonical Signing Input
- 签名输入固定为：
  - UTF-8
  - `payload` 对象按 RFC8785（JCS）规范序列化
- 验签时必须使用同一 canonicalization 规则。

## 5. Public Key Distribution
- CE 内置公钥文件：`shared/entitlement-public-keys.v1.json`
- 最小字段：
  - `version`
  - `keys[]`（`keyId`, `alg`, `publicKey`, `status`）

## 6. Client Validation Rules
- 必须校验：
  - `version == v1`
  - `issuer == litecodex-official`
  - 时间窗有效（`issuedAt <= now < expiresAt`）
  - `signature.keyId` 可在信任公钥集合找到
  - Ed25519 验签通过
- 任一失败即判 `entitlement_invalid`。

## 7. Runtime Decision Rules
- `community_core=true` 时，CE 基础能力可用。
- `official_advanced=false` 时，官方高级能力必须关闭。
- entitlement 缺失或失效时：
  - CE 基础本地能力不中断。
  - 官方能力保持不可用。

## 8. Revocation (v1 Minimum)
- v1 不做复杂在线吊销协议。
- 采用“短有效期 + 定期刷新 + 到期失效”策略。
- 二期再接入透明 revocation list。

## 9. Out Of Scope
- 不引入复杂证书链。
- 不引入远程策略引擎。
- 不引入多级租户授权图谱。


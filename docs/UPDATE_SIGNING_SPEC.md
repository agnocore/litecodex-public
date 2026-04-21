# Update Signing Spec (Minimum v1)

Status: Frozen  
Effective date: 2026-04-22

## 1. Goal
- 首发只做最小官方更新链：`官方 release 签名 + 客户端强制验签`。
- 不阻塞 CE 安装与本地运行。
- 不在首发引入完整 TUF/SLSA。

## 2. Trust Model
- 签名方：PCP 发布系统（私有）。
- 验签方：CE 客户端（公开）。
- CE 只包含更新公钥，不包含签名私钥。

## 3. Artifacts
- `release-manifest.v1.json`
- `release-manifest.v1.sig`（或 manifest 内嵌 signature）
- `litecodex-ce-<version>.zip`（或等价安装包）

## 4. Manifest Schema (minimum)
```json
{
  "version": "v1",
  "channel": "stable",
  "product": "litecodex-ce",
  "release": {
    "version": "1.0.0",
    "publishedAt": "2026-04-22T00:00:00Z"
  },
  "artifacts": [
    {
      "name": "litecodex-ce-1.0.0.zip",
      "url": "https://official.example/releases/litecodex-ce-1.0.0.zip",
      "sha256": "hex-sha256",
      "size": 12345678
    }
  ],
  "signature": {
    "alg": "Ed25519",
    "keyId": "upd-ed25519-2026-01",
    "sig": "base64url-signature-over-canonical-manifest-without-signature"
  }
}
```

## 5. Public Key Distribution
- CE 内置：`shared/update-public-keys.v1.json`
- 最小字段：
  - `version`
  - `keys[]`（`keyId`, `alg`, `publicKey`, `status`）

## 6. Client Verification Flow
1. 拉取 `release-manifest.v1.json`。
2. 校验 manifest 基础字段完整性与版本号。
3. 使用内置公钥按 `keyId` 执行 Ed25519 验签。
4. 下载 artifact 后校验 `sha256` 与 `size`。
5. 验签与 hash 均通过后才允许安装更新。

## 7. Fail-Closed Rules
- 任一条件失败必须终止更新：
  - manifest 验签失败
  - keyId 不受信任
  - artifact hash 不匹配
  - manifest 字段不完整
- 禁止自动降级为“无签名也更新”。

## 8. Rollback Rule (minimum)
- 只允许安装同一信任链签名的历史版本。
- 不允许安装无签名或未知 keyId 的包。

## 9. Phase-2 Upgrade Hook
- 二期可升级到 TUF/SLSA，但不得破坏 v1 客户端验签接口字段：
  - `signature.alg`
  - `signature.keyId`
  - `signature.sig`
  - `artifacts[].sha256`


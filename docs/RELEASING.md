# GitHub Actions 签名与发布

## 流程

- `.github/workflows/ci.yml` 在 PR 和 `main` 推送时运行完整 TypeScript 检查、测试、浏览器构建及原生 Android debug 构建。构建的 APK 还检查 CAMERA 存在、INTERNET 不存在。
- `.github/workflows/release.yml` 只在 `main` 分支的 CI 成功结束后（或仓库维护者手动触发）先运行 `pnpm verify`，然后构建 Android **未签名** Release APK，用 GitHub Secrets 中的原有 keystore 签名，校验后生成 `netproof-air-0.2.0.apk`、扩展 ZIP 和 `SHA256SUMS.txt`。
- TypeScript 与插件完整构建验证成功后，先创建仅含浏览器插件 ZIP / SHA256 的 **GitHub 预发布版本（Pre-release）**。随后构建 Android 正式 APK，**必须**由现有 keystore 签名并验证，成功后附加 APK、更新 SHA256 并转为正式 Release。若 Secrets 名称不匹配或签名失败，预发布页面仅含插件，绝不把未签名 APK 冒充正式包。
- `v0.2.0` 已存在时保留既有插件附件，只补充经过验证的 APK；升级真正的代码版本应更新 tag/软件版本，避免复用旧标签。此流程不是 Chrome Web Store / Google Play 的商店发布。

## 需要的 GitHub Actions Secrets

| 用途 | 优先使用的名称 | 可兼容的名称 |
|---|---|---|
| 现有 Android keystore 文件，base64 编码 | `NP_KEYSTORE_BASE64` | `ANDROID_KEYSTORE_BASE64`, `KEYSTORE_BASE64` |
| keystore 密码 | `NP_KEYSTORE_PASSWORD` | `ANDROID_KEYSTORE_PASSWORD`, `KEYSTORE_PASSWORD` |
| key 密码（若与 store 不同） | `NP_KEY_PASSWORD` | `ANDROID_KEY_PASSWORD`, `KEY_PASSWORD` |
| keystore 内的 alias | `NP_KEY_ALIAS` | `ANDROID_KEY_ALIAS`；缺省 `netproof` |

**不能从当前 GitHub 插件读取 Secrets 的名称或内容。** 如果你仓库里原本使用了其他名字，必须在 workflow 的映射中改成实际名字；缺少密钥时构建会失败而不会使用弱密钥替代。密钥绝不可提交到 Git 仓库或 CI 日志。

在 Linux/macOS 上从原有 keystore 得到 Base64 文本（仅在安全机器操作）：

```bash
base64 -w 0 existing-release.jks
```

更新应用时签名密钥必须与原有安装包匹配。可以在私有安全环境中比对证书指纹：`apksigner verify --print-certs old.apk` 与新 APK 的签名摘要应一致。**不要为了 CI 通过新建 keystore**：Android 会将新签名视为不同应用更新来源，无法覆盖安装旧版本。

## 本地构建

需要 Node.js 22、pnpm 11、JDK 21、Android SDK（API 36 / Build Tools 36.0.0）：

```bash
pnpm install --frozen-lockfile
pnpm verify
export NP_KEYSTORE=/safe/path/original-release.jks
export NP_KEYSTORE_PASSWORD='...'
export NP_KEY_ALIAS=netproof
bash scripts/build-apk.sh
```

如果 key 密码独立，另外设置 `NP_KEY_PASSWORD`。签名成功才会产生 `artifacts/netproof-air-0.2.0.apk`。请勿在共享 shell history 中保存密码；上面密码仅为占位符，推荐通过安全环境变量注入。

## 发布失败时

- `pnpm install --frozen-lockfile` 失败：检查 Node / pnpm 版本及锁文件，不能临时去掉 frozen 选项绕开。
- `assembleRelease` 失败：检查 JDK 21、SDK 36、Capacitor sync 和 Gradle 构建日志。
- 签名失败：确认 Secret Base64、密码、alias 与已有 keystore 对应，并确保签名证书与旧版本一致。
- `gh release create` 失败：检查 workflow 的 `contents: write` 权限以及仓库 Settings → Actions 的工作流权限。
- 需要重新发布时不要覆盖既有 tag；更新版本号并重新走发布门禁。

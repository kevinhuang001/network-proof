# Android 签名与 GitHub Release

## 一次性配置

仓库 `Settings → Secrets and variables → Actions → Repository secrets → New repository secret` 创建以下四个 Secret（大小写完全一致）：

| Secret | 内容 |
| --- | --- |
| `NP_KEYSTORE_BASE64` | 原始 Android 签名 keystore 的 Base64 文本 |
| `NP_KEYSTORE_PASSWORD` | keystore 容器密码 |
| `NP_KEY_ALIAS` | keystore 中私钥条目的别名 |
| `NP_KEY_PASSWORD` | 私钥条目密码；若与容器密码相同可不添加 |

创建 keystore 时务必离线保存原文件、密码与 alias，并做安全备份：丢失签名私钥会影响应用后续升级。绝不把 JKS、Base64 内容或密码提交到 Git、Issue 或聊天中。

### 首次生成 keystore

如果此前**没有发布过任何需要原签名升级的 APK**，可在本机运行：

```bash
keytool -genkeypair -v -keystore netproof-release.jks -alias netproof -keyalg RSA -keysize 3072 -validity 10000 -storetype PKCS12
```

根据交互提示设置并妥善备份密码。若已有 APK 在用户手机上安装且希望覆盖升级，**不能新建一把不同的密钥**，必须使用当初发布 APK 的原始 keystore。

在 macOS / Linux 下把现有 `netproof-release.jks` 转为一行 Base64：

```bash
base64 < netproof-release.jks | tr -d '\\n' > keystore.base64.txt
```

在 PowerShell 中：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("netproof-release.jks")) | Set-Content -NoNewline keystore.base64.txt
```

把 `keystore.base64.txt` **全部内容**粘贴到 `NP_KEYSTORE_BASE64` Secret 的值中。粘贴时不要保留换行或空格。创建 Secret 后删除临时 Base64 文件，但保留安全存储的原 JKS。

别名可用 `keytool -list -keystore netproof-release.jks` 核对，输入密码时不要把它复制到命令行。

## 自动发布

`.github/workflows/ci.yml` 在 PR/main 运行 TypeScript、单元与协议测试、插件构建、Android debug 构建以及模拟器测试。经审核合并到 main 且 CI 成功后，`.github/workflows/release.yml` 自动构建插件 ZIP 与 Android APK，使用上述 Secrets 签名，执行 `apksigner verify`，检查离线 APK 没有 `INTERNET` 权限，并发布到 [GitHub Releases](https://github.com/kevinhuang001/network-proof/releases)。

维护者也可在仓库 Actions 中找到 Signed release 工作流并选择 Run workflow。

注意：GitHub Release 是分发 APK 与可加载的 Chrome 插件 ZIP，**不是** Google Play 或 Chrome Web Store 上架。

## 常见失败

- Secrets 空：核对 `NP_KEYSTORE_BASE64`、`NP_KEYSTORE_PASSWORD`、`NP_KEY_ALIAS` 的名字及作用域，PR 来自 fork 时不会暴露 Secrets。
- Base64 解码失败：检查文件是不是完整 keystore 原始二进制的 Base64。
- alias/密码错误：本地用 `keytool -list` 核对；不要在日志里输出口令。
- APK 无法升级：检查新旧 APK 的签名证书指纹是否一致。
- 标签冲突：发布新版本前同步提高软件版本号、Android versionCode、workflow TAG 与 Release Notes。

正式发布前应完成 [真机扫码验收](QR_SCANNING.md) 和 [测试矩阵](TESTING.md)。

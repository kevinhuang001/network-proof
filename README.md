# NetProof — 离线 Android 签名钱包

NetProof 使用一台不联网的 Android 手机保存助记词并执行离线签名；Chrome 扩展与在线 Web 伴侣负责账户查看、RPC 请求以及广播。双方只通过二维码交换结构化请求与签名响应。

> **安全提醒**：请先阅读 [安全模型](docs/SECURITY.md) 与 [用户指南](docs/USER_GUIDE.md)。本项目涉及真实私钥和交易签名，未经独立安全审计不应存储无法承受损失的资产。

## 组件

| 路径 | 职责 |
| --- | --- |
| `apps/hardware` | Android / Capacitor 离线端，熵采集、地址推导、签名、连续 QR 扫描 |
| `apps/extension` | Chrome MV3 扩展与网站注入桥 |
| `apps/companion-web` | 独立伴侣网页 |
| `packages/core` | 密码学、钱包、QR 协议和交易摘要 |
| `packages/companion` | 联网 RPC、账户与交易辅助逻辑 |
| `packages/companion-ui` | 扩展与伴侣网页共用的界面 |
| `packages/ui` | 通用 UI、主题与网络资源 |

核心隔离要求：手机 App 不请求 `android.permission.INTERNET`，助记词及私钥不通过二维码发送到联网端。

## 本地运行与测试

开发环境：Node.js 22、pnpm 11.24.0。构建 Android 还需要 JDK 21、Android SDK 36。

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm --filter @netproof/hardware exec cap sync android
cd apps/hardware/android
./gradlew testDebugUnitTest assembleDebug
```

`pnpm verify` 包含类型检查、工作区测试和 Web/扩展构建。更多命令见 [开发规范](docs/DEVELOPMENT.md)。

## 二维码签名流程

1. 在 Chrome 插件中创建签名请求，并显示静态或动态二维码。
2. 在离线 Android App 中选择 **连续扫码（推荐）**，自动读取动态二维码的多个片段。
3. 在手机屏幕上审核签名内容、链、目标地址及手续费，确认后在设备本地签名。
4. 将手机显示的签名响应二维码交给插件读取，插件检查结果并广播交易。

扫码细节和设备兼容方案参见 [Android 扫码说明](docs/QR_SCANNING.md)。协议格式参见 [PROTOCOL](docs/PROTOCOL.md)。

## 构建产物与发行

CI 在每个 PR/main 提交运行 TypeScript、协议测试、插件验证及 Android 原生构建/测试。签名 Release 工作流利用仓库现有 GitHub Actions Secrets 中的 keystore 生成 Android APK，并与 Chrome 插件 ZIP 一并发布到 GitHub Releases。没有正确签名密钥时会失败，绝不使用临时签名代替。

- [GitHub Actions](https://github.com/kevinhuang001/network-proof/actions)
- [发行下载](https://github.com/kevinhuang001/network-proof/releases)
- [发行维护手册](docs/RELEASING.md)
- [测试矩阵与实机验收](docs/TESTING.md)

GitHub Release 提供的是 APK 和未上架的 Chrome 扩展 ZIP，不表示已发布 Google Play 或 Chrome Web Store。

## 项目文档

- [架构](docs/ARCHITECTURE.md)
- [协议](docs/PROTOCOL.md)
- [安全模型](docs/SECURITY.md)
- [兼容性](docs/COMPAT.md)
- [Android 扫码](docs/QR_SCANNING.md)
- [用户指南](docs/USER_GUIDE.md)
- [开发规范](docs/DEVELOPMENT.md)
- [测试矩阵](docs/TESTING.md)
- [发行流程](docs/RELEASING.md)

## 许可证

以仓库实际授权文件为准；没有授权文件不意味着可以任意重新分发或商用。

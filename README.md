# NetProof · 隔空签名钱包

[![CI](https://github.com/kevinhuang001/network-proof/actions/workflows/ci.yml/badge.svg)](https://github.com/kevinhuang001/network-proof/actions/workflows/ci.yml)
[![Release](https://github.com/kevinhuang001/network-proof/actions/workflows/release.yml/badge.svg)](https://github.com/kevinhuang001/network-proof/actions/workflows/release.yml)

NetProof 把一部**离线 Android 手机**作为签名设备（NetProof Air），与联网电脑上的浏览器插件 / 伴侣网页（NetProof Companion）通过二维码交换公开信息与签名请求。私钥不应离开离线手机。此项目是**原型级软件，不是经过独立安全审计的硬件钱包**；请不要直接用于保管无法承受损失的资产。

## 获取与安装

从 [GitHub Releases](https://github.com/kevinhuang001/network-proof/releases) 下载：

- `netproof-air-0.2.0.apk`：Android 安装包（由 CI 使用既有签名密钥签名）。
- `netproof-companion-extension-0.2.0.zip`：Chrome / Chromium 扩展；解压后在 `chrome://extensions` 中开启开发者模式，再选择「加载已解压的扩展程序」。
- `SHA256SUMS.txt`：两个安装包的 SHA-256 校验值。

**不要卸载原来存有钱包的手机应用，除非已安全备份助记词并确认能恢复。** Android 更新安装要求应用包名和签名证书与旧版本相同；包名保持为 `io.netproof.air`，签名须使用你原先的密钥。首次使用先以小额测试。GitHub Release 分发扩展 ZIP **不等于**已经提交到 Chrome Web Store。

完整操作见 [使用手册](docs/USER_GUIDE.md)，发行说明见 [RELEASE_NOTES](docs/RELEASE_NOTES.md)。

## 三个应用与共享模块

```text
apps/
  hardware/          离线 Android（Capacitor + React）
    src/screens/      手机各页面
    src/lib/          相机、照片 QR 解码及 UI 适配
    android/          Android 原生壳、权限和 Gradle
    test/             照片及 UI 回归测试
  companion-web/     浏览器网页版伴侣
  extension/         Manifest V3 浏览器插件
packages/
  core/              纯 TS 密码学、熵、QR 帧、签名和保管库
  companion/         节点调用、账户模型与安全策略
  companion-ui/      浏览器伴侣的共享 React 页面
  ui/                通用组件、颜色和 QR 布局
docs/                 规范、威胁模型、兼容性与变更记录
.github/workflows/    多环境 CI 与发布流水线
scripts/             Android 构建 / 发行内容检查
```

### 快速开发

需要 Node.js 22、pnpm 11；Android 构建额外需要 JDK 21、Android SDK API 36 / Build Tools 36.0.0。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @netproof/hardware exec cap sync android
```

`pnpm verify` 执行所有 TypeScript 检查、测试和网页 / 插件构建。GitHub Actions 还会构建和验证 Android APK，检查其必须有 CAMERA、不得有 INTERNET 权限。签名发行见 [发布与签名指南](docs/RELEASING.md)。

### 二维码流程

- **配对**：离线设备显示 xpub / 公共地址二维码，联网伴侣扫描并建立只读账户视图。
- **签名**：浏览器创建请求二维码；Android 用系统相机拍照后本地解析并展示交易；用户确认后离线签名；电脑扫描签名结果。
- **扫码恢复**：Android 先扫描缩图，尝试定位二维码，然后以重叠的高分辨率区域再识别；相机调起失败时可从相册选取本机照片。超过单帧容量时仍通过现有喷泉码收集多帧。

为安全起见，不开放通过网络上传助记词、私钥、xprv 或签名请求的后门。真实 Android 不同机型的摄像头兼容性仍必须做实机测试。

## 文档

- [使用手册 / 扫码故障排查](docs/USER_GUIDE.md)
- [模块边界与数据流](docs/ARCHITECTURE.md)
- [重构与问题清单](docs/REFACTORING.md)
- [签名与自动发布](docs/RELEASING.md)
- [气隙协议](docs/PROTOCOL.md) · [安全模型](docs/SECURITY.md) · [旧安卓兼容性](docs/COMPAT.md)

## 安全边界

- Android 应用包名和扩展 Manifest 的 `key` 保持不变，防止更新后安装失败或浏览器插件 ID 变化造成已存数据不可见。
- 私钥只在离线设备生成、保管和用于签名。设备数据仍受所在手机、Android WebView 及设备密码安全性制约。
- Android APK 不声明 `INTERNET`，但这不是独立的硬件隔离，也不能代替飞行模式和实机验证。
- 摄像头熵的启发式估计未经 NIST SP 800-90B 完整认证；未知合约调用不能仅依赖展示的摘要。

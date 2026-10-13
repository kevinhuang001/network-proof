# 开发规范

## 工作区边界

- `packages/core`：密码学、交易解析、熵采集、CBOR 与 QR 协议；不得依赖浏览器 UI 或 Android API。
- `packages/companion`：在线端 RPC、账户状态与外部网络访问。
- `packages/companion-ui`：在线钱包通用 React 页面，供 Extension 和 Companion Web 共用。
- `packages/ui`：通用组件、样式与图标资源。
- `apps/extension`：MV3 background / content scripts / UI 打包入口。
- `apps/companion-web`：Web 演示/伴侣入口。
- `apps/hardware`：离线 Android Capacitor 应用；`src/lib` 放置相机、扫码与持久化适配层，`screens` 负责页面流程，`android` 放置原生工程。
- `docs`：协议、安全模型、用户流程、发行说明及开发规范。
- `.github/workflows`：自动化测试及有签名密钥保护的发行流水线。

原则：协议和密码学放在 core；平台适配放在 app/lib；页面不得重复实现协议解析逻辑；任何改变二维码格式的修改必须更新协议文档和跨端测试。

## 本地开发

需要 Node.js 22、pnpm 11.24.0。Android 构建还需要 JDK 21、Android SDK 36。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @netproof/hardware exec cap sync android
cd apps/hardware/android && ./gradlew testDebugUnitTest assembleDebug
```

修改 TypeScript 逻辑必须附带单元或协议测试。修复扫码时优先添加离线图片和多帧扫码回归；修改 Android 权限须检查 APK manifest。不要将生成产物、助记词、私钥、JKS 或密钥口令提交到仓库。

## 变更与发布

在功能分支提交改动，打开 PR，核对 TypeScript、单测、打包、Android debug 与设备测试。Release 仅从通过 CI 的 main 提交构建，并通过 GitHub Actions Secrets 解码既有 keystore 签名；绝不重新生成签名密钥。版本号需同步 Android versionCode/versionName、包版本、工作流 TAG 和 Release Notes。发布前人工完成手机与插件的二维码互操作验证。

## 代码审查检查项

- 关键签名操作只消费已审核的结构化请求；用户明确确认后才可签名。
- 手机内的数据不会上传；Android 不包含 INTERNET 权限。
- 摄像头、文件句柄、定时器、监听器和 AbortController 均有明确生命周期。
- 对异常 QR 帧、不完整动态帧、相机权限拒绝提供清楚的反馈。
- 同时验证静态二维码和多帧动态二维码，并确认 Extension/Android 协议兼容。

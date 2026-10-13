# 架构、依赖边界及数据流

## 安全原则

设备端是唯一私钥持有者；连接到 RPC / dApp 的浏览器端只管理公开地址、交易草稿、签名请求及已签名结果。气隙以二维码实现，且 Android Manifest 禁止 INTERNET 权限。不要为了改善扫码而加入云端图像上传或增加设备端网络权限。

## 工作区划分

| 层 | 目录 | 职责 |
|---|---|---|
| Core | `packages/core` | BIP39/BIP32 派生、EVM 签名、CBOR、分帧喷泉码、熵与加密保管库；应避免浏览器平台 API |
| Companion policy | `packages/companion` | EVM JSON-RPC 策略、网络配置、账户及报价；不得接收助记词 |
| Companion UI | `packages/companion-ui` | 伴侣网页及插件复用的 React 页面、扫码扫描循环 |
| Shared UI | `packages/ui` | 设计 token、二维码几何布局和复用组件 |
| Android | `apps/hardware` | 离线 WebView 页面、相机适配、QR 静态照片解码、Capacitor Android 壳 |
| Browser | `apps/extension` | Manifest V3 worker、隔离脚本、弹窗、dApp provider |
| Web | `apps/companion-web` | 直接在普通浏览器访问的伴侣界面 |

## 二维码消息流

```text
dApp -> Companion (只读数据 / 待签请求)
       -> encodeMessage -> CBOR -> NP-REQ 单帧或 LT 分片
       -> 桌面显示 QR
       -> Android 系统相机拍照 / 相册 JPEG
       -> scanPhoto -> FrameCollector('NP-REQ') -> decodeMessage
       -> Android 离线审核 + 设备私钥签名
       -> NP-SIG 二维码 -> Companion 扫描与关联校验
       -> 必要时经浏览器 RPC 广播
```

`scanPhoto` 的几何规划位于 `apps/hardware/src/lib/scanRegions.ts`，与 Canvas、文件输入和相机权限解耦，以便用纯数据单元测试。现有喷泉码和 CBOR 格式没有在此次改动中更换，保持 QR 消息兼容性。照片只在本机处理，失败返回有序尝试记录以便诊断。

## 兼容性约束

- Android 应用 ID `io.netproof.air`，不得更换。
- Chrome 扩展 manifest `key` 不得重建，否则扩展 ID 会变，原 `chrome.storage` 数据可能无法被新扩展访问。
- 现有的 `netproof.companion.*` 本地存储键继续沿用；任何未来迁移必须提供可回退的转换方案并写测试。
- 不要单纯为了简化结构而合并隔离存储、取消加密参数校验、放宽签名请求验证。
- GitHub Actions 不是安全审计：需要独立审查交易签名、随机源质量、密码学实现及被攻击后的数据恢复流程。

## 质量门禁

`pnpm typecheck`、`pnpm test`、`pnpm build`；实际像素 QR 测试已在 `packages/core/test/qr-e2e.test.ts`。CI 还构建原生 Android debug APK、运行原生单元测试并检查 CAMERA / INTERNET 权限；独立 Android 模拟器集成测试验证安装后的应用 ID、系统权限和禁用备份的约束。硬件相机焦距、摩尔纹、厂商 WebView 差异只能由实机回归验证。


## 2026 模块边界调整

- `packages/companion-ui/src/navigation/routes.ts`：路由类型与 URL 解析；不依赖 React 状态与持久化。
- `packages/companion-ui/src/state/settingsScope.ts`：全局及钱包级设置的拆分策略，由 Provider 调用。
- `apps/hardware/src/screens/settings/Preferences.tsx`：版本、二维码速度、Solana 地址数等独立设置组件。
- `apps/hardware/src/screens/Sign.tsx`：QR 采集进度及确认流程；支持清除失败/陈旧分片后重新扫码。
- `packages/ui/src/theme.css`：共用交互状态（键盘焦点、悬浮反馈、减少动态效果和高对比度）。

### 跨层调用约束

`packages/core` 必须是跨平台纯计算；任何签名、助记词、QR 协议的修改要经过兼容性及安全回归。
平台 I/O（相机、浏览器存储、HTTP RPC）位于各 App 或 companion 服务包；UI 只能通过接口调用，不在展示组件里重复签名与解析算法。

### 后续模块化目标

目前 `packages/companion-ui/src/App.tsx` 仍负责较多 Provider 与导航组合逻辑；`screens/Sign.tsx` 等页面也偏大。进一步拆分须基于 E2E 保护，不以文件行数减少作为唯一目标。

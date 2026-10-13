# 2026-10 重构记录与问题清单

此文档区分已写入源码的更改、自动化能验证的内容与尚未完成的实机验证；不能把「有测试」等同「测试已通过」。

| 以前的风险/问题 | 变更 | 验证方式及局限 |
|---|---|---|
| Android 整图缩小后二维码模块消失；定位失败即结束 | `scanPhoto` 先做原有两阶段扫描，失败继续扫描 5 个重叠高清区域 | `scan-regions.test.ts` 验证几何及边界；仍需真实设备照片验收 |
| 缩图 finder 找错位置会走无效裁剪 | 独立的分区回退不依赖 finder 成功，且首个解码成功立即返回 | 原有 finder / photo 测试 + 新测试 |
| 相机调不起来无法换路径 | 增加「从相册选择二维码照片」，两条路径复用同一解码函数 | 自动类型检查；相机系统 UI 仍需旧安卓机测试 |
| Git 树里存放重复构建 ZIP | 移除历史 ZIP，改为 CI 生成发行产物 | `scripts/verify-extension.mjs` 检查扩展入口和固定 ID |
| Android 模拟器测试报 Kotlin stdlib 1.8.22 与历史 1.6.21 JDK7/JDK8 包重复类 | 在 Gradle 所有子模块的配置中排除旧版拆分包，保留新版标准库 | CI 的 `connectedDebugAndroidTest` 复测 |
| 无 Actions 工作流 | `ci.yml` 覆盖 TS 类型、单元/协议测试、构建，Android Gradle 本地单元测试和 APK 权限检查 | PR / main push 执行 |
| APK 正式发布可能意外生成弱的原型签名 | Gradle release 改为 unsigned；单独用已存在的 keystore 签名，缺少密钥时拒绝发布 | 签名校验 `apksigner verify`；必须与旧证书指纹一致 |
| 缺少可重复发布流程 | `release.yml` 使用 Actions secret、生成 APK+扩展 ZIP+SHA256SUMS 并创建 GitHub Release | 必须具备正确的 secret 名称和 Actions 写权限 |
| 文档全部堆进 README | 重写入口文档，拆分手册、架构、重构、签名、发行说明 | 人工审阅 |

## 本轮刻意保留

- BIP39、BIP32、BIP44、EVM 和 Solana 的已有派生语义。
- `packages/core` 的 CBOR、喷泉码、请求 ID 和签名关联校验；改变协议须做跨版本兼容测试。
- Android 包名、浏览器扩展的固定 public key、用户已有存储键。
- Android 不具备 INTERNET 权限以及现有数据加密存储方案。

## 尚需独立验证

1. GitHub Actions 使用仓库现有的 keystore Secret 完成签名、校验并上传产物。
2. 安装在**此前同一签名证书**的旧版 APK 上进行不清数据的升级，检查账户与保管库可用性。
3. 至少两部不同 Android / WebView 版本的真实手机进行远近距离、角度、屏幕反光、JPEG/HEIC 相册回归。
4. 插件在真实 Chrome 的 dApp 授权、签名结果恢复与广播；交易风险提示不代替人工审核。
5. 依赖软件包更新后的安全审查，尤其密码库和 Android WebView 的兼容性边界。

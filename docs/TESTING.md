# 测试矩阵

| 层级 | 命令/入口 | 关注点 |
| --- | --- | --- |
| 类型 | `pnpm typecheck` | 所有工作区 TypeScript 接口 |
| 单元 | `pnpm test` | 密码学、协议、QR 光学、账户状态和 UI |
| 前端构建 | `pnpm build` | Android Web 资源、伴侣页、Chrome Extension |
| 插件校验 | `node scripts/verify-extension.mjs` | MV3 扩展包结构 |
| Android 单元和构建 | `./gradlew testDebugUnitTest assembleDebug` | 原生编译及离线权限 |
| Android 集成 | `./gradlew connectedDebugAndroidTest` | 模拟器测试 |
| 真机验收 | 实体 Android + 桌面 Chrome | 相机对焦、动态 QR、签名互操作 |

## CI

`.github/workflows/ci.yml` 在 PR、main 推送和手动运行时测试；release 工作流只在 main CI 成功（或维护者手动启动）后构建。Android 检查要求 CAMERA 存在、INTERNET 不存在。扩展与 debug APK 作为 Action artifacts 保存。

## 手机真机回归

1. 断网并启动 Android 应用，确保屏幕能够进入扫码页面。
2. 在桌面插件发起签名，分别测试短消息与多帧 EIP-712 请求。
3. 选择连续扫码，查看分片增加与成功进入审核页。
4. 取消扫码后确认相机指示灯关闭。
5. 用静态二维码验证连续扫码识别。
6. 故意扫描不匹配的二维码并检查失败提示。
7. 比对设备上审核内容、签名结果与插件恢复结果。
8. 更新已安装 App 时，验证原签名证书可以正常覆盖升级。

模拟器通常无法复现真实摄像头自动对焦和显示器刷新率问题；CI 通过不等于真机验收通过。

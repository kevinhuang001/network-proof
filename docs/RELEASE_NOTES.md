# NetProof v0.2.1

- Android 实时连续二维码扫描（静态与动态分片）。
- 移除拍照与相册扫码分支，清理旧扫码组件和对应测试。
- 补充扫码回归测试及开发、测试、签名发行文档。
- 签名发布统一使用 NP_KEYSTORE_BASE64、NP_KEYSTORE_PASSWORD、NP_KEY_ALIAS、NP_KEY_PASSWORD（可选）。

发布前须完成真实 Android 手机和 Chrome 扩展的二维码端到端验收。签名密钥由 GitHub Secrets 提供，APK 不请求 INTERNET 权限。

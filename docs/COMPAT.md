# 兼容性下限（旧安卓手机）

这台设备的目标运行环境是**一部永久断网的旧安卓手机**。它不会联网，因此也就永远不会收到
Play 商店推送的 WebView 更新——WebView 版本停在手机出厂或最后一次联网时的状态。

所以下限不是"我们开发时用的浏览器"，而是**手机出厂时自带的 WebView 版本**。

## 下限：WebView 67（Chrome 67，2018-05）

`minSdkVersion = 24`（Android 7.0），因此 Android 7.0 及以上都能安装，包括 Android 9。
构建产物统一按 `chrome67` 转译（见各 `vite.config.ts` 的 `build.target`）。

**为什么不能再低：BigInt。** 钱包的全部金额与签名运算都是 `BigInt`（viem、`@noble/*`、
本仓库的 `bytesToBigInt` 等）。`BigInt` 是语言特性，**没有 polyfill**，在 WebView 67 以下的
引擎里连解析都过不去。67 就是硬下限，66 及以下不可能通过打补丁解决。

## 语法层面

`build.target: 'chrome67'` 让 esbuild 把 `??`、`?.`、逻辑赋值、类字段等新语法降级。
打包产物中不应再出现 `??=`、`||=`、`&&=` 或 `#private`。

## 运行时 API 层面

比 67 新的运行时 API 由 `public/compat.js` 补齐。它是**经典脚本**（不是 module，不经过打包），
在每个 app 的 `index.html` 里于 bundle 之前加载，并且刻意用 ES5 书写——它不能依赖自己要安装的
那些特性。有一条测试盯着这两点（`apps/hardware/test/ui-invariants.test.ts`）。

| API | 引入版本 | 处理 |
| --- | --- | --- |
| `BigInt` | 67 | 下限本身，无 polyfill |
| `globalThis` | 71 | `compat.js` 兜底 |
| `queueMicrotask` | 71 | `compat.js` 兜底 |
| `Array.prototype.flat/flatMap` | 69 | `compat.js` 兜底 |
| `Object.fromEntries` | 73 | `compat.js` 兜底 |
| `Promise.allSettled` | 76 | `compat.js` 兜底 |
| `Promise.any` | 85 | `compat.js` 兜底 |
| `String.prototype.replaceAll` | 85 | `compat.js` 兜底 |
| `Array.prototype.at` | 92 | `compat.js` 兜底 |
| `Object.hasOwn` | 93 | `compat.js` 兜底；核心代码改用 `hasOwn()`（`util/bytes.ts`） |
| `structuredClone` | 98 | 未使用（打包产物中已确认不存在） |
| `crypto.randomUUID` | 92 | 未使用 |

打包产物里来自依赖（viem、`@noble`、React）的 `Object.hasOwn` / `Promise.allSettled` /
`globalThis` / `queueMicrotask` 调用就是这样被覆盖的。

## CSS 层面

比 67 新的 CSS 特性无法用 JS 打补丁，因此分两类处理：

**直接改写，不需要探测：**

- `inset`（87）→ 展开成 `top/right/bottom/left`。
- `appearance`（84）→ 补上 `-webkit-appearance`。
- `backdrop-filter`（76）→ 补上 `-webkit-backdrop-filter`；老引擎上退化为半透明背景（可接受）。
- `env(safe-area-inset-*)`（69）→ 前面先写一条普通 `padding`，老引擎会丢掉整条含 `env()` 的声明。

**必须运行时探测，由 `compat.js` 给 `<html>` 加类名：**

- **flexbox `gap`（84）**。`@supports` 探测不了：WebView 69 支持 grid 的 `gap`，所以
  `@supports (gap: 1px)` 返回 true，而 flex 容器把子元素挤在一起、间距全部消失。
  只能实测：造一个两子元素的纵向 flex 容器，看高度是否等于 `row-gap`。
  失败时加 `np-no-flex-gap`，由 theme.css 末尾的一套 `> * + * { margin }` 规则顶上。
  有一条测试遍历 theme.css，要求**每个**声明了 `display: flex` + `gap` 的类都有对应兜底规则。
- **`aspect-ratio`（88）**。不支持的引擎上，摄像头预览框会塌成 0 高度——而这正是整个产品
  最关键的那一屏。`CSS.supports('aspect-ratio', '1 / 1')` 探测，失败时加 `np-no-aspect-ratio`，
  用「高度 0 + `padding-bottom: 100%`」的经典做法顶上。

## Capacitor 的 `captureInput` 会毁掉输入法（已实测的 bug）

`apps/hardware/capacitor.config.ts` 里的 `android.captureInput` **必须保持 `false`**（也是 Capacitor 的默认值）。
我在模板里把它打开过，直接导致用户在备份验证页输入 `clu` 得到 `cclclu`——而且**只在 APK 里出现，网页版正常**。

机制（`@capacitor/android` 的 `CapacitorWebView.java`）：

```java
public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
    if (config.isInputCaptured()) {
        if (capInputConnection == null) capInputConnection = new BaseInputConnection(this, false);
        return capInputConnection;      // 绕开 Chromium 自己的 IME 管线
    }
    return super.onCreateInputConnection(outAttrs);
}

public boolean dispatchKeyEvent(KeyEvent event) {
    if (event.getAction() == KeyEvent.ACTION_MULTIPLE) {
        evaluateJavascript("document.activeElement.value = document.activeElement.value + '"
            + event.getCharacters() + "';", null);   // 无条件字符串拼接
        return false;
    }
    ...
}
```

打开之后，输入法的组字文本不再走 Chromium 的编辑上下文，而是变成 `KeyEvent.ACTION_MULTIPLE`，
由上面那行 JS **直接往当前聚焦元素的 `value` 后面拼**。中文键盘组 `clu` 会依次送出 `c`、`cl`、`clu`，
于是 `c` + `cl` + `clu` = `cclclu`——和用户报的一字不差。

这个开关是给**硬件键盘楔形扫描枪**用的，本设备没有这种输入；摄像头是唯一的输入源。
`apps/hardware/test/ui-invariants.test.ts` 里有一条测试盯着它（并且顺便断言上游那段拼接代码仍然存在，
以后升级 Capacitor 真修掉了，测试会提醒我们去更新说明，而不是让注释变成假话）。

> 顺带说明：这个 bug 曾经被误判为"受控输入框被 React 写回、打断组字"。
> 那次改动（`@netproof/ui/text-field`，聚焦时非受控）在网页环境是正确且值得保留的，
> 但它**不是**这个现象的原因——真正的原因在原生层，React 根本没参与。

## 摄像头：`getUserMedia` 在老 WebView 上不会照你说的做

用户报的「摄像头打开了，但很模糊，而且一直提示打开摄像头」是两件事，各自有各自的原因。

**模糊。** `width: { ideal: 1920 }` 只是"最好给我这个"，Android WebView 完全可以回一个
640×480 的流并且不告诉你。那个流铺满一个整宽的方形取景框，就是一张小图放大 2 倍以上——
看起来就是糊。所以 `requestCameraStream()` 现在分三步，按代价从低到高，每一步都允许失败：

1. 直接要 1920×1080 + 后置（多数机器这一步就够）；
2. 不够就 `track.applyConstraints()` 让**同一条 track** 换到更高的采集模式——不重新授权、
   不重新开流，在 `attachStream` 之前做，所以切换过程用户看不到；
3. 还不够就 `enumerateDevices()` 按 `label` 认名字（Android 上形如 `camera2 0, facing back`），
   用 `deviceId: { exact }` 直接开后置摄像头；只有**新的更清晰**才换，否则立刻把新的关掉——
   这台设备的前提就是摄像头不会偷偷开着。

最后拿到多少就是多少，`CameraInfo` 把真实分辨率报给界面：
取景框下面会写「摄像头 1920×1080」，低于 960 宽时写「摄像头只有 640×480，画面会偏糊，
把二维码放近一点」。糊不糊这件事从此有数字，而不是感觉。

**一直提示"正在打开摄像头"。** 取景框下面那行提示取的是**解码进度**，而解码进度在成功解出
第一帧之前根本不存在（`progress` 是 `null`）。于是摄像头明明开着、画面在动、只是还没扫到码，
那行字却一直停在"正在打开摄像头…"——用户可以合理地以为它卡住了。
现在扫描器自己上报状态（`opening` / `live` / `searching`），提示由状态决定：

- 打开中 → 「正在打开摄像头…」
- 流已经出来 → 「把二维码放进取景框」
- 1.5 秒没解出任何东西 → 切到原生分辨率 + 反转也试（`attemptBoth`），提示相应变化

**「一直没反应」现在有名字了。** 遮挡的镜头、卡住的预览、以及只是太密的二维码，从 jsQR 那里
得到的沉默完全一样。所以除了看画面，还量三件事（`frameQuality.ts`）：平均亮度、采样点的
离散度、以及**连续多少帧的像素一模一样**（真实摄像头的噪声决定了它永远不会两帧完全相同）。
于是「没反应」会变成其中一句话：画面全黑（镜头被挡）、画面没有对比度（离屏幕太近或太亮）、
画面卡住不动（退出重进）。分辨率这类数字不放在扫码页——那是让人在错误的时刻去读的数字——
而是记在「设置 → 上次扫码」里，供排查用。

这行字符串单独抽成了纯函数 `scanHint()` 并有测试盯着：它是唯一告诉用户"该等、该靠近、还是
该放弃摄像头"的东西，而它错的时候，从渲染它的那段代码里看不出来。

**码本身的密度：这次真正的原因。** 之前每帧固定 300 字节，实测一笔签名请求（CBOR 315 字节）
会变成 **73×73 模块**的二维码，xpub 导出（476 字节）同样是 73 模块。73 个模块要被另一台手机的
摄像头在每个模块上都分辨出来：480 像素的中间方形里放 73 个模块，约等于每模块 4 像素——这正是
jsQR 开始罢工的地方，也就是用户那边看到的「扫不到二维码」。

现在帧的密度由**载荷自己**决定（`chooseFragmentLength`，上限是用户选的档位）：同样的请求变成
每帧 105 字节、**53 模块**，代价是 8 帧而不是 7 帧。多一帧 420 毫秒，换来每个模块多约 28% 的像素
（面积上接近 2 倍），这不是取舍，这是能不能扫出来。三个速度档位从此是**上限**而不是决定，
只在载荷大到「帧数会失控」时才起作用。

**顺带修的：精细模式不再降采样。** 便宜模式把画面中心方形缩到 480×480 再交给 jsQR。
1080 线的画面缩到 480，密集的动画二维码一帧几十上百个模块，模块就在这一步糊掉了——
所以一台报了"清晰"的机器，反而可能读不出一个糊手机能读出的码。现在 4 秒没结果就切到
按原生分辨率（上限 1080）解码 + `attemptBoth`（反转也试）：更慢，但那正是这条路存在的理由。

**已知不可修：对焦。** 旧 WebView 不暴露对焦模式（`focusMode` 不在 `MediaTrackConstraints`
里），所以没有"点一下对焦"可做。能做的只有把真实分辨率显示出来、并在解不出来时给出
"靠近 / 调亮 / 拿稳"这类用户真正能操作的建议。

## 已知不可修的东西

- **`100dvh`**（108）：已经同时写了 `100vh`，老引擎用前者。
- **`scrollbar-width`、`color-scheme`**：纯装饰，降级无感。
- **摄像头对焦**：旧 WebView 没有暴露 `focusMode`（见上一节），无法在应用内对焦。
- **手机相机管线自带时域降噪**：某些机型在 WebView 拿到像素之前就把噪声抹平了。
  这不是兼容性问题，也无法修——测量到的熵会塌到接近 0，设备会**拒绝**创建钱包，
  而不是造出一个假的随机数。参见 `docs/SECURITY.md`。

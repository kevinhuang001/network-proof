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

## 已知不可修的东西

- **`100dvh`**（108）：已经同时写了 `100vh`，老引擎用前者。
- **`scrollbar-width`、`color-scheme`**：纯装饰，降级无感。
- **手机相机管线自带时域降噪**：某些机型在 WebView 拿到像素之前就把噪声抹平了。
  这不是兼容性问题，也无法修——测量到的熵会塌到接近 0，设备会**拒绝**创建钱包，
  而不是造出一个假的随机数。参见 `docs/SECURITY.md`。

# Hello Glass · 日光 / 熔霞 / 晴海 / 晨雾

## 配色与新增组件约定

参考：[Glass OS · 系统设置](https://done.cdn.alibabadesign.com/2026/09/24/0a7c41d6d5dba09a/project_444ab7c5-452f-49a4-b780-2a7f68f01570/chat_6d962860-eb4e-4a47-8de4-234f6ab76de3/file-index.html#/)，默认 **Aurora · 日光**。

四套主题均从参考页主题菜单逐个切换取样。仅背景光场和晨雾光斑亮度改变，文字、紫色主色、白色玻璃材质保持一致。

| 主题 | 稳定 ID | 底色 | 渐变色（45°，0% / 48% / 100%） | 白色光斑 alpha |
| --- | --- | --- | --- | --- |
| Aurora · 日光 | `glass` | `#8f66c9` | `#ee5a86` / `#a05cc4` / `#4a6ce2` | 0.5 |
| Ember · 熔霞 | `glass-ember` | `#d4699b` | `#ff8a5c` / `#f0508c` / `#a44ad4` | 0.5 |
| Abyss · 晴海 | `glass-abyss` | `#3f9bd8` | `#22d3c5` / `#38a8e8` / `#5b6cf0` | 0.5 |
| Graphite · 晨雾 | `glass-graphite` | `#b6bfd4` | `#cfd6e4` / `#aab4cc` / `#8892b0` | 0.6 |

四个 manifest 条目都加载 `themes/glass.css`，不复制组件样式，也不使用主题安全过滤禁止的 `@import`。共享规则用 `[data-plugin-theme|="plugin:demo.pi-themes:glass"]` 匹配保留的 `glass` / `glass-*` 家族；具体配色用完整 ID 精确匹配。既有 `glass` 日光偏好不变，Hello Midnight 不受影响。

| 用途 | 值 |
| --- | --- |
| 极光背景 | `45deg: #ee5a86 0% → #a05cc4 48% → #4a6ce2 100%` |
| 底色 | `#8f66c9` |
| 主文字 / 次文字 / 辅助文字 | `#2b1244` / `#4a3366` / `#6b5a86` |
| 主色 / 强调色 | `#6d3fd4` / `#c2255c` |
| 普通玻璃 | 白色 30%，`blur(26px) saturate(170%)` |
| 深层卡片 | 白色 16.5%，`blur(29.9px) saturate(170%)` |
| 侧栏 | 合成后白色 `46% → 36% → 42%`（叠在整窗底板上，不再单独模糊） |
| 控件 / 悬停 / 选中 | 白色 42% / 50% / 68% |

### 外壳铺排

- 整窗只有一块玻璃底板（`.app-shell::before`，普通玻璃 30% + 模糊）。侧栏、设置导航、工作区只叠加色调，按 `d / (1 - tint)` 换算叠加 alpha，合成后与原侧栏数值一致。
- 贴窗边或贴相邻面板的外壳表面保持直角，外圆角交给系统窗口裁切；只有输入框、提问卡片、设置卡片、菜单等浮在内部的卡片保留圆角。旧版每个面板各自圆角，会在窗口四角、侧栏接缝、工作区接缝和标题栏条带露出未覆盖的极光底色。
- 底板用伪元素而不是给外壳本身加 `backdrop-filter`，避免外壳成为 `position: fixed` 子元素的包含块。
- 极光光斑层向四周外扩 `14vmax + 240px` 并同步偏移光斑位置，避免 `blur(80px)` 的裁切边和漂移动画在窗口四角露出暗角。
- 底部输入区不再加半透明条带：宿主已用 `.thread-scroll` 的遮罩淡出转录内容（D624）。

- 四套主题以 `light` 为基底；所有覆盖仅在本插件保留的 `glass` / `glass-*` 主题家族下生效。
- 新增组件使用 `--ds-*` 语义变量，不再直接引用深色 `--gray-*` 或写死颜色。
- 设置继续使用 `settings-card-block` / `settings-panel` / `settings-row`；一层卡片玻璃即可，行内不要重复模糊。
- 输入使用 `field-input` / `field-select` / `field-textarea`，分段使用 `settings-segment` / `settings-segment-item.active`。不要用全局 `input` 选择器覆盖滑块或复选框。
- 保留主按钮、次按钮、幽灵按钮、错误、只读和禁用状态。输入框/搜索框/对话框聚焦不新增描边或光圈，沿用静态玻璃边缘与阴影；共享字段通过轻微底色变化提示聚焦，按钮等非输入控件保留宿主键盘提示。
- **不要把 `--ds-bg-primary` 改成透明**：它还承担反色文字和聊天输入区遮挡底板。需要透出背景时，仅覆盖对应外壳。
- 浮层使用参考配色中的浅紫 `#f6f1fb` 实色背板，以保证背后存在文字时仍可阅读；极光光斑动画使用四个光斑的合并实现，不声称逐帧相同。
- 系统“减少动态效果”和“减少透明度”偏好均有对应降级。

## 检查记录（2026-10-16，边角填充）

使用当前桌面构建 CSS 与真实类名夹具，在 1280×800 下截图并取窗口边缘 2px 与内侧 30px 的亮度差（固定在极光漂移终点帧）：

| 位置 | 修改前 | 修改后 |
| --- | --- | --- |
| 聊天模式窗口四角 | −43 ～ −85 | −1 ～ +1（右上角取样点落在工作区标题卡片上，已排除） |
| 聊天区底部两角 | −48 / −57 | −2 / +1 |
| 设置模式窗口四角 | −43 ～ −102 | −1 ～ +1 |

宿主 `sanitizeThemeCss` 校验通过。该检查未在运行中的应用里安装插件。

## 检查记录（2026-09-24）

测试范围是**完整桌面构建 CSS + 当前插件 CSS + 真实组件类名的浏览器夹具**，不是向用户运行中的应用自动安装插件。

| 检查 | 结果 |
| --- | --- |
| 桌面 CSS | 使用上一轮已通过构建的完整应用 CSS，本轮未修改宿主代码 |
| 注册与安全校验、既有主题测试 | **21/21** 通过（含新增 3 项测试） |
| 浏览器样式、无描边聚焦与往返切换回归 | 每套 **167 项**；8 次切换共 **1336/1336** 通过 |
| 四套参考配色与本地夹具计算样式对比 | 每套 **44 项**，合计 **176/176** 一致 |
| 1440 / 1024 / 800px 布局 | 四套主题共 12 种组合均无横向溢出 |
| 主题选择 | 下拉列表读取 manifest，四套均可切换 |
| 减少动态效果 / 减少透明度 | 四套均停止动画、使用不透明卡片且模糊为 0 |
| 截图 | 本轮接口恢复，已保存三套新增主题的本地与参考截图；不宣称像素级一致 |

每套 44 项参考对比包含 35 项核心表面样式、1 项背景渐变、8 项配色/材质变量。35 项表面样式覆盖下列 5 对表面，每对比较背景色、背景图、文字色、模糊、阴影、上边框色、上边框宽度：

- `.glass` ↔ `.settings-shell`
- `.glass-deep` ↔ `.settings-card-block`
- `.glass-side` ↔ `.settings-nav`
- `.glass-pill` ↔ `.settings-search`
- `.glass-pill-on` ↔ `.settings-nav-item.active`

167 项浏览器断言还覆盖实际渐变绘制、光斑亮度、主色、圆角、新增组件、原生输入、错误/只读状态、不透明遮挡、主题隔离与恢复。无描边聚焦覆盖 body 上挂载的主题/语言/字体搜索、模型/项目搜索、扩展表单、MCP/技能市场、多行编辑和未来普通输入；同时验证原始玻璃阴影与错误提示未被清空。切换包含晨雾返回日光，并检查 Midnight、其他插件和 `glasshouse` 不被覆盖。

## 复测

仓库根目录构建后启动只绑定本机的静态服务：

```sh
(cd apps/desktop && node node_modules/electron-vite/bin/electron-vite.js build)
python3 -m http.server 43127 --bind 127.0.0.1
```

打开 `http://127.0.0.1:43127/scripts/e2e/glass-theme.html?check=all` 自动执行全部回归；等待 `window.glassThemeResult`，或在普通预览页面等待 `window.fixtureReady` 后执行：

```js
await window.checkAllGlassThemes()
// { ok: true, total: 1336, checks: [...] }
```

夹具及断言位于 `scripts/e2e/glass-theme.html` 和 `scripts/e2e/glass-theme.js`。页面可直接选择四套主题，也支持 `?theme=glass-ember` 等初始主题参数。完整结果包含逐项实际值及预期值；这些检查不是对运行中原生应用自动安装插件的验收。

应用中需要在插件页面重新加载 `examples/plugins/pi-themes`（插件 ID `demo.pi-themes`），再选择 **Hello Glass · 日光 / 熔霞 / 晴海 / 晨雾**；主题 CSS 由插件注册表读取，不属于 Vite 的普通 CSS 热更新。

注册和安全测试：

```sh
node --test apps/desktop/test/glass-theme-variants.test.mjs apps/desktop/test/plugin-themes.test.mjs
```

# Migration Assessment Report

评估日期：2026-07-17  
评估范围：Companion Runtime V1 JavaScript ES Module → TypeScript 迁移可行性  
阶段状态：仅完成迁移审查，未修改 Runtime、配置、测试、Demo 或资源

## 结论

**可以安全迁移。**

当前项目规模小、模块边界清晰，全部 JavaScript 均使用原生 ES Module；未发现 CommonJS、动态 `require`、原生扩展或第三方运行时依赖。现有行为测试在 Node.js 22.23.1 下 8/8 通过，浏览器 Demo 的入口、配置和三名角色的基准资源均可通过静态服务器加载。

迁移不是简单修改扩展名。安全迁移的前置条件是先建立明确的 TypeScript 编译输出与静态资源复制策略，使 Node 测试运行编译后的 JavaScript，并使浏览器 Demo 继续从 HTTP 服务加载编译模块、JSON、CSS 和 PNG。该条件不要求改变现有 Runtime 设计或行为。

## 当前技术栈

- JavaScript ES Module；`package.json` 已配置 `"type": "module"`。
- Node.js 22.23.1、npm 10.9.8。
- 测试框架：Node 内置 `node:test` 与 `node:assert/strict`。
- 浏览器层：原生 HTML、CSS、DOM API、ES Module、Fetch API，无 bundler。
- 配置：5 个 JSON 文件驱动角色、状态、事件映射、行为和人格。
- 资源：Sasuke、Naruto、Itachi 三个角色的 PNG 文件。
- 依赖：当前没有生产依赖或开发依赖，也没有 lockfile。

## 项目结构与文件分类

```text
companion-runtime/
├── packages/core/runtime/       # 10 个 Runtime JavaScript 模块 + 1 个 CSS
├── packages/core/config/        # 5 个 JSON 配置
├── packages/core/tests/         # 2 个 .test.mjs 测试文件
├── characters/naruto-pack/      # 20 个 PNG 角色动作资源
├── examples/browser-demo/       # 1 个 demo.js、HTML、CSS
└── docs/                        # 架构、扩展和 V1 冻结说明
```

JavaScript 文件共 11 个：

| 分类 | 数量 | 文件 |
| --- | ---: | --- |
| Runtime 模型与状态 | 4 | `PetAction`、`PetCharacter`、`PetStateMachine`、`BehaviorRule` |
| Runtime 服务 | 5 | `PetManager`、`PetEventAdapter`、`PetBehaviorEngine`、`PetPersonalityEngine`、`BehaviorScheduler` |
| 浏览器展示 | 1 | `PetViewer` |
| Demo 入口 | 1 | `examples/browser-demo/demo.js` |

另有 2 个 `.test.mjs` 测试文件。仓库当前没有 TypeScript 文件、`tsconfig.json` 或类型声明文件。

## import / export 审查

- 所有模块均使用静态 `import` / 命名 `export`。
- 内部 import 显式包含 `.js` 扩展名，适合 TypeScript 在 Node ESM 模式下保留为编译后路径。
- Demo 使用 `import.meta.url` 和 `new URL()` 构造配置 URL。
- 未发现 CommonJS：无 `module.exports`、`exports.*` 或 `.cjs`。
- 未发现静态或动态 `require()`。
- 未发现动态 `import()`。
- JSON 当前不是通过 ESM import assertion 加载，而是通过 `fetch()` 加载；因此不受 Node JSON module 语法影响。

## 测试与 Demo 基线

### 测试

当前命令：

```bash
npm test
# node --test packages/core/tests/*.test.mjs
```

基线结果：8 个测试全部通过，0 失败。覆盖行为恢复、优先级、冷却、角色切换和人格加权选择。当前测试未覆盖 `PetManager`、`PetStateMachine`、`PetEventAdapter`、`PetViewer`、配置 schema 或完整 Demo 流程。

### Demo

当前命令：

```bash
npm run demo
# python3 -m http.server 4173
```

入口为 `http://127.0.0.1:4173/examples/browser-demo/`。HTML 通过 `<script type="module">` 直接加载 `demo.js`，Demo 再通过相对 URL 加载 Runtime 模块和 JSON。

本次基线静态检查结果：Demo HTML、Demo JS、manifest，以及 Sasuke、Naruto、Itachi 的 `idle.png` 均返回 HTTP 200。该检查证明入口和代表性资源路径有效，但不是完整浏览器交互验收；三名角色的切换、动作和 Viewer 视觉行为应在迁移实施后的浏览器验收中逐项确认。

## 平台依赖审查

### 浏览器全局变量

存在，且集中在展示与 Demo 边界：

- `PetViewer`：`document`、`window`、`Image`、`requestAnimationFrame`、DOM 元素。
- `demo.js`：`window`、`document` 和具体页面元素。
- 多个 Runtime 类：`EventTarget`、`CustomEvent`。
- 配置加载：全局 `fetch`。

TypeScript 配置需要同时包含现代 ECMAScript 与 DOM 类型库。Demo DOM 查询默认可能返回 `null` 或宽泛的 `Element`，在 `strict` 模式下必须通过窄化或小型查询辅助函数处理，不能使用批量非空断言掩盖问题。

### Node 专属 API

生产 Runtime 未使用 Node 专属 API。仅测试导入：

- `node:test`
- `node:assert/strict`

因此核心 Runtime 保持浏览器可用是可行的。测试编译需要 Node 类型声明，建议仅增加开发依赖 `typescript` 与 `@types/node`。

### 隐式类型依赖

存在，主要包括：

- JSON `response.json()` 结果目前隐式决定 manifest、runtime config、event mapping、behavior rules 和 personality profile 的结构。
- `PetManager`、Behavior Engine 与测试替身之间依赖结构化对象约定，没有显式接口。
- `EventTarget` 的 `CustomEvent.detail` 载荷没有事件映射类型。
- 状态、动作、角色 ID、位置、mood、style 和事件名目前均为普通字符串。
- Scheduler 的 timer handle 在浏览器与 Node 类型环境中不同。
- Behavior 对象在处理过程中追加 `selectedAction`、`mood`、`style`、`usedPersonalityPreference` 等字段。
- 多个构造函数使用默认空对象后再做运行时校验；严格类型不能删除这些既有运行时防御。
- Demo 的 `querySelector`、事件对象和 `dataset` 值需要显式窄化。

这些是类型设计工作量，不是功能迁移阻断项。

## 迁移风险

| 风险 | 等级 | 影响 | 控制措施 |
| --- | --- | --- | --- |
| 浏览器不能直接执行 TypeScript | 中 | Demo 入口失效 | 使用 `tsc` 输出 JavaScript；Demo 只加载编译产物 |
| 编译目录改变 `import.meta.url` 相对基准 | 中 | JSON、PNG 路径失效 | 构建时保持目录镜像并复制配置/静态资源，或采用单一明确的 Demo 产物路径；不得临时改角色配置语义 |
| DOM 与 Node 类型环境混合 | 中 | 严格编译冲突、timer 类型冲突 | `lib` 包含 DOM；timer handle 从 `setTimeout` 返回值推导；Node 类型仅服务测试 |
| JSON 数据未经静态验证 | 中 | `response.json()` 容易退化为 `any` | 先以 `unknown` 接收，在边界做类型守卫/解析；配置接口禁止滥用 `any` |
| 核心接口当前为结构类型约定 | 中 | 严格类型可能诱发重构 | 定义最小协作接口，保持现有类、方法名、调用顺序和运行时校验 |
| `CustomEvent.detail` 无类型映射 | 低至中 | 监听器推断不完整 | 定义事件 detail 类型；不引入新的事件总线 |
| 测试覆盖不完整 | 中 | 编译通过但 Demo 行为回归 | 先冻结现有 8 项基线，再迁移测试；补充只针对类型边界/现有行为的测试，不改变规则 |
| Node ESM 扩展名解析 | 低 | 编译后 import 找不到模块 | 源码中继续书写 `.js` specifier，采用 Node ESM 兼容的 TypeScript module resolution |
| 用户当前 V1 文件尚未提交 | 中 | 难以区分迁移改动与 V1 基线 | 实施前建议先将当前 V1 基线单独提交；不得覆盖现有未提交内容 |

未发现重大阻断风险。

## 推荐目标配置

- TypeScript `strict: true`。
- 现代 ESM 输出；基于当前 Node 22 与现代浏览器，建议以 `ES2022` 为保守 target。
- Node ESM 兼容的 module/module resolution 组合，并保留源码中的 `.js` import specifier。
- `lib` 同时包含 `ES2022` 与 `DOM`。
- 独立 `dist/` 编译目录，不在源码目录旁生成 `.js`。
- `npm run typecheck` 使用 `tsc --noEmit`。
- `npm run build` 生成 Runtime、测试与 Demo JavaScript，并复制 Demo 所需 JSON/CSS/PNG 或保持可验证的静态路径。
- `npm test` 应先保证构建产物是最新的，再使用 `node --test` 运行编译后的测试。
- 不引入 bundler 或大型框架；仅使用 TypeScript 编译器和必要的 Node 类型声明。

## 推荐迁移顺序

1. **冻结基线**：确认当前 V1 用户改动形成独立提交；保留 8 项测试结果和 Demo 路径基线。
2. **项目设置**：新增 `tsconfig.json`、开发依赖和 `typecheck` / `build` / `test` 脚本；先验证空迁移构建路径与静态资源策略。
3. **基础类型**：新增 `CompanionEvent`、`EventType`、`EventSource`、`EventCollector`、`PetState`、`PetAction`、`CharacterProfile` 及配置 schema 类型。
4. **纯模型优先**：迁移 `PetAction`、`PetCharacter`、`PetStateMachine`、`BehaviorRule`、`BehaviorScheduler`。
5. **无 DOM 引擎**：迁移 `PetPersonalityEngine`、`PetBehaviorEngine`、`PetEventAdapter`。
6. **浏览器边界**：迁移 `PetViewer` 与 `PetManager`，集中处理 DOM、CustomEvent 和 Fetch 类型。
7. **配置边界**：为 5 个 JSON 对应结构增加类型和最小运行时验证，保持 JSON 内容完全不变。
8. **测试迁移**：将 2 个 `.test.mjs` 迁移为 `.test.ts`，保持断言与行为不变；测试编译后的 `.js`。
9. **Demo 迁移**：迁移 Demo 入口并使用构建产物；验证配置和资源相对路径。
10. **完整验收**：执行 `npm run typecheck`、`npm test`，再在浏览器逐项验证 Sasuke、Naruto、Itachi 的加载、角色切换、状态/动作切换和 Viewer 展示。

## 类型设计边界建议

- `CompanionEvent.payload` 使用 `Record<string, unknown>`，外部输入先视为 `unknown`。
- `EventType` 应允许 V1 已知事件获得字面量提示，同时为未来 Collector 事件扩展保留边界；不要把所有内部行为强制重构到新事件模型。
- `EventCollector` 仅新增为未来契约，本次不实现 Collector，不接入现有 Runtime 调用链。
- `PetState` 应从现有六个冻结状态派生，保留运行时大小写规范化与异常行为。
- `PetAction` 同名既是现有运行时类也是目标类型概念；优先复用类的实例类型，避免创建冲突的重复模型。
- `CharacterProfile` 目标示例中的 `actions: string[]` 与现有 manifest 的 `actions: Record<string, string>` 含义不同。应分别命名“外部简化档案”和“manifest definition”，不能强行改变现有 JSON 格式。
- 配置类型应分别覆盖 manifest、runtime config、event mapping、behavior rules 和 personality profiles；不得以单一索引签名或 `any` 吞掉差异。

## 安全迁移判定

满足以下约束时，判定为可以安全迁移：

- 不修改宠物行为规则、角色设定、PNG、动画参数或 Runtime 设计。
- 不改变公开类名、方法名、事件名、错误语义和 JSON 格式。
- 编译产物与源码分离，并对 Demo 静态资源路径做自动化验证。
- 严格类型问题通过边界接口、类型守卫和 DOM 窄化解决，不使用大面积 `any`、`as any` 或非空断言。
- 每一批迁移后都运行 typecheck 和现有测试；浏览器边界完成后再做三角色 Demo 验收。

因此，本报告的最终判定是：**可以安全迁移**。本轮到此停止，不自动进入代码迁移阶段。


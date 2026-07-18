# TypeScript Core Migration

日期：2026-07-17  
状态：完成

## 背景

Phase 1 已建立严格 TypeScript 工具链和基础类型边界。本阶段将 Companion Runtime V1 的 Core Runtime 与既有测试从 JavaScript ES Module 迁移为 TypeScript，同时冻结行为、配置、角色资源、动画参数和 Demo 展示逻辑。

迁移目标只有三项：功能不变、类型增强、架构不变。

## 修改范围

### Runtime

以下源码从同路径 `.js` 替换为 `.ts`：

- `PetAction`
- `PetCharacter`
- `PetStateMachine`
- `BehaviorRule`
- `BehaviorScheduler`
- `PetBehaviorEngine`
- `PetPersonalityEngine`
- `PetManager`
- `PetEventAdapter`
- `PetViewer`

`PetViewer` 一并迁移，以避免 `packages/core/runtime` 长期保留 JS/TS 双实现，并为 `PetManager` 提供完整的浏览器 DOM 类型边界。`pet-runtime.css` 保持不变。

### Tests

- `behavior-engine.test.mjs` → `behavior-engine.test.ts`
- `personality-engine.test.mjs` → `personality-engine.test.ts`

测试断言覆盖和行为场景保持不变：SUCCESS 恢复、ERROR 抢占、SUCCESS cooldown、priority 和 personality weighted random。

### Build

- `tsconfig.json` 的检查范围扩展到 Runtime、tests 和 types。
- 新增 `tsconfig.build.json`，输出 JavaScript、source map 和 declaration 到 `dist/`。
- 新增 `scripts/build.mjs`，清理固定的 `dist/` 后执行 TypeScript 编译，并复制配置、CSS、角色资源和原始 Demo 文件。
- `npm test` 先构建，再用 `node:test` 执行 `dist/packages/core/tests/*.test.js`。
- `npm run demo` 先构建，再以 `dist/` 为静态服务根目录。

`dist/` 保持源码目录镜像，因此原始 Demo 的模块 import、`import.meta.url`、JSON 路径和角色资源路径无需修改。

## 类型设计

沿用 Phase 1 类型：

- `CompanionEvent`
- `EventType` / `KnownEventType`
- `PetState`
- `PetAction`
- `CharacterProfile`

新增 `RuntimeTypes.ts`，集中定义：

- manifest、runtime config、event mapping
- behavior rules、behavior result、idle target
- personality profile、weighted preference、selection result
- PetManager / PersonalityEngine 的最小协作接口
- constructor / factory options
- browser position、JSON URL、scheduler 与 timer handle

Runtime 和测试没有新增显式 `any`。外部 event payload 继续使用 `Record<string, unknown>`；Fetch JSON 在既有运行时边界转换为对应配置类型，配置文件内容不变。

## 风险处理

### 行为冻结

- 保留所有公开类名、方法名、事件名和错误文本。
- 保留状态规范化、切换与 CustomEvent 触发顺序。
- 保留 Behavior priority、cooldown、duration、recovery、idle 和打断判断顺序。
- 保留 Personality 累计权重算法、边界比较方式和 fallback 行为。
- 保留 PetManager 的角色、状态、动作和 Viewer 调用顺序。
- 保留所有运行时参数检查，没有用静态类型替代既有防御性异常。

### ESM 与浏览器路径

- 源码继续使用 `.js` import specifier，由 TypeScript 输出为原生 ES Module。
- 未引入 CommonJS、`require()` 或 bundler。
- 构建目录镜像保持 `manifest.assetBase` 与 Demo 相对路径语义。

### 不可变内容

迁移前后哈希核对确认以下内容未变化：

- 5 个 JSON 配置
- 20 个 Naruto Character Pack PNG
- `examples/browser-demo/demo.js`
- `examples/browser-demo/index.html`
- `examples/browser-demo/demo.css`

## 验证结果

### Type Check

```text
npm run typecheck
PASS (0 errors)
```

### Build And Node Test

```text
npm test
8 passed
0 failed
```

测试运行的是 TypeScript 编译后的 `dist` JavaScript。

### Browser Demo

通过真实浏览器访问：

```text
http://localhost:4173/examples/browser-demo/
```

验收结果：

- Sasuke：加载 `sasuke/idle.png`，状态 `IDLE / idle`。
- Naruto：加载 `naruto/idle.png`，状态 `IDLE / idle`。
- Itachi：加载 `itachi/idle.png`，状态 `IDLE / idle`。
- Event Demo：`code_review` 正确切换到 Itachi / REVIEWING / code-review。
- Behavior Demo：`task_running` 进入 Sasuke / EXECUTING / chidori；随后 `task_error` 正确抢占并进入 Itachi / ERROR / crow-dissolve。
- Personality Demo：Naruto SUCCESS 从既有权重配置选择合法动作；Itachi REVIEWING 选择 sharingan。
- 浏览器控制台：0 error，0 warning。

静态服务日志确认编译后的 Runtime 模块、JSON 配置和涉及的角色 PNG 均成功加载。唯一 HTTP 404 为浏览器自动请求的未配置 `favicon.ico`，不属于 Runtime 或 Demo 功能异常。

## 架构变化

Runtime 的模块职责和调用链没有变化：

```text
PetEventAdapter
→ PetBehaviorEngine
→ PetPersonalityEngine
→ PetManager
→ PetStateMachine
→ PetViewer
```

仅新增编译层：TypeScript 源码通过 `tsc` 生成 `dist` ES Module、声明文件和 source map。没有新增功能、业务层或跨层调用。

## 下一阶段建议

下一阶段可在独立任务中迁移 Browser Demo 入口本身，或开始 Collector / Adapter 接口设计。两者都不应在本次 Core Migration 中继续展开。若开发 Collector / Adapter，应直接复用 `CompanionEvent`、`EventType` 和已建立的最小 Runtime 协作接口，避免反向修改 V1 行为链。


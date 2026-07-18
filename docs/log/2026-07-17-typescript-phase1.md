# TypeScript Migration Phase 1

日期：2026-07-17  
状态：完成

## 背景

`docs/typescript-migration-assessment.md` 已确认 Companion Runtime V1 可以安全迁移。本阶段只建立 TypeScript 工程基础和公共类型边界，不迁移任何业务实现。

本阶段保持以下内容不变：

- `packages/core/runtime` 下的 JavaScript Runtime
- Behavior 与 Personality 行为逻辑
- Browser Demo 逻辑
- JSON 配置
- Character Pack 与 PNG 资源

## 修改内容

### 工具链

- 新增根目录 `tsconfig.json`。
- 新增开发依赖 `typescript` 与 `@types/node`。
- 新增 `package-lock.json`，锁定可复现的工具链依赖。
- 在 `package.json` 中新增 `typecheck` 脚本：`tsc --noEmit -p tsconfig.json`。

### 类型边界

在 `packages/core/types/` 新增：

- `CompanionEvent.ts`
- `EventType.ts`
- `PetAction.ts`
- `PetState.ts`
- `CharacterProfile.ts`

基础定义包括：

- 统一事件的 ID、类型、来源、未知 payload 字段和时间戳。
- V1 五个已知外部事件，同时允许未来 Collector / Adapter 扩展事件名称。
- V1 六个冻结 Pet State。
- Action 的资源定位字段。
- Character 的公共 ID、名称和动作列表。

## 设计原因

- 使用 `strict: true`，从迁移起点建立严格类型约束。
- 使用 `NodeNext` module 与 module resolution，保持 Node ES Module 规则，并允许 TypeScript 源码继续采用指向编译后文件的 `.js` import specifier。
- target 使用 `ES2022`，匹配当前 Node 22 环境并保持现代浏览器兼容。
- 同时启用 `ES2022`、`DOM` 和 `DOM.Iterable` 类型库，为未来迁移 Runtime 与 Browser Demo 预留正确的平台类型。
- Node 类型约束在 22.x，避免类型声明超前于当前运行环境。
- 本阶段 `include` 仅覆盖 `packages/core/types/**/*.ts`，确保 typecheck 不会隐式迁移或检查尚未纳入本阶段的业务 JavaScript。
- `noEmit: true` 保证 Phase 1 只进行类型检查，不生成或替换 Runtime JavaScript。正式 build 输出策略留到后续迁移阶段确定。
- `payload` 使用 `Record<string, unknown>`，避免公共事件边界使用 `any`。
- 已知事件和状态使用字面量类型；事件边界保留自定义字符串扩展能力，状态仍严格遵循 V1 冻结集合。

## 验证结果

运行环境：

- Node.js 22.23.1
- npm 10.9.8
- TypeScript 7.0.2
- `@types/node` 22.20.1

类型检查：

```text
npm run typecheck
PASS (0 errors)
```

原有测试：

```text
npm test
8 passed
0 failed
```

结论：TypeScript 工程基础可执行，原有 V1 测试保持全部通过；本阶段没有迁移业务代码。

## 下一阶段建议

下一阶段先迁移无 DOM 的基础模型，推荐顺序：`PetAction`、`PetCharacter`、`PetStateMachine`、`BehaviorRule`、`BehaviorScheduler`。开始前应明确编译输出目录和测试运行编译产物的方式，并继续保持每批次运行 `npm run typecheck` 与 `npm test`。


# Profile Management V1

## 背景

`v0.5.0` 已冻结 Companion Runtime 的 Event、Behavior Slot、Action Resolver、Character Manifest 和静态 User Profile 架构。静态模式仍是 `user-profile.json → Runtime`，Runtime 负责定位和读取具体 JSON，不利于未来替换为 LocalStorage、SQLite、Remote API 或 Cloud Sync。

本阶段增加 Profile Store 与 Profile Manager，将存储、校验、运行时切换和 Runtime 应用分离。本阶段不实现 UI、Web 页面、Desktop App、Collector 或 Marketplace。

## 架构变化

之前：

```text
user-profile.json → PetManager → UserProfileResolver → Runtime
```

之后：

```text
JsonProfileStore / Future Store
  → ProfileManager
  → ProfileValidator
  → UserProfileResolver
  → PetManager
  → Character → Action → Asset
```

`PetManager` 不再读取 `user-profile.json`，只接收 `ProfileStore`，并通过 `ProfileManager.loadProfile()` 获得 Runtime Configuration。

## 存储抽象

`ProfileStore` 定义四个异步操作：

- `load(id)`
- `save(profile)`
- `delete(id)`
- `list()`

`JsonProfileStore` 从单 Profile、Profile 数组或 `{ profiles: [] }` JSON 文档初始化数据，并提供隔离副本，避免调用方直接修改内部状态。V1 的 `save/delete` 保存在当前 Store 实例中；页面或进程重启后重新从 JSON 快照初始化。

该边界允许后续实现 `LocalStorageProfileStore`、`SQLiteProfileStore` 或 `RemoteProfileStore`，无需修改 ProfileManager 和 Runtime。

## Profile Manager

`ProfileManager` 提供：

- `loadProfile(id)`：加载、校验并解析当前 Profile。
- `switchCharacter(characterId)`：更新角色、清空旧角色 Action 覆盖、保存 Profile，并通知 Runtime 刷新 Character 与 ActionResolver。
- `getCurrentProfile()`：返回当前 Profile 的隔离副本。
- `exportProfile()`：导出格式化 JSON。
- `importProfile(json)`：解析、严格校验并保存 Profile。
- `onChange(handler)`：供 Runtime 等订阅者响应配置变化。

角色切换时清空旧 `behaviorMapping` 是显式切换语义，防止前一个 Character 的 Action id 被带入新 Character。导入数据不会被静默修复，任何非法字段都会失败。

## Profile Validation

`ProfileValidator` 检查：

- Profile 必须是对象。
- `id` 与 `characterId` 必须是非空字符串。
- `behaviorMapping` 必须是对象。
- Character 必须存在于 Manifest Catalog。
- Behavior Slot 必须属于固定协议。
- Action 必须属于目标 Character Manifest。

无效 JSON、未知 Character、非法 Behavior Slot 和不支持的 Action 均返回包含具体字段值的明确错误。

## 风险

- JsonProfileStore V1 不负责把修改写回只读 HTTP JSON 文件；跨会话持久化需要后续 Store 实现。
- ProfileManager 使用 PetManager 已加载的 Character Manifest Catalog，切换时重新选择并解析 Manifest，不重复发起网络请求。
- `PetManager.changeCharacter()` 现在通过 ProfileManager 执行，因此会保存 Profile 并刷新 ActionResolver。
- Event、Behavior Engine、Viewer、PNG 和 Character Asset 内容未修改。

## 验证

- Phase 0：`npm run typecheck` 通过，原有 27/27 测试通过后提交 `e3234fd`，并创建 annotated Tag `v0.5.0`。
- Phase 1：`npm run typecheck` 通过。
- Phase 1：`npm test` 33/33 通过。
- 新增覆盖 JsonProfileStore 的 load/save/list/delete、Profile 加载和角色切换、保存与通知、Import/Export 往返，以及非法 schema、Character、Behavior Slot、Action。
- Browser Demo：默认加载 Sasuke；通过现有角色控件切换 Naruto 后显示 `Naruto / IDLE / idle`，图片加载正常，浏览器无 error 日志。
- `git diff --check`：通过。

## 结果

Companion Runtime 已拥有独立 Profile Management 层。Runtime 只消费 ProfileManager 解析后的配置，存储实现可以独立替换，整体链路保持 `Event → Behavior → Profile → Character → Action → Asset`。

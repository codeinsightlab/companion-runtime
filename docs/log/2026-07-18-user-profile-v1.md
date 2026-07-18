# User Profile 与 Character Manifest V1

## 背景

Behavior Slot 架构已经将 Event、Action 与 Asset 分层，但当前角色仍由 Runtime 配置选择，ActionResolver 也只有单一的全局 Behavior Mapping。为了支持用户选择宠物、覆盖动作，以及让第三方 Character Pack 声明自身能力，需要增加独立的 User Profile 与 Character Manifest 配置层。

本阶段只实现配置模型、解析与校验，不增加 UI、Marketplace、Collector 或平台接入。

## 配置模型

User Profile 描述用户选择和个性化覆盖：

```json
{
  "id": "default",
  "characterId": "itachi",
  "behaviorMapping": {
    "SUCCESS": "celebrate",
    "ERROR": "danger"
  }
}
```

`UserProfileResolver` 接收 User Profile 和对应 Character Manifest，验证角色 id 一致，并确认每个覆盖 Action 都由角色声明。解析结果为只读 Runtime Configuration：`profileId`、`characterId` 和 `behaviorMapping`。

默认配置保留 Sasuke，确保现有 Runtime 启动行为不变。更换 `characterId` 即可在下一次 Runtime 创建时选择其他角色。

## Character Manifest

每个角色包的 `character.json` 现在包含：

- `id`：角色唯一标识。
- `name`：展示名称。
- `version`：角色清单版本。
- `actions`：角色支持的 Action id 数组。
- `assets`：Action 到资源文件的映射。
- `behaviorMapping`：角色自身的默认 Behavior Slot 映射。

示例：

```json
{
  "id": "example-pet",
  "name": "Example Pet",
  "version": "1.0.0",
  "actions": ["idle", "celebrate"],
  "behaviorMapping": {
    "IDLE": "idle",
    "SUCCESS": "celebrate"
  },
  "assets": {
    "idle": { "asset": "idle.png" },
    "celebrate": { "asset": "celebrate.png" }
  }
}
```

加载时会校验 `actions` 中每个能力都有 Asset 定义。Runtime 不猜测缺失资源。

## Action Resolution

ActionResolver 按以下固定顺序解析：

1. User Profile `behaviorMapping` 覆盖。
2. 当前 Character Manifest 的 `behaviorMapping`。
3. Runtime 默认 `behavior-mapping.json`。

解析出的 Action 必须存在于当前角色的 `actions` 和 `assets` 中。如果三层均不存在映射，抛出包含 Behavior Slot 的明确 `RangeError`；如果映射指向角色不支持的 Action，由 Character 能力校验抛出明确错误。

## 风险

- `PetManager.create` 现在要求提供 `profileUrl`，调用方必须显式指定 User Profile。
- Character Manifest 从旧的 Action 对象升级为 `actions` 能力数组与 `assets` 资源表，不保留旧结构兼容逻辑。
- User Profile 覆盖只在 Runtime 创建时解析；本阶段不实现运行时 Profile 编辑或持久化 UI。
- Viewer、PNG、Behavior 生命周期和 Event Contract 均未修改。

## 验证

- `npm run typecheck`：通过。
- `npm test`：27/27 通过。
- 覆盖 User Profile 选择 Itachi/Naruto、用户 Action 覆盖、角色默认优先级、Runtime 默认回退、无映射错误、Manifest 能力与 Asset 校验。
- Browser Demo：默认 User Profile 正确加载 Sasuke，初始状态为 `IDLE/idle`，图片正常显示，浏览器无 error 日志。
- `git diff --check`：通过。

## 结果

Companion Runtime 现在可从 User Profile 选择当前 Character，并通过 Character Manifest 加载角色能力。Action Resolution 具备明确的三层优先级和失败语义，同时保持现有 Runtime 默认行为不变。

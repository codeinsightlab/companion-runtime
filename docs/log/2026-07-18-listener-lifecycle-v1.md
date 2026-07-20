# Listener Lifecycle Reliability V1

## 背景

Listener Architecture V1/V2 已保持 `Listener → ExternalEvent → Mapping → Runtime` 分层，但架构审查发现长期运行可靠性不足：原生命令没有可取消 handle、异步采样可能重入、stop 后可能收到迟到结果、Manager 异常路径可能跳过其他资源释放，Electron 退出也没有等待 Listener 销毁完成。

本阶段只修改 `packages/listeners` 和 `apps/desktop` 生命周期集成。没有修改 Runtime Core、Behavior Slot、Action Resolver、Character、Profile 或 Viewer。

## 修改内容

### 生命周期状态

`Listener` 新增只读状态：

```text
CREATED → STARTED → STOPPED → DESTROYED
```

并暴露 `running`。新增 `BaseListener` 统一实现：

- 重复 `start()` 不创建重复资源。
- 重复 `stop()` 安全。
- `destroy()` 幂等，销毁后不能重新启动或注册 handler。
- handler Set 在 destroy 时统一清空。
- stop 失败时仍继续执行 destroy resource hook。

### 异步安全

`BaseListener.sampleExclusive()` 为每个 Listener 维护一个 in-flight Promise：

```text
timer
→ 检查 active generation
→ 检查是否存在 in-flight sample
→ collect
→ finally 释放锁
```

同一 Listener 同一时间最多执行一个采样任务。

每次 start/stop/destroy 都由 generation token 隔离。异步采样在 await 后必须再次确认 generation；stop 之后返回的旧结果不会更新 Memory/Battery 状态，也不会发布 ExternalEvent。

### ChildProcess 资源管理

`MacCommandRunner` 现在返回：

```ts
interface MacCommandExecution {
  result: Promise<string>;
  cancel(): void;
}
```

内部保存 `execFile()` 返回的 ChildProcess。Memory Pressure Adapter 和 Battery Provider 跟踪所有 active executions：

- 正常完成后从 Set 删除。
- stop 时调用 `cancel()`，执行 `child.kill()`。
- destroy 再次确保 cancel 并标记 Adapter/Provider 不可使用。

### ListenerManager 异常隔离

- `startAll()` 使用 `Promise.allSettled()`，一个 Listener 启动失败时仍尝试启动其他 Listener；最后聚合错误。
- `stopAll()` 对所有 Listener 尝试 stop。
- `destroyAll()` 不依赖 stopAll 成功：先对所有 Listener stop，再对所有 Listener destroy，最后清空注册表并聚合全部错误。
- Listener 自身 stop hook 失败时，BaseListener 仍继续执行 destroy hook。

### Desktop 退出流程

Electron Main Process 在第一次 `before-quit` 时阻止立即退出：

```text
before-quit
→ await listenerManager.destroyAll()
→ IPC 通知 Renderer runtime.stop()
→ 等待 runtime-stopped acknowledgement
→ app.quit()
```

Renderer 同时在 `beforeunload` 移除 External Event / Runtime Stop IPC handler，并再次幂等调用 `runtime.stop()`。Desktop 只编排生命周期，不接触 timer、ChildProcess 或 Listener handler 内部资源。

## 设计原因

- BaseListener 只治理生命周期和 ExternalEvent handler，不包含任何 Runtime 或 Pet 依赖。
- generation token 解决 stop/restart 与旧异步任务交叉问题。
- 单飞采样避免慢系统命令导致重叠 process 和乱序状态。
- 可取消 command execution 让 stop/destroy 的资源释放从接口承诺变为实际能力。
- all-settled Manager 确保单个 Listener 故障不阻断其他 Listener 的启动或释放。

## 风险

- `child.kill()` 请求终止进程，但操作系统仍可能存在极短的退出等待；Listener 会等待对应 Promise 收敛。
- Desktop Runtime stop acknowledgement 设置 2 秒兜底，Renderer 无响应时仍允许应用退出。
- ListenerManager 在部分 start 失败时保留成功启动的 Listener，并抛出 AggregateError；宿主必须记录错误，但可以继续使用健康 Listener。
- 当前 `onEvent()` 仍不提供单 handler unsubscribe，动态插件卸载不属于本阶段范围；destroy 会统一清空。

## 架构影响

数据架构没有变化：

```text
macOS
→ MacSystemListener / MacBatteryListener
→ ExternalEvent
→ Desktop ExternalEventMapper
→ CompanionEvent
→ Runtime
→ Current Character
→ Action / Asset
```

Listener 生产代码没有增加 PetManager、BehaviorEngine、ActionResolver、Character 或 Viewer 依赖。

## 验证

新增或增强测试覆盖：

- CREATED、STARTED、STOPPED、DESTROYED 状态。
- 重复 start 不重复采样或创建 timer。
- in-flight sample 阻止重入。
- collect 运行中 stop，迟到低电量结果不产生事件。
- Memory command handle cancel 被调用。
- destroy 后不能再次 start。
- start failure 不阻止健康 Listener 启动。
- Listener A destroy failure 不阻止 Listener B destroy。
- stop hook failure 时仍执行 resource destroy hook。

执行结果：

- `npm run typecheck`：通过。
- `npm test`：通过，48/48。
- `npm run desktop:build`：通过。
- `git diff --check`：通过。
- macOS 原生命令采样：通过；Memory 为 normal/free 78%，Battery 为 80%/未充电。
- Electron 正常 quit：最终 exit code 0；Listener destroy 与 Runtime stop acknowledgement 流程完成。启动时仍观察到既有 Chromium Service Worker database 清理日志，该日志不来自 Listener lifecycle。

## 结果

Listener 已具备统一状态、重复调用安全、异步单飞、generation 隔离、在途 ChildProcess 取消、Manager 异常隔离和等待式 Desktop 退出流程。

本阶段只增强长期运行可靠性，没有改变 Listener 的职责或 ExternalEvent 到 Runtime 的数据链路。

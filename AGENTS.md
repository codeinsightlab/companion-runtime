# Companion Runtime Agent Guidelines

## 1. 项目定位

Companion Runtime 是一个面向 AI 应用的通用伙伴运行时框架。

目标：

通过事件采集、行为决策、人格模型和角色资源，让不同 AI 工具拥有可扩展的数字伙伴能力。

项目不绑定具体宿主。

未来支持接入：

- Codex
- VS Code
- JetBrains
- 其他 AI Agent 工具


---

# 2. 核心设计原则


## 2.1 宿主与 Runtime 分离

Runtime 不允许直接依赖具体应用。


错误设计：

Host Application
    |
    v
Runtime
    |
    v
Codex


正确设计：

Host Application

    |

Adapter / Collector

    |

Companion Runtime

    |

Character Pack


Runtime 只负责：

- 标准事件处理
- 行为决策
- 状态管理
- 人格逻辑
- 角色资源加载


---

## 2.2 事件驱动

所有外部行为必须转换为统一 Event。


禁止：

业务代码直接调用：

PetViewer.show()


正确流程：

External Event

    |

Event Adapter

    |

Behavior Engine

    |

Runtime

    |

Viewer


---

## 2.3 单一职责


模块职责：

Collector：

负责获取外部信息。


Adapter：

负责转换外部事件。


Runtime：

负责伙伴行为决策。


Viewer：

负责展示。


Character Pack：

负责角色资源。


禁止跨层直接调用。


---

# 3. 技术规范


## 3.1 技术栈

当前技术：

- TypeScript
- ES Module
- Node.js
- JSON 配置驱动


禁止无明确原因引入大型依赖。


---

## 3.2 类型优先


公共结构必须定义类型。


包括：

- Event
- Character
- Action
- Collector
- Adapter


禁止公共代码大量使用 any。


---

# 4. 项目目录规范


packages/

    core/
    
        runtime/
    
        events/
    
        behavior/
    
        personality/
    
        types/


    collectors/


    adapters/


characters/


examples/


docs/


职责：

core：

核心运行能力。


collectors：

外部事件采集。


adapters：

宿主适配。


characters：

角色资源。


examples：

示例。


docs：

设计文档。


---

# 5. 修改规则


## 5.1 优先最小修改


修改前必须判断：

- 是否真的需要修改
- 是否可以通过配置解决
- 是否影响已有能力
- 是否破坏模块边界


禁止为了方便直接重构。


---

## 5.2 保持 V1 能力稳定


以下能力必须保持：

- Event Model
- Behavior Engine
- Personality Engine
- Character Pack
- Runtime 生命周期


修改这些模块时必须说明影响范围。


---

# 6. 测试要求


修改 Runtime 后必须执行：

npm test


涉及 TypeScript 类型修改：

执行：

npm run typecheck


涉及 Demo：

必须进行浏览器验证。


---

# 7. 开发日志要求


项目必须维护开发日志。


目录：

docs/log/


文件格式：

YYYY-MM-DD-主题.md


例如：

docs/log/2026-07-17-typescript-migration.md


日志必须包含：


## 背景

说明为什么进行修改。


## 修改内容

说明修改了什么。


## 设计原因

说明为什么采用当前方案。


## 风险

说明可能影响。


## 验证

说明执行了哪些测试。


## 结果

说明最终状态。


---

# 8. README 与文档语言规范


默认语言：

中文。


适用：

- README
- 架构文档
- 设计文档
- 更新记录


以下技术词保留英文：

- TypeScript
- JavaScript
- Event
- Adapter
- Runtime
- Collector
- Interface
- API
- JSON


不要强行翻译技术名称。


推荐：

Event Adapter 负责事件转换。


不推荐：

事件适配器层负责事件转换。


---

# 9. README 编写要求


README 必须包含：


## 项目介绍

说明项目目标。


## 架构说明

说明模块关系。


## 快速开始

说明运行方式。


## 扩展方式

说明如何增加：

- Collector
- Adapter
- Character Pack


## 版本记录

说明重要变化。


---

# 10. 文档原则


文档不能只记录代码修改。


必须说明：

- 为什么设计
- 解决什么问题
- 如何扩展
- 有什么限制


---

# 11. Agent 工作方式


执行任务前必须先分析：


1. 当前项目阶段

2. 修改范围

3. 潜在风险

4. 是否影响已有架构


需求不明确时：

不要直接实现。


先输出：

- 当前理解
- 风险
- 需要确认的问题


---

# 12. 代码审查重点


重点检查：


架构：

- 是否破坏模块边界


数据流：

- 输入输出是否明确


状态：

- 是否存在状态竞争


扩展性：

- 是否可以配置化


兼容性：

- 是否支持未来平台扩展


---

# 13. Git 规范


重要阶段必须创建 Tag。


例如：

v1.0.0


表示：

Companion Runtime V1 Freeze


实验功能：

使用 feature 分支。


禁止直接污染稳定版本。


---

# 14. 当前项目阶段


当前：

Companion Runtime V1 已完成。


包含：

- Runtime
- Behavior Engine
- Personality Engine
- Character Pack
- Browser Demo


下一阶段：

TypeScript Migration。


随后：

Event Collector Infrastructure。


---

# 15. 最重要原则


保持：

简单、稳定、可扩展。


优先：

清晰边界 > 复杂功能。


不要为了未来可能需求提前增加复杂度。
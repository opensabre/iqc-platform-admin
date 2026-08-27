# IQC 平台系统设计（SDD）

## 1. 文档状态

- 状态：Draft，作为后续开发的设计基线
- 日期：2026-08-22
- 产品需求来源：[产品需求文档](../../iqc-platform/PRD.md)
- 适用范围：IQC 独立前端、IQC 业务服务、OpenSabre 平台能力接入

本文档先解决系统边界和关键技术决策，再进入具体页面和接口开发。未决问题必须在对应阶段开始前完成决策，禁止通过临时实现替代产品/架构决策。IQC 后端必须基于 `opensabre-framework` 的 Starter 和公共 Web 能力开发，优先使用 OpenSabre 已有治理能力，不在 IQC 内复制审计、限次、计次、字典和错误码基础设施。

## 2. 目标与非目标

### 2.1 目标

一期完成通用文本会话质检闭环：

```text
上传 txt 会话 → 解析会话 → 配置 Agent/规则 → 创建手动任务
→ 异步执行规则和 LLM 质检 → 保存可解释结果 → 查询和导出结果
```

系统需要支持：

1. 独立 IQC 业务前端，采用 Ant Design Vue 风格。
2. 复用 OpenSabre 的登录、用户、组织、角色、菜单、资源权限和审计能力。
3. IQC 业务模型、任务执行、结果存储和 LLM 编排保持独立边界。
4. 质检结果记录 Agent、规则、模型配置等执行快照，确保可追溯。
5. 任务执行具备状态、进度、失败原因、重试和幂等语义。

### 2.2 一期非目标

以下能力不进入一期实现：

- 人工复核和申诉
- 语音转写、图片/附件识别
- 数据库同步和外部 API 接入
- 可视化 Agent 编排、多 Agent 协作
- 多租户隔离
- 自动规则推荐
- Token/模型调用成本统计
- 定时、抽样和事件触发任务

## 3. 现有能力与复用边界

### 3.1 必须复用的能力

| 能力 | 现有位置 | IQC 使用方式 |
| --- | --- | --- |
| OAuth2 登录与令牌 | `base-authorization`、`opensabre-admin/src/api/auth.ts` | IQC 前端使用独立 OAuth2 client，业务 API 通过 Bearer Token 访问 |
| 当前用户信息 | `base-organization/src/main/java/io/github/opensabre/organization/rest/UserController.java` | 获取用户、部门和组织上下文，不复制用户表 |
| 菜单/角色/资源权限 | `base-organization`、`opensabre-admin/src/store/modules/permission.ts` | IQC 菜单与 API 资源使用 `iqc` 应用归属和独立权限编码 |
| 审计日志 | `base-sysadmin`、`base-organization` 的审计注解/链路 | 记录 Agent、规则、任务、敏感会话查看和导出等操作 |
| 文件上传 | OpenSabre 前端上传能力和平台文件接口 | 一期只允许 txt，IQC 自己负责会话解析和导入结果 |
| 字典/基础配置 | `base-sysadmin` | 复用通用枚举展示能力；质检领域配置归 IQC 管理 |
| 审计 | Framework 审计能力、`base-sysadmin/docs/audit.md` | 记录 Agent、规则、任务、敏感会话查看和导出等操作 |
| 限次 | `opensabre-starter-governance`、`base-sysadmin/docs/ratelimit.md` | 上传、任务创建、任务执行、LLM 调用等场景通过 `GovernanceRateLimiter` 同步判定 |
| 计次 | `opensabre-starter-governance`、Usage Counter | 记录质检任务、会话处理、规则命中、LLM 成功/失败等使用量；同一业务的 ATTEMPT 与 SUCCESS/FAILURE 使用不同且稳定的 `recordId`，重试沿用同一事件语义 |
| 错误码 | Framework 错误码能力、`opensabre-framework/docs/modules/error-catalog.md` | Controller 和前端统一使用注册错误码，不重建错误码目录和响应协议 |
| Web/持久化/缓存 | `opensabre-web`、Framework persistence/cache starters | DTO、校验、异常、数据库和 Redis 接入遵循 Framework 约定 |

### 3.2 后端 Framework 约束

IQC 后端必须：

1. 使用 Java 21 和 OpenSabre Framework 当前发布基线的 Maven BOM/Starter，依赖版本由 Framework 统一管理。
2. 使用 `opensabre-web` 的请求模型、校验、异常和响应约定，禁止自定义第二套全局错误码格式。
3. 使用 Framework 的持久化、缓存、配置、注册和治理 Starter；业务模块只声明所需能力和配置。
4. 审计、限次、计次、字典和错误码优先寻找现有 Starter/API；确认缺口后才能扩展，并记录 ADR。
5. 不把 `base-sysadmin` 当作 IQC 业务依赖的内部 DAO 层，通过稳定 API/Starter 接入平台能力。

Framework 的模块事实源、自动配置和公共 API 以 `opensabre-framework/pom.xml`、各 Starter 源码和测试为准，不能只依据示例文档猜测 API。

### 3.3 不应复用或复制的能力

- 不把 Agent、规则、任务、结果表放进 `base-sysadmin`。
- 不复制 OpenSabre 用户、部门、角色和权限表。
- 不直接复制 `opensabre-admin` 的布局、页面组件和全局状态。
- 不让 IQC 前端依赖 `opensabre-admin` 的源码路径；如需共享组件，另建稳定的共享包或通过平台 API 复用。

## 4. 总体架构

```text
┌──────────────────────┐       OAuth2 / API       ┌────────────────────────┐
│ iqc-platform-admin   │ ───────────────────────▶ │ OpenSabre Gateway      │
│ Vue 3 + Ant Design   │                          └───────────┬────────────┘
└──────────┬───────────┘                                      │
           │ IQC API                                          │
           ▼                                                  ▼
┌──────────────────────┐                         ┌────────────────────────┐
│ iqc-platform-service │ ─────── platform ──────▶│ Authorization/Org/Admin │
│ SQA 业务服务          │                          │ 登录/组织/权限/审计      │
└──────┬───────────────┘                         └────────────────────────┘
       │
       ├── MySQL：会话、Agent、规则、任务、结果、版本快照
       ├── Redis：任务状态、幂等键、限流/短期缓存
       ├── Object Storage：原始 txt 和导出文件（具体存储待定）
       └── LLM Provider Adapter：模型供应商适配和结构化输出
```

### 4.1 前端部署边界

```text
admin.opensabre.xxx  → opensabre-admin
iqc.opensabre.xxx    → iqc-platform-admin
```

两个前端独立构建、独立发布、独立路由，但共享 OpenSabre 的认证和权限服务。IQC 不做第二套身份系统。

### 4.2 后端部署边界

一期建议建立独立 `iqc-platform` Spring Boot 服务，并基于 `opensabre-framework` 组合 Starter，而不是把业务代码加入 `base-sysadmin`。服务内部按领域模块拆分；当异步执行压力或 LLM 调用隔离需要时，再将执行 Worker 拆为独立进程。

```text
iqc-platform
├── conversation   会话导入、解析、查询
├── agent          Agent 配置、发布、测试
├── rule           规则配置、测试、执行
├── task           任务创建、状态、调度入口
├── inspection     质检编排和结果生成
├── result         结果查询、详情、导出
├── model          模型供应商配置和调用适配
└── shared         快照、权限、错误码、审计上下文
```

`shared` 只负责 IQC 领域适配，不自行实现平台横切能力：

```text
OpenSabre Framework / base-sysadmin
├── 审计：统一记录操作和敏感访问
├── 限次：同步放行判定
├── 计次：异步或 HTTP 使用量记录
├── 字典：声明注册、后端读取、前端 options 消费
└── 错误码：应用快照注册、统一错误响应
```

## 5. 前端架构

### 5.1 技术基线

- Vue 3 + TypeScript + Vite
- Ant Design Vue 作为 UI 组件和视觉基线
- Vue Router：路由和页面级权限
- Pinia：仅保存认证用户、权限、任务轮询等跨页面状态
- Axios：统一请求、Token、错误响应和登录失效处理
- 总览趋势：一期使用轻量 CSS 柱状图按路由懒加载；复杂分布图在引入 ECharts 前单独评估包体积和交互需求。

IQC 前端不得使用 Element Plus 作为业务 UI 基线；当前运行时依赖已统一为 `ant-design-vue` 和 `@ant-design/icons-vue`。

### 5.2 前后端接口基础约定

- API 错误响应使用 OpenSabre Framework 错误码目录和标准错误结构；业务错误码按 IQC 应用归属注册。
- 字典字段优先使用 Framework 字典声明/读取能力，前端通过 options API 按需加载并缓存。
- 操作日志只读页面通过网关访问 `base-sysadmin` 的 `/api/sysadmin/audit/log/conditions`；IQC 业务接口继续使用 Framework `@Audit` 注解产生审计记录，不复制审计表和 DAO。
- 模型设置页面仅返回启用状态、模型名和超时/重试等非敏感参数；API Key、完整模型端点和其他密钥不进入响应。
- 前端不自行实现限次和计次逻辑；限次由后端在请求入口判定，计次由后端在业务成功/失败节点记录。
- 审计信息由后端生成，前端只传递必要业务上下文，不允许前端伪造操作者或审计结论。
- 任务/LLM 调用的计次记录必须使用稳定 `recordId`，重试复用同一 ID，避免重复计量。
- 会话、质检任务、质检结果采用统一分页响应 `{ records, current, size, total }`，后端页大小限制为 100；配置类 Agent/规则列表当前保持小规模全量读取。

### 5.3 目录约定

```text
iqc-platform-admin/src
├── api/                 按领域划分的 HTTP API
├── components/          IQC 业务组件
├── composables/         上传、任务轮询、筛选等复用逻辑
├── layouts/              独立 IQC 工作台布局
├── router/               静态路由和权限守卫
├── store/                auth、permission、task 等 Pinia store
├── types/                API DTO 和页面模型
├── views/
│   ├── dashboard/
│   ├── conversations/
│   ├── tasks/
│   ├── results/
│   ├── agents/
│   ├── rules/
│   └── templates/
└── styles/               Ant Design token 覆盖和 IQC 主题变量
```

### 5.4 前端权限模型

前端权限只负责路由/菜单可见性和操作入口控制，后端 API 必须再次校验资源权限和数据范围。

IQC 左侧导航使用 `base-organization` 的 `/org/menu/user/{userId}` 授权菜单树动态渲染：`MENU` 节点提供名称、层级、路径和图标，`BUTTON` 节点继续承载操作权限。IQC 本地路由仍是静态注册的页面边界，动态菜单只会显示已注册路由；二级菜单支持点击展开/折叠，当前路由会自动展开所属分组，展开状态保存在浏览器本地。

建议权限编码：

```text
iqc:dashboard:view
iqc:conversation:view
iqc:conversation:upload
iqc:task:create
iqc:task:execute
iqc:task:cancel
iqc:result:view
iqc:result:export
iqc:agent:manage
iqc:rule:manage
iqc:model:manage
```

### 5.5 Ant Design 视觉约束

- 采用 Ant Design Vue 的 Layout、Menu、Form、Table、Drawer、Descriptions、Tag、Progress、Result 等基础组件。
- 页面优先使用“工作台 + 列表 + 详情抽屉/页面”的企业业务结构。
- 风险等级不能只依赖颜色，必须同时显示文本和图标/状态。
- 结果详情重点突出原文、证据片段、扣分项、AI 理由和建议。
- 配置页优先使用分步表单或分区表单，避免一屏堆叠所有 Agent 配置。

## 6. 领域模型

### 6.1 核心实体

| 实体 | 职责 | 一期关键字段 |
| --- | --- | --- |
| Conversation | 一次完整沟通记录及参与人/业务快照 | id、sourceType、externalId、employeeId、employeeName、employeeGroupId、customerExternalId、customerName、channel、startedTime、endedTime、businessType、businessNo、tagsJson、status |
| ConversationMessage | 会话中的一条消息 | conversationId、sequence、speakerRole、relativeTime、content、rawLine |
| Agent | 质检配置聚合根 | name、scenario、mode、status、publishedVersionId、scope |
| AgentVersion | Agent 执行快照来源 | agentId、rulesSnapshot、modelConfigSnapshot、scorePolicy、version、status |
| Rule | 可复用检测标准 | category、type（关键词/正则/结构化条件/LLM）、targetRole、expression、deduction、riskLevel、status |
| Task | 一次质检执行 | agentVersionId、scope、status、progress、successCount、failedCount、errorSummary |
| InspectionResult | 会话质检结果 | taskId、conversationId、score、riskLevel、deductions、evidence、reason、suggestions |
| ModelConfig | LLM 供应商配置 | provider、model、parameters、secretRef、status |

### 6.2 版本与快照原则

任务启动时必须固定 AgentVersion、Rule 版本和 ModelConfig 快照。后续修改配置不能改变已生成结果的解释依据。

一期即使暂不提供完整的版本管理页面，也必须保留执行快照字段；否则无法满足 PRD 的可追溯性要求。

## 7. 关键流程

### 7.1 会话导入

```text
填写参与人和业务元数据 → 上传 txt/ZIP → 校验文件类型/大小
→ 按行解析 → 生成 Conversation 元数据快照 + Message
→ 返回成功/失败行数和错误明细 → 允许修正后重新导入
```

解析格式以 PRD 第 6.5 节为准：`<序号>(<说话人角色>):[<相对时间>] <消息内容>`。

员工身份通过 `employeeId` 引用 OpenSabre 组织用户，不在 IQC 复制员工主数据；`employeeName` 是导入时历史快照。
客户通过 `customerExternalId` 引用 CRM 等上游系统，IQC 不建立第二套客户主数据；联系方式只接受脱敏值。
文件内容指纹同时纳入员工、客户、渠道和业务对象，防止不同参与人的相同模板文本被错误合并。

### 7.2 质检任务

```text
选择会话/范围和已发布 Agent
→ 创建任务（CREATED）
→ 校验快照并提交执行（QUEUED）
→ 规则预检（RUNNING）
→ LLM 判断和建议生成
→ 保存结果（SUCCEEDED / PARTIAL_FAILED / FAILED）
→ 更新统计和可查询索引
```

任务执行必须支持：

- 同一任务只能有一个有效执行实例。
- 单会话失败不应默认导致全部任务失败。
- 重试只能针对失败会话，且不能覆盖已成功结果。
- 取消任务后，Worker 不得继续写入新的结果。

### 7.3 结果查询

列表查询先应用数据范围，再应用业务筛选。详情页返回原始会话、命中证据、扣分明细、模型理由、建议和执行快照摘要。敏感内容访问和导出均写审计日志。

## 8. 数据与安全边界

- 组织/部门/人员 ID 来自 OpenSabre，IQC 只保存业务关联 ID 和必要快照，不复制组织主数据。
- IQC 通过 `opensabre-starter-rpc` 调用 `base-organization` 获取当前用户 `groupId`；会话和任务保存创建时的 `ownerGroupId`，查询按本人或同组放行，管理员按权限查看全部。
- 组织服务不可用或无法解析归属时只退化为本人范围，不扩大可见数据范围。
- 规则测试只执行本地确定性关键词/正则匹配，返回命中片段和可诊断错误；LLM 类型明确返回未支持，不伪装成命中或未命中。
- 会话原文视为敏感数据，详情接口必须受数据范围控制。
- 模型调用密钥不能返回前端；后端只返回供应商、模型和脱敏参数。
- 导出接口单独配置 `iqc:result:export` 权限，并记录导出人、范围、时间和条数。
- LLM 请求前需要明确脱敏策略；脱敏后的文本和原文的证据定位策略需在实现前确定。
- 所有写操作使用统一错误码和审计上下文，禁止在前端判断成功后伪造业务状态。

## 9. 可观测性与运维

一期至少记录：任务耗时、解析成功/失败数、规则执行耗时、LLM 调用失败原因、结果生成失败原因、重试次数和治理计次结果。日志中不得直接输出完整客户会话或模型密钥；限次拒绝、错误码和审计事件需要能通过关联 ID 追踪到具体请求/任务。

## 10. 关键未决决策

以下问题是开发前置条件：

1. OAuth2 独立客户端的 registration id、回调地址和 token 保存策略。
2. IQC 后端服务名称已定为 `iqc-platform`，默认端口 `8040`，网关路由前缀为 `/api`，数据库 schema 为 `iqc_platform`。
3. 原始 txt 的存储方式：数据库、服务器文件系统还是对象存储。
4. LLM 供应商首选、结构化输出协议、超时和降级策略。
5. Agent/规则已采用追加式版本历史；草稿版本发布后成为当前版本，任务创建时保存不可变版本 JSON 快照。
6. 员工/客户标识在 txt 中缺失时，业务关联信息由上传表单还是文件名提供。
7. 脱敏发生在 LLM 调用前还是只在展示/导出阶段，证据片段如何定位。
8. OpenSabre Framework 当前版本中 IQC 所需 Starter 的具体依赖坐标、配置键和接入样例，需要以源码/API 测试核对后冻结。

## 11. 架构验收标准

- IQC 前端可以独立执行 `dev` 和 `build`，不依赖 `opensabre-admin` 源码或构建产物。
- IQC 登录、用户信息、菜单/资源权限通过 OpenSabre 服务完成，不新增账号体系。
- IQC 业务数据表和 API 不进入 `base-sysadmin` 的领域模型。
- IQC 后端基于 `opensabre-framework` 开发，未重复实现审计、限次、计次、字典和错误码基础设施。
- 任务执行状态和结果快照可通过接口查询，刷新页面不会丢失任务状态。
- 任意结果可以定位到会话、Agent 版本、规则快照和模型配置摘要。
- 敏感会话详情、结果导出和关键配置变更均可在审计日志中追踪。
- 前端正式页面只使用 Ant Design Vue 组件体系，Element Plus 不再作为 IQC 运行时依赖。

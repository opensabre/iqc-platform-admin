# IQC PRD 前端实施进度

## I1 原始节点轨迹

在独立工作树 `iqc-platform-prd-ui` 内复用既有结果详情及 `result-hierarchy` 接口。新增 `RouteExecutionTrace.vue` 和 `route-execution-trace.ts`，仅以文本插值展示原因、事实值、证据和原始 JSON，不使用 `v-html`。

- `ResultHierarchy.conversation.executionTraceJson` 为可空字符串；历史记录为空显示未记录，未知 schema、无效 JSON 或不兼容事实字段显示不可用，不补造轨迹。
- 按 runIndex 分组，并保留每轮原始节点顺序。
- 分别展示 executed、SUCCESS/FAILED/SKIPPED、检测结果和事实状态。跳过节点的旧 NOT_HIT 不显示成执行产生的阴性。
- 展示规则版本、来源 engineVersion、快照摘要、开始时间、检测耗时、输入摘要、原因、统一 Findings 及两类原始输出。
- KNOWN 的类型和值匹配后才展示确定值；UNKNOWN/CONFLICT/ERROR/NOT_EVALUATED 明示无确定值。
- 同轮重复 nodeId、源节点与轮次不匹配、跳过节点携带 KNOWN 均拒绝展示。限制轨迹 5 MB、节点 10000，避免异常响应无限展开。
- 原始、评分、人工复核通过现有区域分别呈现；本增量不代表通用 Pipeline 编辑器上线。

## 验证与接口边界

未新增或执行测试。尝试 `npm run build`，当前工作树无依赖，失败于 `vue-tsc: command not found`；由主开发者准备依赖后统一构建。未修改锁文件，未提交。

后端需继续在当前会话结果事务内保存轨迹，且权限与原接口一致。当前轨迹没有独立模型部署不可变版本；Agent 快照摘要仅代表配置绑定。页面不能宣称模型可确定性重演。融合输出仍需要独立契约后再接入，不把原始节点 Finding 伪装成融合决策。

主开发集成验证：确认与 V2 发布工作树的 package.json/pnpm-lock.yaml 一致后复用其 node_modules，`npm run build` 成功，包含 vue-tsc 和 Vite；未执行测试或页面运行验收。未部署。

## I2 Pipeline 与政策重算结果界面

复用 RouteExecutionTrace 入口，识别 iqc-pipeline-execution-v1：校验节点状态、强类型事实、融合来源集合、评分状态与覆盖数量；显示每次节点尝试、失败/跳过、原始候选事实、融合原因、证据及评分贡献。未知 schema 和无效数据保持不可展示。沿用插值展示，不使用 HTML 注入。

结果详情新增独立 DecisionRevisionPanel。按权限加载已发布流水线及版本，支持分页选择、填写原因、创建重算及查看最近100条历史。失败保留同一 requestId 重试；切换结果和加载版本使用请求代次避免旧响应覆盖。原始机器评分、人工复核和政策重算分别保留。

Pipeline 结果使用现有会话评分字段，不落入旧消息得分分支。未完成的 Pipeline 人工复核/导出适配不显示对应操作，仍是后续待办。流水线配置编辑器、Finding目录页面、标签/独立风险政策重算界面及 I3–I7 未完成。

本批不新增或执行测试；构建和后端摘要编译记录由集成负责人补充。数据库迁移、浏览器联调与部署尚未进行。

本批 `npm run build` 成功（vue-tsc + Vite），未执行自动化测试、浏览器联调或部署。构建存在大分包提示，容量与加载优化仍需后续实测。临时依赖链接仅用于本地构建，未提交锁文件或 node_modules。

## Finding 语义目录配置

新增 /findings 页面，复用既有目录API与权限 composable：分页目录、强类型草稿表单、枚举值、默认严重度、证据约束、不可变发布版本及可用性。高/严重风险强制要求证据；稳定编码创建后锁定，已发布值类型锁定；更新携带 expectedRevision。未保存修改阻止发布，显式重新加载草稿须确认替换编辑内容。失败不推断保存或发布成功。

导航遵循组织菜单，V20261004_04将已有900150身份升级为MENU并保留角色关联，补齐详情/更新/启停/历史按钮权限。没有新增后端平行接口或事实表。菜单迁移与角色登录验收、浏览器联调、部署尚未进行。

Pipeline配置编辑器、丰富引擎及全闭环需求仍待开发，不能把语义目录页面视为整个I1/I2验收完成。

本批最终 `npm run build` 成功（vue-tsc+Vite），未新增或执行测试，未浏览器联调或部署。枚举值直接维护数组，保存时不拆分、不修剪现有值。另需V20261004_05补齐Pipeline版本查看等按钮权限，使已交付的政策版本选择可用。

## Pipeline 配置页面

新增 /pipelines，复用 PipelineAsset 接口、ConversationPicker、ReviewTaskSelector 和已有任务运行接口。目录、草稿修订维护、不可变历史、可用性、真实试跑及发布确认分别呈现。正式任务固定已发布版本，草稿试跑最大10会话；创建并不隐式执行。创建失败保存原 requestId 重试；执行请求未确认时先刷新状态。

PipelineReleaseEditor 提供顺序节点、发布规则/Agent/Finding引用、阶段/范围、前序依赖、条件、超时/重试、错误政策和禁用备用节点；高级输入映射/输出schema以JSON编辑。融合方式、优先级/覆盖映射/校准声明及Boolean业务映射、分值、否决和适用条件接入当前契约。变量JSON格式、引用版本、节点顺序及备用关系先在客户端校验，服务端仍是发布与执行权威。

现有组件未提供跨Rule/Agent/Finding的不可变版本选择，新增小型PublishedAssetReference复用三类现有查询API，保留已有引用并显示未加载状态。未新增后端平行资产/API。菜单V20261004_06保留900160及授权提升页面入口，已有按钮移入其下。

此页面仅覆盖当前顺序/条件/级联协议；不代表并行DAG、丰富引擎、维度评分、标签/风险政策或金标评测门禁已完成。当前引擎无已校准置信度，选择CONFIDENCE会保留不确定融合。浏览器/角色登录、迁移与运行验收、部署尚未进行；未执行测试。

本批最终npm run build成功（vue-tsc+Vite），未新增或运行测试。保留原始工作树修改，本批仅在独立工作树提交。未执行浏览器验收、数据库迁移或部署。

## Pipeline业务复核

结果页向Pipeline开放既有BusinessReviewPanel及任务人工复核ZIP，复用权限、轮次和原始/人工评分分列。原始机器CSV仍只对既有Scheme显示，Pipeline机器导出待接入。最终vue-tsc+Vite构建通过；未执行测试、浏览器联调或部署。

Pipeline原始机器业务CSV：既有导出按钮及接口对Pipeline开放，保持原始机器结果，与人工复核和政策重算分别导出/查看。最终vue-tsc+Vite通过；测试、浏览器联调与部署未进行。
# 开发者 B 校验集成（2026-10-04）

提取 B `af909ad` 的 `pipeline-execution-trace.ts` 源码校验：贡献分、否决汇总、待定结论及分数边界。B 的 CSV/复核页面功能由 A 现有实现覆盖，保留 A 的空业务项目保护。此次未新增或运行测试；`npm run build` 的 vue-tsc 与 Vite 成功，仍有既有大包提示。B 的测试结果只属于 B 分支，不作为本分支运行证明。报表与候选样本交付尚待适配集成。

## 2026-10-05 I4 Selector 资产管理与任务引用

沿用检测流水线入口和SelectorEditor，新增可复用SelectorAssetLibrary：分页目录、草稿创建/按修订更新、启停、不可变发布/历史、精确版本预览与选择。正式任务增加已发布Selector资产方式，只提交selectorId/versionNo，与内联定义/显式IDs互斥；原请求重试保持第一次提交内容不变。readonly/disabled与资源按钮分别控制，异步目录/历史/预览有代次保护，发布确认复核当前修订。

资产导入比较JSON数字token与JavaScript往返十进制语义；不能往返的配置使用原始JSON编辑/预览，API用互斥definitionJson字符串精确解析，避免只改名称也损失抽样比例/条件数值。不增加依赖、路由或另一套条件编辑器。配套后端DDL V1.1.43、权限V20261004_13。构建结果以交接为准；没有新增或运行测试、浏览器/角色/模型验收、迁移或部署。Cron/预算及完整PRD继续。


## 模型调用记录（2026-10-07）

复用模型配置页面加入 ModelGatewayCalls，管理员查看全局显式调用、响应/用量状态、真实Token、规则与逻辑记录。未确认与未知响应不冒充成功，用量缺失不显示0；Token按字符串显示保持整数精度。权限iqc:model-gateway:calls:view；没有新路由/菜单。请求代次与卸载保护，状态筛选/分页/刷新。没有新增或执行测试、浏览器/模型/角色或部署。

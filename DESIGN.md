# Design

## Source of truth
- Status: Active / 用户已授权按原型开发；按小特性 PR 交付。
- Last refreshed: 2026-11-05
- Primary product surfaces: 会话中心、任务创建、任务执行详情、质检与打标结果。
- 本轮用户明确需求优先于旧产品方案。此前模板优先、评测门禁、知识库等设计不作为本轮要求。
- Evidence reviewed: 前端 main `bf62916ee762f8ae91505fb2ca5f1b7fc1c9c1f7`；后端 main `bac0a1236de7472956876fa9e35012bcf7d87692`。2026-11-04 已 fetch 核对。
- Source paths: `src/router/index.ts`、`src/views/tasks/index.vue`、`src/components/ConversationPicker.vue`、`src/components/ConversationDetailDrawer.vue`、`src/components/LabelTreeSelector.vue`、`src/views/results/index.vue`、`src/api/tasks.ts`、`src/styles/`；后端 `InspectionTaskController`、`InspectionTaskService`、`InspectionExecutionService`、`RuleMatcher`、`DlsEngine`、`InspectionScoring`、`LabelResultService`。
- 线上状态：用户告知已恢复 main 对应镜像；本轮未登录服务器验证镜像 digest，也未操作部署。
- [当前数据筛选实现范围](docs/tasks/data-selection.md)；[可点击界面草图](docs/main-redesign/prototype.html)。

## Brand
- Personality: 清楚、克制、面向任务。
- Trust signals: 明确显示选中会话数、实际引擎顺序、失败记录、分数和标签来源。
- Avoid: 新术语堆叠、无需求的新入口、用代码量解释价值。

## Product goals
- Goals: 选择处理好的会话；质检/打标可单选或同时选择；每项操作独立配置多个引擎及参数、顺序；失败留痕且继续后续引擎；统一输出后生成评分/标签。
- Non-goals: 语音转换、知识库、风险中心、事实语义、评测/金标平台、自由 DAG 编排；小模型暂不实现。
- Success signals: 用户能在创建确认页看懂本次数据、两类操作、各自顺序和结果处理；运行结果与配置一致。

## Personas and jobs
- Primary personas: 创建和执行任务、查看结果的业务用户。
- User jobs: 选择数据、设置检测、执行、查看分数/标签和异常。
- Key contexts of use: 中文桌面管理后台；不要求用户理解内部协议或 JSON。

## Information architecture
- Primary navigation: 本轮工作入口为会话中心、任务中心、结果查看；配置复用已有规则、标签、模型配置页面。本提案不直接删除 main 的其他菜单。
- Core routes/screens: 复用 `/conversations/list`、`/tasks`、`/results`；任务创建为现有任务页中的分步表单，是否使用全页由评审确定；详情复用已有入口。
- 创建任务向导固定名称：1 数据筛选 → 2 任务类型 → 3 结果处理 → 4 任务确认。任务类型步骤承载质检/打标选择与各自引擎配置。
- Content hierarchy: 任务 → 会话 → 质检项/标签 → 引擎结果和证据。

## Design principles
- 数据、检测、结果处理三种职责分开，按实际操作顺序呈现。
- 质检和打标同级、独立；不能由一种操作的配置偷偷改变另一种。
- 引擎顺序可见且可调整；失败不是通过、无标签或零分。
- Tradeoffs: 数据选择包含批量选择、随机抽样、条件筛选；条件在创建时保存、运行时取数。选择方式与立即/定时执行分开，不能把条件筛选等同于定时任务。

## Visual language
- Color: 沿用 main 的 Ant Design Vue 与蓝灰后台风格；红/橙用于错误提示，不新增风险等级。
- Typography: 中文系统字体；正文 14px 左右，标题、辅助说明有明确层级。
- Spacing/layout rhythm: 8px 网格；表单分区 24px，卡片 16–24px 内边距。
- Shape/radius/elevation: 沿用已有主题 token 和 Ant 组件。
- Motion: 简单切换，无大幅动画。
- Imagery/iconography: 使用已有图标，不引入插画和新品牌体系。

## Components
- Existing components to reuse: ConversationPicker、ConversationDetailDrawer、LabelTreeSelector、Ant Steps/Form/Table/Tabs/Drawer；现有规则、规则集、模型和标签 API。
- 模拟执行：随机抽样、条件筛选均返回与批量选择同列同样式的会话表格；随机模式可切换本次抽样结果/全部匹配数据，标明抽样状态；条件模式展示全部匹配数据。分页不重新抽样，修改条件使旧列表失效；仅预览，不改为批量名单。
- 数据选择：批量选择（明确名单）、随机抽样（范围与数量）、条件筛选（创建存条件、运行时取数）。预览数量不得冒充最终取数结果。
- New/changed components: 改造任务向导；质检/打标独立的引擎卡片列表、参数面板、结果处理表单；在现有详情中展示引擎记录。
- 引擎卡片: 名称、类型、参数摘要、上移/下移、配置、移除；重复类型允许不同实例，实例 ID 唯一。
- 正则: 选现有规则、指定识别目标及命中值映射；不默认把“命中”理解成违规。
- DLS: 选现有会话规则及入口，具体参数按现有 DLS 能力暴露，不新增另一种规则语言。
- 大模型: 引用已有模型/Agent 能力配置，展示提示词、目标、温度及超时等支持字段；不在任务中录入凭证。
- 小模型: 草图可显示“后续支持”，不可添加；不创建空实现。
- 结果处理: 质检配置质检项与评分关系；打标配置标签目标、类型与值映射；全部引擎结果交给独立结果处理器，不在执行层覆盖或选优。
- Variants and states: 单质检、单打标、联合；引擎未配置/已配置/失败；评分待确认；标签未知/冲突。
- Token/component ownership: IQC 前端内维护，无通用组件库新增。

## Accessibility
- Target standard: 设计目标参考 WCAG 2.1 AA，实施时验证，不宣称当前已达标。
- Keyboard/focus behavior: 排序提供上移/下移按钮；不只支持拖拽。弹窗关闭恢复焦点。
- Contrast/readability: 不以颜色作为唯一状态信息。
- Screen-reader semantics: 表单使用标签，状态变化使用可读提示。
- Reduced motion and sensory considerations: 无闪烁；运行轮询不抢焦点。

## Responsive behavior
- Supported breakpoints/devices: 桌面 1280px 及以上优先；1024px 可用，窄屏单列。
- Layout adaptations: 双操作面板窄屏纵排；表格在自身容器内横向滚动。
- Touch/hover differences: 所有关键动作有可点击按钮，不依赖 hover。

## Interaction states
- Loading: 保留已选数据及填写内容，局部显示加载状态。
- Empty: 无会话说明去会话中心准备数据；无引擎显示“添加引擎”。
- Error: 定位到具体字段；执行错误显示具体引擎、原因及后续执行状态。
- Success: 提交成功后进入真实任务详情；离线草图只显示模拟结果。
- Disabled: 必填配置未完成不允许提交，解释原因；未选操作不显示对应必填。
- Offline/slow network: 提交结果不确定保留请求标识，通过同一请求确认，不重复创建。

## Content voice
- Tone: 直接、使用用户能理解的业务名称。
- Terminology: 会话、任务、质检、打标、引擎、执行顺序、评分、标签、失败记录。
- Microcopy rules: 不使用“事实语义”“风险闭环”“发布门禁”解释本轮功能。

## Implementation constraints
- Framework/styling system: 复用 Vue 3 + TypeScript + Ant Design Vue，后端复用现有 Spring Boot/MyBatis-Plus 和执行器。
- Design-token constraints: 不引入新的样式框架或组件系统。
- Performance constraints: 会话和结果分页；会话数量上限依当前可验证能力确定，不宣称百万规模。
- Compatibility constraints: 新任务格式显式版本化；旧任务仍可查看、执行既有入口。主分支数据库迁移保持原样。
- Approval boundary: 已获 IQC 任务模块业务实现授权；任何基础服务/框架变更另行提出具体方案并获人工允许。
- Test/screenshot expectations: 本轮验证草图交互与文档一致；后续按每个小功能做有效测试及真实链路验收。

## Open questions
- 已确认：多引擎结果全部记录，汇总到专门的结果处理模块；执行层不覆盖或裁决。结果处理模块具体评分和标签汇总规则需显式配置。
- [ ] 引擎输入是否需要消费上游输出？建议首期各读完整会话，顺序仅代表执行次序，不暗含数据过滤。
- [ ] 首期评分方式、分值与及格线；草图示例分值不作为业务默认。
- 已确认：随机抽样、条件筛选均在执行时确定数据；不足时有多少处理多少。模拟执行不固定正式名单。
- [ ] 条件取数无匹配、上限和稳定排序；定时/立即执行是独立维度，是否调整原有入口另行审阅。

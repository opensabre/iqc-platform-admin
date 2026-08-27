# Design

## Source of truth

- Status: Draft
- Last refreshed: 2026-08-26
- Primary product surfaces: IQC 质检工作台、会话/任务/结果管理、Agent 配置
- Evidence reviewed: `iqc-platform/PRD.md`、`opensabre-admin/` 现有 Vue 3 工程结构

## Brand

- Personality: 专业、可信、清晰，突出质量改进而非监控压迫感。
- Trust signals: 展示证据片段、扣分原因、AI 判断理由和任务进度。
- Avoid: 复杂的开发后台视觉、信息过密、只强调风险颜色的界面。

## Product goals

- Goals: 让质检管理员高效配置和执行任务，让主管快速发现问题，让员工看懂并改进结果。
- Non-goals: 一期不建设人工复核、申诉、多渠道接入和可视化编排。
- Success signals: 用户能完成“上传会话—执行任务—查看可解释结果”的闭环。

## Personas and jobs

- Primary personas: 质检管理员、业务主管、客服/销售人员、系统管理员。
- User jobs: 配置质检标准、执行质检、定位高风险会话、理解扣分原因并改进。
- Key contexts of use: 桌面端管理后台，支持日常列表操作和会话详情阅读。

## Information architecture

- Primary navigation: 睿检总览、会话中心、质检任务、质检结果、智能体管理（智能体列表、模型、MCP、Skill）、规则中心、模板中心。
- Core routes/screens: `/dashboard`、`/conversations`、`/tasks`、`/results`、`/agents`、`/agent-models`、`/agent-mcps`、`/agent-skills`、`/rules`、`/templates`。
- Content hierarchy: 先看业务指标和任务状态，再进入列表，最后查看会话证据和改进建议。

## Design principles

- 证据优先：结论必须能回到原始会话和命中片段。
- 任务导向：突出待处理任务、风险和下一步行动。
- 渐进披露：列表保持清晰，复杂配置和判断细节进入详情页。
- 违规可解释：结果详情先展示未满足项和总扣分，再逐项展示规则名称、扣分点、风险、一票否决、证据、判断理由和改进建议；技术快照折叠到追溯区域。
- Tradeoffs: 一期直接采用 Ant Design Vue，优先验证业务闭环；不引入 Element Plus，避免与既定 IQC 视觉基线产生双组件体系。

## Visual language

- Color: 以商务深蓝、石墨灰和冷白为主色，使用低饱和蓝色作为 IQC 品牌和主要行动色；风险使用橙/红分级，绿色仅用于成功状态。
- Typography: 中文桌面端优先，遵循 Ant Design Typography 层级，正文保证清晰阅读。
- Spacing/layout rhythm: 遵循 Ant Design 4/8 间距节奏，页面保持清晰分区和留白。
- Shape/radius/elevation: 使用 Ant Design 的控件圆角、边框和阴影，避免自建平行控件体系。
- Motion: 使用 Ant Design 反馈组件和克制的任务状态动画。
- Imagery/iconography: 使用 `@ant-design/icons-vue` 和语义明确的图标，不依赖大幅插画表达核心信息。

## Components

- Existing components to reuse: Ant Design Vue、OpenSabre 的认证/权限服务和接口约定；不直接依赖 `opensabre-admin` 内部页面组件。
- New/changed components: IQC 工作台布局、会话消息时间线、证据片段高亮、质检风险标签、结构化违规与扣分详情、Agent 四步创建/版本配置向导、质检任务四步创建向导。
- Agent 向导约束: 依次完成基本信息、大模型、MCP/Skill、提示词与确认；资产选择必须引用模型/MCP/Skill 管理中的已启用实体，并提供不中断当前表单的管理入口。
- 任务向导约束: 依次完成任务信息、数据范围、质检方案、执行参数与确认；直接引用已导入会话、已发布 Agent 和已发布规则，批量与定时任务共享同一向导骨架。
- Variants and states: loading、empty、error、running、success、failed、high-risk。
- Token/component ownership: IQC 前端维护业务组件和主题变量，平台通用能力由 OpenSabre 服务提供。

## Accessibility

- Target standard: 桌面端键盘可操作，颜色不是唯一的信息表达方式。
- Keyboard/focus behavior: 表单、表格操作、详情抽屉保持可见焦点。
- Contrast/readability: 正文和风险标签满足可读对比度。
- Screen-reader semantics: 状态标签和按钮提供文本语义。
- Reduced motion and sensory considerations: 任务轮询不使用强烈闪烁。

## Responsive behavior

- Supported breakpoints/devices: 一期优先 1280px 以上桌面端，兼容 1024px 宽度。
- Layout adaptations: 小屏时侧栏收起，详情内容改为单列。
- Touch/hover differences: 核心操作不依赖 hover，表格操作提供明确按钮。

## Interaction states

- Loading: 列表和任务详情显示骨架或进度状态。
- Empty: 说明下一步动作，例如“上传会话”或“创建任务”。
- Error: 告知失败原因并提供重试入口。
- Success: 明确提示任务提交、配置保存等结果。
- Disabled: 未发布 Agent、无权限或任务运行中时禁用冲突操作。
- Offline/slow network, if applicable: 保留任务状态，避免重复提交。

## Content voice

- Tone: 简洁、客观、可执行。
- Terminology: 统一使用 Agent、规则、会话、任务、质检结果、证据片段。
- Microcopy rules: 说明“为什么”和“下一步做什么”，避免只显示技术错误码。

## Implementation constraints

- Framework/styling system: Vue 3 + Vite + TypeScript + Ant Design Vue。
- Design-token constraints: 复用 Ant Design Vue 基础交互，通过主题 token 集中维护 IQC 品牌变量。
- Performance constraints: 质检结果和会话详情按路由懒加载；任务状态采用可控轮询。
- Compatibility constraints: 通过 OAuth2 接入 OpenSabre，业务 API 与平台认证解耦。
- Test/screenshot expectations: 完成核心页面后补充路由、权限和关键交互测试。

## Open questions

- [ ] IQC 是否需要与 OpenSabre 使用同一域名下的 SSO，还是采用独立子域名？
- [ ] 一线客服/销售是否需要移动端或窄屏适配？
- [ ] IQC 是否需要独立品牌色和 Logo 资源？

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

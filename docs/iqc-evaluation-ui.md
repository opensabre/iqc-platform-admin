# 固定数据集评测前端

本批页面 `/evaluation/tasks` 复用原 Task 分页、执行历史与任务执行入口，创建调用 `/iqc/evaluation/tasks`。原任务列表对 `PIPELINE_EVALUATION` 跳到评测页，避免请求生产结果/标签接口。

创建复用分页 Dataset/Pipeline 资产目录及精确版本列表。数据集使用冻结版本；目标选择已发布版本或所选 Pipeline 当前已保存草稿修订，服务端再次检查精确修订。分页目录只显示当前页可用资产；资产读权限不足时明确显示错误。相同参数失败重试保留请求标识，参数变更生成新标识。

报告按选定执行轮次展示，缺失样本保留分母；complete 仅表示终态产物齐全。事实精确率、召回/F1、覆盖/值/证据准确率，分数 MAE/覆盖、高风险召回，回归通过率及耗时分位数/失败率直接使用后端数值；无分母保持未定义。标签输出未接入。详情包含按事实计数、缺失样本及重试继承来源，产物分页仅显示选定 EID 自身行；精确轨迹独立按权限读取。

任务尚未执行时不请求结果与报告；切任务、执行轮次、产物分页及详情均保留请求失效保护。页面未实现 Benchmark、发布门禁或模型/成本指标。

验证：执行 vue-tsc + Vite 生产构建；没有新增或执行测试，没有运行数据库迁移、浏览器或角色验收。构建包含同工作树其他开发者的候选样本 UI；各自提交所属文件。现有大 chunk 提示仍在。

结构化输出指标补充：展示server计数的逻辑LLM调用valid/total、未测量attempt与successRate，无LLM明确不适用。旧轨迹、超时丢失计数与无分母不合成成功率；不是实际网络调用成功率。Benchmark同范围差值保持null语义。最新vue-tsc+Vite构建成功，未新增或执行测试。

## 模型一致性浏览器检查（2026-10-22）

本机预览 e7b6837 构建产物，专用 Playwright 会话 iqc-b-consistency，以 page.route 注入身份、菜单、任务、报告和一致性响应。未填写参考身份时按钮禁用；填写后真实浏览器请求：
`GET /api/iqc/evaluation/tasks/selected-task/consistency?executionId=selected-execution&referenceTaskId=reference-task&referenceExecutionId=prior-execution`。

受控返回 expected2/comparable0/agreement null/SAME_ARTIFACT1/UNSUCCESSFUL_NODE1，页面显示覆盖率0/2、一致率“未测量 · 0/0”、重复引用和节点未成功；修改参考EID后旧指标立即清除。快照和请求记录存本机忽略目录 output/playwright/consistency-{unmeasured,cleared}.yml、consistency-network.txt。初始无身份服务时跳登录，preview的代理目标未配置；注入后检查属于真实浏览器+网络夹具，不是后端SQL/PDP端到端。CLI网络命令已按当前版本使用 requests。

检查发现页头仍称发布门禁尚未接入，已改为“流水线发布仍须通过独立的发布门禁”，与后端现状和报告完整性提示一致。该修订仅文案；浏览器证据对应修订前构建。专用浏览器已关闭，43179 preview原48391主动Ctrl-C终态exit1，无发布部署。

### 冻结标签投影准确率

报告沿用businessMetrics.labelAccuracy/comparableLabels/labelGold，展示准确率与“可比 / Gold”数量；零可比显示原有未测量文案。后端只比较冻结绑定地址对应的已知合法投影，不把旧名称键、缺输出或未知状态计为正确值。该显示依赖对应后端标签指标版本；本轮没有切换默认release协议。

验证：原64670 `pnpm type-check`终态0，日志`/tmp/iqc-b-label-ui-typecheck.log`；Node22.22.2/pnpm8.7.6与声明版本存在既有提示。仅类型检查与diff检查，不代表此次标签展示已经真实浏览器或后端SQL整链验证。

## 2026-10-23 会话引用来源校验

原评测报告增加CitationGroundingPanel，只展示可选iqc-citation-grounding-report-v1协议。覆盖分母为冻结样本×LLM节点，区分完整/部分/未测量；引用错误率仅针对已观测引用，零分母显示未测量。展示坏容器及无效诊断，不将缺失产物或旧轨迹填零。没有额外请求/权限/原文，沿用父报告授权和清理流程。新批次仅构建检查，无新增/运行测试或浏览器证明，完整事实幻觉指标仍未完成。

Gold编辑器高级标签期望提示已同步为绑定地址，给出`/labelId/valueCode`例子及JSON Pointer转义说明，提醒冻结绑定与旧名称键缺测语义。原63938 `pnpm type-check`终态0，日志`/tmp/iqc-b-label-gold-ui.log`；仅文案和类型检查，无新增浏览器证据。

## 2026-10-23 任务单会话费用入口

复用ModelGatewayCalls及任务调用列表API添加conversationId可选筛选和生效范围提示，保留原Task/EID/状态条件、未知费用与按币种分组。切换任务清筛选，原generation/卸载/授权流程继续保护旧响应；全执行范围包括重试，旧未关联记录不猜测归属，无记录不等于零成本。本批构建检查，无新增/运行测试或真实浏览器证据，详情见后端iqc-model-gateway.md。

## 2026-10-23 上游声明消息完整率

原报告页接可选iqc-input-completeness-report-v1，展示测量覆盖、数量完整率、消息覆盖、不足/超出/坏声明与缺测，空分母显示未测量。明确数量相等不证明内容无遗漏/清单真实，按冻结输入而非执行成功样本统计。API接入页说明三个原businessFields标量，无默认示例声明自动注入用户数据；无新请求/权限/来源编辑入口。当前仅构建，真实数据/角色/browser待独立验证，后端契约见iqc-input-completeness.md。

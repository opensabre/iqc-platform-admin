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

### B 2026-10-23 统一report路由真实浏览器受控响应

B前端快进至固定A06d85be（含标签显示/Gold地址/引用报告/会话费用），原18257 `pnpm build`终态0，`/tmp/iqc-b-shared-report-ui-build.log`，包含vue-tsc与Vite构建（52.43秒/既有chunk提示）。专用preview127.0.0.1:43179 + Playwright iqc-b-shared-report：空参考身份按钮禁用，普通报告标签显示`100.00% · 可比 1 / Gold 2`；填双方参考身份点击比较，实际网络GET `/api/iqc/evaluation/tasks/selected-task/report?executionId=selected-execution&referenceTaskId=reference-task&referenceExecutionId=prior-execution`。受控零可比响应展示`0 / 2`覆盖与`未测量 · 0 / 0`一致率及排除原因；修改参考EID为changed-execution清旧比较且保留普通标签报告。

本机忽略证据：`output/playwright/shared-report-unmeasured.yml`、`shared-report-cleared.yml`、`shared-report-network.txt`。合成身份/菜单/报告的真实浏览器网络夹具，不是SQL后端/PDP/供应商连接；初始未注入身份时proxy target缺失500不计成功认证。原专用browser已close终态0，preview25249主动Ctrl-C终态1（正常清理），无残留验证进程。本轮只同步与验证，无新增生产UI改动。

### B 2026-10-23 单会话费用组件交互与迟到响应

原ModelGatewayCalls.vue新增组件验证（生产代码不变）：会话输入去空格后精确传task/EID/status/page/size/conversation，清除恢复整个任务；长小数字符串保持原文、未知费用计数展示；旧会话响应迟到不覆盖新会话汇总；切任务清空会话并恢复全部重试范围且忽略旧task响应；非法ID不发新请求，撤销权限后迟到结果不可见。

原7546四项通过但存在未注册UI组件桩警告；补桩后原25515 terminal0，`/tmp/iqc-b-conversation-cost-ui-test-final.log`，4项通过无组件警告；原86462 `pnpm type-check` terminal0，`/tmp/iqc-b-conversation-cost-ui-typecheck.log`，git diff --check通过。真实Vue响应式/组件逻辑，API与权限为桩，非浏览器/PDP/SQL后端整链。本轮仅新增测试，现有生产build证据仍归06d85be，不外推后续A完整率页面。

## 2026-10-23 上游声明消息完整率

原报告页接可选iqc-input-completeness-report-v1，展示测量覆盖、数量完整率、消息覆盖、不足/超出/坏声明与缺测，空分母显示未测量。明确数量相等不证明内容无遗漏/清单真实，按冻结输入而非执行成功样本统计。API接入页说明三个原businessFields标量，无默认示例声明自动注入用户数据；无新请求/权限/来源编辑入口。当前仅构建，真实数据/角色/browser待独立验证，后端契约见iqc-input-completeness.md。

### B 2026-10-23 完整率页面与撤权迟到响应修复

固定A007b09d合入B为5a548b2；保留原费用组件验证和A完整率说明。新增evaluation-tasks/index.spec.ts验证实际页面：无产物仍显示冻结输入覆盖、混合缺失/超额计数、空分母显示未测量、历史无字段隐藏卡片、切任务丢弃旧响应。原82767的权限用例实证撤权再授权后旧在途报告重新显示，修复原页面为独立报告请求代次、撤权清空报告并作废在途响应、展示实时检查权限；恢复权限须刷新当前执行，未增加自动请求或新协议。

原82925 terminal0，页面5项及原费用4项共9项通过，无组件注册警告，日志`/tmp/iqc-b-input-completeness-ui-final.log`。原10587 `pnpm build` terminal0，含vue-tsc与Vite构建（1m14s），日志`/tmp/iqc-b-input-completeness-ui-build.log`；现有Node/pnpm声明差异及chunk提示仍存在。实际Vue/API和权限桩，未运行本轮真实浏览器/PDP/SQL整链；此前受控浏览器证据仍只归原06d85be。未推送或部署。

### B 2026-10-23 引用来源卡片独立验证

新增CitationGroundingPanel.spec.ts两项实际组件测试：完整测量覆盖25%、部分/未测量、无效诊断与已观测引用错误率50%分别展示；空分母显示未测量，无LLM/无样本显示不适用，未知协议和缺字段隐藏卡片。提示明确引用匹配不证明事实判断正确。原23888 terminal0，`/tmp/iqc-b-citation-ui.log`，含原页面权限回归共7项通过；原94676 type-check terminal0，`/tmp/iqc-b-citation-ui-typecheck.log`。生产UI未改，生产构建沿9fd3684的10587证据；本轮不是浏览器/PDP/后端整链验证，无推送或部署。

Benchmark原面板可选附带来源执行已记录调用与费用（task:model-calls:view），沿原getBenchmarkReport开关；默认省略，报告缺modelUsage不影响原质量表。两侧显示bound/expected/unbound、调用/已知未知数量、已测调用耗时和分币种小计，金额/账本计数按精确字符串展示，不转Number求和或自动推断胜者。切换开关/执行清报告，调用权限撤销也清报告与开关。文案明确非当前轮次/生命周期总账、无记录不等于零成本，重试继承按原样本来源EID。

来源执行RunUsage可选tokens在同一Benchmark面板显示输入/输出/总量各自已知小计及已知/未知调用；小计字符串不转Number，无贡献显示未测量而非0，不相互推算总数。旧报告无tokens则不显示此表，仍沿原调用统计权限/来源范围/迟到响应清理机制。

业务质量报告原可选调用卡补供应商已报告输入/输出/总Token，各自已知/未知调用和nullable小计，复用共享CallTokenSummary/CallLatencySummary类型，不使用Number转换大数。旧无tokens保留原成本/耗时展示，原includeModelUsage与权限及切换清理机制不变；不增加模型调用或重新查询账本。

### 对照报告撤权清理

对照报告查看权限撤销时，页面沿原请求代次机制同步清除已显示报告及其完整JSON，并丢弃在途报告响应。模型调用权限撤销仍清除可选用量及报告；切换执行轮次继续使旧结果失效。前端清理不替代服务端每次请求的当前授权校验。

业务评分报告同样在报表权限撤销时清除结果并使在途请求失效；权限恢复只恢复查询入口，必须显式重新查询，不能重现撤权前或撤权期间返回的数据。用户选择的任务和运行口径保留。

# 动作策略兼容
现有PipelineReleaseEditor重新拼装release，会丢弃新的actionPolicy字段。复用原编辑器，在加载/保存时保留策略并展示动作标识/类型/失败处理，不新建页面、权限或策略副本。该批只读展示，配置表单和动作执行尚未开放；后端仍负责条件、声明引用和发布快照校验。

摘要展示明确适配版本，早期v1缺少字段固定显示1；编辑其他流水线配置保留该字段，不采用最新版本推断。

# 结果动作记录
现有结果详情没有动作状态展示；ActionHistoryPanel复用该页、既有permission composable与Ant表格，不新增中心页面或来源数据副本。新只读GET与history:view显示最多100条状态/尝试/UTC时间/回执及输出引用/原因代码，无冻结内容或身份快照。结果/权限变化和卸载清空旧响应，加载失败显式错误，手动刷新不自动轮询；未开放发送/恢复，不代表生产调用链或全部动作类型已可执行。

## 结果动作检查请求入口
结果详情ActionHistoryPanel增加iqc:action:enqueue按钮，沿既有权限composable；还须有history:view才能进入动作面板。POST /iqc/conversation-results/{id}/actions/enqueue仅请求后台发现，DISCOVERY_REQUESTED提示稍后刷新，ALREADY_DISCOVERED只显示完成检查；不会显示“发送成功”。请求失败明确显示错误，点击期间防重复提交，切换结果/权限变化/卸载后废弃旧响应。请求成功后沿已有记录查询刷新，不自动轮询。
后端要求开关启用、生产冻结策略、来源创建者及稳定身份匹配，广泛结果读权限不等于能替创建者执行动作。组织DML_29为真实API注册资源，默认IQC_ADMIN/QUALITY_MANAGER。尚未运行浏览器/接口/迁移或动作网络验收。
动作记录nextAttemptAtUtc列调整为“下次检查/重试 UTC”：PENDING可以表示等待任务/固定复核轮次等前置条件，attempt0不代表发出过动作。候选动作完成只表示实际候选创建，后续标注/金标审核沿原流程。

Finding标签政策labelPolicy作为可选发布字段沿PipelineReleaseEditor深拷贝保留并只读显示绑定Finding、标签ID/版本和值编码，编辑评分/节点时不丢弃标签政策。目录和类型由后端发布冻结，未提供标签政策配置表单，也不表示UPDATE_LABEL已经执行。
## UNKNOWN 持久产物人工核对（B 独立分支）

复用结果详情 ActionHistoryPanel，新增独立 `iqc:action:reconcile` 操作；仍须先拥有 history:view。仅对三类已有本地只读核对能力（SAVE_RESULT、CREATE_REVIEW、ADD_TO_EVALUATION_CANDIDATE）的 REQUIRES_RECONCILIATION/UNKNOWN 行显示按钮。旧后端未返回version或版本超出JS安全整数时仍可阅读记录，不提供无法精确条件提交的按钮。

弹窗要求非空≤1000字原因，以当前结果ID、动作账本ID、观察version和原因调用后端；不提交产物引用或成功声明。提交中禁用重复操作和关闭弹窗，结果/权限变化或卸载废弃旧响应。响应须匹配动作ID与已知状态；CONFIRMED提示真实产物完成，UNCONFIRMED提示继续等待核对，STALE_OBSERVATION要求查看刷新后的记录。重新查询状态而不在本地伪造COMPLETE；请求异常/外来回执仅提示未确认，保留人工原因，不自动再次请求。后端仍负责原负责人稳定身份、冻结请求及CAS围栏。

验证：类型检查87951 exit0；定向89094 exit0，9项通过，覆盖权限、旧版本读取、远端/不安全版本不开放、原因、防重复、真实刷新、结果切换、撤权及外来回执。生产构建58003 exit0，4018 modules；完整最终64297 exit0，28文件180项通过。日志 `/private/tmp/iqc-b-reconcile-ui-{types,tests,build,final-tests}.log`。

首次完整测试1失败/179通过；A未改动4ba1d4f基线上同一导航测试94514 exit1（1失败/6通过），夹具空业务项与既有页面businessItems.length展示条件不符。仅在B导航测试补真实质检项并隔离无关动作面板，保留来源版本断言和页面生产逻辑；最终完整通过不包含失败轮。构建仍有已有Node/pnpm版本及chunk大小提示。

基线A UI4ba1d4f，B独立树feature/iqc-prd-b-action-ui；配套后端b2c3fa6与权限084d1ae均是独立提交。本轮组件测试使用原Vue/DOM测试方式和Ant组件stub；未宣称真实浏览器、四角色登录、HTTP/网关授权、生产动作链或部署通过。未修改A树/后端/组织/framework/gateway，未推送或合入A；完整尝试审计、阻塞恢复、远端适配与PRD其他能力继续。

## 2026-10-11：动作状态历史

原ActionHistoryPanel增加“查看历史”，复用history:view权限；单动作白名单事件、50条分页与十进制字符串游标。显示实际UTC时间/状态/回执引用和旧历史缺口，不提供发送/重试。关闭/刷新/换结果/撤权/卸载清空历史和标题，废弃响应，非法分页只提示错误。组件14、完整185及最终构建通过；真实浏览器仅分页等部分通过，最后复跑审批审核因额度失败未执行。边界/复现见[历史浏览器说明](iqc-action-state-history-browser.md)。

## 成功核对原因展示（2026-10-11）

状态历史事件可选reconciliationReason，旧后端缺失该字段仍可读取；值存在时要求字符串且不超过1000字符，并按普通文本显示。只代表已成功提交的核对原因，不表示未确认请求已持久审计。14项组件测试及vue-tsc/Vite构建通过，包括HTML样式原因不生成标签；本轮真实浏览器未运行。后端需先迁移V1.1.65，真实SQL事务及独立审查仍待验收。

## 人工核对尝试

原动作表增加“查看核对尝试”，复用history:view权限和原GET可选includeAttempts，按开始时间/请求ID独立分页，版本使用字符串。展示规范化原因、操作人、观察/确认版本及UTC时间；STARTED显示“核对结果尚未持久确认”，明确不能据此判断动作失败或重发。空列表提醒较早请求可能未保留。

原因只按文本显示。每页最多50条，时间支持后端省略零毫秒的LocalDateTime格式，分页规范化为完整毫秒游标；同时间ID严格下降，不接受重复/错误排序或无效终态。加载防重复，关闭/刷新/换结果/撤销history权限/卸载废弃旧响应。旧后端缺少attempts显示读取失败，不伪造空历史。真实浏览器和组织登录验收尚未执行。

本轮60669 exit0，19项组件测试随后vue-tsc/Vite构建通过；全量98634 exit0，28文件190项通过。构建原Node/pnpm engine及chunk警告保留。仅本地组件/构建证据，不宣称真实SQL、四角色登录、浏览器或独立审查通过。

## A/B 集成现状（2026-10-11）
以上各节保留当时验证范围。当前分支已集成标签绑定与四类实际 v1 动作的配置编辑、递归动作条件及重试表单，也集成 B a81ecaf 的 UNKNOWN 核对、持久历史/原因/核对尝试和阻塞恢复页面。核对按钮仍仅覆盖原三类实际支持产物，标签 UNKNOWN 尚无 reconcile 实现，不显示可确认按钮；恢复不发送动作。配套后端 b6a6381 和权限 af4bc7a 已本地合并。尚未执行整合后浏览器、实际用户授权或生产链路验收，不以 B 原分支组件回归代替本分支验证。

标签持久产物核对已接入同一面板类型白名单，需配套后端 FindingLabelActionAdapter.reconcile；仅 UNKNOWN 原观察版本+原因请求，依旧不提交产物或成功声明，不发送。旧目录或产物缺失保持未确认，实际后端证明决定是否可确认；浏览器/真实标签核对验收尚待。

风险事件 v1 配置表单新增 category/title/description（64/128/1000），保存拒绝额外字段及非法文本，初始条件显式风险不低于LOW。等级/证据由实际生产结果决定，不提供自填；事件创建不表示已处置。原核对面板增加CREATE_RISK_EVENT持久产物白名单，需配套真实后端适配器和DDL69，权限与实际验收仍待；不启用动作开关。

结果风险事件面板复用原结果详情、permission及Ant列表；原动作面板只有执行状态，不能把COMPLETE当风险处置完成，故增加事件元数据面板，不建立新结果详情或复制来源。风险中心及处置操作尚待。

风险面板处置弹窗复用原Modal，risk:handle独立显示，字符串观察版本+有限目标状态+必填原因；提交防重复/关闭，MAX禁用，响应ID/状态校验后刷新实际记录不本地伪造处置。旧观察不自动重试，切结果/撤权/卸载废弃响应。真实权限/浏览器验收待。

RiskEventPanel复用原Modal增加独立history:view历史查询，50条/string版次分页，状态前后/原因/actor/UTC普通文本展示；页内及跨页连续版本和状态链、返回游标/字段界限核验。关闭/刷新/处理后刷新/换结果/撤权/卸载清旧响应，失败不伪造空历史，不提供历史重放。真实浏览器与SQL授权验收待。

## 自动挖掘待标注候选 v2（2026-10-25）

复用流水线动作表单，ADD_TO_EVALUATION_CANDIDATE 显式选择原业务复核 v1 或自动挖掘 v2；切换清理 sampleType/reviewRevision 与 findingCodes/threshold 等不兼容字段，保留名称、标签及原动作条件。旧未指定版本仍按 v1，未知适配版本保持只读，不自动升级。

v2 必须选择当前流水线已声明的 1–50 个不同事实编码，阈值使用精确十进制字符串（0–1，沿用 precision 38/scale 18），不经 JavaScript Number 转换。保存时校验引用；阈值只是筛选线索，不代表正确率。执行仍依赖后端动作开关、原生产来源及当前 sample:manage 授权，不从表单直接创建样本。仅处理已提交的会话结果，不新增语音处理或模型调用。

候选池将 UNCLASSIFIED 显示为“未分类（挖掘候选）”，与金标状态分别展示；不预判误报/漏报，也不自动生成金标。人工标注及独立审核沿用已有入口，数据范围沿用单租户组织权限。来源元数据的可见性仍由原服务端读取投影控制。

本轮 Root 仅执行 pnpm run build（vue-tsc + Vite），原 4951 已终态且 /tmp/iqc-mining-action-v2-ui.exit=0；保留现有 chunk 大小提示。组件交互、真实授权、发现/claim/生产持久化及 Gold 整链验证交由 B 后续专项，不以构建通过代替验收。

## 业务报告动作状态统计（2026-10-25）

原业务报告新增可选“动作统计”，只对拥有 action:history:view 的当前用户显示；仍需 report:view。默认不查动作，沿原显式任务/轮次/首次或最新口径，仅显示原选中结果的当前动作账本快照，不自动执行动作。已确认失败率分母只含最终确认成功与最终确认失败；等待重试、阻塞、结果未知等逐状态显示并排除分母，零分母未测量，无动作记录不代表成功。动作数量用字符串展示，不在浏览器转 Number 汇总。跨冻结标准只合计动作状态，不混合评分。

权限变化沿原代次机制清报告、关闭选项并隔离旧响应；旧后端缺可选统计时明确无法确认。后端五字段来源、当前组织授权及 SQL 口径见后端 docs/iqc-action-failure-metrics.md。构建/专项实际终态以根协作记录为准，未据页面存在宣称真实 PDP/浏览器/外部动作成功。

Root 原68367 build 终态0，/tmp/iqc-action-metrics-ui.exit=0，vue-tsc/Vite通过，保留chunk大小提示，diff通过。Root未新增/执行测试；独立组件、真实组织授权与SQL组合仍待 B，不能据构建称指标或PRD整体验收完成。

## Mined candidate publication validation

`mined-action-policy.spec.ts` adds 24 cases: preserves exact threshold strings (including 18 decimal places and 0/1 boundaries) without Number coercion; rejects numeric/exponent/out-of-range/over-scale values, invalid/duplicate/empty/over-limit/undeclared finding references and stale v1 or expected-label fields. Omitted-version v1 round-trips without upgrade, unknown adapter versions remain read-only with original configuration. Returned configuration is independent of input mutation.

Original 51409 failed seven new equality assertions because the fixture omitted the existing retry:null normalization; after explicitly including retry:null, original 78457 passed 38 tests (new 24 + external policy 3 + candidate pool 11), `/tmp/iqc-b-mined-action-policy-final.log.exit=0`. Original 73195 type-check exited 0, `/tmp/iqc-b-mined-action-policy-types.log.exit=0`. No production changes. Pure validator evidence does not prove component mode-switch interaction or browser/backend publication.

## Candidate mode component interactions

`ActionPolicyEditor.mining.spec.ts` exercises five component scenarios: v1/v2 switching clears incompatible fields and preserves name/tags/condition; selecting the current omitted-version v1 does not upgrade or reset revision; the threshold input preserves 18-place decimal text; disabled actions cannot switch; unknown versions render read-only. Select/input UI primitives are controlled, while the actual editor handlers and parent model updates run.

Original 47028 had four passes and one fixture DataCloneError from structuredClone on a Vue proxy; the terminal run was corrected to snapshot plain JSON. Original 87648 then passed 29 tests (five interactions plus 24 publication validator cases), `/tmp/iqc-b-mining-mode-final.log.exit=0`. Original 28824 type-check exited 0. No production source changes; this does not prove browser/backend publication.

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


## 模型容量管理及核对恢复（2026-10-07）

沿模型调用记录组件增加容量查看/并发上限配置与未知请求核对恢复。配置版本字符串不经JS数字往返，保存失败要求刷新；恢复必须选择结论、填写核对凭据编号并明确确认远端停止。已恢复行显示操作人，不把原UNKNOWN变成成功或填0Token。前后端及权限都仅允许IQC管理员；没有新路由/菜单/依赖。仅构建，未新增或执行测试、浏览器、真实模型/远端核对或部署。


## 任务模型调用归属（2026-10-07）

调用记录组件接入任务详情，按task:model-calls:view及任务范围查询明确归属记录；全局记录仍仅管理员。展示真实Task/EID/节点/检测轮次/会话；源字段为null的旧调用不从逻辑记录反推。复用已有API/组件，无新路由/菜单；容量管理仍只按管理员权限显示。请求切任务/执行轮次和卸载代次保护。仅构建，未新增/执行测试或浏览器/真实模型验收。


## 模型定价配置（2026-10-07）

复用模型配置表单和model manage接口，价格开关/ISO币种/输入输出每百万Token单价表单始终保留价格字符串，不转换为JS number；内部pricingJson由表单生成，不向产品用户展示协议JSON。更新读取既有配置，留空明确清除；客户端基础校验类型，服务端严格重复键/未知字段/范围/精度校验。价格随Agent发布快照冻结；未宣称已启用金额预算。无新组件/权限/路由，未新增或运行测试、浏览器或部署。


## 冻结价格计算费用（2026-10-07）

复用调用记录组件/API，显示请求模型、响应模型、原配置版本、按声明价格计算费用和未知原因。金额始终字符串显示，不转换JS number；缺价格/用量/响应及工具范围未知不显示0。明确不是供应商发票或预算控制，无新导航/权限/组件。只构建，未新增或执行测试、浏览器或部署。

I5：结果动作面板已增加检查请求入口，独立enqueue权限、请求与实际发送语义分离、结果切换/权限变更/卸载丢弃旧请求响应。需后端实际POST及组织DML_29，同步部署前不可宣称可用；浏览器/API未验收。

## I5 风险中心（2026-10-11）

新增风险中心导航，复用风险事件API/View与原RiskEventPanel处置/历史界面；独立risk:center:view读取授权范围的20条稳定事件ID游标页，支持状态/风险等级筛选。来源结果只用后台返回的真实sourceResultId，不生成会话上下文；risk:view/handle/history:view保持独立。切筛选/刷新/撤权/卸载废弃旧响应，失败不伪造空结果或成功，元数据普通文本展示。历史页面记录按稳定ID排序，未声称创建时间排序；处置后需刷新中心列表观察状态，不把旧观察自动更新为成功。需组织06/900255及后台600da40配套；未进行浏览器、SQL、权限或容量验收。

## I5 公共通知告警配置（2026-10-11）

复用原动作策略/条件/重试表单，开放实际SEND_ALERT v1，场景编码、SMS/EMAIL渠道、固定接收地址和最多50项文本模板参数；不另建通知模板或通知记录页面。新增默认风险LOW触发，配置严格有界且按发布快照冻结，不现场插入会话变量。已有未知类型/版本/失败政策仍只读保留。动作历史允许SEND_ALERT的UNKNOWN只读核对，实际后台仅GET owning通知记录，不重发。需后台9003310、通知9c2c6cf与组织07/900256配套；真实渠道/登录/浏览器和完整权限验收尚未进行。

## I5 确认失败升级配置（2026-10-12）

复用原动作表单，实际v1适配允许配置RECORD_ONLY或ESCALATE_REVIEW，不修改动作配置结构或既有幂等键。明确仅FAILED/确认失败在重试结束后升级，UNKNOWN仍核对，已有PENDING等待；未尝试EXPIRED/阻塞及历史EID政策尚未实施。未知类型/版本保留只读。需配套失败升级拥有服务与默认关闭的后台扫描；实际运行、等待/失败原因和关联复核历史展示尚待，不声称全I5已完成。
## B：风险与告警界面集成构建（2026-10-11）

同步A已提交826bbb5，保留风险中心、历史与原动作恢复界面；SEND_ALERT配置和UNKNOWN只读核对入口已合入。B完整npm run build（vue-tsc+Vite）49602退出0，仍有原大包提示，临时依赖链接已移除。日志/private/tmp/iqc-b-risk-alert-integrated-ui-build.log。该构建不证明浏览器、真实身份权限、通知跨服务或真实渠道验收。

## B：离线转写对齐显示（2026-10-12）

沿原会话明细和API接入说明显示真实startMs/endMs与confidence，小时不按24h取模、保留毫秒；未知字段省略，不提供未接通的音频播放。API类型沿原请求增加可选字段，无新导航/组件/权限。完整vue-tsc/Vite构建49052退出0，原大包提示保留，临时依赖链接已移除。日志/private/tmp/iqc-b-offline-transcript-ui-build.log；未验证浏览器/真实角色或完整音频定位。

## I5 失败升级关联只读入口（2026-10-12）

原ActionHistoryPanel在FAILED确认失败行增加独立failure-review:view入口，GET实际历史核验结果；ESCALATED必须真实br-ID，UNCONFIRMED不推断等待或成功，原策略/状态不适用分别显示。原负责人范围，不请求新建/重发，也不修改父列表失败状态。关闭/刷新/切结果/撤权/卸载以generation废弃旧响应。复用原Modal与质量运营导航，无新页面/表。需组织01/900257和后台实际GET配套，真实权限/浏览器/SQL验收待。

## I6 转写指标节点表单（2026-10-12）

复用PipelineReleaseEditor/PublishedAssetReference加入METRIC，四种指标、显式角色及NUMBER/METRIC定义选择，固定transcript-timing-v1；提交只保留指标配置/原Finding引用，不带旧规则/智能体/phase/inputScope快照。切引擎清理相斥字段，旧RULE/DLS/LLM仍原引用路径；输入完整性由后台实际manifest核对。明确缺坐标未知、转写间隙/重叠不等于声学静默/抢话、6位小数语义。无新页面/权限/表，原发布/试跑门禁；真实浏览器/引用类型/生产评测运行及I6其余引擎/DAG待。

## 指标与离线金标整合（2026-10-12）

1580f43原编辑器METRIC四指标/显式角色与冻结引用；4424abd整合B已提交金标冻结区间/置信度显示及会话详情请求代次隔离，未知值仍省略。29351整合vue-tsc/Vite build退出0（原大chunk提示），日志/tmp/iqc-metric-audio-integrated-ui-build.log。后台已整合音频v3独立身份及候选/金标/评测时间坐标，上传HTTP/Range/播放器尚未合入；未运行测试、浏览器或部署，完整I6及PRD继续。

## Session配置首批（2026-10-13）

原PipelineReleaseEditor/API类型增加SESSION，固定dls-session-v1，沿原发布引用选择DLS规则及BOOLEAN/NUMBER事实定义，支持流程满足与指定RULE子规则命中消息数；切换引擎清除阶段/Agent相斥配置，不支持输入裁剪。80808 vue-tsc/Vite构建退出0，日志/tmp/iqc-session-engine-ui-build.log（原大chunk提示）。真实发布/任务/评测/浏览器验收尚待；未新增运行测试、SQL或部署，不标记完整I6完成。

## 并行ALL配置首批（2026-10-13）

原PipelineReleaseEditor加入顺序/并行模式，独立iqc-pipeline-parallel-v1保留原版本可读语义；输出声明模板复用原高级schema配置，节点编码/聚合变化后需手动更新，服务端独立校验归属及依赖读取。UI96151 vue-tsc/Vite退出0（原chunk提示），日志/tmp/iqc-parallel-dag-ui-build.log。实际并发/停止/预算/租约和浏览器、满足策略汇聚/可视化DAG仍待，未新增运行测试、SQL或部署，不标记完整I6完成。

## 数值业务比较配置（2026-10-13）

原业务映射表单增加可选数值与适用比较，复用六种Pipeline运算符，阈值文本直接保存并校验38位精度/18小数/64字符，不走JS Number转换；启用后阈值默认空要求明确输入，清空适用code同步清除谓词。旧布尔映射无需启用，原事实数值/证据不变。69278最终vue-tsc/Vite退出0（原chunk提示），日志/tmp/iqc-numeric-decisions-ui-final-build.log；配套后台ce01863/17518最终编译通过。未新增运行测试、SQL、浏览器或部署，完整评分/风险政策与真实运行验收仍待。

## I6画布节点交互（2026-10-20）

原依赖图补节点主体拖动、25%..150%缩放、自动布局恢复、Ctrl方向键及Shift步长、七引擎拖入落点定位；原连线/属性/依赖语义复用，不创建平行图协议。布局为组件内会话状态，不进入Release或持久化，重新打开自动排布。13500最终vue-tsc+Vite通过（48.71s），未运行Root测试/browser；交互与保存发布仍待B独立验收，完整I6/PRD不标完成。详见pipeline-graph-editing.md。

## CUSTOM融合目录配置（2026-10-20）

原Fusion区域增加CUSTOM，读取GET /iqc/pipelines/fusion-strategies中的已安装精确版本，显示id/版本/实现摘要并由明确选择冻结；参数JSON只允许有界字符串值。刷新目录不替换旧绑定，缺失版本/摘要明确提示，未装版本不自动升级；目录错误保留旧绑定。切换其它方式时从请求省略custom及非当前方法的nodeWeights。目录响应有界/重复身份/字段校验，卸载和重复读取用generation隔离。旧policy的7/8参服务端JSON兼容由独立B继续验证，页面不写任意脚本或类名。

原63145及最终18385 vue-tsc+Vite均terminal exit0，最终日志/tmp/iqc-custom-fusion-ui-build-final.log；本批只构建，Root没有新增或运行测试/browser/SQL/部署。新增目录权限资源900270及组织迁移由对应仓提供，脚本未执行。实际目录授权/精确选择/刷新/切换残留/真实发布与重算仍交B，完整适用I1–I7继续。

## Agent敏感读取与能力选择（2026-10-21）

QualityAgent/Version可空configJson/description及响应privacy、独立agentPresentation接线；受限正文不建默认编辑器或空存。Agent模式、schemes Agent3.0版本筛选及SkillApiConfigurationEditor能力选择用明确元数据，仍保留原ID/version和MCP工具名，不要求看到Prompt正文。unknown协议不回退裸正文，只有旧无privacy兼容旧协议。当前配置2/3向导保持，1.0保留原JSON编辑为新草稿版本；前端业务按钮/处理函数对齐原submit/disable/version:manage，刷新/关闭/卸载清数据并隔离迟到响应。Agent效果rate契约允许无分母null。

首轮39271和最终54477 vue-tsc+Vite均exit0，最终/tmp/iqc-agent-sensitive-read-ui-build-final.log（1m15s/既有体积提示）。没有新增或执行Root测试/browser/SQL/部署，实际读取授权/能力选择/旧协议/角色仍交B，完整适用I1–I7未宣称完成。

## Rule正文与诊断受限读取（2026-10-21）

原规则页识别iqc-rule-read-v1，非LLM按FULL+PII，LLM含大小写/空白再需Prompt。unknown/受限表达式与描述不留在可编辑状态，不生成空新版本；历史、ID、版本、类型、状态仍可用。测试/导入只按允许正文渲染，保留ERROR/NOT_SUPPORTED与计数，File/测试输入/历史/表单关闭清理并隔离迟到响应；DLS遮蔽名称不作行唯一键。请求目标与发起输入固定，未确认写入提示先核对原草稿。

首轮93991与最终95124 vue-tsc+Vite均exit0（最终51.16s/既有体积提示），/tmp/iqc-rule-sensitive-read-ui-build-final.log。未新增/运行Root测试或browser/SQL/部署，授权/原数据/实际页面验收交B；完整适用I1–I7继续。


## RuleSet 读取边界（2026-10-21）

复用既有规则业务授权及当前敏感授权，RuleSet list/history仅FULL+PII齐备返回原description；所有命令回执扣留description。响应副本使用iqc-rule-set-read-v1，非持久privacy为null时省略；ruleIdsJson原顺序、aggregationMode、ID/code/version/status保留，不改变检测或内部快照。页面仅保存成员选择所需元数据，关闭清理新建表单，刷新代次/卸载阻断迟到响应，创建提交复制输入，禁止提交期间关闭。页面本来没有历史编辑入口，未添加空描述覆盖路径。

当前批次仅编译/前端构建；实际grant组合、源对象不变、内部JSON兼容、网关逐URL注册及浏览器生命周期仍待独立验证。单租户组织范围不变，完整I1–I7未完成。


## 已发布Scheme普通读取投影（2026-10-21）

GET /schemes/published目录及schemeId游标历史先检查当前scheme:view并设置no-store，查询审计不收正文。独立PublishedSchemeRead响应封装，不修改ReleaseSnapshot/内部快照/摘要。FULL+PII+PROMPT全部具备可回原发布正文；其它组合只回业务definition（item/评分/上限/variant/引用），自由名称沿原PII mask、描述扣留，dependencies仅executionMode和规则id/version/name，agent/label/route plan/variantDependencies不复制；policyVersion=iqc-scheme-template-read-v1。contentHash始终原发布物身份，不能用展示投影重算校验。

普通前端API即使有全部权限，也只保留任务选择所需依赖元数据，不保存检测器正文；描述需已知协议全部grant方保留。原TemplateWizard仍按原definition/推荐变体/上限/执行模式及版本创建任务。专家draft/history/preview和发布回执仍待独立收口，不把普通模板路径完成当成整个Scheme域完成。实际权限组合/源快照不变/普通任务与历史/浏览器/网关注册待独立验证，本批仅编译构建。


## Scheme专家读取与命令回执（2026-10-21）

草稿list在原scheme:manage当前授权后复制实体，正文description/draftConfigJson仅FULL+PII+PROMPT齐备读取；命令回执始终扣留正文和presentation。非持久null省略的privacy和schemePresentation不改变原内部快照。专门草稿读取另给iqc-scheme-presentation-v1 typed业务definition（检测器ID/版本引用、评分、执行变体、上限），自由名称/说明走既有PII mask，非法定义显示UNAVAILABLE而不补默认。该展示数据供原试跑选用，不能作原草稿编辑。

专家历史复用独立发布投影，保留来源修订/试跑/归档元数据；原Release/hash不改。preview仍执行原完整依赖校验，但仅返回schemeId/draftRevision/validated，不返回冻结检测器。发布/版本归档返回SchemeVersionReceipt元数据，无snapshotJson。创建/修订/停启用返回无正文草稿回执。各入口在调用业务前检查原资源码，no-store，查询审计无正文。

页面受限/未知协议草稿禁止编辑/保存，合法选用presentation供试跑；派生按原服务端冻结引用创建，回执不直接当可编辑草稿，重读后有权限才打开。历史完整正文不足时禁差异比较并显示正文未展示，查看和派生/归档仍沿原业务权限。刷新/编辑代次及卸载清理用于阻止迟到回填；关闭编辑清配置。权限组合、内部旧JSON、真实Audit/网关/撤权/浏览器/试跑发布仍待独立验收，本批仅编译构建。


## MCP表单生命周期（2026-10-21）

复用原MCP管理接口/引用模型，无新增schema/授权。关闭清理表单和selected，卸载清理配置列表并失效列表代次/字典响应；命令提交复制输入和固定目标，提交中禁止关闭及改动，handler检查原manage权限，只读用户保留view。确认启停捕获ID并在回调重新检查页面/权限。已发写入不会取消，未知写入结果提示核对后再试。实际浏览器迟到响应/关闭/只读/授权仍待，当前仅构建。


## 人工Finding上下文读取（2026-10-21）

沿用原available=false提示及save guard：后端FULL+PII不足时不显示Finding值/原文，不将扣留当无Finding。HumanFindingReviewEditor对存在但未知/不完整privacy协议同样清除findings/messages并禁裁决；保留既有无privacy旧接口兼容。卸载清上下文/草稿并使请求代次失效，迟到响应不回填。接口数值原文/证据/原复核服务不改；实际权限/浏览器待验，本批只编译构建。


## 业务/标签复核待办投影（2026-10-21）

原IqcPage服务查询不变，当前业务review:view、标签review:label:queue分别在业务前刷新授权/no-store，查询审计不收正文。独立ReviewQueuePage响应保留records/current/size/total并加iqc-review-queue-read-v1隐私元数据。FULL+PII齐备回原requestComment；其它组合扣留评论，对taskName/createdBy及标签labelName/valueDescription沿原PII mask。业务record重建、标签DTO复制，原对象/SQL范围/排序分页/ID/状态/currentResult不改，业务stage直接保留原已校验枚举，不重新解析已清理workflowMetadata为INITIAL。

页面已知受限或未知privacy清除评论并提示未展示；卸载使队列和标签历史代次失效/清行和selected，关闭历史清引用。旧无privacy API兼容保留。ResultReview历史与命令返回的reviewedResultJson/评论、人工改分原因仍待配套安全工作流/UI投影；此批不覆盖那些接口。当前仅编译构建，实际四grant/源不变/组织SQL/分页stage/当前授权和浏览器待验。


## 标签复核细分权限对齐（2026-10-21）

以QualityOperationsController和现有V20260927_01权限脚本为准：LabelReviewQueue请求/展示用iqc:review:label:queue，队列历史按钮及handler单独用label:history；LabelValueReviewPanel读取/发起/裁决及submit handler分别用label:history/create/decide；tasks标签表和路由定位打开复核用label:history。此前混用通用review:view/create/decide会阻止只有标签权限的账号，也会给只有通用权限的账号显示最终被后端拒绝的操作。既有result:view/task:view及服务端授权/组织范围仍适用，不新增权限码/角色/接口。实际独立grant组合/撤权/浏览器待验，本批仅构建。


## 人工改分上下文原因投影（2026-10-22）

SCORE_CONTEXT沿现有reviews固定review:view当前授权/no-store及原service组织/来源/计算hash校验，独立ScoreReviewContextRead只控制前轮manualScore.adjustment.reason：FULL+PII齐备回原原因，否则该字段null，iqc-score-review-context-read-v1声明扣留。computedScore/hash/status、APPLIED/STALE、effectiveScore、原finalScore字符串和source/expectedScoringHash完全保留；没有manualScore仍null，不把旧原因扣留变成未改分或零分。不需要Prompt授权，不修改原ManualScoreProjection/ScoreAdjustment/评估及存储。

ManualScoreReviewEditor原本不以旧原因填表，新一轮原因始终重新必填；现提示前轮原因未展示，仍可用原评分基准编辑。存在但未知/受限privacy剔除旧原因；保留旧无privacy兼容。卸载清评分上下文/输入并失效请求代次。当前仅编译构建，四grant/精确分数及状态/hash不变/源字节不变、实际授权/浏览器仍待独立验收。ResultReview历史与命令正文仍待。


## 标签复核历史与回执（2026-10-22）

标签history/create/decide先检查原固定label:history/create/decide当前授权/no-store，历史QUERY审计不收正文。ResultReview响应copy新增非持久null省略privacy，内部存储/旧快照不设字段。专门history仅FULL+PII齐备回原requestComment/reviewComment/reviewedResultJson；其它组合扣留三字段，创建人/复核人沿原mask，ID/轮次/状态/分数/hash等保留。所有标签命令回执无论敏感grant均扣留正文，前端沿原刷新历史取最终详情，不改复核幂等/锁/来源/组织范围。无需Prompt。

LabelValueReviewPanel区分未展示和损坏：存在但未知/受限privacy清正文评论、显式提示、停止用不完整历史裁决；合法完整旧body原验证保留，无privacy旧接口兼容。LabelReviewQueue历史结论显示复核正文未展示而不猜值。组件卸载清历史/消息/命令草稿并失效请求；已发出的写入不取消，迟到响应不触发刷新。实际grant/源字节/旧内部JSON/命令回执/当前授权及组织/browser待独立验收，当前仅编译构建。业务/消息ResultReview历史与命令仍未投影，工作流stage须另行配套。


## 标签权限回归夹具集成（2026-10-22）

从B已提交a2b90f3同步LabelReviewQueue.spec.ts、LabelValueReviewPanel.spec.ts，生产代码保持当前标签正文保护版本。覆盖标签专属grant、通用grant不能替代、queue/history独立、按钮和重试前撤权。B曾在其组合分支运行两文件14项并构建通过（日志见协作台账）；Root本次仅同步既有测试及构建，不把B旧分支结果当当前隐私/评分/序列化全部验收，不运行测试。


## 消息复核历史与回执（2026-10-22）

复用既有标签review响应copy字段处理为私有reviewRead，消息路径使用iqc-message-review-read-v1，不新增持久模型。消息history FULL+PII才回原评论/JSON，命令receipt始终扣留，原original/final数值、状态、风险、ID/hash保留，创建人/复核人沿原mask。request/decide入口在原业务分支前检查固定review:create/decide当前授权；history已有review:view/no-store/QUERY不收正文。原service范围与裁决不变；业务review JSON/工作流本批未扣留，仍待完整配套。

旧质量运营页按当前tab及其原grant分别查询review/feedback/sample，report只在report:view具备时查询，不再无条件四接口联读。消息评论受限显示未展示，表单不填历史评论；提交固定目标/复制payload，handler检查decide并防重复，提交中禁止关闭/改动，关闭清表单/selected，卸载清列表/输入/代次，迟到响应不回填。字段保护和页面运行未独立验收，当前仅编译构建；原组织/role/PDP/browser与I1–I7保持待验。


## 业务复核历史与安全工作流展示（2026-10-22）

业务history及request/decide各已有分支统一接入businessReview，复用reviewRead响应copy规则；history FULL+PII才回原评论/reviewedResultJson，命令永扣正文，不需Prompt。新增ResultReview.reviewPresentation非持久null省略字段；历史专门响应仅含iqc-review-workflow-presentation-v1、AVAILABLE/UNAVAILABLE、阶段及原ReviewWorkflow元数据。复用既有ReviewWorkflow构造校验，额外保持parentRevision小于当前轮次，初审无上游workflow；坏JSON/错误协议不自动补INITIAL。只解析显示用元数据，不重写裁决/源JSON/hash，原服务的锁/独立审核人/范围/计算/升级逻辑不改。

BusinessReviewPanel正文受限时不解析为坏投影，显示未展示并禁止基于不完整历史变更；读取已知有效presentation保留二审/仲裁/终局含义，异常presentation禁操作。完整正文原评分/证据验证保留，无privacy历史旧接口兼容。命令后仍原刷新history；卸载清历史/输入/命令并失效代次，迟到命令响应不刷新。实际四grant/初审二审仲裁/坏协议/源字节/旧JSON、当前授权与组织SQL/浏览器仍待独立验收，本批仅编译构建，完整I1–I7未完成。


## 置信度诊断报告展示（2026-10-22）

原评测任务报告读取Finding指标新增confidenceDiagnostics协议，只在已知v1时显示coverage/未测量/Brier/ECE及10箱表，不加接口/路由。区间上界包含标识由服务端明确给出，均值/准确率/无样本不制造零值；旧报告无字段不显示。该诊断是已报告最终完整值置信度与冻结金标正确性的误差，非正类概率，不证明校准工件。算法/报告摘要及实际数值/HTTP/browser验收待独立验证，当前仅构建。


## 业务人工修改率（2026-10-22）

原业务质量报表按冻结标准展示reviewChanges：最近完成复核覆盖率、相对机器结果修改率以及项目/事实/有效改分三个可重叠分类。空分母明确无完成复核/无样本，不混入独立标签复核；原评分和分组表保留。协议未知或旧报告无字段时不展示。实际数值/多轮/组织及浏览器待B独立验收，目前仅构建。


## A/B前端固定提交组合（2026-10-22）

当前A4f69e90合并Ba2b90f3，共同祖先4455aa2。生产页面/导航及标签权限回归已在A；实际新增仅PipelineDependencyGraph既有spec对错误图仍可修正的预期，保留无虚构依赖边和节点选择断言。当前Root仅构建，不运行测试；B269组件回归归38f8592，标签14项归a2b90f3，不外推为含新指标/复核隐私的当前头全通过。后端已5147226统一，完整角色/browser/运行和PRD验收继续待。

## B 统一头与改分隐私回归

581a604组合A f4e6e2b后，39文件274项测试全部通过（/tmp/iqc-b-ui-integrated-tests.log），原70538构建终态0（/tmp/iqc-b-ui-integrated-build.log，Vite 1m44s，既有chunk提示）。Node22.22.2/pnpm8.7.6与声明版本有差异。新增ManualScoreReviewEditor两项检查受限历史原因不展示/不自动带入、原有效数字保留且新原因必填，以及卸载后的迟到响应；该文件5项全过（/tmp/iqc-b-ui-manual-score-privacy.log）。新增仅测试，不重复称全量276已运行；真实PDP/组织角色及浏览器链路尚未完成。

## B 模型重复运行一致性入口

原评测报告接ModelConsistencyPanel，显式输入参考Task/EID，调用原评测报告权限保护的consistency子资源；显示同模型/输入的节点事实值/状态/严重度一致率与可比较覆盖率，缺测/同源/输入变化等排除原因分列，不混称准确率或完整模型输出一致率。权限/目标/输入变化清旧结果，卸载失效迟到请求，未知协议拒绝显示。

原74942 build terminal0，/tmp/iqc-b-model-consistency-ui-build.log（Vite1m3s/既有chunk提示）；原39035 ModelConsistencyPanel.spec.ts三项全过，/tmp/iqc-b-model-consistency-ui-tests.log；补测试类型标注后原59750 vue-tsc terminal0，/tmp/iqc-b-model-consistency-ui-types.log。没有重复跑全量；Node/pnpm仍与声明版本有差异。实际SQL重复产物、HTTP当前角色与真实浏览器联调待，完整I1–I7目标保持active。


## 一致性A/B组合资源映射（2026-10-22）

固定合并B已提交abdd53f。前端getModelConsistency复用已注册/report URL并传双方Task/EID，避免同report:view注册两URL覆盖；原报告请求、页面清理/缺测/撤权逻辑保留。B既有组件与受控浏览器证据归原分支旧路径，当前仅构建，新的实际网络/PDP/SQL联调待验。

## 节点运行监控（2026-10-25）

原模型运行监控页扩展生产检测图完成速率/逻辑P95/在途、节点尝试状态速率/成功率/P95/未开始跳过与共享线程池active/queued；不另建页。新九系列完整可选，旧控制面明确无法确认节点指标，部分系列视为协议错误；缺测/NaN/Inf不补零，权限与范围变更同步清图及代次。明确重试/备用各自计数、线程池含评测、图逻辑耗时排除融合评分/持久化，GPU仍无来源。后端详细口径见iqc-pipeline-monitoring.md，构建/独立专项实际终态见根协作记录；未据图存在宣称容量或PRD完成。

Root原34759 build终态0且/tmp/iqc-pipeline-monitoring-ui.exit=0，vue-tsc/Vite通过，现有chunk提示保留，diff通过。Root未新增/执行测试；新系列/旧控制面/撤权迟到响应和真实采集仍待B独立专项。

## B 2026-10-26 固定合并前端全量回归

基线98cf73b（含动作统计、一致性v2及节点监控固定5cd4190），原4696 terminal0，/tmp/iqc-b-ui-integrated-regression.log.exit=0：53文件380测试全部通过。原85531 terminal0，/tmp/iqc-b-ui-integrated-build.log.exit=0：vue-tsc与Vite构建通过，保留chunk大于500kB提示及engine声明版本差异。无源码修改，node_modules symlink不提交。

尚未集成持久任务23系列或模型在途可选系列，本次结果不外推未来提交；监控组件撤权/迟到响应、真实PDP、Prometheus采集与容量整链仍待专门验收。处理好的会话为输入，语音转换不在完成条件中。
## 持久任务与轮次结束监控（2026-10-26）

原监控页增加持久任务状态、近5分钟已测轮次结束速率、历史终态未测量数、数据库采样健康及年龄。任务23/节点18/模型9系列兼容，任务组必须完整且依赖节点组，缺组明确无法确认；缺失/无效采样不补零。预算等待/暂停/计划/排队与结束状态分别显示，取消不是成功，目标UP不代表数据库样本有效。原权限/请求代次围栏保持，无新页/API/权限。编译构建/独立专项终态以根协作记录为准，未据图表宣称容量或完整PRD完成。

Root原56584 build终态0且/tmp/iqc-task-operational-ui.exit=0，vue-tsc/Vite通过，保留chunk提示，diff通过。Root未运行测试；23系列/旧控制面与采样失效、权限迟到等独立专项仍待B，未部署。

## 显式模型调用在途（2026-10-26）

原监控页可选activeModelCalls图，跨实例应用显式调用在途，不宣称供应商物理并发/GPU/预算占用。缺字段明确无法确认，已采样0与缺测区分，原非有限断点/权限代次不变。兼容旧9/18/23和可选单系列，不新增页面/API/权限。构建及独立采集/组件专项以根协作终态为准，完整I1–I7未完成，未部署。

Root原28604 build终态0且/tmp/iqc-model-active-ui.exit=0，vue-tsc/Vite通过（Vite2m7s），chunk提示保留，diff通过，Root未写/运行测试。新可选在途协议/页面与实际采集仍待B专项，未部署。

## Finding运营分布（2026-10-26）

原业务报告可选分组Finding频次，需report:view及原完整会话/PII双敏感读取；撤权清数据/代次和选项，恢复重选。机器与最新已完成业务复核后有效事实分开，保留来源缺测与事实缺失，显示五状态、KNOWN严重度和BOOL真/假；UNKNOWN不填FALSE，频次不当准确率，不输出任意原值/证据。复核后有效事实可包含未改判的机器值，不是全部逐项人工确认。无流水线Finding协议的方案不适用，缺/坏响应不伪造0。原页面/组件/接口复用，未新建权限或持久副本；正式口径与构建/专项终态见后端文档/根协作记录，完整I1–I7继续。

Root原57046 build终态0且/tmp/iqc-finding-distribution-ui.exit=0，vue-tsc/Vite通过（Vite1m13s），chunk提示保留，diff通过。Root未写/运行测试；后续页面复核来源说明与固定监控校验集成后另行构建，不把首轮证据外推后续变更。
## B 2026-10-26 监控协议/撤权专项

固定集成4483a74为a16dbdc，保留双方进度追加章节。新增ModelMonitoring.spec.ts共17项，真实解析器+受控API/权限/基础组件：六合法9/10/18/19/23/24组合、无权限不请求、已加载撤权与恢复重新取数、挂起history/source撤权后隔离、status单独撤权、时间窗口代次、节点/任务部分组与任务依赖节点、未知键拒绝、采样0与NaN/Inf断点、失败刷新清图。

原11181 terminal1，16通过1失败，真实复现未知指标键被忽略；生产ModelMonitoring.vue补已声明字段白名单，未知响应整体拒绝。原17773修复后17通过；原69600类型检查失败仅新增测试stub隐式any，终态后改defineComponent类型推导。原17285 terminal0、/tmp/iqc-b-monitoring-ui-verified.log.exit=0，17项通过；原92563 terminal0、/tmp/iqc-b-monitoring-ui-types-final.log.exit=0，vue-tsc通过。保留engine版本差异警告。

未重跑全量/构建，之前380项证据仅属于98cf73b。专项不证明真实PDP/浏览器后端/Prometheus/PromQL、数据库迁移或容量达标。完整I1–I7仍在推进，处理好的会话为输入，未部署。

Root整合后原25691 build终态0且/tmp/iqc-finding-distribution-final-ui.exit=0，vue-tsc/Vite通过，保留chunk提示；包括B监控未知key拒绝及Finding复核有效事实用词澄清。Root未执行测试，Finding权限/计数/来源/组件专项仍待B，不将构建或旧380项当新功能验收。

## 2026-10-27 全量分片批次原页面接入

原发布版本任务+临时选择器增加显式全量分片开关/每片候选数，只允许ALL及执行grant；原请求重试冻结bulk选项，切换任务/选数方式或失去执行权限清除可选开关。原任务目录新增父类型、按父查看分片/返回全部，详情有界严格校验扫描统计协议/十进制计数/守恒，缺失或异常保持未知。父进度不再按0条消息显示百分比，扫描完成不代表分片完成；父终态按钮标为重新汇总，不能伪称自动重跑失败模型。

原12686 build terminal0且/tmp/iqc-bulk-ui-build.exit=0，vue-tsc/Vite通过（Vite2m47s），engine及chunk提示保留，diff通过，Root未写/执行测试。API需配套当前批次后端与迁移77；B独立权限/坏协议/迟到响应/重试/过滤及真实联调验证仍待，跨分片报告及统一终态清理未完成。未部署。

## 2026-10-27 批次统一终态清理界面

原删除按钮对有bulkShard来源的分片隐藏，函数入口同样拒绝并引导从父批次统一处理；父删除确认明确统一隐藏父与全部终态分片，仍有活动/暂停片需先取消回收，原结果与审计保留。沿用原DELETE与原删除grant，不新增入口。原39282 build terminal0且/tmp/iqc-bulk-cleanup-ui-build.exit=0，vue-tsc/Vite通过（53.83s），engine/chunk提示保留，diff通过；Root未写/执行测试。需配套本轮后端锁序与原子清理，行为/并发仍待B独立验证，未部署。

## 2026-10-27 父批次结果与风险分页检索

原任务目录父批次“批次结果”复用原结果中心/results，按parentTaskId读取当前可见分片的业务会话结果，仍可筛风险/分数。父过滤时禁消息观察兼容视图，避免兼容API忽略参数后显示全库；显式清除批次或改选单任务才离开父范围，非法URL参数失败而非降级为无过滤。详情依旧用实际子taskId/conversationId进入原复核/证据，不构造父均分或P95。入口同时保留原路由result:view与business:view权限。

原45985 build terminal0且/tmp/iqc-bulk-result-page-ui-build.exit=0，vue-tsc/Vite通过，既有engine/chunk提示保留，diff通过；Root未写/执行测试。后端7071f5e直接SQL应用组织范围/父过滤/最新轮次先于评分风险，不加载全库任务ID。B仍需协议/权限/迟到/跳转与真实SQL及容量验收，本轮未部署，完整I1–I7未完成。

## 2026-10-27 独立高风险规则证据门

原风险编辑器不允许HIGH/CRITICAL默认；高风险规则需要已知事实证据门（ALL至少一项、ANY各分支、已知状态/等值/直接NOT等值），服务端还会核验同code所有冻结生产者都要求证据。UNKNOWN不是RiskPolicy.Severity合法配置选项。旧加载配置不静默转换值，需显式修正后保存新版本；原历史显示不改。

原33465 build terminal0且/tmp/iqc-high-risk-evidence-ui-build.exit=0，vue-tsc/Vite通过（1m9s），既有engine/chunk提示保留，diff通过，Root未写/执行测试。配套后端4f73190，原历史RiskPolicy求值/JSON/Hash不改；旧配置迁移和正反组合需B独立验证，不将静态门当语义质量或完整27.9验收，未部署。

## B MCP独立操作权限组件验证（2026-10-29）

仅merge固定d9b0d91为56942ee，进度文档冲突保留双方记录。新增operation-permissions.spec.ts六项：旧manage只创建不能更新、update只更新不能创建、确认期间撤销disable不调用、enable不能disable且调用自身端点、更新撤权关闭表单及拒迟到保存、读取撤权丢弃在途列表。

原70219 terminal0，/tmp/iqc-b-asset-operation-ui-20261029.log.exit=0，新MCP6+原模板目录6=12项通过6.80s；原84408 vue-tsc终态0，/tmp/iqc-b-asset-operation-types-20261029.log.exit=0。旧模板modal未stub警告保留。测试使用真实Vue页面、受控permission/API与Ant组件stub，通过setupState调用业务入口并检查模态DOM及API边界，非真实浏览器或PDP。没有声称本次验证了模型/Skill/模板物化全部新操作码，也未重跑全量套件或Vite构建。无生产改动/部署，完整适用I1–I7继续。

## B 模型Skill与模板物化独立权限验证（2026-10-29）

基线5cf534d，仅新增模型/Skill共享参数化组件测试13项与模板目录3项。模型6与Skill6分别覆盖旧manage可创建不可更新、update可更新不可创建、enable不可disable、确认期间撤权、更新撤权关闭并拒保存、读撤权丢弃迟到列表；Skill另验证正文缺失的受限投影不能补空保存。模板验证template:view+旧rule:manage仅预览、不调用物化；新template:materialize成功调用；撤销物化权限后迟到成功不显示成功消息。

原75397终态0且/tmp/iqc-b-assets-template-operations-20261029.log.exit=0，三个文件28项全部通过7.95s（模型/Skill13、MCP6、模板9）。原57583 vue-tsc终态0且/tmp/iqc-b-model-skill-template-types-20261029.log.exit=0，diff通过。首轮模型不适用的正文空用例已删除，不计证据。原模板未stub modal警告保留，不影响断言。

组件使用真实Vue页面、受控API/权限和Ant stub，通过setupState调用业务入口并检查DOM/API边界；不是浏览器/真实组织权限/PDP。未重跑全量或Vite，不把原四页构建证据升级为本轮全量验收。后续任务页新码/全量与真实登录范围仍继续，完整适用I1–I7未完成，无部署。


## 2026-10-29 B 规则集精确操作权限与全量回归

基线 b01819f，含生产固定 732b531 的规则集页面。新增 `src/views/rule-sets/operation-permissions.spec.ts` 十项，复用真实 Vue owning 页面、响应式权限 mock、API mock 与 Ant stub，无生产源码修改：

- 旧 rule:view/manage/approve 不替代规则集读取、创建或审批操作；set:view 单独读取，不额外请求成员规则。
- 创建要求 set:manage 与 rule:view，保留必填校验、已发布成员选项和请求中的成员列表；列表不保留规则表达式或说明正文。
- submit/approve/reject 各自仅允许对应调用，互不授权，也不授权创建。
- 撤销成员读取关闭并清空创建表单、拒绝后续保存；撤销读取丢弃在途规则/规则集响应；审批撤权后迟到成功不提示、不额外刷新；保留提交失败反馈。

原 70696 首轮 9 通过 / 1 失败，为测试误把撤权本身触发的刷新计作审批完成后的刷新；待类型检查原进程终态后，修正为撤权稳定后的调用基线，不修改生产行为。原 53812 `vue-tsc --noEmit` terminal 0，`/tmp/iqc-b-rule-set-operation-types-20261029.log.exit=0`，该类型检查先于此断言修正。

最终原 29305 `pnpm exec vitest run` terminal 0，`/tmp/iqc-b-rule-set-full-ui-20261029.log.exit=0`：58 文件、456 项全部通过，110.18s，含最终规则集 10 项及模型/Skill/MCP/模板专项。日志保留既有组件 stub 警告。测试依赖受控权限/API 和组件 stub，不代表浏览器、真实岗位、PDP 或后台持久化通过；不含 A 尚未固定的任务页慢轮询修正，本轮未重跑 Vite build。完整适用 I1–I7 仍在推进，输入仅已处理会话。


## 2026-10-29 B 任务操作权限与慢轮询专项

基线929291e，仅merge固定efa1420（生产任务b8a0aab与8554207）为c9cdf9a。新增 `src/views/tasks/operation-permissions.spec.ts` 19项，实际Vue页面/响应式权限与API mock、Ant stub、受控3秒interval：

- task:view不额外请求创建资产；rule:view不代rule-set:view。execute不代详情/暂停/恢复/优先级，普通resume只需自身码，bulk resume还需execute与pipeline:task:create。
- cancel/delete确认回调重新检查当前权限。慢于三个周期的poll保持单请求，完成后可继续；撤权、refresh换代或卸载使旧poll失效，卸载清理interval。
- detail及summary撤权拒绝迟到数据；summary不越读labels/insights，标签深链无授权仍选inspection；labels/insights各按自身授权独立读取。
- 冻结配置复用task:view与Prompt权限，Prompt撤回使旧响应失效；旧result:export不代labels:export，标签导出撤权后迟到Blob不得生成下载URL。

原26820首14项连既有bulk10/schedule24共48通过。最终原45509 terminal0，`/tmp/iqc-b-task-operation-ui-final-20261029.log.exit=0`，新19+既有34共53项、3文件全部通过，9.99s。原80906 `pnpm build` terminal0，`/tmp/iqc-b-task-operation-ui-build-20261029.log.exit=0`，vue-tsc与Vite通过（Vite41.25s），保留既有引擎版本及chunk提示。diff检查通过。

不使用历史456全量结果冒称新任务组合已跑全量。本批经setupState调用handler、实际受控定时器检查，未证明完整Ant渲染/真实浏览器、PDP、岗位、后台写入或Worker恢复。菜单MySQL验证另在组织仓库，完整适用I1–I7继续，无语音转换。


## 2026-10-29 B 已处理会话四入口权限与全量回归

基线b8f8f17，仅merge固定a6975da为eb0fd4c（会话生产de8d687），未包含后续规则/Agent a6473f8。新增conversations/operation-permissions.spec.ts 26项：TXT批量/ZIP独立权限与撤权/卸载迟到回执、文件和元数据快照、六种原校验；archive列表与详情分权；实际共享Drawer安全预览、FULL/PII复合权限、撤权迟到响应与服务器privacy；统计精确权限、pending未知/真实零值/失败/撤权。音频子组件stub，不新增或验证语音处理。

首轮52943为24通过1测试预期错误，修正无授权应隐藏统计卡片并增加pending→真实零用例。原81263全量498通过3失败，均为旧Drawer测试缺少新增权限上下文；仅补detail:view明确fixture，保留原迟到响应、超过24小时精度和零置信度断言，没有删业务断言或放宽生产权限。

最终原90437 terminal0，/tmp/iqc-b-conversation-full-ui-final-20261029.log.exit=0，60文件501项全部通过，190.41s，包含新增26项和旧Drawer3项。最终原72129 vue-tsc --noEmit terminal0，/tmp/iqc-b-conversation-types-final-20261029.log.exit=0。既有Ant组件stub警告保留，diff检查通过；本轮未重跑Vite。

证据为实际Vue组件、受控API/权限与Ant stub，不代表真实浏览器/岗位/PDP/后台导入写入/完整I1–I7已通过。用户再次确认所有输入已为处理好的会话；语音转换、ASR/转写生成、音频解码和说话人分离不列待办，既有时间戳、证据及业务字段保留。


## 2026-10-29 B 规则与Agent独立操作/历史权限验证

基线a4dead4仅merge固定a6473f8为ffe3dc3；没有取A尚在构建的两个共享引用组件。新增rules/operation-permissions.spec.ts 11项及agents/operation-permissions.spec.ts 20项，复用真实owning Vue页面、受控permission/API、Ant stub和setupState，不修改生产源码。

规则验证manage不替submit/history/version、submit/approve/reject各自独立、历史只读不创建；有版本创建无submit只保存原配置草稿、有submit先创建再提交、中途撤回submit不发第二次写；历史撤权拒迟到正文，受限正文不能空替换；DLS撤权清结果且旧请求完成释放busy，恢复授权可重新预检。Agent验证四操作各自独立；创建不越读可选资产，Model/MCP/Skill各独立，旧rule:view不代legacy rule-set:view；指令目录+历史+三敏感权限复合，筛除异来源/空正文，仅绑定精确来源版本，历史撤权关闭/拒迟到正文；manage不代版本创建，合法version:manage保留原1.0配置保存草稿，受限配置不被默认值替换。

首轮37385为15通过12失败：规则路由mock缺meta，Agent在资产加载未完成时开始绑定产生第二次历史读取。原31234类型终态0后修正route fixture并等待资产完成，未修改生产逻辑。原86737 27项7.53s通过；补六项复合权限与legacy保存后，最终原52064 terminal0，/tmp/iqc-b-rule-agent-operations-complete-20261029.log.exit=0，3文件33项全部通过8.76s（新31+原prompt生命周期2）。最终原83661 vue-tsc terminal0，/tmp/iqc-b-rule-agent-types-final-20261029.log.exit=0，diff通过。保留原Prompt测试Ant未stub警告。

本轮没有重跑全量或Vite；之前501项全量只证明a4dead4组合，不能套在本轮新源。当前专项不是真实浏览器/岗位/PDP/成功持久化或完整I1–I7验收。所有输入为处理好的会话，不增加语音处理。


## 2026-10-29 B 四类资产引用与Skill能力分权/全量回归

基线5312ca8，仅merge固定8dc731e为a66c4c8。三个原spec仅补明确自身list/history权限fixture，保留Knowledge切换/卸载、Finding版本valueType、Skill/API精确快照及无效Schema草稿断言。新asset-reference-permissions.spec.ts 18项：四类RULE/AGENT/FINDING/KNOWLEDGE各自目录不代历史、历史不代目录、两在途撤回清查询不改父引用/code/valueType；Skill能力不借Agent目录权限、精确发布legacy快照、撤权保已存引用、敏感变化重取安全presentation并拒旧body、无效privacy不退回legacy正文、卸载拒迟到。未修改生产源码。

原83917 terminal0，/tmp/iqc-b-reference-permissions-20261029.log.exit=0，4文件24项通过11.25s（新18+原6）；原77895 vue-tsc terminal0，/tmp/iqc-b-reference-types-20261029.log.exit=0。最终原18992全量terminal0，/tmp/iqc-b-reference-full-ui-20261029.log.exit=0，63文件550项全部通过124.08s，包含规则/Agent固定源及新31项。diff通过，原未stub组件警告保留。

这是当前B快照真实Vue/受控API权限/Ant stub验证，不代表真实浏览器/组织PDP/写入或完整I1–I7验收；不含A尚在开发的方案权限修改。本轮未重跑Vite或部署。只处理既有会话数据，语音生成/转换不在范围。


## 2026-10-29 B 方案历史与依赖精确读取专项

基线2d2236b，仅merge固定de5ea70为8412b3b，文档冲突保留双方记录。新增schemes/operation-permissions.spec.ts 16项；旧history.spec.ts明确增加history权限fixture并把无授权用例名称改为list/history均无，原历史/归档/冻结/只读断言保持。未修改生产源码。

验证scheme:manage不代versions:view、历史独立不读目录；创建无依赖权限不请求目录，各Rule/Agent/Label目录独立；旧Rule目录不代检测/条件/阶段版本选择，授权后只选PUBLISHED，旧Agent目录不代历史且授权后只选兼容3.0发布版本；无history时已有规则精确引用保留；撤销依赖或历史清面板并拒迟到；旧保存完成不关闭权限变化后新开的表单；受限草稿不能空替换、同一规则版本冲突仍拒保存。

原66404 terminal0，/tmp/iqc-b-scheme-reference-permissions-20261029.log.exit=0，新增16+原history10+availability35共61项、3文件全部通过9.82s；原46323 vue-tsc terminal0，/tmp/iqc-b-scheme-reference-types-20261029.log.exit=0。diff通过，保留既有未stub组件提示。

真实Vue owning页面、受控API/权限与Ant stub，通过setupState验证，非浏览器/真实岗位/PDP/写入。未重跑全量或Vite，旧550全量不套当前方案新组合。未据本批认定方案所有试跑/导出/发布操作已完成分权；这些及完整I1–I7继续，输入仅已处理会话，无部署/语音处理。


## 2026-10-29 B 方案预览及发布确认撤权修复

方案历史专项a1d018b之后审查发现原check没有preview精确权限、availability/archive确认回调未重查publish、publish处理函数未独立核对自身权限。新增红测原61508 terminal1（20项中17通过3失败）实际复现前三条，不依赖改变后台授权。

最小修改原schemes/index.vue：检查依赖按钮与handler使用scheme:preview；停用/恢复、版本归档及发布使用现有scheme:publish。确认捕获原id/revision与操作代际，执行前再次检查当前权限、disposed和busy。权限/相关上下文变化及卸载使旧操作失效；撤权再恢复也不能复用旧确认，已发操作的迟到成功/错误不回写页面，归档刷新后再检查。发布保留成功试跑、原revision、结果检查确认及所有原语义，增加自身权限、busy与trial代际检查。没有改变服务端、数据库或框架；页面检查不替代服务端PDP。

原62486首修68项通过；最终原43339 terminal0，/tmp/iqc-b-scheme-command-final-20261029.log.exit=0，25项新spec+原history10+availability35共70项3文件通过14.70s，覆盖合法预览/发布、未授权、确认撤回/恢复、迟到回执及原领域回归。原5194 pnpm build terminal0，/tmp/iqc-b-scheme-command-build-20261029.log.exit=0，vue-tsc与Vite通过（Vite2m33s），保留现有Node引擎/chunk提示；diff通过。

本轮未重跑全量，旧550不套新组合；组件受控权限/API与Ant stub，不代表真实岗位/PDP/后台写入。方案试跑记录/详情/汇总/标签读取与任务执行复合授权仍需继续，不把这四入口修复视为全方案或完整I1–I7验收。输入仅已处理会话，无部署/语音处理。

## 2026-10-29 B 方案试跑分权与撤权恢复

基线0c868d1。原57646红测（/tmp/iqc-b-scheme-trial-red-20261029.log.exit=1）原25项通过、新8项失败，复现创建权限越读记录、只读用户打不开记录、目录权限越读详情、详情越读汇总/标签、单一权限创建并执行、无execute重试启动、撤权迟到正文回填。原页面最小修复：trial:create/view分别控制创建/记录，task:detail:view控制详情，summary/labels独立可选读取且失败不冒充零结果；创建执行需create+execute，重试启动需detail+execute，各await后检查当前权限及代际。六项grant变化同步关闭并清结果，保原pending requestId和冻结参数，恢复授权可按同一请求标识重试，不自动执行。

原36687为77通过1失败，试跑watcher数组返回导致publish权限变化误清面板，改为实际权限位字符串比较；原31663随后86项通过、原89143中间构建0。继续补撤权busy断言，原58132真实40通过1失败（/tmp/iqc-b-scheme-trial-busy-red-20261029.log.exit=1）：撤权后列表结束仍忙。保迟到结果拒收，finally释放busy并以入口busy保证单飞；增加重复刷新、恢复授权重读、执行回执撤权及卸载阻止串联。mock统一reset后逐测试重设默认，防一次性响应泄漏。

最终原7489 terminal0，/tmp/iqc-b-scheme-trial-complete-20261029.log.exit=0，3文件89项通过14.48s（本spec44、原history10、availability35）。最终原16036 terminal0，/tmp/iqc-b-scheme-trial-final-build-20261029.log.exit=0，vue-tsc/Vite通过，Vite1m2s，现有引擎/chunk提示保留。diff通过。未重跑全量，旧550不套当前组合；真实Vue/受控API权限与Ant stub不代表真实岗位/PDP、后台成功写或完整I1–I7验收。所有输入已为处理好的会话，语音处理不在范围，无部署或共享SQL修改。

## 2026-10-29 B 结果固定源与共享任务选择器

UI基线232d527，仅cherry-pick A固定7e301db为0537c75，不含A后续标签/评测修改或CI线程dirty。复用ReviewTaskSelector.spec.ts，权限fixture改响应式，逐例reset mock，保留原四项深链/名称搜索/手动ID/失败迟到断言；新增撤权恢复拒旧回执、撤权清已读目录且拒旧选择回调、disabled清在途且拒编辑、卸载拒回执/回调、taskType切换拒旧目录五项。

原10206 terminal1，/tmp/iqc-b-task-selector-red-20261029.log.exit=1，8通过1失败，真实复现EVALUATION切到BENCHMARK仍采用旧目录回执。原组件最小修改把taskType纳入同步失效watch，并为手动ID编辑补disposed守卫；保留手动输入/深链ID，不自动搜索或清除父筛选。最终原63056 terminal0，/tmp/iqc-b-task-selector-results-20261029.log.exit=0，选择器9+原结果导航12/路由6/分组3共30项四文件通过16.40s。旧结果导航测试仍有Ant stub及happy-dom尝试localhost:3000的EPERM日志，保留如实记录，不将其视真实浏览器/后台请求成功；本轮选择器API均受控mock。

原17981类型检查终态另记，未计通过前冻结源码。结果页全部精确grant/导出/撤权独立组件专项仍需补，现有导航和工具函数断言不替代该验收；真实PDP/岗位/成功持久化与完整I1–I7仍继续。所有输入为处理好的会话，不做语音处理。

最终原17981 vue-tsc --noEmit terminal0，/tmp/iqc-b-task-selector-types-20261029.log.exit=0，原进程持续跟进至结束，未因安静重启。diff通过，无在途构建；本轮未重跑Vite/全量。

## 2026-10-29 B 结果页精准读写及撤权命令验证

基线b1e6ed6，结果生产来自A固定7e301db（B定点0537c75）。新results/operation-permissions.spec.ts使用实际Vue页面、响应式权限与受控API，所有嵌套业务面板stub，避免后台调用。独立business/message列表、detail不借目录、conversation+hierarchy双授权、summary无权不读/失败不推断分数、普通export和labels:export分别与full/PII复合、旧Blob不下载/旧业务确认不复活均有专项。结果页原导航/路由/分组与共享选择器断言保留。

首轮原48382终态1是新Ant Table stub错误展开带record的slot（20失败/46异步错误）；修为原导航fixture已有的data-source表不展开slot，未修改生产逻辑/断言。干净红测原93326终态1，/tmp/iqc-b-results-operation-red-clean-20261029.log.exit=1，16通过4真实失败：仅result:view仍可反馈、发起复核、沉淀样本，以及feedback撤权恢复后旧确认可写。

原results/index.vue最小修复三个handler：feedback、review:create、sample:manage各自精确码，当前授权/disposed/列表与详情上下文/原权限代际核对；反馈确认前后、异步成功/失败回执均须仍在当前上下文。三项权限加入原sync失效watch，撤权再恢复不复活旧确认；不回滚已发服务端操作、不新建API/存储/框架能力。反馈保持原ID和类型/追加不覆盖语义。新增合法原payload、两个异步回执撤权、关闭详情与卸载使确认失效等正反回归。

原5437 terminal0，/tmp/iqc-b-results-operation-final-20261029.log.exit=0，5文件58项18.81s通过（新28+原结果导航12/路由6/分组3/选择器9）。原导航保留既有Ant stub/happy-dom localhost:3000 EPERM日志，新28项全部API受控；不把测试日志或受控成功当真实后台成功。原32977最终pnpm build仍在途，源码冻结，终态另记。未跑全量，旧550不套当前组合；全部适用I1–I7、真实五职责/PDP/成功写入/外部/监控/容量与A–E继续。输入仅处理好的会话，不做语音处理，未部署/修改共享SQL/framework。

最终原32977 pnpm build terminal0，/tmp/iqc-b-results-operation-build-20261029.log.exit=0，vue-tsc/Vite通过（Vite1m37s），现有Node引擎/chunk提示保留。原进程全程跟进，无重启；diff通过，无在途构建。进度记录已归入本UI工作树文档。

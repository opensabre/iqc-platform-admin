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

## 持久任务与轮次结束监控（2026-10-26）

原监控页增加持久任务状态、近5分钟已测轮次结束速率、历史终态未测量数、数据库采样健康及年龄。任务23/节点18/模型9系列兼容，任务组必须完整且依赖节点组，缺组明确无法确认；缺失/无效采样不补零。预算等待/暂停/计划/排队与结束状态分别显示，取消不是成功，目标UP不代表数据库样本有效。原权限/请求代次围栏保持，无新页/API/权限。编译构建/独立专项终态以根协作记录为准，未据图表宣称容量或完整PRD完成。

Root原56584 build终态0且/tmp/iqc-task-operational-ui.exit=0，vue-tsc/Vite通过，保留chunk提示，diff通过。Root未运行测试；23系列/旧控制面与采样失效、权限迟到等独立专项仍待B，未部署。

## 显式模型调用在途（2026-10-26）

原监控页可选activeModelCalls图，跨实例应用显式调用在途，不宣称供应商物理并发/GPU/预算占用。缺字段明确无法确认，已采样0与缺测区分，原非有限断点/权限代次不变。兼容旧9/18/23和可选单系列，不新增页面/API/权限。构建及独立采集/组件专项以根协作终态为准，完整I1–I7未完成，未部署。

Root原28604 build终态0且/tmp/iqc-model-active-ui.exit=0，vue-tsc/Vite通过（Vite2m7s），chunk提示保留，diff通过，Root未写/运行测试。新可选在途协议/页面与实际采集仍待B专项，未部署。

## Finding运营分布（2026-10-26）

原业务报告可选分组Finding频次，需report:view及原完整会话/PII双敏感读取；撤权清数据/代次和选项，恢复重选。机器与最新已完成业务复核后有效事实分开，保留来源缺测与事实缺失，显示五状态、KNOWN严重度和BOOL真/假；UNKNOWN不填FALSE，频次不当准确率，不输出任意原值/证据。复核后有效事实可包含未改判的机器值，不是全部逐项人工确认。无流水线Finding协议的方案不适用，缺/坏响应不伪造0。原页面/组件/接口复用，未新建权限或持久副本；正式口径与构建/专项终态见后端文档/根协作记录，完整I1–I7继续。

Root原57046 build终态0且/tmp/iqc-finding-distribution-ui.exit=0，vue-tsc/Vite通过（Vite1m13s），chunk提示保留，diff通过。Root未写/运行测试；后续页面复核来源说明与固定监控校验集成后另行构建，不把首轮证据外推后续变更。

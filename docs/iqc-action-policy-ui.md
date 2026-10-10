# 动作策略兼容
现有PipelineReleaseEditor重新拼装release，会丢弃新的actionPolicy字段。复用原编辑器，在加载/保存时保留策略并展示动作标识/类型/失败处理，不新建页面、权限或策略副本。该批只读展示，配置表单和动作执行尚未开放；后端仍负责条件、声明引用和发布快照校验。

摘要展示明确适配版本，早期v1缺少字段固定显示1；编辑其他流水线配置保留该字段，不采用最新版本推断。

# 结果动作记录
现有结果详情没有动作状态展示；ActionHistoryPanel复用该页、既有permission composable与Ant表格，不新增中心页面或来源数据副本。新只读GET与history:view显示最多100条状态/尝试/UTC时间/回执及输出引用/原因代码，无冻结内容或身份快照。结果/权限变化和卸载清空旧响应，加载失败显式错误，手动刷新不自动轮询；未开放发送/恢复，不代表生产调用链或全部动作类型已可执行。

## 结果动作检查请求入口
结果详情ActionHistoryPanel增加iqc:action:enqueue按钮，沿既有权限composable；还须有history:view才能进入动作面板。POST /iqc/conversation-results/{id}/actions/enqueue仅请求后台发现，DISCOVERY_REQUESTED提示稍后刷新，ALREADY_DISCOVERED只显示完成检查；不会显示“发送成功”。请求失败明确显示错误，点击期间防重复提交，切换结果/权限变化/卸载后废弃旧响应。请求成功后沿已有记录查询刷新，不自动轮询。
后端要求开关启用、生产冻结策略、来源创建者及稳定身份匹配，广泛结果读权限不等于能替创建者执行动作。组织DML_29为真实API注册资源，默认IQC_ADMIN/QUALITY_MANAGER。尚未运行浏览器/接口/迁移或动作网络验收。
动作记录nextAttemptAtUtc列调整为“下次检查/重试 UTC”：PENDING可以表示等待任务/固定复核轮次等前置条件，attempt0不代表发出过动作。候选动作完成只表示实际候选创建，后续标注/金标审核沿原流程。

## UNKNOWN 持久产物人工核对（B 独立分支）

复用结果详情 ActionHistoryPanel，新增独立 `iqc:action:reconcile` 操作；仍须先拥有 history:view。仅对三类已有本地只读核对能力（SAVE_RESULT、CREATE_REVIEW、ADD_TO_EVALUATION_CANDIDATE）的 REQUIRES_RECONCILIATION/UNKNOWN 行显示按钮。旧后端未返回version或版本超出JS安全整数时仍可阅读记录，不提供无法精确条件提交的按钮。

弹窗要求非空≤1000字原因，以当前结果ID、动作账本ID、观察version和原因调用后端；不提交产物引用或成功声明。提交中禁用重复操作和关闭弹窗，结果/权限变化或卸载废弃旧响应。响应须匹配动作ID与已知状态；CONFIRMED提示真实产物完成，UNCONFIRMED提示继续等待核对，STALE_OBSERVATION要求查看刷新后的记录。重新查询状态而不在本地伪造COMPLETE；请求异常/外来回执仅提示未确认，保留人工原因，不自动再次请求。后端仍负责原负责人稳定身份、冻结请求及CAS围栏。

验证：类型检查87951 exit0；定向89094 exit0，9项通过，覆盖权限、旧版本读取、远端/不安全版本不开放、原因、防重复、真实刷新、结果切换、撤权及外来回执。生产构建58003 exit0，4018 modules；完整最终64297 exit0，28文件180项通过。日志 `/private/tmp/iqc-b-reconcile-ui-{types,tests,build,final-tests}.log`。

首次完整测试1失败/179通过；A未改动4ba1d4f基线上同一导航测试94514 exit1（1失败/6通过），夹具空业务项与既有页面businessItems.length展示条件不符。仅在B导航测试补真实质检项并隔离无关动作面板，保留来源版本断言和页面生产逻辑；最终完整通过不包含失败轮。构建仍有已有Node/pnpm版本及chunk大小提示。

基线A UI4ba1d4f，B独立树feature/iqc-prd-b-action-ui；配套后端b2c3fa6与权限084d1ae均是独立提交。本轮组件测试使用原Vue/DOM测试方式和Ant组件stub；未宣称真实浏览器、四角色登录、HTTP/网关授权、生产动作链或部署通过。未修改A树/后端/组织/framework/gateway，未推送或合入A；完整尝试审计、阻塞恢复、远端适配与PRD其他能力继续。

## 2026-10-11：动作状态历史

原ActionHistoryPanel增加“查看历史”，复用history:view权限；单动作白名单事件、50条分页与十进制字符串游标。显示实际UTC时间/状态/回执引用和旧历史缺口，不提供发送/重试。关闭/刷新/换结果/撤权/卸载清空历史和标题，废弃响应，非法分页只提示错误。组件14、完整185及最终构建通过；真实浏览器仅分页等部分通过，最后复跑审批审核因额度失败未执行。边界/复现见[历史浏览器说明](iqc-action-state-history-browser.md)。

# 动作策略兼容
现有PipelineReleaseEditor重新拼装release，会丢弃新的actionPolicy字段。复用原编辑器，在加载/保存时保留策略并展示动作标识/类型/失败处理，不新建页面、权限或策略副本。该批只读展示，配置表单和动作执行尚未开放；后端仍负责条件、声明引用和发布快照校验。

摘要展示明确适配版本，早期v1缺少字段固定显示1；编辑其他流水线配置保留该字段，不采用最新版本推断。

# 结果动作记录
现有结果详情没有动作状态展示；ActionHistoryPanel复用该页、既有permission composable与Ant表格，不新增中心页面或来源数据副本。新只读GET与history:view显示最多100条状态/尝试/UTC时间/回执及输出引用/原因代码，无冻结内容或身份快照。结果/权限变化和卸载清空旧响应，加载失败显式错误，手动刷新不自动轮询；未开放发送/恢复，不代表生产调用链或全部动作类型已可执行。

## 结果动作检查请求入口
结果详情ActionHistoryPanel增加iqc:action:enqueue按钮，沿既有权限composable；还须有history:view才能进入动作面板。POST /iqc/conversation-results/{id}/actions/enqueue仅请求后台发现，DISCOVERY_REQUESTED提示稍后刷新，ALREADY_DISCOVERED只显示完成检查；不会显示“发送成功”。请求失败明确显示错误，点击期间防重复提交，切换结果/权限变化/卸载后废弃旧响应。请求成功后沿已有记录查询刷新，不自动轮询。
后端要求开关启用、生产冻结策略、来源创建者及稳定身份匹配，广泛结果读权限不等于能替创建者执行动作。组织DML_29为真实API注册资源，默认IQC_ADMIN/QUALITY_MANAGER。尚未运行浏览器/接口/迁移或动作网络验收。

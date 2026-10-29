# 并行提前满足配置集成

状态：类型、校验、独立组件与父设计器已在独立集成分支接通；运行验收待完成。

后端契约来自 feature/iqc-prd-parallel-policy 的94e530f：pipeline.schemaVersion为iqc-pipeline-parallel-v2，completionPolicy包含requiredNodes与可空condition。旧schema只可ALL，不能悄悄携带或丢弃新政策。

## 设计器集成步骤（开发者B负责原编辑器）

1. 当前 views/pipelines/index.vue 的加载白名单会拒绝v2。只有完成编辑器保留策略与保存校验后才同步开放该白名单，避免开放后静默降级。加载时区分sequential、parallel-v1 ALL和parallel-v2策略；保存必须保留政策。历史v2不能按“非parallel-v1”自动载入成串行。
2. 显式选择ALL或提前满足。切换为ALL才移除completionPolicy；未知协议不自动降级。策略模式必须使用v2。
3. 引用ParallelCompletionPolicyEditor，传入v-model、当前完整PipelineNode[]和disabled；持有组件ref。保存时调用ref.validated()，阻止比较值输入无效时悄悄保存旧值；再用validateParallelCompletionPolicy复核最终转换后的nodes。
4. 图编辑改名/停用/删除必需节点时保留旧引用并明确报错，由用户调整；不能自动删requiredNodes放宽策略。条件变量只能由必需成功节点（含其备用输出声明）唯一生产。
5. 服务端发布和冻结继续权威校验。旧ALL定义不新增null字段，不将组件默认值写入历史快照。

组件不负责选择执行模式、发起保存或替代发布校验。比较值复用selectorJsonNeedsExactEditor，无法由浏览器精确保留的十进制拒绝编辑，不自动舍入；可用原精确JSON接口提交。节点输入/输出schema、变量祖先作用域和Fallback仍由原流程校验。

验收需覆盖只读状态、旧模式保持、v2保存重开、无效/失效引用、非法JSON保存阻止、精确数值拒绝、条件缺失不推断命中、图与列表双向同步及实际发布/任务；当前未新增或执行测试、SQL或部署。


## 父设计器接入（独立集成分支，2026-10-17）

PipelineReleaseEditor显式选择ALL/提前满足，载入保留v2策略，关闭并行或改ALL才明确移除政策。保存调用子组件validated阻止非法比较值草稿，再以最终转换后的节点做完整引用校验。条件编辑器观察当前输出schema JSON，不使用修改前的旧声明。删除/停用/重命名节点不会自动修改必需列表。原图预览/列表配置/发布流程保留，不冒称已实现拖拽DAG。

页面加载白名单与父编辑器一起开放v2，并拒绝v2缺政策或旧协议夹带政策的异常快照，避免静默降级。新分支不改开发者B的工作树。编译状态见根协作记录；尚未新增或执行测试、浏览器、数据库或部署。

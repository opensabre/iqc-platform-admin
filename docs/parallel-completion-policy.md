# 并行提前满足配置集成

状态：类型、校验及独立组件已编码；尚未接入设计器，首轮84123前端构建通过；随后只读事件防御和非有限数值防御的最终构建另记。运行验收待完成。

后端契约来自 feature/iqc-prd-parallel-policy 的94e530f：pipeline.schemaVersion为iqc-pipeline-parallel-v2，completionPolicy包含requiredNodes与可空condition。旧schema只可ALL，不能悄悄携带或丢弃新政策。

## 设计器集成步骤（开发者B负责原编辑器）

1. 当前 views/pipelines/index.vue 的加载白名单会拒绝v2。只有完成编辑器保留策略与保存校验后才同步开放该白名单，避免开放后静默降级。加载时区分sequential、parallel-v1 ALL和parallel-v2策略；保存必须保留政策。历史v2不能按“非parallel-v1”自动载入成串行。
2. 显式选择ALL或提前满足。切换为ALL才移除completionPolicy；未知协议不自动降级。策略模式必须使用v2。
3. 引用ParallelCompletionPolicyEditor，传入v-model、当前完整PipelineNode[]和disabled；持有组件ref。保存时调用ref.validated()，阻止比较值输入无效时悄悄保存旧值；再用validateParallelCompletionPolicy复核最终转换后的nodes。
4. 图编辑改名/停用/删除必需节点时保留旧引用并明确报错，由用户调整；不能自动删requiredNodes放宽策略。条件变量只能由必需成功节点（含其备用输出声明）唯一生产。
5. 服务端发布和冻结继续权威校验。旧ALL定义不新增null字段，不将组件默认值写入历史快照。

组件不负责选择执行模式、发起保存或替代发布校验。比较值复用selectorJsonNeedsExactEditor，无法由浏览器精确保留的十进制拒绝编辑，不自动舍入；可用原精确JSON接口提交。节点输入/输出schema、变量祖先作用域和Fallback仍由原流程校验。

验收需覆盖只读状态、旧模式保持、v2保存重开、无效/失效引用、非法JSON保存阻止、精确数值拒绝、条件缺失不推断命中、图与列表双向同步及实际发布/任务；当前未新增或执行测试、SQL或部署。

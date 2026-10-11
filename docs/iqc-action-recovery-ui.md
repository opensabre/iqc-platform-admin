# 阻塞动作恢复页面

复用结果动作记录页面、原因弹窗和历史记录，不新增页面。查看权限与独立iqc:action:recover权限均须满足。仅BLOCKED_SOURCE/BLOCKED_AUTHORIZATION/BLOCKED_ADAPTER且原结果为零尝试无outcome或CONFIRMED_RETRYABLE_FAILURE提供操作；UNKNOWN不提供恢复。

请求只提交原观察版本和必填原因（规范化后≤1000字），不提交身份、权限、输入或回执。页面只接受相同动作的RECOVERED/NOT_RECOVERED响应，再加载实际服务端记录；不把恢复当执行成功。重复点击、权限撤销、结果切换、刷新及卸载使用原请求代次围栏。历史中的recoveryReason经过长度/类型检查并作为文本展示。

本地组件测试6130 exit0，24项零失败，新增5项覆盖不安全版本/UNKNOWN、原因必填/重复提交/实际刷新、权限撤销、刷新观察失效、异动作响应拒绝。测试为DOM组件模拟，并非实际浏览器或服务端授权验收。构建17775 terminal exit0，vue-tsc与Vite构建通过，保留原engine/chunk提示；真实SQL/事务和浏览器验收未完成。

恢复页面提交d78c06d后的全量前端回归73630 terminal exit0，实际测试数量见本轮交接记录；原组件替身的Vue提示仍在。未运行真实浏览器；测试依赖链接已删除，不污染A工作区。

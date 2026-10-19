# 周期调度读取失败浏览器验证

## 范围与入口

基线 UI `0c430ac`，独立分支 `feature/iqc-prd-b-ui-validation`。使用真实 Vue 页面、Ant Design Drawer/Input/Button、Pinia 和 Axios 响应拦截器，只有 Axios adapter 与权限状态使用本地夹具。数据是合成的已处理会话调度，不涉及语音转换。未连接后端、共享数据库或真实权限服务。

可复现入口 `scripts/browser-fixtures/schedule-read-privacy.html`。在本仓库启动 Vite 后打开该路径。夹具授权 schedule:view/detail:view/update，不授流水线目录及历史权限。`window.validation` 记录 reads/writes；设置 failRead=true 注入详情读取失败。

## 已取得证据

本轮缓存 Playwright CLI 会话 `iqc-b-ui`，本机 Vite 127.0.0.1:4317：

1. 点击“会话质检日调度”，真实 Drawer 展示名称、六字段 Cron、Asia/Shanghai、生效时间及流水线/选择器精确引用，并展示保存按钮。
2. 执行 `window.validation.failRead=true`，点击“重新加载”。页面显示“调度详情读取失败，旧配置已清除，请重新加载”，切为受限/需要重新读取提示。
3. 读取失败后 DOM 无 input、无“保存草稿”按钮，正文与旧编辑值已移除。实际计数 reads=2、writes=0；未意外重发写请求。
4. 快照：本地忽略产物 `.playwright-cli/page-2026-10-19T11-17-27-516Z.yml`（成功）及 `page-2026-10-19T11-19-05-171Z.yml`（读取失败）。

最初夹具直接引用不存在的 Vite 预构建路径导致加载失败，已改为标准 bare imports 后重新加载成功；此前失败不算通过证据。

## 未证明的范围

尚未验证保存成功后读取失败、关闭/卸载后迟到响应、订阅/选择器/模型诊断页面、真实服务/PDP角色联调及完整 I1–I7。当前只证明周期调度已有详情重新读取失败时的浏览器行为，不能替代全 PRD 验收。

## 第二轮：保存后读取失败与卸载后迟到响应

同一基线，真实浏览器打开已提交的 fixture 路径，未修改生产页面：

- 正常打开详情后设置 failRead=true，再点击“保存草稿”。本轮快照 `.playwright-cli/page-2026-10-19T11-23-29-700Z.yml` 显示保存成功及重新读取失败提示。后续 DOM 实测 reads=2、writes=1、inputs=0、保存按钮数=0、草稿修订已更新为2。说明写入已确认且没有重复提交，读取失败后清除了可编辑正文。该用例未编辑名称，验证的是保存命令及回执处理。
- 为 fixture 增加 holdRead/readPending/releaseRead/unmount 控制。重新载入，holdRead=true，点击详情并确认 readPending=true 后卸载真实 Vue app，再释放原 GET。释放后 pending=false、reads=1、writes=0、页面正文为空、input数=0、Drawer数=0。证明当前详情 load 的卸载代次保护，不外推保存、发布或预览中的异步续体。
- 此轮有一次使用错误元素 ref 的 CLI 操作，返回 Ref not found；重新 snapshot 后用真实引用继续，无生产修改。唯一控制台加载错误为 favicon 404，不作为功能通过证据。

仍需单独验证：保存/发布/预览响应在卸载后到达、Drawer关闭后历史响应、事件订阅和其它配置页面、真实角色及后端联调。

## 命令迟到续体缺陷及修复

在同基线新增 `src/views/tasks/schedule-lifecycle.spec.ts`，用真实页面按钮/确认回调触发命令、挂起 API Promise 后卸载，再成功或失败返回。未修复最终轮 `/tmp/iqc-b-schedule-lifecycle-red-final.log` 终态1：14项中13失败、1通过，保存/发布/启停成功仍发全局提示并继续GET，失败仍发错误提示；预览失败仍发提示。首次订阅夹具 schema 拼写错误已在该最终红轮前纠正。

两个页面新增组件卸载标记，命令完成/错误/后续读取及确认框回调先检查生命周期；卸载后不再更新正文、弹全局提示或发起新读取。沿用各详情/历史现有 generation；历史读取失效后也不继续请求实例。已经发出的服务端命令不会因页面离开而取消或回滚，用户返回页面仍应重新读取确认。

最终专项 `/tmp/iqc-b-schedule-lifecycle-final.log` 终态0，24项通过：两个页面保存/发布/启停成功与失败迟到、周期预览成功/失败迟到；保存后GET成功/失败迟到；卸载后才接受发布确认；正常保存仍更新修订及列表；已保存但读取失败仍保留明确提示并禁编辑。测试使用 happy-dom、API与权限mock，真实 Vue页面及响应续体，不替代真实浏览器、PDP或服务端事务证据。

类型检查 `/tmp/iqc-b-schedule-lifecycle-typecheck.log` 原进程终态0。完整前端 Vitest 首轮 `/tmp/iqc-b-ui-lifecycle-full.log` 终态1：38文件、263项中262通过，唯一失败是已有 `PipelineDependencyGraph.spec.ts` 将新增连接按钮也当成节点，期望2但获得3；与生命周期修复无共享代码。不能称完整套件通过，需修正该旧测试的节点选择范围后核对。

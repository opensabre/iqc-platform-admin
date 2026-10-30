# 流水线准入预览上下文

基线为 UI PR17 固定 `21565da`。原准入预览的评测/资产监听默认异步，同轮改变再恢复可能保留旧请求代次；编辑草稿不会主动清除旧准入报告，导航也未重置预览 loading。

复用原 invalidateGate，将评测和资产修订监听改为同步；dirty 变化立即清报告并失效旧请求。预览保存原资产 ID、草稿修订、详情代次和精确评测引用，成功/错误回执都检查当前上下文、只读权限和页面存活状态；旧 finally 不解除新预览 loading。卸载走原 invalidateGate 清报告、错误和 loading。没有更改服务端准入阈值、发布接口或管理员覆盖语义。

验证源码/测试在进程运行期间冻结：

- 旧源码首次新增 9 项：原37268 terminal1，63 项中 6 失败、57 通过，8.01s；日志 `/tmp/iqc-b-pipeline-gate-red.log`。
- 修复后初轮原31117 terminal0，流水线两文件69项通过；追加编辑改回、迟到错误、当前错误和修订变化边界后，原96935 terminal0，`pnpm exec vitest run src/views/pipelines` 两文件73项通过，8.15s，日志 `/tmp/iqc-b-pipeline-gate-final.log`。
- 原50876 terminal0，`pnpm build` 的 vue-tsc 与 Vite 均通过，Vite 1m13s，日志 `/tmp/iqc-b-pipeline-gate-build.log`。Node/pnpm版本提示和chunk体积提示保留。

测试使用实际流水线页面、受控API及组件替身，验证正常原参数、无关权限变化、独立gate读取权限、撤权恢复、迟到成功/失败、编辑改回、新预览与卸载。没有据此宣称真实浏览器、服务端PDP、发布持久化或完整PRD验收通过。本PR仅接现有PR17，小项独立交付。

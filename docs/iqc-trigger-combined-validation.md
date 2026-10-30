# 调度与订阅四专项组合验证

本组合基于 PR26 固定 `23a0c16`，生产页面保持 PR24 固定 `2a1f7e2`，无生产改动。将 PR21 `50312f9` 发布、PR23 `6f06645` 读取、PR25 `9b13c1d` 草稿专项的唯一用例合入现有生命周期文件，复用读取专项的响应式权限与流水线 API 夹具，公共原有 24 项只保留一次。

旧读取专项要求敏感撤权后保留私有 definition，适用范围早于 PR22 的私有草稿清理。最终断言改为立即清除 definition 流水线、draftConfigJson、name 与读取列表，同时保留 id、draftRevision、activeRevisionId 公共身份。没有放宽撤权或恢复旧私有数据。

验证时源码与测试冻结：

- `pnpm exec vitest run src/views/tasks/schedule-lifecycle.spec.ts`：117 项同跑通过，4.93 秒；原进程 70683 terminal 0，日志 `/tmp/iqc-b-trigger-combined-tests.log`。
- `pnpm exec vue-tsc --noEmit`：原进程 85238 terminal 0，日志 `/tmp/iqc-b-trigger-combined-types.log`。
- 生产两个页面相对 `2a1f7e2` diff 为空；`git diff --check` 通过。

117 项包含原有 24、发布 16、读取 20、草稿 29、放弃确认 28，实际在同一文件同一源码运行。采用实际 Vue 页面与受控 API/Ant 组件夹具，覆盖撤权恢复、迟到读写、旧 finally、正常原参数、确认所属编辑与无关权限变化；不代表真实浏览器、服务端 PDP、持久化、远端完整 CI 或整个 PRD 验收。其它模块尚须按各自固定证据合流。

本 PR 接 PR26，不重复提交四份原专项文档；前三项测试为内容组合，不声称它们的提交是本分支 Git 祖先。

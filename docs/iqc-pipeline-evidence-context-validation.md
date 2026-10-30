# 评测证据执行轮次的选择上下文

基于 PR50 固定 `b5a50e0`。质量/回归任务的原异步监听会合并同轮改动，选择任务后再恢复时旧执行列表可能重新入选。原错误回执只检查请求代次，切换流水线后的迟到错误仍会污染当前准入提示。

复用原 qualityGeneration/regressionGeneration，将两类任务监听改为同步。每次选择立即清除所属执行列表和执行ID，即使随后恢复原选择，旧请求也已失效。成功、错误回执共用存活状态、准确 executions:view 权限、所属代次、原资产ID及详情代次检查。两类证据保持独立，继续仅展示终态执行。不新增API、权限或持久化模型。

验证期间源与测试冻结，原句柄跟到终态：

- 原82311 terminal1：旧源增加8项回归用例，75项中6失败69通过，7.05s；日志 `/tmp/iqc-b-pipeline-evidence-red.log`。
- 原6779 terminal0：`pnpm exec vitest run src/views/pipelines` 两文件81项通过，7.32s；日志 `/tmp/iqc-b-pipeline-evidence-final.log`。
- 原90301 terminal0：`pnpm exec vue-tsc --noEmit` 通过；日志 `/tmp/iqc-b-pipeline-evidence-types.log`。
- `git diff --check` 通过。本轮未运行Vite或全量前端测试，不沿用父项构建作为本轮构建证据。

两类选择立即清理、改动后恢复、旧资产迟到错误与独立正常终态投影分别验证；现有准入预览及任务创建回归也在81项中同跑。采用实际Vue页面、受控API和组件替身，不代表真实浏览器/PDP、发布持久化或整个PRD验收。

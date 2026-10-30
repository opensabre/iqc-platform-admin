# 发布确认绑定已核对准入报告

基于PR51固定 `8d400c6`。原发布确认只比较当前评测值；评测/草稿改动后再恢复，准入报告已失效却仍可能提交。新报告替换旧报告后，旧确认也可使用新上下文。

复用原gateGeneration：打开确认时保存原准入报告对象、代次及原流水线ID/修订；确认时要求同一报告、同一代次且无进行中的预览，普通发布仍要求报告通过。报告失效或替换后必须重新核对并发起确认。普通与管理员例外路径均适用；原例外原因和精确评测引用继续冻结，不改变服务端重新核验语义、权限或发布接口。

源码与测试冻结至原句柄终态：

- 初轮原55084 terminal1，85项8失败77通过。随后将gate读取grant从一开始即授予，排除测试中新授grant触发现有command守卫的干扰；最终旧源原35786 terminal1，10项新增全部失败，75原有通过，3.76s。日志 `/tmp/iqc-b-pipeline-publication-gate-red-final.log`。
- 修复后原16938 terminal0，`pnpm exec vitest run src/views/pipelines` 两文件91项通过，4.14s；日志 `/tmp/iqc-b-pipeline-publication-gate-final.log`。
- 原2412 terminal0，`pnpm exec vue-tsc --noEmit` 通过，日志 `/tmp/iqc-b-pipeline-publication-gate-types.log`；`git diff --check` 通过。本轮未Vite或全量前端测试。

新增10项分别验证两种发布的评测改回、草稿改回、报告替换、重新预览、失效后新确认合法提交。正常原参数/独立权限/原例外原因等既有回归同跑；实际Vue页面使用受控API与组件替身，不代表真实浏览器/PDP/发布持久化或全部PRD验收。

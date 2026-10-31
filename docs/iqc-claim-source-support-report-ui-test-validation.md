# 来源支持报告展示专项验证

基于 UI60 固定 `2e1c0fc556b04580acc55b28afabac1994946cf0`（报告59与表单测试58正常组合），仅扩展原 `BusinessQualityReport.spec.ts` 及本文档。真实组件挂载，沿用原生 DOM 的 Ant Design 测试桩、受控 API 与响应式权限；不引入生产组件或接口。

## 验证范围

新增26项，原报告22项保留：

- 默认调用不变，显式勾选才请求 Finding 摘要；三类结论、未标注、范围和限制独立展示。
- UNMEASURED/null 与 UNANNOTATED/0、COMPLETE 区分；旧响应缺失/null 不补零。
- long 最大值与超过 Number 精度的计数原样显示，PARTIAL 在覆盖率舍入为100%时仍为部分标注；验证六位 HALF_UP 恰逢舍入中点。
- 错版本/范围、两种计数守恒破坏、非规范整数、超long、数字类型、负数、错状态/覆盖率、NaN/Infinity/缺失有效覆盖率均拒绝摘要；零分母非null、无机器来源却存在声明亦拒绝。
- 两个冻结组的不同摘要分别展示，变更统计口径清理旧结果，FIRST_PER_CONVERSATION 请求不携带执行选择。
- 报告/完整会话/PII三权限逐一撤销，已加载摘要立即清除；恢复不复活旧数据，撤权前发出的晚到响应丢弃，必须重新勾选和查询。

## 本机证据

2026-10-31，离线 frozen-lockfile 安装原91669 terminal0，锁文件未改。

`pnpm exec vitest run src/components/BusinessQualityReport.spec.ts src/components/ClaimSourceSupportEditor.spec.ts src/components/BusinessReviewPanel.spec.ts`

原1971：70项通过，报告48/表单9/父面板13。新增报告触发表格列组件未注册警告，补齐原DOM夹具列组件桩，保留同一断言后，最终原9824 terminal0：三文件70项全通过，6.37秒。日志 `/tmp/iqc-b-claim-report-ui-tests-final-20261031.log` 及 `.exit`。

`pnpm exec vue-tsc --noEmit`：原23098及最终47394均terminal0；最终日志 `/tmp/iqc-b-claim-report-ui-typecheck-final-20261031.log` 及 `.exit`。最终运行期间源码冻结；测试中的父面板既有组件桩警告仍保留，未据此扩大修改。`git diff --check` 通过。

## 边界

组件测试不等于真实浏览器/真实Ant组件集成、实际登录/PDP/远程撤权、SQL报告聚合或独立Gold语义评估。本次没有验证任意分组与轮次组合、执行实例指定后晚到响应等全部排列。未新增语音转换或音频数据流程。自动最终头CI须独立跟踪，不以本机70项或父分支绿色推断。

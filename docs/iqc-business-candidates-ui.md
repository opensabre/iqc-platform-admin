# 业务复核会话候选入口

2026-10-05：从开发者B候选交付提取必要前端源码，保留A业务复核与金标入口，没有提取或新增测试。

复用 BusinessReviewPanel、quality API 和样本库。已完成且可解析的复核轮次可选择正向、负向、误判、漏判候选；POST既有 samples API，带 targetType=BUSINESS、reviewId、requestId、sampleType。服务端冻结完整原输入、业务裁决及来源，不自动生成 Finding 金标。

提交失败保留原请求以供幂等重试，切换结果使旧异步响应失效；样本库明确CANDIDATE仍需独立标注审核，并保留GoldSampleEditor。继续复用 iqc:sample:manage，没有新增权限或页面。

数据库、角色和浏览器验收尚未运行；候选入库不等于成为已审核金标，也不等于进入回归集。后续由金标审核和Dataset精确冻结版本闭环承接。

最终 `npm run build`（vue-tsc + Vite）成功，包含评测页面和本候选入口；没有新增或执行测试。B原工作树及node_modules保持原状，A构建临时软链已删除。

## 自动挖掘来源说明与读取权限（2026-10-25）

原样本库增加“挖掘依据（非裁决）”，将已知策略 v1 的缺失/未知/冲突/错误/未评测、未测量/低置信度及原始观测分歧显示为待核实线索。仅当前 sample:view、完整会话、PII 三权限均有，且服务端 iqc-gold-read-v1 投影明确允许 candidateContentVisible 时，才解析最多 16384 字符的原 expectedJson；未知协议/策略/版本/原因或非法数组显示不可用，不回显来源正文或自定义字符串。依据不填充 Gold，也不代表误判结论；类型“未分类（挖掘来源）”与 Gold 审核状态独立。

sample:view、完整会话或 PII 读取权限变化同步清除已加载样本；样本页废弃挂起读取并按当前授权重读。无样本读取权限不请求 listSamples。组织范围继续由后端 IqcDataScope 与当前身份负责，前端不推断跨组可见性。撤权不取消已经发出的服务端命令，Gold 编辑器继续使用其独立授权及请求代次保护。

本批构建与 B 独立专项的终态以根协作记录为准；构建不证明真实 PDP/组织撤权或浏览器整链。

Root 本轮原77145构建终态0，/tmp/iqc-mined-pool-permission-ui.exit=0；vue-tsc + Vite通过，Vite耗时2m5s，现有chunk提示保留。Root未新增或运行测试；权限变更/迟到响应及来源说明交互的独立专项仍交 B。

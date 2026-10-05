# 业务复核会话候选入口

2026-10-05：从开发者B候选交付提取必要前端源码，保留A业务复核与金标入口，没有提取或新增测试。

复用 BusinessReviewPanel、quality API 和样本库。已完成且可解析的复核轮次可选择正向、负向、误判、漏判候选；POST既有 samples API，带 targetType=BUSINESS、reviewId、requestId、sampleType。服务端冻结完整原输入、业务裁决及来源，不自动生成 Finding 金标。

提交失败保留原请求以供幂等重试，切换结果使旧异步响应失效；样本库明确CANDIDATE仍需独立标注审核，并保留GoldSampleEditor。继续复用 iqc:sample:manage，没有新增权限或页面。

数据库、角色和浏览器验收尚未运行；候选入库不等于成为已审核金标，也不等于进入回归集。后续由金标审核和Dataset精确冻结版本闭环承接。

最终 `npm run build`（vue-tsc + Vite）成功，包含评测页面和本候选入口；没有新增或执行测试。B原工作树及node_modules保持原状，A构建临时软链已删除。

# 灰度任务页面验证（2026-10-20）

输入范围为已处理会话；不包含语音转换、ASR或转写生成。

## 基线与修复

B UI基线6822b3f，包含A的灰度策略历史/任务表单提交c5db906、cb0a0ec（本树f0ffecc、6822b3f）及既有周期/事件页面修复。

新组件回归使用真实流水线页面的命令处理，模拟API和子组件；直接驱动挂载组件的命令边界，不能替代完整浏览器或服务端验收。修复前6项中4项失败：灰度/手动发布创建在组件卸载后收到成功响应仍发全局提示，失败响应仍写旧页面错误。另2项原请求重试通过。日志：`/tmp/iqc-b-pipeline-command-lifecycle-before.log`，原58344 exit1。更早9856为测试表格stub错误，不作为生产缺陷证据。

修复在卸载时废弃本地创建命令；异步成功、失败、清理以及再次重试均检查生命周期。服务器任务不取消、不重写。原请求重试仍冻结名称、会话、并发及请求标识，返回已有任务时保留原状态。

定向回归原13725 exit0，30项通过（新增流水线6项、既有周期/订阅24项）。最终全套原87809 exit0，39文件269项通过，日志`/tmp/iqc-b-rollout-ui-full.log`。不是后端或真实角色验证。

## 真实浏览器与本地合成API

夹具：`scripts/browser-fixtures/pipeline-rollout-task.html`。使用实际Vue、Pinia、Ant Design、流水线页面、编辑器及会话选择器；Axios本地适配器返回合成已处理会话，未调用共享服务。未知写请求直接拒绝。

运行：启动本地Vite后访问 `/scripts/browser-fixtures/pipeline-rollout-task.html`。编辑“处理后会话质检”，任务方式选“按已保存灰度策略分配”，填写名称、选择会话、创建；默认首次故障，再点“使用原请求重试”。

实测两次请求完整JSON相同（count=2、same=true）；首次失败锁定参数并显示原请求重试；成功回执保留`SUCCEEDED`，显示“灰度修订 r3 · 候选 · 发布版本 v2”。这证明表单和公开回执的显示，不证明服务端真实分配或持久化。

修复后访问 `?mode=late`，经真实控件创建任务，确认 `validation.pending`，调用夹具`validation.unmount()`后`validation.release()`；MutationObserver在响应后的200ms内记录：count=1、pending=false、body为空、additions为空。组件单测另覆盖迟到失败。初版空节点夹具触发编辑器校验失败，已修正为显式引用的合成RULE节点；该次失败不计成功验收。

保留边界：无真实HTTP服务、PDP账号、SQL、worker、模型供应商或容量测试；`?mode=denied`是可用夹具模式，本轮未完成浏览器验收。完整PRD目标仍未完成。

## 构建与交接

`npm run build`原31837 terminal exit0，先完成vue-tsc，再Vite构建（2m31s），日志`/tmp/iqc-b-rollout-ui-build.log`。存在大于500kB产物提示，无构建错误。本地浏览器iqc-rollout和Vite原84967均已关闭。

A前端当前有加权融合相关未提交改动，本次不向该工作树自动应用；仅提供独立提交交接，避免覆盖并行开发内容。

# 最终前端固定模块组合（2026-10-31）

生产/测试组合基线 `655d338beebe1ff9c697df86ba58361233e592ff`；随后仅增加本文。最终文档头和自动CI精确head/run见对应PR，不用父分支通过数相加。

## 合流来源

| 模块 | 固定提交 | 原自动CI |
| --- | --- | --- |
| 流水线、调度与订阅 | `d2ad96af08171121b7bc044006c18e0c37acfa1b` / PR54 | [41070481630](https://github.com/opensabre/iqc-platform-admin/actions/runs/41070481630) |
| 知识库 | `0cc0c1cd6e98d0cf791ef037aa138514cc509120` / PR44 | [41014953441](https://github.com/opensabre/iqc-platform-admin/actions/runs/41014953441) |
| 数据集 | `8747ea98283e7a8e494a1867de298689d44f3b67` / PR45 | [41015046013](https://github.com/opensabre/iqc-platform-admin/actions/runs/41015046013) |
| 质量运营/Gold | `04f39cb8b3384a07c3e899e9fd30fa5b55367a0c` / PR48 | [41068597292](https://github.com/opensabre/iqc-platform-admin/actions/runs/41068597292) |
| 消息裁决专项 | `c5d3444bf25a2ad8cc830ab4cd701f68dba47146` / PR33 | 既有独立专项与类型检查，另纳入本组合CI |
| Gold操作专项 | `fe4bdf81e008216ab7a007b2a0fa838af93236fb` / PR35 | 既有独立专项与类型检查，另纳入本组合CI |

复用原CI配置 `3c33eb508c1da65db41c4484856e6e2ebb79d089`，原类型检查/覆盖率/生产资源/Docker命令、权限、needs与PR不推镜像语义保持。

## 一致性核对

在独立工作树正常本地merge全部固定提交，均自动合并；未手写生产/测试冲突、未cherry-pick重做功能。上述来源及CI提交全部通过 `git merge-base --is-ancestor`，对应拥有路径通过 `git diff --exit-code`：

- 流水线目录与两个调度/订阅页面、原生命周期spec与PR54一致。
- knowledge-bases目录与PR44一致；evaluation-datasets目录与PR45一致。
- 质量运营页面、候选/父页确认spec及Gold组件与PR48一致。
- 独立消息裁决spec与PR33一致，Gold组件spec与PR35一致。
- 唯一workflow与原CI提交一致，未增加第二套检查或降低断言。

原小PR保留逐项审阅；本组合接PR54用于跨模块同头验证，不直接推进集成review/main，不远端合并或部署。Root仅源码/祖先/diff核对，不写跑本地测试、构建或主动dispatch；自动PR完整CI结果以本组合实际head/run/job终态补入PR与协作记录。

## 验收范围

这覆盖当前已固定前端模块的一致组合，仍须观察本头完整CI，不能用表内各轮数字推断本轮数量或成功。即使通过，也不是实际登录/PDP、跨组织敏感读写、真实供应商、业务A–E、百万容量或全部适用I1–I7完成。输入仍为已处理会话，排除语音转换，单租户沿原组织范围。默认v2/动作开关、共享SQL、后端及框架源码均未改。

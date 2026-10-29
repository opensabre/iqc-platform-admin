# 调度与订阅私有草稿及写回验证

基于 PR22 固定1d9a3bc，保原24项异步生命周期，加两页面各14项及periodic预览1项，共53项。只改原schedule-lifecycle.spec.ts与本文，不改生产。

覆盖详情撤权恢复迟到；三敏感grant分别清名称/正文/lastError；重授权新读不被旧finally解锁；update/publish/availability撤权恢复后不采用旧回执、不继续详情或目录读取；敏感撤权旧保存不恢复正文；无detail合法新建不越读；confirmed回执读失败只保元数据需重读；正常update保原ID/修订/冻结目标；无关grant保未保存编辑；periodic预览迟到不恢复时间。

原50545在PR20旧生产上terminal1，53项25失败28通过（包括旧保存错误串入新详情等待所触发的两项有界超时），/tmp/iqc-b-trigger-draft-red.log.exit=1。保持相同测试、正常快进1d9a3bc后原57902 terminal0，53项4.00s全部通过，/tmp/iqc-b-trigger-draft-final.log.exit=0。生产源完全为协作者已固定版本，无B修改。类型检查终态另补。

Vue/API/权限为受控组件测试。未验证真实岗位/PDP、后台写入、外部供应商、浏览器或完整PRD；旧放弃确认由协作者下一项单独修复。已处理会话输入范围不变，无框架/数据库/部署操作。

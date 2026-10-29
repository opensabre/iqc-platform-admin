# 调度与订阅发布确认回归

针对 PR18 固定0fdb83f，仅扩原schedule-lifecycle.spec.ts，不改生产。每个页面新增8项，共16项，原24项保留：确认时自身publish码；撤权恢复；三项敏感读取grant分别撤权恢复；同资产重读details代际；无关grant变化仍用原id/revision发布；恢复授权后新确认正常发布且旧确认不写。

旧生产源码原21361 terminal1，40项14失败26通过，/tmp/iqc-b-trigger-publish-red.log.exit=1。取协作者固定0fdb83f后原59121 terminal0，40项5.83s全部通过，/tmp/iqc-b-trigger-publish-final.log.exit=0。生产两页面与该固定源逐字一致，文档追加冲突保留双方记录。

Vue处理函数、响应与权限为受控组件证据。仅验证确认发出边界与原生命周期，不代表写后回读、草稿副本、真实岗位/PDP、浏览器或完整PRD验收。已处理会话输入范围保持；无框架、数据库或部署变更。PR基线复跑及类型检查终态另补。

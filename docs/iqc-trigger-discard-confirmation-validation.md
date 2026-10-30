# 调度与订阅放弃确认回归

针对 PR24 固定2a1f7e2，只扩原schedule-lifecycle.spec.ts及本文，不改生产。保原24项，增加28项：两页面的close/reload分别验证后续名称、编码、定义编辑；改值再恢复原值；新建编辑上下文；详情撤权恢复并重新读取后的新编辑；合法确认仍正常关闭或原ID重新读取。

原77987在PR22旧生产源码terminal1，52项24失败28通过，/tmp/iqc-b-trigger-discard-red.log.exit=1。保持测试不变快进PR24固定2a1f7e2后，原24947 terminal0，52项5.40s全部通过，/tmp/iqc-b-trigger-discard-final.log.exit=0。旧失败直接证明确认可以操作后来的编辑；固定源不再发生。生产两个页面未修改，不引入PR21/23/25各自另交的专项。

Vue/API/权限为受控测试，只验证旧确认作用域与原生命周期，不替代真实岗位/PDP、浏览器或完整PRD验收。生产无变化，不重复Vite；类型检查终态另补。无framework/共享SQL/部署/语音处理操作。

# 智能体改造对接

基于 origin/main bf62916 的独立 worktree，分支 feature/agent-engine-chat。

只修改智能体及资产页面、导航命名，新增版本/关联展示和测试聊天；不修改任务、方案、规则或评分页面，也未修改公共 config.ts 中任务使用的历史类型。AgentRuntimeConfig 的旧字段仅用于其他模块兼容，新建智能体页面始终生成 schema 3.0，不带 mode/ruleSetId。

后端同名分支基于 bac0a12；新接口 POST /iqc/config/agents/test-chat 和 POST /iqc/agent-assets/mcps/{id}/discover-tools，沿用 agent:manage 和 mcp:manage 权限。完整契约见后端 docs/agent-engine-chat.md。

与任务开发者的边界：任务自行保存执行策略与规则依赖，调用已发布智能体的模型能力；不要把规则集和执行顺序写回智能体。未来集成时 router/index.ts 和布局可能同时变化，应仅合并智能体菜单对应修改。

测试聊天采用完整回复，未接入流式输出、长期历史或服务端取消。关闭会话仅丢弃迟到结果，不保证停止远端调用。真实账号、真实模型和 MCP 的联调仍需在部署候选环境完成。

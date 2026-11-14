# 规则停用与删除浏览器验收

日期：2026-11-14。使用 Playwright CLI、独立 Chrome、本地生产构建预览。全部 `/api/**` 由夹具返回，不访问应用数据库或生产服务。

| 场景 | 实测结果 |
| --- | --- |
| 取消停用 | 关闭确认框，写请求记录为空 |
| 停用被引用规则 | 原先验证 POST 400；修正夹具后复验 HTTP 200、IQC-1006、无 data 的实际业务错误格式，显示具体引用错误，原状态保持 PUBLISHED，确认框保留，没有成功提示 |
| 停用无引用规则 | 成功后刷新列表为 DISABLED，停用入口消失，删除入口保留；重新加载仍为 DISABLED |
| 删除无引用规则 | DELETE `/api/iqc/config/rules/remove`；刷新后对应行消失 |
| 删除被引用规则 | 原先验证 DELETE 400；随后复验 HTTP 200、IQC-1006、无 data，只有引用错误提示，原记录与确认框保留 |
| 只读权限 | 仅有 iqc:rule:view 时，创建、停用和删除均不显示，写请求为空 |
| 中文按钮 | 修正 cancelText 并重新构建、加载后，显示“取消”，点击关闭确认框 |

`pnpm build` 通过类型检查与生产构建，保留既有大包体提示。成功停用/删除在修正文案前验收；新构建复验了只读角色、删除拒绝及中文取消。

初次 400 夹具没有覆盖实际框架业务协议。当前夹具使用 mesg、实际 IQC 错误码及省略空 data 的 HTTP 200 错误包。由此发现并修复 http.ts 只识别含 data 响应而误报成功的问题；后端 IQC 异常处理器保留具体原因。修复后重新构建并通过浏览器验证引用拒绝、成功停用和成功删除。前端 API 测试 25 项通过，其中 4 项直接运行真实拦截器。

400 场景控制台包含 HTTP 失败；HTTP 200 业务拒绝场景只有 Ant Design Vue 对拒绝 onOk Promise 的错误输出。当前拒绝 Promise 以保留确认框和重试能力，不能宣称控制台零错误。

## 复现

1. 运行 `pnpm build`，再运行 `pnpm exec vite preview --host 127.0.0.1 --port 4178 --strictPort`。
2. 使用 Playwright CLI 新会话打开空白页，运行 `run-code --filename scripts/qa/rule-lifecycle-fixture.js`，再导航至 `http://127.0.0.1:4178/rules/library`。
3. 每次 snapshot 后使用新引用点击按钮。夹具提供三条规则，`window.__iqcMutationLog` 记录请求路径和方法，每次导航清空日志。
4. 导航至 `/rules/library?readonly=1` 验证只读入口。重新安装夹具并导航可重置数据。
5. 关闭专用浏览器和预览进程。截图保存在被忽略的 `output/playwright/`。

本记录不替代真实 HTTP 权限拒绝、后端引用查询、数据库事务和并发测试，不证明大存量扫描性能。

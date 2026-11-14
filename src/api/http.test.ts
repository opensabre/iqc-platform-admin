import { describe, expect, it } from "vitest";
import type { AxiosAdapter } from "axios";
import http from "./http";

/** Exercise the real interceptor with framework-shaped responses, without network calls. */
function response(body: unknown): AxiosAdapter {
  return async config => ({ data: body, status: 200, statusText: "OK", config,
    headers: { "content-type": "application/json" } });
}

describe("framework Result envelopes", () => {
  it("rejects a business refusal when null data is omitted", async () => {
    await expect(http.post("/iqc/config/rules/rule/disable", undefined, {
      adapter: response({ code: "IQC-1006", mesg: "规则仍被引用，不能删除或停用" }),
    })).rejects.toThrow("规则仍被引用，不能删除或停用");
  });

  it("rejects an explicit null-data error too", async () => {
    await expect(http.delete("/iqc/config/rules/rule", {
      adapter: response({ code: "IQC-1005", mesg: "无权管理该规则", data: null }),
    })).rejects.toThrow("无权管理该规则");
  });

  it("unwraps a successful void mutation without data", async () => {
    const result = await http.delete("/iqc/config/rules/rule", {
      adapter: response({ code: "000000", mesg: "处理成功" }),
    });
    expect(result.data).toBeUndefined();
  });

  it("unwraps normal data and preserves raw domain objects", async () => {
    const data = { id: "rule", code: "RULE_CODE" };
    expect((await http.get("/rules", { adapter: response({ code: "000000", data }) })).data).toEqual(data);
    expect((await http.get("/raw", { adapter: response(data) })).data).toEqual(data);
  });
});

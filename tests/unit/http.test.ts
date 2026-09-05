import { describe, expect, it } from "vitest";
import http from "@/api/http";

describe("http client", () => {
  it("requests JSON without the wildcard media type", () => {
    expect(http.defaults.headers.Accept).toBe("application/json");
  });
});

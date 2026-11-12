import { describe, expect, it } from "vitest";
import { extractResearchTarget } from "../convex/research";

describe("Research Oracle search-result origin validation", () => {
  it("accepts explicit HTTPS targets wrapped by DuckDuckGo", () => {
    const wrapped = "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent("https://example.com/research");
    expect(extractResearchTarget(wrapped)).toBe("https://example.com/research");
  });

  it("accepts the alternate DuckDuckGo result host only when a target is explicit", () => {
    const wrapped = "https://duckduckgo.com/?uddg=" + encodeURIComponent("https://docs.example.org/page");
    expect(extractResearchTarget(wrapped)).toBe("https://docs.example.org/page");
    expect(extractResearchTarget("https://duckduckgo.com/l/?kh=-1")).toBeNull();
  });

  it.each([
    "https://attacker.example/?uddg=https%3A%2F%2Fexample.com",
    "https://example.com/page",
    "javascript:alert(1)",
    "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent("http://example.com"),
    "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent("https://127.0.0.1/admin"),
    "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent("https://user:pass@example.com"),
    "https://html.duckduckgo.com/html/?uddg=" + encodeURIComponent("https://example.com:8443"),
  ])("rejects malformed, off-origin, or unsafe result link %s", (value) => {
    expect(extractResearchTarget(value)).toBeNull();
  });
});

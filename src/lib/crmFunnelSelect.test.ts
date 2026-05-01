import { describe, it, expect } from "vitest";
import {
  CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL,
  resolveCrmFunnelSelectValue,
} from "./crmFunnelSelect";

describe("resolveCrmFunnelSelectValue", () => {
  const codes = new Set(["new_lead", "qualified"]);

  it("returns the code when it exists in the set", () => {
    expect(resolveCrmFunnelSelectValue("qualified", codes)).toBe("qualified");
  });

  it("returns sentinel when stageCode is empty", () => {
    expect(resolveCrmFunnelSelectValue("", codes)).toBe(CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL);
  });

  it("returns sentinel when code not in funnel", () => {
    expect(resolveCrmFunnelSelectValue("legacy_removed", codes)).toBe(CRM_FUNNEL_SELECT_UNRESOLVED_SENTINEL);
  });
});

import { describe, expect, it } from "vitest";
import { MaskingError } from "../../../src/errors.js";
import { MaskingProfile } from "../../../src/masking/profile.js";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LUMINARA_YAML = resolve(__dirname, "../../fixtures/masking/luminara-like.yaml");

describe("MaskingProfile.fromObject", () => {
  it("constructs from a minimal object", () => {
    const p = MaskingProfile.fromObject({ kinds: ["NAME"] });
    expect(p.kinds).toEqual(["NAME"]);
    expect(p.columnRules.size).toBe(0);
    expect(p.regexRules.size).toBe(0);
  });

  it("builds a column → kind lookup map", () => {
    const p = MaskingProfile.fromObject({
      kinds: ["NAME", "EMAIL"],
      columnRules: { NAME: ["name", "lastName"], EMAIL: ["email"] },
    });
    expect(p.columnRules.get("name")).toBe("NAME");
    expect(p.columnRules.get("lastName")).toBe("NAME");
    expect(p.columnRules.get("email")).toBe("EMAIL");
  });

  it("compiles regex rules into RegExp instances with /g", () => {
    const p = MaskingProfile.fromObject({
      kinds: ["EMAIL"],
      regexRules: { EMAIL: "[a-z]+@[a-z]+\\.[a-z]+" },
    });
    const re = p.regexRules.get("EMAIL");
    expect(re).toBeInstanceOf(RegExp);
    expect(re?.flags.includes("g")).toBe(true);
  });

  it("rejects columnRules with unknown kind", () => {
    expect(() =>
      MaskingProfile.fromObject({
        kinds: ["NAME"],
        columnRules: { OTHER: ["x"] },
      }),
    ).toThrow(MaskingError);
  });

  it("rejects regexRules with unknown kind", () => {
    expect(() =>
      MaskingProfile.fromObject({
        kinds: ["NAME"],
        regexRules: { OTHER: "abc" },
      }),
    ).toThrow(MaskingError);
  });

  it("rejects invalid regex source", () => {
    expect(() =>
      MaskingProfile.fromObject({
        kinds: ["EMAIL"],
        regexRules: { EMAIL: "(unclosed" },
      }),
    ).toThrow(MaskingError);
  });

  it("rejects tokenFormat missing {KIND} or {N}", () => {
    expect(() =>
      MaskingProfile.fromObject({
        kinds: ["NAME"],
        tokenFormat: "<{KIND}>",
      }),
    ).toThrow(MaskingError);
  });
});

describe("MaskingProfile.fromJson", () => {
  it("parses valid JSON", () => {
    const p = MaskingProfile.fromJson(JSON.stringify({ kinds: ["NAME"] }));
    expect(p.kinds).toEqual(["NAME"]);
  });
  it("throws MaskingError on invalid JSON", () => {
    expect(() => MaskingProfile.fromJson("{not json")).toThrow(MaskingError);
  });
});

describe("MaskingProfile.fromYamlString", () => {
  it("parses inline YAML", () => {
    const p = MaskingProfile.fromYamlString("kinds:\n  - NAME\n");
    expect(p.kinds).toEqual(["NAME"]);
  });
});

describe("MaskingProfile.fromYaml (file)", () => {
  it("loads the Luminara-like fixture", async () => {
    const p = await MaskingProfile.fromYaml(LUMINARA_YAML);
    expect(p.kinds).toContain("NAME");
    expect(p.columnRules.get("plate_number")).toBe("PLATE");
    expect(p.regexRules.has("PHONE")).toBe(true);
    expect(p.skipFields.has("id")).toBe(true);
  });
});

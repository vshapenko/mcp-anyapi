import { describe, expect, it } from "vitest";
import { ConfigMasker } from "../../../src/masking/configMasker.js";
import { MaskingProfile } from "../../../src/masking/profile.js";

function profile(): MaskingProfile {
  return MaskingProfile.fromObject({
    kinds: ["NAME", "PHONE", "EMAIL"],
    columnRules: {
      NAME: ["name", "last_name"],
      PHONE: ["phone"],
      EMAIL: ["email"],
    },
    regexRules: {
      PHONE: "\\+?\\d{8,15}",
      EMAIL: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
    },
    skipFields: ["id"],
  });
}

describe("ConfigMasker — column-driven tokenization", () => {
  it("masks values whose key is in columnRules", () => {
    const m = new ConfigMasker(profile());
    const out = m.tokenizeObject({ name: "Ahmed", id: "abc" });
    expect(out).toEqual({ name: "<NAME_1>", id: "abc" });
  });

  it("reuses tokens for repeated values within the same instance", () => {
    const m = new ConfigMasker(profile());
    m.tokenizeObject({ name: "Ahmed" });
    const out = m.tokenizeObject({ name: "Ahmed", last_name: "Ahmed" });
    expect(out).toEqual({ name: "<NAME_1>", last_name: "<NAME_1>" });
  });

  it("assigns distinct tokens to distinct values", () => {
    const m = new ConfigMasker(profile());
    const out = m.tokenizeObject({ name: "Ahmed", last_name: "Ali" });
    expect(out).toEqual({ name: "<NAME_1>", last_name: "<NAME_2>" });
  });

  it("skips fields listed in skipFields", () => {
    const m = new ConfigMasker(profile());
    const out = m.tokenizeObject({ id: "name@example.com" });
    expect(out).toEqual({ id: "name@example.com" });
  });
});

describe("ConfigMasker — regex tokenization", () => {
  it("masks PII inside free-text columns by regex", () => {
    const m = new ConfigMasker(profile());
    const out = m.tokenizeObject({ note: "Call Ahmed on +971501234567 or ahmed@example.com" });
    expect(out).toMatchObject({
      note: expect.stringContaining("<PHONE_1>"),
    });
    expect(out).toMatchObject({
      note: expect.stringContaining("<EMAIL_1>"),
    });
  });

  it("is idempotent against already-tokenized strings", () => {
    const m = new ConfigMasker(profile());
    const first = m.tokenizeObject({ note: "ahmed@x.com" }) as { note: string };
    const second = m.tokenizeObject({ note: first.note }) as { note: string };
    expect(first.note).toBe(second.note);
  });

  it("walks nested arrays and objects", () => {
    const m = new ConfigMasker(profile());
    const out = m.tokenizeObject({ rows: [{ name: "Ali" }, { name: "Beth" }] });
    expect(out).toEqual({ rows: [{ name: "<NAME_1>" }, { name: "<NAME_2>" }] });
  });
});

describe("ConfigMasker — rehydration", () => {
  it("substitutes tokens back to original values", () => {
    const m = new ConfigMasker(profile());
    m.tokenizeObject({ name: "Ahmed", email: "ahmed@x.com" });
    const text = "Hi <NAME_1>, your email <EMAIL_1> is confirmed.";
    expect(m.rehydrate(text)).toBe("Hi Ahmed, your email ahmed@x.com is confirmed.");
  });

  it("tolerantly passes unknown tokens through unchanged", () => {
    const m = new ConfigMasker(profile());
    expect(m.rehydrate("User <NAME_99> not found")).toBe("User <NAME_99> not found");
  });

  it("rehydrate is a no-op when no tokens are present", () => {
    const m = new ConfigMasker(profile());
    expect(m.rehydrate("plain text")).toBe("plain text");
  });
});

describe("ConfigMasker — messages", () => {
  it("masks user message content", () => {
    const m = new ConfigMasker(profile());
    const masked = m.tokenizeMessages([
      { role: "user", content: "Find ahmed@example.com please" },
    ]);
    expect(masked[0]?.content).toContain("<EMAIL_1>");
  });

  it("parses tool message JSON and walks it", () => {
    const m = new ConfigMasker(profile());
    const masked = m.tokenizeMessages([
      {
        role: "tool",
        toolCallId: "1",
        content: JSON.stringify({ rows: [{ name: "Ahmed" }] }),
      },
    ]);
    const parsed = JSON.parse(masked[0]?.content ?? "{}") as { rows: Array<{ name: string }> };
    expect(parsed.rows[0]?.name).toBe("<NAME_1>");
  });

  it("falls back to string masking when tool content is not JSON", () => {
    const m = new ConfigMasker(profile());
    const masked = m.tokenizeMessages([
      { role: "tool", toolCallId: "1", content: "raw ahmed@x.com text" },
    ]);
    expect(masked[0]?.content).toContain("<EMAIL_1>");
  });

  it("respects skipRoles", () => {
    const p = MaskingProfile.fromObject({
      kinds: ["NAME"],
      columnRules: { NAME: ["name"] },
      skipRoles: ["system"],
    });
    const m = new ConfigMasker(p);
    const masked = m.tokenizeMessages([
      { role: "system", content: "Ahmed" },
      { role: "user", content: "Ahmed" },
    ]);
    expect(masked[0]?.content).toBe("Ahmed");
    expect(masked[1]?.content).toBe("Ahmed");
  });
});

describe("ConfigMasker — stats and reset", () => {
  it("stats() returns per-kind counts and total", () => {
    const m = new ConfigMasker(profile());
    m.tokenizeObject({ name: "Ahmed", email: "a@x.com" });
    const stats = m.stats();
    expect(stats.counts["NAME"]).toBe(1);
    expect(stats.counts["EMAIL"]).toBe(1);
    expect(stats.totalReplacements).toBe(2);
  });

  it("reset() clears the forward/reverse maps and counts", () => {
    const m = new ConfigMasker(profile());
    m.tokenizeObject({ name: "Ahmed" });
    m.reset();
    expect(m.stats().totalReplacements).toBe(0);
    const out = m.tokenizeObject({ name: "Ahmed" });
    expect(out).toEqual({ name: "<NAME_1>" });
  });
});

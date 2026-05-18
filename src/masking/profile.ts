import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { MaskingError } from "../errors.js";

const MaskingProfileSchema = z.object({
  kinds: z.array(z.string().min(1)).min(1),
  columnRules: z.record(z.string(), z.array(z.string())).default({}),
  regexRules: z.record(z.string(), z.string()).default({}),
  skipFields: z.array(z.string()).default([]),
  skipRoles: z.array(z.string()).default([]),
  tokenFormat: z.string().default("<{KIND}_{N}>"),
});

export type MaskingProfileInput = z.input<typeof MaskingProfileSchema>;
export type MaskingProfileData = z.output<typeof MaskingProfileSchema>;

export class MaskingProfile {
  readonly kinds: ReadonlyArray<string>;
  readonly columnRules: ReadonlyMap<string, string>;
  readonly regexRules: ReadonlyMap<string, RegExp>;
  readonly skipFields: ReadonlySet<string>;
  readonly skipRoles: ReadonlySet<string>;
  readonly tokenFormat: string;

  private constructor(data: MaskingProfileData) {
    this.kinds = data.kinds;
    const knownKinds = new Set(data.kinds);

    const columnMap = new Map<string, string>();
    for (const [kind, columns] of Object.entries(data.columnRules)) {
      if (!knownKinds.has(kind)) {
        throw new MaskingError(`MaskingProfile: columnRules references unknown kind "${kind}"`);
      }
      for (const col of columns) columnMap.set(col, kind);
    }
    this.columnRules = columnMap;

    const regexMap = new Map<string, RegExp>();
    for (const [kind, source] of Object.entries(data.regexRules)) {
      if (!knownKinds.has(kind)) {
        throw new MaskingError(`MaskingProfile: regexRules references unknown kind "${kind}"`);
      }
      try {
        regexMap.set(kind, new RegExp(source, "g"));
      } catch (err) {
        throw new MaskingError(
          `MaskingProfile: invalid regex for kind "${kind}": ${(err as Error).message}`,
        );
      }
    }
    this.regexRules = regexMap;

    this.skipFields = new Set(data.skipFields);
    this.skipRoles = new Set(data.skipRoles);
    this.tokenFormat = data.tokenFormat;

    if (!this.tokenFormat.includes("{KIND}") || !this.tokenFormat.includes("{N}")) {
      throw new MaskingError(
        `MaskingProfile: tokenFormat "${this.tokenFormat}" must contain {KIND} and {N}`,
      );
    }
  }

  static fromObject(data: MaskingProfileInput): MaskingProfile {
    const parsed = MaskingProfileSchema.safeParse(data);
    if (!parsed.success) {
      throw new MaskingError(`Invalid MaskingProfile: ${parsed.error.message}`);
    }
    return new MaskingProfile(parsed.data);
  }

  static fromJson(json: string): MaskingProfile {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (err) {
      throw new MaskingError(`Invalid JSON for MaskingProfile: ${(err as Error).message}`);
    }
    return MaskingProfile.fromObject(raw as MaskingProfileInput);
  }

  static fromYamlString(yamlText: string): MaskingProfile {
    let raw: unknown;
    try {
      raw = parseYaml(yamlText);
    } catch (err) {
      throw new MaskingError(`Invalid YAML for MaskingProfile: ${(err as Error).message}`);
    }
    return MaskingProfile.fromObject(raw as MaskingProfileInput);
  }

  static async fromYaml(path: string): Promise<MaskingProfile> {
    const text = await readFile(path, "utf-8");
    return MaskingProfile.fromYamlString(text);
  }

  /** All kinds that have any regex rule, useful for the tolerant rehydrator. */
  get knownKinds(): ReadonlyArray<string> {
    return this.kinds;
  }
}

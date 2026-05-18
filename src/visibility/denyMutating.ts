import type { CallerIdentity, EndpointToolSpec } from "../types.js";
import type { VisibilityFilter } from "./base.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export class DenyMutatingFilter implements VisibilityFilter {
  allow(spec: EndpointToolSpec, _caller?: CallerIdentity): boolean {
    return SAFE_METHODS.has(spec.method);
  }
}

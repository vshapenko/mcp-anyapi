import type { CallerIdentity, EndpointToolSpec } from "../types.js";
import type { VisibilityFilter } from "./base.js";

export class AllowAllFilter implements VisibilityFilter {
  allow(_spec?: EndpointToolSpec, _caller?: CallerIdentity): boolean {
    return true;
  }
}

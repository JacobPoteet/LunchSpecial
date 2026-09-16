// Helpers more than one admin route file reads.

import type { Context } from "hono";

import type { Surface } from "../../../shared/types";
import { SURFACES } from "../../../shared/types";

export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Optional surface filter (web / discord) for the analytics reads. Absent or
 * unrecognised → all surfaces. The value is whitelisted against the SURFACES
 * enum, so it's safe to splice the literal straight into the SQL (no bind-param
 * reshuffling across the many queries below). `and` extends an existing WHERE;
 * `where` starts one for the queries that otherwise have none.
 */
export function surfaceClause(c: Context): { and: string; where: string } {
  const param = c.req.query("surface");
  const surface = SURFACES.includes(param as never) ? (param as Surface) : null;
  return surface ? { and: ` AND surface = '${surface}'`, where: ` WHERE surface = '${surface}'` } : { and: "", where: "" };
}

import { createHash } from "node:crypto";

function serialize(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  if (
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${serialize(item)}`)
      .join(",")}}`;
  throw new Error("Canonical JSON requires finite JSON values.");
}
export function canonicalJsonHash(value) {
  return createHash("sha256").update(serialize(value)).digest("hex");
}

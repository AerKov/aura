// Files embedded with `import path from "…" with { type: "file" }` (Bun): the import is a path.
declare module "*/apply-seccomp" {
  const path: string;
  export default path;
}

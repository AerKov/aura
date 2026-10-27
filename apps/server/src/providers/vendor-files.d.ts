// Files embedded with `import path from "…" with { type: "file" }` (Bun): the import is a path.
declare module "*/apply-seccomp" {
  const path: string;
  export default path;
}

// Built-in catalog files embedded with `with { type: "text" }`: the import is the file's text.
declare module "*.md" {
  const text: string;
  export default text;
}
declare module "*.css" {
  const text: string;
  export default text;
}
declare module "*.txt" {
  const text: string;
  export default text;
}

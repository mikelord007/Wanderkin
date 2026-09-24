import { register } from "node:module";

// TypeScript preserves the repository's @shared/* imports in the compiled
// server. Register the narrow production resolver before loading the API.
register("./alias-loader.mjs", import.meta.url);

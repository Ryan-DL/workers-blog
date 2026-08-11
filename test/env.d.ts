/// <reference types="@cloudflare/vitest-pool-workers/types" />

// Makes `env` in tests carry the same bindings as the Worker, using the Env
// generated from wrangler.jsonc.
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

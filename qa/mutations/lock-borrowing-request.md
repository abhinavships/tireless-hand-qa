# T01 prerequisite: token-validated lock borrowing

At the start of `acquireAppLock` (after computing `path`), before its mkdir loop:

```ts
const token = process.env.APP_LOCK_TOKEN;
if (token) {
  const parentToken = await readFile(`${path}/token`, 'utf8').catch(() => '');
  if (parentToken !== token) throw new Error('Invalid mutation-parent app lock token');
  return async () => {}; // parent retains and releases app.lock
}
```

Import readFile from node:fs/promises. This is a request, not an edit to T01's shared file. The parent mutation runner creates a unique token only after atomically acquiring app.lock; its child inherits the environment. Standalone workers have no token and must acquire the lock normally.

Only run mutation children from the parent runner; never set a token manually to bypass another worker's lock. Mutation runs also need a designated exclusive browser runner slot because the shared run.sh/evidence.ts report path is fixed.

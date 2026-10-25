export default {
  extends: ['@commitlint/config-conventional'],
  // `git merge --squash` creates a non-merge commit whose subject is exactly
  // `Squashed commit of the following commits:` — not in commitlint's default
  // ignore list, so exempt just that prefix.
  ignores: [(message) => /^Squashed commit of the following commits:/.test(message)],
  rules: {
    // The conventional preset leaves scope casing unchecked; keep scopes
    // kebab-case (levels, main-menu, dev-desktop, …).
    'scope-case': [2, 'always', ['kebab-case']],
  },
}

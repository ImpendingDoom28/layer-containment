export default {
  extends: ['@commitlint/config-conventional'],
  // `git merge --squash` creates a non-merge commit whose subject
  // (`Squashed commit of the following commits:`) is not in commitlint's
  // default ignore list — exempt it, matching what the commit-msg hook skips.
  ignores: [(message) => /^Squashed commit/.test(message)],
  rules: {
    // The conventional preset leaves scope casing unchecked; keep scopes
    // kebab-case (levels, main-menu, dev-desktop, …).
    'scope-case': [2, 'always', ['kebab-case']],
  },
}

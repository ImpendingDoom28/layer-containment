export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The conventional preset leaves scope casing unchecked; keep scopes
    // kebab-case (levels, main-menu, dev-desktop, …).
    'scope-case': [2, 'always', ['kebab-case']],
  },
}

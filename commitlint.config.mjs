// Conventional Commits enforcement — see .cursor/rules/sdlc.md.
//
// Type + subject format come from @commitlint/config-conventional.
// The `story-id-in-subject` rule is a small inline plugin (no extra
// dependency) that requires a bracketed story ID, e.g. [CORTEX-104],
// on every commit *except* automated dependency-bump commits, which
// aren't tied to a tracked story.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'style', 'perf', 'build', 'ci', 'revert'],
    ],
    'story-id-in-subject': [2, 'always'],
  },
  plugins: [
    {
      rules: {
        'story-id-in-subject': ({ header }) => {
          // Matches [CORTEX-104] and multi-segment IDs like [CORTEX-GOV-1].
          const hasStoryId = /\[[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\]/.test(header || '');
          return [
            hasStoryId,
            'commit header must include a story ID in brackets, e.g. [CORTEX-104] ' +
              '(exempt: automated "chore(deps): ..." dependency-bump commits)',
          ];
        },
      },
    },
  ],
  // Commits that don't need a story ID: automated dependency bumps and
  // anything from Dependabot. Merge commits are already ignored by
  // commitlint's built-in defaultIgnores.
  ignores: [(commit) => /^chore\(deps\)/.test(commit) || /dependabot\[bot\]/i.test(commit)],
};

# Your First Astra CE Contribution

Thank you for contributing. Start with a small issue, documentation correction,
test, or scenario proposal. Read `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, and the
architecture rules in `.cursorrules` before changing code.

## A newcomer-friendly path

1. Search existing issues and pull requests.
2. Open an issue before large, security-sensitive, or architecture-changing work.
3. Fork the repository, create a focused branch, and avoid unrelated formatting.
4. Add tests for behaviour and failure paths.
5. Run the checks relevant to the files you changed.
6. Open a pull request that explains the problem, approach, and verification.

Maintainers review for correctness, scope, safety, accessibility, licensing, and
project fit. Review comments are about the contribution, not the contributor.

## Contributing a scenario

Copy `contrib/scenarios/scenario.template.yaml` into
`contrib/scenarios/submissions/<scenario-id>.yaml`. Use only material you wrote or
can redistribute under one of the schema's accepted licenses. Cite public source
material with an HTTPS URL and never include personal, confidential, or customer
data.

Validate locally:

```bash
python contrib/scenarios/validate_scenario.py \
  contrib/scenarios/submissions/<scenario-id>.yaml
```

To produce the deterministic review artifact:

```bash
python contrib/scenarios/validate_scenario.py --compile \
  contrib/scenarios/submissions/<scenario-id>.yaml
```

The reported SHA-256 is calculated from canonical JSON with
`provenance.content_sha256` excluded. Add that hash to the provenance block when
you want review to fail after any content change. Do not commit generated
`.compiled.json` files unless a maintainer requests one.

Validation establishes structure, bounded size, cross-reference integrity, and
provenance consistency. It does not establish that a scenario is legally
accurate, safe, pedagogically sound, or accepted. Human review remains required.
YAML is loaded as untrusted data; custom tags are rejected and narrative text is
never rendered or executed as Markdown.

Run the focused test suite:

```bash
pytest -q contrib/scenarios/tests
```

## Getting help

See `SUPPORT.md`. Report vulnerabilities privately as described in `SECURITY.md`;
do not open a public issue for them.

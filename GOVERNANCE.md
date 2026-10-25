# Astra CE Governance

## Principles

Astra GRC Community Edition is maintained in the open. Decisions prioritise
learner safety, technical integrity, the ZTAIP architecture, legal clarity, and a
reviewable contribution history. Influence is earned through sustained,
constructive participation; employment or sponsorship does not bypass review.

## Roles

- **Contributors** propose code, scenarios, documentation, or review feedback.
- **Reviewers** are trusted contributors who regularly review a defined area.
- **Maintainers** triage work, enforce project policy, approve releases, and grant
  or revoke reviewer status.

Current code ownership and required review areas are recorded in
`.github/CODEOWNERS`. A maintainer may be inactive without losing credit, but
repository permissions may be removed after prolonged inactivity or for security.

## Decisions

Routine changes use pull-request review and lazy consensus: after reasonable
review time, a maintainer may merge when required checks and approvals pass and
no unresolved, reasoned objection remains.

Architecture, security boundaries, governance, licensing, scenario trust rules,
and backwards-incompatible changes require an explicit written rationale and
maintainer approval. Material architecture decisions should be captured as an
ADR. If consensus cannot be reached, maintainers document the competing views
and decide based on project principles. Security response may proceed privately
under `SECURITY.md` before public documentation.

No contributor approves their own change as the required final review. Anyone
with a conflict of interest must disclose it and recuse from the deciding review.

## Scenario stewardship

Community scenarios are untrusted data until validation and human review
complete. Automated validation checks structure and provenance; it does not
certify legal accuracy, control interpretation, safety, or pedagogical quality.
Reviewers may request subject-matter evidence, licensing clarification, or
revision. Acceptance does not imply endorsement of an author or source.

## Changes to governance

Governance changes use a public pull request with at least 14 days for comment,
except urgent safety or legal corrections. Maintainers record the decision and
follow-up rationale in the pull request.

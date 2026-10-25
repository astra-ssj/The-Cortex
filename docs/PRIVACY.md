# Privacy and data boundaries

The offline release stores application data in the local PostgreSQL volume.
The frontend talks to the API through same-origin nginx routing; neither
service exposes PostgreSQL to the host network.

With the default settings:

- `MODEL_PROVIDER=stub` and `CORTEX_LLM_PROVIDERS=stub`
- no document, prompt, or learner response is sent to an external model
- no telemetry service is required
- backups remain local unless an operator moves them

`MODEL_PROVIDER=ollama` with `AGENT_MODEL=gemma4:12b` keeps stakeholder turns
and training narration on the local Ollama process. That path does not require
an external API key. The weights are a separate archive, verified before load.

Adding an external provider key changes this boundary. Before enabling one,
review the provider's retention, training, regional processing, and subprocessors,
and apply your organization's purpose and jurisdiction controls.

Audit records are append-only during normal operation. Operational scripts do
not issue `UPDATE` or `DELETE` statements against `audit_log`. A full database
restore is an explicitly confirmed disaster-recovery operation and replaces the
database as a unit; preserve the automatic pre-restore backup.

Secrets live in `.env`, which the installer creates with owner-only permissions.
Do not include `.env`, database dumps, or exported evidence in support bundles.

# Astra Practice Quality v1.1 evaluation

**Run date:** 25 October 2026
**Quality standard:** `practice-quality-v1`
**Fixture version:** `v2`

## Scope

- 15 reviewed practices
- 75 deterministic paths
- Correct, qualified-alternative, failure, defer, and mixed paths per practice
- Four competency dimensions scored from authored choice weights

## Results

| Path | Minimum | Maximum | Mean | Expected |
|---|---:|---:|---:|---|
| Correct | 86.00 | 98.00 | 90.00 | At least 70 |
| Qualified alternative | 58.00 | 60.25 | 58.75 | At least 55 |
| Failure | 38.00 | 38.00 | 38.00 | At most 50 |
| Defer | 42.00 | 42.00 | 42.00 | At most 50 |
| Mixed | 77.50 | 89.50 | 81.50 | At least 60 |

All 15 practices scored 100/100 against the structural quality gate. Every
fixture terminated, and all 75 paths remained within their expected score band.

No ZTAIP autonomy or competency threshold changed. The existing 0.75
human-review threshold, 60 gap floor, and 70 proven threshold remain unchanged,
so this content calibration does not require a threshold-change sign-off.

Reproduce with:

```bash
PYTHONPATH=. python scripts/audit_practice_quality.py --strict
PYTHONPATH=. pytest -q tests/test_practice_quality_evaluations.py
```

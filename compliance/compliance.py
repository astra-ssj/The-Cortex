# compliance/compliance.py — FrameworkId enum and compliance entry points.

from __future__ import annotations

from enum import Enum


class FrameworkId(str, Enum):
    """Identifiers for registered compliance frameworks."""

    ISO27001_2022 = "iso27001-2022"
    GDPR_2016_679 = "gdpr-2016-679"
    NIS2_2022_2555 = "nis2-2022-2555"
    NIST_CSF_2_0 = "nist-csf-2.0"
    CSA_CCM_V4 = "csa-ccm-v4"
    CYBER_ESSENTIALS_V3_1 = "cyber-essentials-v3.1"
    EU_AI_ACT_2024 = "eu-ai-act-2024"
    EU_CYBERSECURITY_ACT = "eu-cybersecurity-act"
    DORA_2022_2554 = "dora-2022-2554"
    ISO42001_2023 = "iso42001-2023"
    DORA = "dora-2022-2554"
    ISO42001 = "iso42001-2023"


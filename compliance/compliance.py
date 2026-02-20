# compliance/compliance.py — FrameworkId enum and compliance entry points.

from __future__ import annotations

from enum import Enum


class FrameworkId(str, Enum):
    """Identifiers for registered compliance frameworks. Add new framework IDs here when adding a new framework."""

    NIST_CSF = "nist_csf"
    GDPR = "gdpr"
    NIS2 = "nis2"
    SOC2 = "soc2"
    ISO27001 = "iso27001"
    HIPAA = "hipaa"
    PCI_DSS = "pci_dss"
    CCPA = "ccpa"

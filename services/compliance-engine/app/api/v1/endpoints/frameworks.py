# frameworks — Minimal frameworks list (compliance-engine stub).

from fastapi import APIRouter

router = APIRouter()


@router.get("", summary="List frameworks")
async def list_frameworks():
    """Return list of framework summaries."""
    return [
        {"id": "iso27001-2022", "name": "ISO/IEC 27001:2022", "version": "v2022"},
        {"id": "gdpr-2016-679", "name": "GDPR 2016/679", "version": "v1.0"},
        {"id": "nis2-2022-2555", "name": "NIS2 Directive", "version": "v1.0"},
        {"id": "nist-csf-2.0", "name": "NIST CSF 2.0", "version": "v2.0"},
        {"id": "csa-ccm-v4", "name": "CSA CCM v4.0", "version": "v4.0"},
        {"id": "cyber-essentials-v3.1", "name": "Cyber Essentials v3.1", "version": "v3.1"},
        {"id": "eu-ai-act-2024", "name": "EU AI Act 2024", "version": "v2024"},
        {"id": "eu-cybersecurity-act", "name": "EU Cybersecurity Act", "version": "v1.0"},
    ]

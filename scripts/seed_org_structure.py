#!/usr/bin/env python3
# scripts/seed_org_structure.py — Seed CORTEX org structure (groups, entities, units, people, systems, controls).
# Uses DATABASE_URL; idempotent (INSERT ... ON CONFLICT DO NOTHING). Run after migrations/002_cortex_ontology.sql.

from __future__ import annotations

import os
import sys
from pathlib import Path

# Sync driver for one-off script; DATABASE_URL may be postgresql:// or postgresql+asyncpg://
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("psycopg2 required: pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

# Fixed UUIDs for idempotency
GROUP_ID = "a0000000-0000-0000-0000-000000000001"
E_DE = "b0000000-0000-0000-0000-000000000001"
E_UK = "b0000000-0000-0000-0000-000000000002"
E_AU = "b0000000-0000-0000-0000-000000000003"
E_TH = "b0000000-0000-0000-0000-000000000004"
E_ES = "b0000000-0000-0000-0000-000000000005"
E_US = "b0000000-0000-0000-0000-000000000006"

# Organisational units (DE, UK, then AU, TH, ES, US 1–2 each)
U_DE_ENG = "30000000-0000-0000-0000-000000000001"
U_DE_PRODUCT = "30000000-0000-0000-0000-000000000002"
U_DE_SEC = "30000000-0000-0000-0000-000000000003"
U_DE_LEGAL = "30000000-0000-0000-0000-000000000004"
U_UK_ENG = "30000000-0000-0000-0000-000000000005"
U_UK_COMM = "30000000-0000-0000-0000-000000000006"
U_AU_1 = "30000000-0000-0000-0000-000000000007"
U_AU_2 = "30000000-0000-0000-0000-000000000008"
U_TH_1 = "30000000-0000-0000-0000-000000000009"
U_TH_2 = "30000000-0000-0000-0000-00000000000a"
U_ES_1 = "30000000-0000-0000-0000-00000000000b"
U_ES_2 = "30000000-0000-0000-0000-00000000000c"
U_US_1 = "30000000-0000-0000-0000-00000000000d"
U_US_2 = "30000000-0000-0000-0000-00000000000e"

# People (20)
P_CISO = "40000000-0000-0000-0000-000000000001"
P_DPO = "40000000-0000-0000-0000-000000000002"
P_CTO = "40000000-0000-0000-0000-000000000003"
P_SEC_DE = "40000000-0000-0000-0000-000000000004"
P_SEC_UK = "40000000-0000-0000-0000-000000000005"
P_SEC_AU = "40000000-0000-0000-0000-000000000006"
P_SEC_TH = "40000000-0000-0000-0000-000000000007"
P_SEC_ES = "40000000-0000-0000-0000-000000000008"
P_SEC_US = "40000000-0000-0000-0000-000000000009"
P_CTRL_1 = "40000000-0000-0000-0000-00000000000a"
P_CTRL_2 = "40000000-0000-0000-0000-00000000000b"
P_CTRL_3 = "40000000-0000-0000-0000-00000000000c"
P_BOARD_DE = "40000000-0000-0000-0000-00000000000d"
P_BOARD_UK = "40000000-0000-0000-0000-00000000000e"
P_BOARD_AU = "40000000-0000-0000-0000-00000000000f"
P_BOARD_TH = "40000000-0000-0000-0000-000000000010"
P_BOARD_ES = "40000000-0000-0000-0000-000000000011"
P_BOARD_US = "40000000-0000-0000-0000-000000000012"
P_COMPLIANCE_LEAD = "40000000-0000-0000-0000-000000000013"
P_RISK_OWNER = "40000000-0000-0000-0000-000000000014"

# Systems (12)
SYS_AZURE_AD = "50000000-0000-0000-0000-000000000001"
SYS_AZURE_DEVOPS = "50000000-0000-0000-0000-000000000002"
SYS_AWS = "50000000-0000-0000-0000-000000000003"
SYS_SALESFORCE = "50000000-0000-0000-0000-000000000004"
SYS_WORKDAY = "50000000-0000-0000-0000-000000000005"
SYS_JIRA = "50000000-0000-0000-0000-000000000006"
SYS_WIKI = "50000000-0000-0000-0000-000000000007"
SYS_PG = "50000000-0000-0000-0000-000000000008"
SYS_PAYMENT = "50000000-0000-0000-0000-000000000009"
SYS_PORTAL = "50000000-0000-0000-0000-00000000000a"
SYS_BANGKOK = "50000000-0000-0000-0000-00000000000b"
SYS_GITHUB = "50000000-0000-0000-0000-00000000000c"

# Controls (15)
CTL_MFA = "60000000-0000-0000-0000-000000000001"
CTL_ENC = "60000000-0000-0000-0000-000000000002"
CTL_VULN = "60000000-0000-0000-0000-000000000003"
CTL_AWARENESS = "60000000-0000-0000-0000-000000000004"
CTL_ACCESS = "60000000-0000-0000-0000-000000000005"
CTL_INCIDENT = "60000000-0000-0000-0000-000000000006"
CTL_BACKUP = "60000000-0000-0000-0000-000000000007"
CTL_ROPA = "60000000-0000-0000-0000-000000000008"
CTL_SUPPLIER = "60000000-0000-0000-0000-000000000009"
CTL_DPO = "60000000-0000-0000-0000-00000000000a"
CTL_NIS2_REG = "60000000-0000-0000-0000-00000000000b"
CTL_PENTEST = "60000000-0000-0000-0000-00000000000c"
CTL_DATA_CLASS = "60000000-0000-0000-0000-00000000000d"
CTL_CHANGE = "60000000-0000-0000-0000-00000000000e"
CTL_BC = "60000000-0000-0000-0000-00000000000f"


def get_connection():
    url = os.environ.get("DATABASE_URL", "postgresql://localhost/cortex")
    url = url.replace("postgresql+asyncpg://", "postgresql://").split("?")[0]
    return psycopg2.connect(url)


def run_migration(conn, migrations_dir: Path) -> None:
    """Apply 002_cortex_ontology.sql if present."""
    sql_file = migrations_dir / "002_cortex_ontology.sql"
    if not sql_file.exists():
        return
    with open(sql_file, "r") as f:
        content = f.read()
    cur = conn.cursor()
    for block in content.split(";"):
        block = block.strip()
        if not block:
            continue
        # Drop comment-only lines so each block is valid SQL
        lines = [line for line in block.split("\n") if line.strip() and not line.strip().startswith("--")]
        if not lines:
            continue
        cur.execute("\n".join(lines))
    conn.commit()


def insert_all(conn) -> dict[str, int]:
    cur = conn.cursor()
    counts: dict[str, int] = {}

    # 1. Groups
    cur.execute(
        """
        INSERT INTO groups (id, name)
        VALUES (%s, 'AstraLabs')
        ON CONFLICT (id) DO NOTHING
        """,
        (GROUP_ID,),
    )
    counts["groups"] = cur.rowcount

    # 2. Entities
    entities = [
        (E_DE, GROUP_ID, "AstraLabs DE", "DE"),
        (E_UK, GROUP_ID, "AstraLabs UK", "UK"),
        (E_AU, GROUP_ID, "AstraLabs AU", "AU"),
        (E_TH, GROUP_ID, "AstraLabs TH", "TH"),
        (E_ES, GROUP_ID, "AstraLabs ES", "ES"),
        (E_US, GROUP_ID, "AstraLabs US", "US"),
    ]
    for eid, gid, name, code in entities:
        cur.execute(
            "INSERT INTO entities (id, group_id, name, code) VALUES (%s, %s, %s, %s) ON CONFLICT (id) DO NOTHING",
            (eid, gid, name, code),
        )
        counts["entities"] = counts.get("entities", 0) + cur.rowcount

    # 3. Organisational units
    units = [
        (U_DE_ENG, E_DE, "Engineering", 280, False),
        (U_DE_PRODUCT, E_DE, "Product", 40, False),
        (U_DE_SEC, E_DE, "Security & Compliance", 15, True),
        (U_DE_LEGAL, E_DE, "Legal & Data Protection", 8, True),
        (U_UK_ENG, E_UK, "Engineering", 60, False),
        (U_UK_COMM, E_UK, "Commercial", 35, False),
        (U_AU_1, E_AU, "Operations", 25, False),
        (U_AU_2, E_AU, "Technology", 15, False),
        (U_TH_1, E_TH, "Operations", 20, False),
        (U_TH_2, E_TH, "IT", 10, False),
        (U_ES_1, E_ES, "Operations", 30, False),
        (U_ES_2, E_ES, "Compliance", 5, False),
        (U_US_1, E_US, "Engineering", 80, False),
        (U_US_2, E_US, "Sales", 45, False),
    ]
    for uid, eid, name, staff, shared in units:
        cur.execute(
            """INSERT INTO organisational_units (id, entity_id, name, staff_count, is_shared_service)
               VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
            (uid, eid, name, staff, shared),
        )
        counts["organisational_units"] = counts.get("organisational_units", 0) + cur.rowcount

    # 4. Unit consumers (Security & Compliance: all 6; Legal: DE, UK, ES)
    all_entities = [E_DE, E_UK, E_AU, E_TH, E_ES, E_US]
    de_uk_es = [E_DE, E_UK, E_ES]
    unit_consumers_count = 0
    for entity_id in all_entities:
        cur.execute(
            "INSERT INTO unit_consumers (unit_id, entity_id) VALUES (%s, %s) ON CONFLICT (unit_id, entity_id) DO NOTHING",
            (U_DE_SEC, entity_id),
        )
        unit_consumers_count += cur.rowcount
    for entity_id in de_uk_es:
        cur.execute(
            "INSERT INTO unit_consumers (unit_id, entity_id) VALUES (%s, %s) ON CONFLICT (unit_id, entity_id) DO NOTHING",
            (U_DE_LEGAL, entity_id),
        )
        unit_consumers_count += cur.rowcount
    counts["unit_consumers"] = unit_consumers_count

    # 5. People (20)
    from typing import Optional
    people: list[tuple[str, str, Optional[str], str, list[str]]] = [
        (P_CISO, E_DE, U_DE_SEC, "Group CISO", ["ciso"]),
        (P_DPO, E_DE, U_DE_LEGAL, "Group DPO", ["dpo"]),
        (P_CTO, E_DE, U_DE_ENG, "CTO", ["cto"]),
        (P_SEC_DE, E_DE, U_DE_SEC, "Entity Security Lead DE", ["security_lead"]),
        (P_SEC_UK, E_UK, None, "Entity Security Lead UK", ["security_lead"]),
        (P_SEC_AU, E_AU, None, "Entity Security Lead AU", ["security_lead"]),
        (P_SEC_TH, E_TH, None, "Entity Security Lead TH", ["security_lead"]),
        (P_SEC_ES, E_ES, None, "Entity Security Lead ES", ["security_lead"]),
        (P_SEC_US, E_US, None, "Entity Security Lead US", ["security_lead"]),
        (P_CTRL_1, E_DE, U_DE_ENG, "Control Owner 1", ["control_owner"]),
        (P_CTRL_2, E_DE, U_DE_ENG, "Control Owner 2", ["control_owner"]),
        (P_CTRL_3, E_DE, U_DE_SEC, "Control Owner 3", ["control_owner"]),
        (P_BOARD_DE, E_DE, None, "Board Member DE", ["board"]),
        (P_BOARD_UK, E_UK, None, "Board Member UK", ["board"]),
        (P_BOARD_AU, E_AU, None, "Board Member AU", ["board"]),
        (P_BOARD_TH, E_TH, None, "Board Member TH", ["board"]),
        (P_BOARD_ES, E_ES, None, "Board Member ES", ["board"]),
        (P_BOARD_US, E_US, None, "Board Member US", ["board"]),
        (P_COMPLIANCE_LEAD, E_DE, U_DE_SEC, "Compliance Lead DE", ["compliance_lead"]),
        (P_RISK_OWNER, E_DE, U_DE_SEC, "Risk Owner DE", ["risk_owner"]),
    ]
    for pid, eid, uid, name, roles in people:  # type: ignore
        cur.execute(
            """INSERT INTO people (id, entity_id, unit_id, name, roles)
               VALUES (%s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
            (pid, eid, uid, name, psycopg2.extras.Json(roles)),
        )
        counts["people"] = counts.get("people", 0) + cur.rowcount

    # 6. Systems (12)
    systems = [
        (SYS_AZURE_AD, "Azure AD", "infrastructure", E_DE, "CRITICAL", ["internal"], [], False, None),
        (SYS_AZURE_DEVOPS, "Azure DevOps", "application", E_DE, None, [], [], False, None),
        (SYS_AWS, "AWS Production", "infrastructure", E_US, "CRITICAL", [], ["US"], True, "Standard Contractual Clauses"),
        (SYS_SALESFORCE, "Salesforce CRM", "saas", E_DE, None, ["personal_data"], ["US"], True, None),
        (SYS_WORKDAY, "Workday HR", "saas", E_DE, None, ["personal_data", "special_category"], ["US", "DE"], True, None),
        (SYS_JIRA, "JIRA", "saas", E_UK, None, [], [], False, None),
        (SYS_WIKI, "Internal Wiki", "application", E_DE, None, [], [], False, None),
        (SYS_PG, "PostgreSQL Production DB", "data_store", E_DE, "CRITICAL", ["personal_data"], ["DE"], False, None),
        (SYS_PAYMENT, "Payment Processor", "third_party", E_DE, "RESTRICTED", [], [], False, None),
        (SYS_PORTAL, "Customer Portal", "application", E_UK, None, ["personal_data"], [], False, None),
        (SYS_BANGKOK, "Bangkok Office Network", "network", E_TH, None, [], [], False, None),
        (SYS_GITHUB, "GitHub Enterprise", "saas", E_US, None, [], [], False, None),
    ]
    for sid, name, stype, owner, crit, data_cls, juris, third, mech in systems:
        cur.execute(
            """INSERT INTO systems (id, name, system_type, owning_entity_id, criticality, data_classifications,
               jurisdictions_data_stored, third_country_transfer, transfer_mechanism)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
            (sid, name, stype, owner, crit, psycopg2.extras.Json(data_cls), psycopg2.extras.Json(juris), third, mech),
        )
        counts["systems"] = counts.get("systems", 0) + cur.rowcount

    # 7. System-entity usage
    all_entities_list = [E_DE, E_UK, E_AU, E_TH, E_ES, E_US]
    de_uk_es_list = [E_DE, E_UK, E_ES]
    de_uk_au_us = [E_DE, E_UK, E_AU, E_US]
    de_uk_only = [E_DE, E_UK]
    for eid in all_entities_list:
        for sys_id in [SYS_AZURE_AD, SYS_SALESFORCE, SYS_WORKDAY, SYS_WIKI, SYS_GITHUB]:
            cur.execute(
                "INSERT INTO system_entities (system_id, entity_id) VALUES (%s, %s) ON CONFLICT (system_id, entity_id) DO NOTHING",
                (sys_id, eid),
            )
    for eid in de_uk_es_list:
        cur.execute(
            "INSERT INTO system_entities (system_id, entity_id) VALUES (%s, %s) ON CONFLICT (system_id, entity_id) DO NOTHING",
            (SYS_AZURE_DEVOPS, eid),
        )
    cur.execute(
        "INSERT INTO system_entities (system_id, entity_id) VALUES (%s, %s) ON CONFLICT (system_id, entity_id) DO NOTHING",
        (SYS_AWS, E_US),
    )
    for eid in de_uk_au_us:
        cur.execute(
            "INSERT INTO system_entities (system_id, entity_id) VALUES (%s, %s) ON CONFLICT (system_id, entity_id) DO NOTHING",
            (SYS_JIRA, eid),
        )
    cur.execute(
        "INSERT INTO system_entities (system_id, entity_id) VALUES (%s, %s) ON CONFLICT (system_id, entity_id) DO NOTHING",
        (SYS_PG, E_DE),
    )
    for eid in de_uk_only:
        cur.execute(
            "INSERT INTO system_entities (system_id, entity_id) VALUES (%s, %s) ON CONFLICT (system_id, entity_id) DO NOTHING",
            (SYS_PAYMENT, eid),
        )
    cur.execute(
        "INSERT INTO system_entities (system_id, entity_id) VALUES (%s, %s) ON CONFLICT (system_id, entity_id) DO NOTHING",
        (SYS_PORTAL, E_UK),
    )
    cur.execute(
        "INSERT INTO system_entities (system_id, entity_id) VALUES (%s, %s) ON CONFLICT (system_id, entity_id) DO NOTHING",
        (SYS_BANGKOK, E_TH),
    )

    # 8. Controls (15)
    controls = [
        (CTL_MFA, "MFA enforcement", "technical", "IMPLEMENTED", True, None),
        (CTL_ENC, "Encryption at rest", "technical", "IMPLEMENTED", False, None),
        (CTL_VULN, "Vulnerability scanning", "technical", "IMPLEMENTED", False, "SEMI_AUTOMATED"),
        (CTL_AWARENESS, "Security awareness training", "administrative", "IMPLEMENTED", False, None),
        (CTL_ACCESS, "Access review process", "administrative", "PARTIAL", False, None),
        (CTL_INCIDENT, "Incident response plan", "administrative", "PARTIAL", False, "documented not tested"),
        (CTL_BACKUP, "Backup and recovery", "technical", "IMPLEMENTED", False, None),
        (CTL_ROPA, "GDPR RoPA / processing register", "administrative", "PARTIAL", False, None),
        (CTL_SUPPLIER, "Supplier security assessment", "administrative", "NOT_IMPLEMENTED", False, None),
        (CTL_DPO, "DPO appointment", "administrative", "IMPLEMENTED", False, "DE only"),
        (CTL_NIS2_REG, "NIS2 entity registration", "administrative", "NOT_IMPLEMENTED", False, None),
        (CTL_PENTEST, "Penetration testing", "technical", "PARTIAL", False, "18 months ago"),
        (CTL_DATA_CLASS, "Data classification", "administrative", "PARTIAL", False, None),
        (CTL_CHANGE, "Change management", "administrative", "IMPLEMENTED", False, None),
        (CTL_BC, "Business continuity test", "administrative", "PARTIAL", False, "not tested"),
    ]
    for cid, name, ctype, status, inherited, notes in controls:
        cur.execute(
            """INSERT INTO controls (id, name, control_type, status, inherited_from_group, notes)
               VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (id) DO NOTHING""",
            (cid, name, ctype, status, inherited, notes),
        )
        counts["controls"] = counts.get("controls", 0) + cur.rowcount

    # 9. Control framework mappings
    mappings = [
        (CTL_MFA, "nis2", "NIS2-RM-10"),
        (CTL_MFA, "iso27001", "A.8.4"),
        (CTL_MFA, "cyber_essentials", "CE-UAC-01"),
        (CTL_ENC, "nis2", "NIS2-RM-08"),
        (CTL_ENC, "gdpr", "GDPR-SEC-01"),
        (CTL_ENC, "iso27001", "A.8.24"),
        (CTL_VULN, "nis2", "NIS2-RM-05"),
        (CTL_VULN, "iso27001", "A.8.8"),
        (CTL_AWARENESS, "nis2", "NIS2-RM-07"),
        (CTL_AWARENESS, "iso27001", "A.6.3"),
        (CTL_ACCESS, "nis2", "NIS2-RM-09"),
        (CTL_ACCESS, "iso27001", "A.5.18"),
        (CTL_INCIDENT, "nis2", "NIS2-RM-02"),
        (CTL_INCIDENT, "gdpr", "GDPR-BN-01"),
        (CTL_INCIDENT, "iso27001", "A.5.26"),
        (CTL_BACKUP, "nis2", "NIS2-RM-03"),
        (CTL_BACKUP, "iso27001", "A.8.13"),
        (CTL_ROPA, "gdpr", "GDPR-LB-03"),
        (CTL_ROPA, "gdpr", "GDPR-AG-01"),
        (CTL_SUPPLIER, "nis2", "NIS2-RM-04"),
        (CTL_SUPPLIER, "iso27001", "A.5.19"),
        (CTL_DPO, "gdpr", "GDPR-DPO-01"),
        (CTL_NIS2_REG, "nis2", "NIS2-SC-01"),
        (CTL_PENTEST, "nis2", "NIS2-RM-06"),
        (CTL_PENTEST, "iso27001", "A.8.8"),
        (CTL_DATA_CLASS, "iso27001", "A.5.12"),
        (CTL_DATA_CLASS, "gdpr", "GDPR-AG-01"),
        (CTL_CHANGE, "iso27001", "A.8.32"),
        (CTL_BC, "nis2", "NIS2-RM-03"),
        (CTL_BC, "iso27001", "A.5.30"),
    ]
    for cid, fw, ref in mappings:
        cur.execute(
            """INSERT INTO control_framework_mappings (control_id, framework_id, requirement_ref)
               VALUES (%s, %s, %s) ON CONFLICT (control_id, framework_id, requirement_ref) DO NOTHING""",
            (cid, fw, ref),
        )
        counts["control_framework_mappings"] = counts.get("control_framework_mappings", 0) + cur.rowcount

    conn.commit()
    return counts


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    migrations_dir = repo_root / "migrations"

    conn = get_connection()
    try:
        run_migration(conn, migrations_dir)
        counts = insert_all(conn)
        print("Seed summary (rows inserted this run):")
        for table, n in sorted(counts.items()):
            print(f"  {table}: {n}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

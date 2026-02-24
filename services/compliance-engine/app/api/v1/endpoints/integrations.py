# Integrations hub — data source connectors with setup guides and connection status.
# ZTAIP: read-only metadata; credentials stored separately (encrypted). No naked LLM calls.

from fastapi import APIRouter, HTTPException

router = APIRouter()

INTEGRATIONS = [
    {
        "id": "microsoft-365",
        "name": "Microsoft 365",
        "category": "Identity & Access",
        "icon": "M365",
        "color": "#0078d4",
        "status": "not_connected",
        "description": "Pull user accounts, MFA status, conditional access policies and admin audit logs.",
        "compliance_value": [
            "ISO 27001 A.5.15 — Access control",
            "ISO 27001 A.8.2 — Privileged access",
            "Cyber Essentials — User access control",
            "NIS2 Art.21 — Access management"
        ],
        "data_collected": [
            "User accounts and roles",
            "MFA enforcement status",
            "Conditional access policies",
            "Admin audit log events",
            "Licensed applications"
        ],
        "setup_steps": [
            {
                "step": 1,
                "title": "Register app in Azure Portal",
                "description": "Go to portal.azure.com → Azure Active Directory → App registrations → New registration. Name it 'CORTEX Integration'.",
                "docs_url": "https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app"
            },
            {
                "step": 2,
                "title": "Grant API permissions",
                "description": "Add Microsoft Graph permissions: User.Read.All, Policy.Read.All, AuditLog.Read.All. Grant admin consent.",
                "docs_url": "https://docs.microsoft.com/en-us/graph/permissions-reference"
            },
            {
                "step": 3,
                "title": "Create client secret",
                "description": "In Certificates & secrets → New client secret. Copy the value immediately — it won't be shown again.",
                "docs_url": None
            },
            {
                "step": 4,
                "title": "Enter credentials in CORTEX",
                "description": "Enter your Tenant ID, Client ID and Client Secret below to complete the connection.",
                "docs_url": None
            }
        ],
        "credentials_required": [
            {"key": "tenant_id",     "label": "Tenant ID",     "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"},
            {"key": "client_id",     "label": "Client ID",     "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"},
            {"key": "client_secret", "label": "Client Secret", "placeholder": "Enter client secret", "secret": True}
        ]
    },
    {
        "id": "google-workspace",
        "name": "Google Workspace",
        "category": "Identity & Access",
        "icon": "GWS",
        "color": "#4285f4",
        "status": "not_connected",
        "description": "Pull user accounts, 2-step verification status, OAuth app permissions and admin activity.",
        "compliance_value": [
            "ISO 27001 A.5.15 — Access control",
            "Cyber Essentials — User access control",
            "GDPR Art.32 — Security of processing",
            "NIS2 Art.21 — Access management"
        ],
        "data_collected": [
            "User accounts and admin roles",
            "2-Step Verification status",
            "OAuth app permissions",
            "Admin activity reports",
            "Drive sharing settings"
        ],
        "setup_steps": [
            {
                "step": 1,
                "title": "Create service account in GCP",
                "description": "Go to console.cloud.google.com → IAM & Admin → Service Accounts → Create. Name it 'cortex-integration'.",
                "docs_url": "https://cloud.google.com/iam/docs/creating-managing-service-accounts"
            },
            {
                "step": 2,
                "title": "Enable Admin SDK API",
                "description": "In GCP Console → APIs & Services → Enable APIs → search for 'Admin SDK API' and enable it.",
                "docs_url": "https://developers.google.com/admin-sdk/directory/v1/guides/prerequisites"
            },
            {
                "step": 3,
                "title": "Delegate domain-wide authority",
                "description": "In Google Admin Console → Security → API Controls → Domain-wide delegation. Add your service account client ID with scopes: admin.directory.user.readonly, admin.reports.audit.readonly",
                "docs_url": "https://developers.google.com/admin-sdk/directory/v1/guides/delegation"
            },
            {
                "step": 4,
                "title": "Download service account key",
                "description": "In GCP → Service Account → Keys → Add Key → JSON. Upload the JSON file to CORTEX below.",
                "docs_url": None
            }
        ],
        "credentials_required": [
            {"key": "admin_email",       "label": "Admin Email",          "placeholder": "admin@yourdomain.com"},
            {"key": "service_account_json", "label": "Service Account JSON", "placeholder": "Paste JSON key here", "multiline": True}
        ]
    },
    {
        "id": "slack",
        "name": "Slack",
        "category": "Communications",
        "icon": "SLK",
        "color": "#4a154b",
        "status": "not_connected",
        "description": "Pull workspace members, admin audit logs and security settings for access control evidence.",
        "compliance_value": [
            "ISO 27001 A.6.3 — Security awareness",
            "ISO 27001 A.5.15 — Access control",
            "NIS2 Art.21 — Monitoring",
            "GDPR Art.32 — Security of processing"
        ],
        "data_collected": [
            "Workspace members and roles",
            "Admin audit log events",
            "App permissions and OAuth scopes",
            "2FA enforcement status",
            "Data retention settings"
        ],
        "setup_steps": [
            {
                "step": 1,
                "title": "Create a Slack App",
                "description": "Go to api.slack.com/apps → Create New App → From scratch. Name it 'CORTEX' and select your workspace.",
                "docs_url": "https://api.slack.com/authentication/basics"
            },
            {
                "step": 2,
                "title": "Add OAuth scopes",
                "description": "In OAuth & Permissions → Bot Token Scopes, add: users:read, admin:read, audit:logs:read, team:read",
                "docs_url": "https://api.slack.com/scopes"
            },
            {
                "step": 3,
                "title": "Install app to workspace",
                "description": "Click 'Install to Workspace' and authorise. Copy the Bot User OAuth Token.",
                "docs_url": None
            },
            {
                "step": 4,
                "title": "Enter token in CORTEX",
                "description": "Paste your Bot User OAuth Token below. CORTEX will verify the connection immediately.",
                "docs_url": None
            }
        ],
        "credentials_required": [
            {"key": "bot_token", "label": "Bot OAuth Token", "placeholder": "xoxb-...", "secret": True}
        ]
    },
    {
        "id": "github",
        "name": "GitHub",
        "category": "Development",
        "icon": "GH",
        "color": "#24292e",
        "status": "not_connected",
        "description": "Pull repository security settings, branch protection rules, secret scanning and dependency alerts.",
        "compliance_value": [
            "ISO 27001 A.8.25 — Secure development",
            "ISO 27001 A.8.8 — Technical vulnerabilities",
            "NIS2 Art.21(2)(d) — Supply chain security",
            "GDPR Art.25 — Security by design"
        ],
        "data_collected": [
            "Repository security settings",
            "Branch protection rules",
            "Secret scanning alerts",
            "Dependabot vulnerability alerts",
            "Code scanning results",
            "Organisation member 2FA status"
        ],
        "setup_steps": [
            {
                "step": 1,
                "title": "Create a GitHub App or PAT",
                "description": "For organisations, go to Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens → Generate new token.",
                "docs_url": "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token"
            },
            {
                "step": 2,
                "title": "Set required permissions",
                "description": "Grant read access to: Administration, Members, Metadata, Secret scanning alerts, Vulnerability alerts, Code scanning alerts.",
                "docs_url": "https://docs.github.com/en/rest/overview/permissions-required-for-fine-grained-personal-access-tokens"
            },
            {
                "step": 3,
                "title": "Enter token in CORTEX",
                "description": "Paste your Personal Access Token and organisation name below. CORTEX will scan your repositories immediately.",
                "docs_url": None
            }
        ],
        "credentials_required": [
            {"key": "token",  "label": "Personal Access Token", "placeholder": "ghp_...", "secret": True},
            {"key": "org",    "label": "Organisation Name",     "placeholder": "your-org-name"}
        ]
    },
    {
        "id": "aws",
        "name": "Amazon Web Services",
        "category": "Cloud Infrastructure",
        "icon": "AWS",
        "color": "#ff9900",
        "status": "not_connected",
        "description": "Pull IAM policies, S3 bucket exposure, CloudTrail audit logs and Security Hub findings.",
        "compliance_value": [
            "ISO 27001 A.8.20 — Network security",
            "ISO 27001 A.5.15 — Access control",
            "NIS2 Art.21 — Security measures",
            "CSA CCM — Infrastructure security"
        ],
        "data_collected": [
            "IAM users, roles and policies",
            "S3 bucket public access settings",
            "CloudTrail audit events",
            "Security Hub findings",
            "GuardDuty threat detections",
            "Config compliance rules"
        ],
        "setup_steps": [
            {
                "step": 1,
                "title": "Create IAM user for CORTEX",
                "description": "In AWS Console → IAM → Users → Create user. Name it 'cortex-integration'. Enable programmatic access.",
                "docs_url": "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html"
            },
            {
                "step": 2,
                "title": "Attach read-only policies",
                "description": "Attach these managed policies: SecurityAudit, ReadOnlyAccess. These provide read-only access for compliance scanning.",
                "docs_url": "https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html"
            },
            {
                "step": 3,
                "title": "Generate access keys",
                "description": "In the IAM user → Security credentials → Create access key. Select 'Third-party service'. Copy both the Access Key ID and Secret.",
                "docs_url": None
            },
            {
                "step": 4,
                "title": "Enter credentials in CORTEX",
                "description": "Enter your AWS Access Key ID, Secret Access Key and primary region below.",
                "docs_url": None
            }
        ],
        "credentials_required": [
            {"key": "access_key_id",     "label": "Access Key ID",     "placeholder": "AKIAIOSFODNN7EXAMPLE"},
            {"key": "secret_access_key", "label": "Secret Access Key", "placeholder": "Enter secret key", "secret": True},
            {"key": "region",            "label": "Primary Region",    "placeholder": "eu-west-1"}
        ]
    },
    {
        "id": "azure",
        "name": "Microsoft Azure",
        "category": "Cloud Infrastructure",
        "icon": "AZ",
        "color": "#0089d6",
        "status": "not_connected",
        "description": "Pull Entra ID users, Defender for Cloud alerts, Azure Policy compliance and activity logs.",
        "compliance_value": [
            "ISO 27001 A.5.15 — Access control",
            "NIS2 Art.21 — Security measures",
            "CSA CCM — Cloud security",
            "EU AI Act Art.9 — Risk management"
        ],
        "data_collected": [
            "Entra ID users and MFA status",
            "Defender for Cloud security score",
            "Azure Policy compliance state",
            "Activity log audit events",
            "Resource security configurations",
            "Privileged Identity Management data"
        ],
        "setup_steps": [
            {
                "step": 1,
                "title": "Register app in Azure Portal",
                "description": "portal.azure.com → Azure Active Directory → App registrations → New registration. Name it 'CORTEX Security Scanner'.",
                "docs_url": "https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app"
            },
            {
                "step": 2,
                "title": "Assign Security Reader role",
                "description": "In your subscription → Access control (IAM) → Add role assignment → Security Reader. Assign to your CORTEX app registration.",
                "docs_url": "https://docs.microsoft.com/en-us/azure/role-based-access-control/built-in-roles"
            },
            {
                "step": 3,
                "title": "Grant Graph permissions",
                "description": "In App registration → API permissions → Microsoft Graph: User.Read.All, SecurityEvents.Read.All. Grant admin consent.",
                "docs_url": None
            },
            {
                "step": 4,
                "title": "Enter credentials in CORTEX",
                "description": "Enter your Tenant ID, Client ID, Client Secret and Subscription ID below.",
                "docs_url": None
            }
        ],
        "credentials_required": [
            {"key": "tenant_id",       "label": "Tenant ID",       "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"},
            {"key": "client_id",       "label": "Client ID",       "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"},
            {"key": "client_secret",   "label": "Client Secret",   "placeholder": "Enter client secret", "secret": True},
            {"key": "subscription_id", "label": "Subscription ID", "placeholder": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"}
        ]
    }
]


@router.get("")
async def list_integrations():
    return INTEGRATIONS


@router.get("/{integration_id}")
async def get_integration(integration_id: str):
    for i in INTEGRATIONS:
        if i["id"] == integration_id:
            return i
    raise HTTPException(status_code=404, detail="Integration not found")


@router.post("/{integration_id}/test")
async def test_integration(integration_id: str):
    return {
        "integration_id": integration_id,
        "status": "coming_soon",
        "message": "Live connection testing coming in v0.4.0"
    }

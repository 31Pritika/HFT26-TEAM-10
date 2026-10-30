"""Rule-based remediation steps and compliance tags for every finding subtype (master §8.5, §9)."""
from __future__ import annotations

_ROTATE = ("Revoke this credential now", "Rotate it and move it to a secrets manager",
           "Add pre-commit secret scanning")
_AWS = ("Deactivate key in IAM now", "Rotate & move to AWS Secrets Manager", "Add pre-commit secret scanning")
_PURGE = ("Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Enable masking in source system")
_INFRA = ("Remove internal addressing from prompts", "Restrict AI tool access to internal docs")
_AGENT = ("Run agent in sandbox/container", "Require human approval for shell tools", "Restrict tool allowlist")
_SHARED_CODE = ("Review what was shared with the provider", "Move the team to a sanctioned AI tool")
_SHADOW = ("Decide whether to sanction or block this tool", "Tell the owner about the approved alternative")

_STEPS: dict[str, dict[str, tuple[str, ...]]] = {
    "secret": {
        "aws_access_key": _AWS,
        "aws_secret_key": _AWS,
        "openai_key": ("Revoke key in the OpenAI dashboard", "Issue a scoped project key from a secrets manager",
                       "Add pre-commit secret scanning"),
        "anthropic_key": ("Revoke key in the Anthropic console", "Issue a new key from a secrets manager",
                          "Add pre-commit secret scanning"),
        "github_token": ("Revoke token in GitHub settings", "Audit recent repository activity",
                         "Use short-lived fine-grained tokens"),
        "google_api_key": ("Delete key in Google Cloud console", "Restrict the replacement key by API and referrer",
                           "Add pre-commit secret scanning"),
        "slack_token": ("Revoke token in Slack app settings", "Reinstall the app to issue a new token",
                        "Audit workspace access logs"),
        "stripe_key": ("Roll key in the Stripe dashboard", "Review recent API logs", "Use restricted keys"),
        "hf_token": ("Revoke token in Hugging Face settings", "Issue a read-only replacement",
                     "Add pre-commit secret scanning"),
        "groq_key": ("Revoke key in the Groq console", "Issue a new key from a secrets manager",
                     "Add pre-commit secret scanning"),
        "npm_token": ("Revoke token with `npm token revoke`", "Audit recently published versions",
                      "Use granular access tokens"),
        "sendgrid_key": ("Delete key in SendGrid settings", "Issue a restricted replacement",
                         "Review recent mail activity"),
        "jwt": ("Invalidate the session behind this token", "Shorten token lifetimes",
                "Keep bearer tokens out of prompts and logs"),
        "private_key": ("Treat the key as compromised and revoke it", "Generate a new key pair",
                        "Store private keys in a vault or HSM"),
        "db_connection_url": ("Rotate the database password", "Move the URL to a secrets manager",
                              "Restrict database network access"),
        "azure_conn_string": ("Rotate the storage account key", "Switch to managed identity or SAS",
                              "Move the string to Key Vault"),
        "gcp_service_account": ("Delete the service account key in IAM", "Audit recent activity for this account",
                                "Use workload identity instead of key files"),
        "generic_secret_assignment": _ROTATE,
        "high_entropy_string": ("Confirm whether this token is a credential", "Rotate it if it is",
                                "Add pre-commit secret scanning"),
    },
    "pii": {
        "email": _PURGE,
        "phone_in": _PURGE,
        "phone_intl": _PURGE,
        "aadhaar": _PURGE,
        "pan": _PURGE,
        "gstin": _PURGE,
        "upi_id": _PURGE,
        "ifsc": _PURGE,
        "passport_in": _PURGE,
        "us_ssn": _PURGE,
        "credit_card": ("Purge from AI provider history", "Open a PCI-DSS incident review",
                        "Block card numbers at the gateway"),
        "bulk_pii": ("Purge from AI provider history", "Notify DPO under DPDP Act 2023",
                     "Block bulk exports to AI tools"),
        "private_ip": _INFRA,
        "internal_host": ("Remove internal hostnames from prompts", "Restrict AI tool access to internal docs"),
    },
    "source_code": {
        "source_code": _SHARED_CODE,
        "proprietary_code": ("Review what was shared with the provider", "Tell the code owner about the exposure",
                             "Move the team to a sanctioned AI tool"),
    },
    "canary": {
        "canary_token": ("Treat as an active leak", "Trace the process and user that sent the token"),
    },
    "agent_action": dict.fromkeys(
        ("destructive_command", "remote_code_exec", "data_exfil_command", "privilege_escalation", "persistence",
         "recon", "sensitive_file_read", "unverified_tool_call", "shell_spawn", "autonomous_loop"), _AGENT),
    "shadow_ai": dict.fromkeys(("new_unsanctioned_tool", "sanctioned_tool_seen"), _SHADOW),
    "policy": {"blocked_provider_contacted": ("Block the provider at the network edge",
                                              "Follow up with the process owner")},
    "exfil_volume": {"bytes_out_spike": ("Inspect the destination and payload",
                                         "Pause the process until it is reviewed")},
}

# Master §9. It maps source_code, canary, policy and exfil_volume to ISO27001 only, unlike contracts/mock/findings.json.
_TAGS: dict[str, tuple[str, ...]] = {
    "secret": ("SOC2", "ISO27001"),
    "pii": ("DPDP", "GDPR", "ISO27001"),
    "source_code": ("ISO27001",),
    "canary": ("ISO27001",),
    "agent_action": ("SOC2", "ISO27001"),
    "shadow_ai": ("SOC2", "ISO27001"),
    "policy": ("ISO27001",),
    "exfil_volume": ("ISO27001",),
}

REMEDIATION: dict[str, tuple[str, ...]] = {
    subtype: steps for group in _STEPS.values() for subtype, steps in group.items()
}
COMPLIANCE: dict[str, tuple[str, ...]] = {
    subtype: _TAGS[finding_type] for finding_type, group in _STEPS.items() for subtype in group
}
COMPLIANCE["credit_card"] += ("PCI-DSS",)


def remediation_for(subtype: str) -> list[str]:
    return list(REMEDIATION.get(subtype, ()))


def compliance_for(subtype: str) -> list[str]:
    return list(COMPLIANCE.get(subtype, ()))

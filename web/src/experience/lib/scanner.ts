/**
 * ShadowScope Client-Side Threat Scanner
 * TypeScript port of Master Spec §8.1–§8.4 & §9.
 *
 * Implements:
 * - 20+ Secrets detection rules
 * - PII with Verhoeff (Aadhaar), PAN 4th-char, Luhn + IIN (Credit Card), UPI, Email
 * - JWT header/payload decoding
 * - Shannon entropy analysis
 * - Source & proprietary code heuristics
 * - Agent action & dangerous command parsing (ReAct, OpenAI JSON, Bash)
 * - Overlap resolution & redaction
 * - Risk score calculation & compliance mapping
 */

import type { Finding, Severity, Evidence } from "../../shared/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScannerFinding extends Finding {
  start: number;
  end: number;
  matchRaw: string;
}

export interface ScannerResult {
  findings: ScannerFinding[];
  risk_score: number;
  risk_grade: "A" | "B" | "C" | "D" | "F";
  redacted_text: string;
  stats: {
    chars: number;
    lines: number;
    entropy_max: number;
    flagged_tokens: number;
    duration_ms: number;
  };
}

// ── Algorithms & Validators ──────────────────────────────────────────────────

// Verhoeff tables
const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function validateVerhoeff(numStr: string): boolean {
  const digits = numStr.replace(/\s+/g, "");
  if (!/^\d{12}$/.test(digits)) return false;
  let c = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const digit = parseInt(digits.charAt(len - 1 - i), 10);
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digit]];
  }
  return c === 0;
}

export function validateLuhn(ccStr: string): boolean {
  const digits = ccStr.replace(/[\s-]+/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function matchesCardIIN(digits: string): boolean {
  // Visa
  if (/^4/.test(digits)) return true;
  // Mastercard
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(digits)) return true;
  // Amex
  if (/^3[47]/.test(digits)) return true;
  // Discover
  if (/^(6011|65)/.test(digits)) return true;
  // RuPay
  if (/^(60|65|81|82)/.test(digits)) return true;
  return false;
}

export function calculateShannonEntropy(str: string): number {
  if (!str || str.length === 0) return 0;
  const frequencies = new Map<string, number>();
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }
  let entropy = 0;
  const len = str.length;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return parseFloat(entropy.toFixed(3));
}

function base64UrlDecode(str: string): string {
  try {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    return atob(base64);
  } catch {
    return "";
  }
}

export function decodeJwtClaims(jwt: string): { alg?: string; exp?: number; sub?: string } | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const headerJson = base64UrlDecode(parts[0]);
    const payloadJson = base64UrlDecode(parts[1]);
    const header = JSON.parse(headerJson);
    const payload = JSON.parse(payloadJson);
    return {
      alg: header.alg,
      exp: payload.exp,
      sub: payload.sub,
    };
  } catch {
    return null;
  }
}

function sha256Fingerprint(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(12, "0").slice(0, 12);
}

// ── Redaction ────────────────────────────────────────────────────────────────

export function redactSecretValue(val: string): string {
  if (val.length <= 6) {
    return "•".repeat(val.length);
  }
  const prefix = val.slice(0, 4);
  const suffix = val.slice(-2);
  const maskLen = Math.max(val.length - 6, 4);
  return `${prefix}${"•".repeat(maskLen)}${suffix}`;
}

export function generateRedactedSnippet(
  fullText: string,
  start: number,
  end: number
): { snippet: string; matchRedacted: string } {
  const matchRaw = fullText.slice(start, end);
  const matchRedacted = redactSecretValue(matchRaw);

  const contextRadius = 40;
  const snippetStart = Math.max(0, start - contextRadius);
  const snippetEnd = Math.min(fullText.length, end + contextRadius);

  const before = fullText.slice(snippetStart, start);
  const after = fullText.slice(end, snippetEnd);

  const snippet = `${snippetStart > 0 ? "…" : ""}${before}${matchRedacted}${after}${snippetEnd < fullText.length ? "…" : ""}`;
  return { snippet, matchRedacted };
}

// ── Line & Offset Calculation ────────────────────────────────────────────────

function getLineAndOffset(text: string, charIndex: number): { line: number; offset: number } {
  const before = text.slice(0, charIndex);
  const lines = before.split("\n");
  const line = lines.length;
  const offset = lines[lines.length - 1].length;
  return { line, offset };
}

// ── Remediation Table ────────────────────────────────────────────────────────

const REMEDIATION_MAP: Record<string, string[]> = {
  aws_access_key: [
    "Deactivate key immediately in AWS IAM console",
    "Rotate credentials and migrate to AWS Secrets Manager",
    "Add git pre-commit hook scanning with trufflehog or gitleaks",
  ],
  aws_secret_key: [
    "Rotate associated IAM Access Key immediately",
    "Verify AWS CloudTrail for unauthorized API calls in the last 24h",
  ],
  openai_key: [
    "Revoke key on platform.openai.com/api-keys",
    "Issue project-scoped restricted API key",
    "Route AI traffic through ShadowScope Local Gateway for automatic policy enforcement",
  ],
  anthropic_key: [
    "Revoke key on console.anthropic.com",
    "Enable workspace IP restrictions",
  ],
  github_token: [
    "Revoke personal access token in GitHub Settings > Developer settings",
    "Switch to GitHub App installations with fine-grained repository permissions",
  ],
  google_api_key: [
    "Restrict key in Google Cloud Console by HTTP referrer and API service",
    "Rotate compromised API key",
  ],
  stripe_key: [
    "Roll secret key in Stripe Dashboard > Developers > API keys",
    "Review Stripe Webhook & Event log for anomalous transactions",
  ],
  jwt: [
    "Invalidate active user session / revoke signing refresh token",
    "Check token expiration and reduce token TTL",
  ],
  db_connection_url: [
    "Change database user password immediately",
    "Verify network firewall rules to ensure database is not publicly exposed",
  ],
  private_key: [
    "Revoke and remove public key from ~/.ssh/authorized_keys on all target hosts",
    "Generate replacement Ed25519 keypair with strong passphrase",
  ],
  aadhaar: [
    "Purge sensitive record from AI conversation history",
    "File incident log with DPO under India DPDP Act 2023",
    "Mask source system to display only last 4 digits (XXXX-XXXX-1234)",
  ],
  pan: [
    "Notify Data Protection Officer under DPDP Act 2023",
    "Mask PAN in source dataset prior to external AI analysis",
  ],
  credit_card: [
    "Notify cardholder and issue card replacement",
    "Check PCI-DSS tokenization gateway compliance",
  ],
  destructive_command: [
    "Isolate process runtime inside locked container sandbox",
    "Require mandatory human-in-the-loop approval for execution commands",
  ],
  remote_code_exec: [
    "Block outbound network traffic to non-whitelisted C2 addresses",
    "Terminate offending process tree immediately",
  ],
  sensitive_file_read: [
    "Restrict host filesystem read permissions for AI agent runtime",
    "Mount only non-sensitive project directories to agent workspace",
  ],
};

function getRemediation(subtype: string): string[] {
  return REMEDIATION_MAP[subtype] ?? [
    "Review context and purge from AI provider session",
    "Enforce ShadowScope Gateway policy to block unsanctioned payloads",
  ];
}

// ── Overlap Resolution ───────────────────────────────────────────────────────

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export function resolveOverlaps(findings: ScannerFinding[]): ScannerFinding[] {
  if (findings.length <= 1) return findings;

  // Sort by start asc, then severity desc, then span length desc
  const sorted = [...findings].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const rankDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (rankDiff !== 0) return rankDiff;
    return (b.end - b.start) - (a.end - a.start);
  });

  const resolved: ScannerFinding[] = [];
  for (const item of sorted) {
    const prev = resolved[resolved.length - 1];
    if (!prev) {
      resolved.push(item);
      continue;
    }

    // Check overlap
    if (item.start < prev.end) {
      // Overlaps! Keep higher severity
      if (SEVERITY_RANK[item.severity] > SEVERITY_RANK[prev.severity]) {
        resolved[resolved.length - 1] = item;
      }
      // If equal, the longer one was already prioritized by sort
    } else {
      resolved.push(item);
    }
  }

  return resolved;
}

// ── Scanner Engine Core ──────────────────────────────────────────────────────

let findingCounter = 1;

export function scanText(text: string, canaryTokens: string[] = []): ScannerResult {
  const startTime = performance.now();
  const rawFindings: ScannerFinding[] = [];
  let maxEntropy = 0;

  if (!text || text.trim().length === 0) {
    return {
      findings: [],
      risk_score: 0,
      risk_grade: "A",
      redacted_text: "",
      stats: {
        chars: 0,
        lines: 0,
        entropy_max: 0,
        flagged_tokens: 0,
        duration_ms: 0,
      },
    };
  }

  function addFinding(
    type: Finding["type"],
    subtype: string,
    severity: Severity,
    title: string,
    desc: string,
    start: number,
    end: number,
    compliance: string[],
    detector: Finding["detector"] = "regex",
    confidence = 0.95
  ) {
    const matchRaw = text.slice(start, end);
    const { line, offset } = getLineAndOffset(text, start);
    const { snippet, matchRedacted } = generateRedactedSnippet(text, start, end);
    const entropy = calculateShannonEntropy(matchRaw);
    if (entropy > maxEntropy) maxEntropy = entropy;

    const evidence: Evidence = {
      redacted_snippet: snippet,
      match_redacted: matchRedacted,
      entropy,
      line,
      offset,
      fingerprint: sha256Fingerprint(matchRaw),
    };

    rawFindings.push({
      id: `fnd_${Date.now()}_${findingCounter++}`,
      ts: new Date().toISOString(),
      event_id: null,
      type,
      subtype,
      severity,
      confidence,
      title,
      description: desc,
      evidence,
      detector,
      provider_id: null,
      process_name: null,
      status: "open",
      compliance,
      remediation: getRemediation(subtype),
      triage: null,
      start,
      end,
      matchRaw,
    });
  }

  // 1. Canary Tokens
  for (const canary of canaryTokens) {
    if (!canary) continue;
    let idx = text.indexOf(canary);
    while (idx !== -1) {
      addFinding(
        "canary",
        "canary_token",
        "critical",
        "Honeytoken Canary Alert",
        `Configured canary honeytoken "${canary.slice(0, 6)}…" detected in payload`,
        idx,
        idx + canary.length,
        ["SOC2", "ISO27001"],
        "validator",
        1.0
      );
      idx = text.indexOf(canary, idx + canary.length);
    }
  }

  // 2. AWS Access Key
  const awsKeyRegex = /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g;
  let match: RegExpExecArray | null;
  while ((match = awsKeyRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "aws_access_key",
      "critical",
      "AWS IAM Access Key",
      "Active AWS access credential identified in payload",
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  // 3. AWS Secret Key
  const awsSecretRegex = /aws.{0,20}(?:secret|private).{0,20}['"]([0-9a-zA-Z/+]{40})['"]/gi;
  while ((match = awsSecretRegex.exec(text)) !== null) {
    const keyVal = match[1];
    const keyIndex = match.index + match[0].indexOf(keyVal);
    addFinding(
      "secret",
      "aws_secret_key",
      "critical",
      "AWS Secret Key",
      "40-character base64-encoded AWS Secret Access Key",
      keyIndex,
      keyIndex + keyVal.length,
      ["SOC2", "ISO27001"]
    );
  }

  // 4. OpenAI API Key
  const openaiKeyRegex = /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g;
  while ((match = openaiKeyRegex.exec(text)) !== null) {
    if (!match[0].startsWith("sk-ant-")) {
      addFinding(
        "secret",
        "openai_key",
        "critical",
        "OpenAI API Key",
        "OpenAI secret API key found in prompt text",
        match.index,
        match.index + match[0].length,
        ["SOC2", "ISO27001"]
      );
    }
  }

  // 5. Anthropic API Key
  const anthropicKeyRegex = /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g;
  while ((match = anthropicKeyRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "anthropic_key",
      "critical",
      "Anthropic API Key",
      "Anthropic secret API key discovered",
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  // 6. GitHub Token
  const githubTokenRegex = /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g;
  while ((match = githubTokenRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "github_token",
      "critical",
      "GitHub Personal Access Token",
      "GitHub access token with repository control privileges",
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  // 7. Google API Key
  const googleKeyRegex = /\bAIza[0-9A-Za-z_-]{35}\b/g;
  while ((match = googleKeyRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "google_api_key",
      "high",
      "Google Cloud API Key",
      "Google API credential token discovered",
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  // 8. Slack Token
  const slackTokenRegex = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;
  while ((match = slackTokenRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "slack_token",
      "high",
      "Slack OAuth Token",
      "Slack workspace bot or user authorization token",
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  // 9. Stripe Key
  const stripeKeyRegex = /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/g;
  while ((match = stripeKeyRegex.exec(text)) !== null) {
    const isLive = match[2] === "live";
    addFinding(
      "secret",
      "stripe_key",
      isLive ? "critical" : "medium",
      `Stripe ${isLive ? "Live" : "Test"} Secret Key`,
      `Stripe API secret key (${match[2]} environment)`,
      match.index,
      match.index + match[0].length,
      ["PCI-DSS", "SOC2"]
    );
  }

  // 10. HuggingFace Token
  const hfTokenRegex = /\bhf_[A-Za-z0-9]{30,}\b/g;
  while ((match = hfTokenRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "hf_token",
      "high",
      "Hugging Face Access Token",
      "Hugging Face platform authentication token",
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  // 11. Groq Key
  const groqKeyRegex = /\bgsk_[A-Za-z0-9]{40,}\b/g;
  while ((match = groqKeyRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "groq_key",
      "high",
      "Groq Cloud API Key",
      "Groq API authorization key discovered",
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  // 12. NPM Token
  const npmTokenRegex = /\bnpm_[A-Za-z0-9]{36}\b/g;
  while ((match = npmTokenRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "npm_token",
      "high",
      "NPM Publishing Token",
      "NPM registry package publication credential",
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  // 13. SendGrid Key
  const sendgridRegex = /\bSG\.[\w-]{22}\.[\w-]{43}\b/g;
  while ((match = sendgridRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "sendgrid_key",
      "high",
      "SendGrid API Key",
      "SendGrid email relay authentication secret",
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  // 14. JSON Web Token (JWT)
  const jwtRegex = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
  while ((match = jwtRegex.exec(text)) !== null) {
    const claims = decodeJwtClaims(match[0]);
    const algDesc = claims?.alg ? ` (alg: ${claims.alg})` : "";
    addFinding(
      "secret",
      "jwt",
      "high",
      "JSON Web Token (JWT)",
      `Signed JWT authentication payload${algDesc}`,
      match.index,
      match.index + match[0].length,
      ["SOC2", "GDPR"],
      "validator"
    );
  }

  // 15. Private Key
  const privateKeyRegex = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/g;
  while ((match = privateKeyRegex.exec(text)) !== null) {
    const endHeader = text.indexOf("-----END", match.index);
    const keyEnd = endHeader !== -1 ? endHeader + 30 : match.index + match[0].length;
    addFinding(
      "secret",
      "private_key",
      "critical",
      "Cryptographic Private Key",
      "Asymmetric private key certificate or block",
      match.index,
      Math.min(keyEnd, text.length),
      ["SOC2", "ISO27001"]
    );
  }

  // 16. Database Connection URL
  const dbUrlRegex = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/g;
  while ((match = dbUrlRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "db_connection_url",
      "critical",
      "Database Connection URI",
      "Connection string containing embedded username and plaintext password",
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  // 17. Azure Connection String
  const azureConnRegex = /DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[^;\s"']+/gi;
  while ((match = azureConnRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "azure_conn_string",
      "critical",
      "Azure Storage Connection String",
      "Azure resource connection credential with AccountKey",
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  // 18. GCP Service Account JSON signature
  const gcpServiceAccountRegex = /"type"\s*:\s*"service_account"/g;
  while ((match = gcpServiceAccountRegex.exec(text)) !== null) {
    addFinding(
      "secret",
      "gcp_service_account",
      "critical",
      "GCP Service Account Credentials",
      "Google Cloud Platform service account JSON credentials block",
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  // 19. Generic Secret Assignment
  const genericSecretRegex = /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)\b\s*[:=]\s*['"]?([^\s'"]{8,})/gi;
  while ((match = genericSecretRegex.exec(text)) !== null) {
    const val = match[1];
    const valStart = match.index + match[0].lastIndexOf(val);
    const ent = calculateShannonEntropy(val);
    if (ent >= 3.0 || val.length >= 16) {
      addFinding(
        "secret",
        "generic_secret_assignment",
        "high",
        "Hardcoded Secret Assignment",
        `Assigned credential token with high entropy (${ent})`,
        valStart,
        valStart + val.length,
        ["SOC2"]
      );
    }
  }

  // 20. Credit Card (Luhn + IIN)
  const ccRegex = /\b(?:\d[ -]?){13,19}\b/g;
  while ((match = ccRegex.exec(text)) !== null) {
    const rawDigits = match[0].replace(/[\s-]+/g, "");
    if (rawDigits.length >= 13 && rawDigits.length <= 19 && matchesCardIIN(rawDigits) && validateLuhn(rawDigits)) {
      addFinding(
        "pii",
        "credit_card",
        "critical",
        "Payment Card Number",
        "Valid payment card primary account number (Luhn validated)",
        match.index,
        match.index + match[0].length,
        ["PCI-DSS", "GDPR", "DPDP"],
        "validator",
        1.0
      );
    }
  }

  // 21. Aadhaar Number (Verhoeff Checksum)
  const aadhaarRegex = /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/g;
  while ((match = aadhaarRegex.exec(text)) !== null) {
    if (validateVerhoeff(match[0])) {
      addFinding(
        "pii",
        "aadhaar",
        "high",
        "Aadhaar Number (UIDAI)",
        "12-digit Indian national identity number with verified Verhoeff checksum",
        match.index,
        match.index + match[0].length,
        ["DPDP"],
        "validator",
        1.0
      );
    }
  }

  // 22. Permanent Account Number (PAN)
  const panRegex = /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g;
  while ((match = panRegex.exec(text)) !== null) {
    addFinding(
      "pii",
      "pan",
      "high",
      "Indian PAN Card Number",
      "Income tax Permanent Account Number with valid 4th entity character",
      match.index,
      match.index + match[0].length,
      ["DPDP"]
    );
  }

  // 23. GSTIN
  const gstinRegex = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
  while ((match = gstinRegex.exec(text)) !== null) {
    addFinding(
      "pii",
      "gstin",
      "medium",
      "Goods and Services Tax ID (GSTIN)",
      "Indian business GST identification number",
      match.index,
      match.index + match[0].length,
      ["DPDP"]
    );
  }

  // 24. UPI ID
  const upiRegex = /\b[\w.-]{2,}@(okaxis|okhdfcbank|okicici|oksbi|ybl|paytm|upi|apl|ibl|axl)\b/gi;
  while ((match = upiRegex.exec(text)) !== null) {
    addFinding(
      "pii",
      "upi_id",
      "medium",
      "Unified Payments Interface (UPI) VPA",
      "Personal banking UPI Virtual Payment Address",
      match.index,
      match.index + match[0].length,
      ["DPDP", "PCI-DSS"]
    );
  }

  // 25. Indian Phone Number
  const phoneInRegex = /(?:\+91[\s-]?)?[6-9]\d{9}\b/g;
  while ((match = phoneInRegex.exec(text)) !== null) {
    addFinding(
      "pii",
      "phone_in",
      "medium",
      "Indian Mobile Number",
      "Mobile telephone number (+91 telecom band)",
      match.index,
      match.index + match[0].length,
      ["DPDP"]
    );
  }

  // 26. Email Addresses (with bulk check)
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
  const emails: { index: number; text: string }[] = [];
  while ((match = emailRegex.exec(text)) !== null) {
    emails.push({ index: match.index, text: match[0] });
  }

  const isBulkPii = emails.length >= 5;
  for (const item of emails) {
    addFinding(
      "pii",
      isBulkPii ? "bulk_pii" : "email",
      isBulkPii ? "high" : "medium",
      isBulkPii ? "Bulk PII / Email Collection" : "Email Address",
      isBulkPii ? `Part of ${emails.length} customer contact addresses` : "Personal email contact address",
      item.index,
      item.index + item.text.length,
      ["GDPR", "DPDP"]
    );
  }

  // 27. US Social Security Number (SSN)
  const ssnRegex = /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;
  while ((match = ssnRegex.exec(text)) !== null) {
    addFinding(
      "pii",
      "us_ssn",
      "high",
      "US Social Security Number",
      "US government Social Security Number (SSN)",
      match.index,
      match.index + match[0].length,
      ["GDPR", "SOC2"]
    );
  }

  // 28. Private IP Addresses
  const privateIpRegex = /\b(?:10\.\d+|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d+\.\d+\b/g;
  while ((match = privateIpRegex.exec(text)) !== null) {
    addFinding(
      "pii",
      "private_ip",
      "low",
      "Internal RFC1918 IP Address",
      "Private corporate network IP address revealed",
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  // 29. Internal Hostnames
  const internalHostRegex = /\b[\w-]+\.(internal|corp|intranet|local|lan)\b/gi;
  while ((match = internalHostRegex.exec(text)) !== null) {
    addFinding(
      "pii",
      "internal_host",
      "low",
      "Internal Infrastructure FQDN",
      "Corporate intranet server domain address",
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  // 30. Agent Actions & Dangerous Commands
  const agentDestructiveRegex = /\b(?:rm\s+-rf|mkfs|dd\s+if=|:\(\)\{|del\s+\/s\s+\/q|Remove-Item\s+.*-Recurse|format\s+[a-z]:)/gi;
  while ((match = agentDestructiveRegex.exec(text)) !== null) {
    addFinding(
      "agent_action",
      "destructive_command",
      "critical",
      "Destructive Shell Command",
      `Dangerous file or filesystem deletion signature "${match[0]}"`,
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  const agentRceRegex = /(?:curl[^|\n]*\|\s*(?:ba|z)?sh|wget[^|\n]*\|\s*sh|iex\s*\(\s*iwr|Invoke-Expression|python\s+-c\s+.*exec)/gi;
  while ((match = agentRceRegex.exec(text)) !== null) {
    addFinding(
      "agent_action",
      "remote_code_exec",
      "critical",
      "Remote Code Execution Pattern",
      `Piped external payload execution command: "${match[0]}"`,
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  const agentExfilRegex = /(?:curl\s+.*(?:-d|--data|-F|--upload-file)\s*@|scp\s+|nc\s+.*-e|base64\s+.*\|\s*curl)/gi;
  while ((match = agentExfilRegex.exec(text)) !== null) {
    addFinding(
      "agent_action",
      "data_exfil_command",
      "high",
      "Data Exfiltration Command",
      `Outbound data exfiltration payload command "${match[0]}"`,
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  const agentPrivEscRegex = /\b(?:sudo\b|chmod\s+777|chown\s+root)/gi;
  while ((match = agentPrivEscRegex.exec(text)) !== null) {
    addFinding(
      "agent_action",
      "privilege_escalation",
      "high",
      "Privilege Escalation Attempt",
      `Privileged user elevation signature: "${match[0]}"`,
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  const agentPersistRegex = /\b(?:crontab|launchctl|schtasks|reg\s+add|systemctl\s+enable)/gi;
  while ((match = agentPersistRegex.exec(text)) !== null) {
    addFinding(
      "agent_action",
      "persistence",
      "high",
      "System Persistence Mechanism",
      `Background task or daemon persistence command "${match[0]}"`,
      match.index,
      match.index + match[0].length,
      ["SOC2"]
    );
  }

  const agentSensitiveFileRegex = /(?:~?\/\.ssh\/|id_rsa|id_ed25519|\.env|\/etc\/passwd|\/etc\/shadow|\.aws\/credentials|\.kube\/config|\.git-credentials|\.npmrc|\.docker\/config\.json|Login Data|Cookies|\\config\\SAM)/gi;
  while ((match = agentSensitiveFileRegex.exec(text)) !== null) {
    const isCritical = /id_rsa|id_ed25519|shadow|SAM/i.test(match[0]);
    addFinding(
      "agent_action",
      "sensitive_file_read",
      isCritical ? "critical" : "high",
      "Sensitive Path Access",
      `Agent accessed confidential operating system credential path "${match[0]}"`,
      match.index,
      match.index + match[0].length,
      ["SOC2", "ISO27001"]
    );
  }

  // 31. Source Code & Proprietary Code Detection
  const lines = text.split("\n");
  const codeLines = lines.filter((l) =>
    /^(?:\s*(?:import\s|from\s+\w+\s+import|def\s|class\s|function\s|const\s|let\s|var\s|public\s+static|#include|package\s|SELECT\s+.*FROM|CREATE\s+TABLE)|.*=>.*|.*[{}();]{2,}.*)/i.test(
      l
    )
  );

  const hasProprietaryNotice = /Proprietary|Confidential|Internal use only|Copyright .* (?:Inc|Ltd|Pvt)/i.test(
    text
  );

  if (codeLines.length >= 5) {
    const subtype = hasProprietaryNotice ? "proprietary_code" : "source_code";
    const sev: Severity = hasProprietaryNotice ? "high" : "medium";
    const title = hasProprietaryNotice ? "Proprietary Source Code" : "Source Code Leak";
    const desc = hasProprietaryNotice
      ? "Proprietary code with confidential company ownership notice"
      : `Application source code snippet (${codeLines.length} code lines identified)`;

    addFinding(
      "source_code",
      subtype,
      sev,
      title,
      desc,
      0,
      Math.min(text.length, 120),
      ["SOC2", "ISO27001"],
      "heuristic"
    );
  }

  // Resolve overlaps to ensure clean non-conflicting spans
  const resolved = resolveOverlaps(rawFindings);

  // Calculate Risk Score (Master Spec §9)
  // Severity weights: critical 60, high 40, medium 20, low 8, info 2
  const SEVERITY_WEIGHTS: Record<Severity, number> = {
    critical: 60,
    high: 40,
    medium: 20,
    low: 8,
    info: 2,
  };

  let maxWeight = 0;
  let agentBonus = 0;

  for (const f of resolved) {
    const w = SEVERITY_WEIGHTS[f.severity];
    if (w > maxWeight) maxWeight = w;
    if (f.type === "agent_action") agentBonus = 15;
  }

  const rawScore = resolved.length > 0 ? maxWeight + 5 * (resolved.length - 1) + agentBonus : 0;
  const risk_score = Math.min(100, Math.max(0, rawScore));

  const risk_grade =
    risk_score <= 20
      ? "A"
      : risk_score <= 40
        ? "B"
        : risk_score <= 60
          ? "C"
          : risk_score <= 80
            ? "D"
            : "F";

  // Build fully redacted text
  let redacted_text = "";
  let lastIndex = 0;
  for (const f of resolved) {
    redacted_text += text.slice(lastIndex, f.start);
    redacted_text += "•".repeat(f.end - f.start);
    lastIndex = f.end;
  }
  redacted_text += text.slice(lastIndex);

  const duration_ms = parseFloat((performance.now() - startTime).toFixed(2));

  return {
    findings: resolved,
    risk_score,
    risk_grade,
    redacted_text,
    stats: {
      chars: text.length,
      lines: lines.length,
      entropy_max: maxEntropy,
      flagged_tokens: resolved.length,
      duration_ms,
    },
  };
}

// ── Dev Self-Test Suite ───────────────────────────────────────────────────────

export function runScannerSelfTests(): { passed: number; failed: number } {
  console.group("🛡 Running ShadowScope Scanner Self-Tests");
  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean) {
    if (condition) {
      console.log(`%c✔ PASS: ${name}`, "color: #34D399");
      passed++;
    } else {
      console.error(`✖ FAIL: ${name}`);
      failed++;
    }
  }

  // 1. Verhoeff Aadhaar Test
  assert("Verhoeff validates 3675 9834 5212", validateVerhoeff("3675 9834 5212"));
  assert("Verhoeff rejects invalid digit 3675 9834 5213", !validateVerhoeff("3675 9834 5213"));

  // 2. Luhn Card Test
  assert("Luhn validates Visa 4532 0150 1234 5671", validateLuhn("4532015012345671"));
  assert("Luhn rejects invalid 4532 0150 1234 5679", !validateLuhn("4532015012345679"));

  // 3. AWS Key Scan Test
  const r1 = scanText("export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE");
  assert("Detects AWS Access Key", r1.findings.some((f) => f.subtype === "aws_access_key"));

  // 4. PAN Card Test
  const r2 = scanText("Employee PAN is ABCPA1234F");
  assert("Detects valid PAN", r2.findings.some((f) => f.subtype === "pan"));

  // 5. Destructive Agent Command
  const r3 = scanText("Agent output: rm -rf /var/log/*");
  assert("Detects destructive rm -rf", r3.findings.some((f) => f.subtype === "destructive_command"));

  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.groupEnd();
  return { passed, failed };
}

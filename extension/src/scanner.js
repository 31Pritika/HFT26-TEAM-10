/*
 * JS port of shadowscope_detect (master §8.1-§8.3). Runs in the page, so the browser never hands raw text to anything.
 * extension/tests/test_parity.py checks this against the Python scanner, fixture by fixture. Change both together.
 */
(function (root) {
  "use strict";

  const MASK_CHAR = "•";
  const MAX_BULLETS = 40;
  const FULL_MASK_MIN = 12;
  const SNIPPET_CONTEXT = 40;
  const RISK_DECAY = 0.5;
  const DEFAULT_THRESHOLD = 4.0;
  const HEX_THRESHOLD_OFFSET = 1.0;
  const MIN_TOKEN_LEN = 20;
  const ENTROPY_SAMPLE = 4096;
  const CONTEXT_CHARS = 32;
  const PEM_MAX = 64 * 1024;
  const MIN_CODE_LINES = 5;
  const EXCERPT_CHARS = 80;
  const BULK_EMAILS = 5;
  const BULK_IDENTITY_DOCS = 3;

  const TIER_CANARY = 4, TIER_NAMED = 3, TIER_DEFAULT = 2, TIER_GENERIC = 1, TIER_INFRA = 0;
  const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  const WEIGHTS = { critical: 60, high: 40, medium: 20, low: 8, info: 2 };

  const SECRET_TAGS = ["SOC2", "ISO27001"];
  const PII_TAGS = ["DPDP", "GDPR", "ISO27001"];
  const ROTATE = ["Revoke this credential now", "Rotate it and move it to a secrets manager", "Add pre-commit secret scanning"];
  const AWS = ["Deactivate key in IAM now", "Rotate & move to AWS Secrets Manager", "Add pre-commit secret scanning"];
  const PURGE = ["Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Enable masking in source system"];

  const REMEDIATION = {
    aws_access_key: AWS,
    aws_secret_key: AWS,
    openai_key: ["Revoke key in the OpenAI dashboard", "Issue a scoped project key from a secrets manager", "Add pre-commit secret scanning"],
    anthropic_key: ["Revoke key in the Anthropic console", "Issue a new key from a secrets manager", "Add pre-commit secret scanning"],
    github_token: ["Revoke token in GitHub settings", "Audit recent repository activity", "Use short-lived fine-grained tokens"],
    google_api_key: ["Delete key in Google Cloud console", "Restrict the replacement key by API and referrer", "Add pre-commit secret scanning"],
    slack_token: ["Revoke token in Slack app settings", "Reinstall the app to issue a new token", "Audit workspace access logs"],
    stripe_key: ["Roll key in the Stripe dashboard", "Review recent API logs", "Use restricted keys"],
    hf_token: ["Revoke token in Hugging Face settings", "Issue a read-only replacement", "Add pre-commit secret scanning"],
    groq_key: ["Revoke key in the Groq console", "Issue a new key from a secrets manager", "Add pre-commit secret scanning"],
    npm_token: ["Revoke token with `npm token revoke`", "Audit recently published versions", "Use granular access tokens"],
    sendgrid_key: ["Delete key in SendGrid settings", "Issue a restricted replacement", "Review recent mail activity"],
    jwt: ["Invalidate the session behind this token", "Shorten token lifetimes", "Keep bearer tokens out of prompts and logs"],
    private_key: ["Treat the key as compromised and revoke it", "Generate a new key pair", "Store private keys in a vault or HSM"],
    db_connection_url: ["Rotate the database password", "Move the URL to a secrets manager", "Restrict database network access"],
    azure_conn_string: ["Rotate the storage account key", "Switch to managed identity or SAS", "Move the string to Key Vault"],
    gcp_service_account: ["Delete the service account key in IAM", "Audit recent activity for this account", "Use workload identity instead of key files"],
    generic_secret_assignment: ROTATE,
    high_entropy_string: ["Confirm whether this token is a credential", "Rotate it if it is", "Add pre-commit secret scanning"],
    credit_card: ["Purge from AI provider history", "Open a PCI-DSS incident review", "Block card numbers at the gateway"],
    bulk_pii: ["Purge from AI provider history", "Notify DPO under DPDP Act 2023", "Block bulk exports to AI tools"],
    private_ip: ["Remove internal addressing from prompts", "Restrict AI tool access to internal docs"],
    internal_host: ["Remove internal hostnames from prompts", "Restrict AI tool access to internal docs"],
    source_code: ["Review what was shared with the provider", "Move the team to a sanctioned AI tool"],
    proprietary_code: ["Review what was shared with the provider", "Tell the code owner about the exposure", "Move the team to a sanctioned AI tool"],
    canary_token: ["Treat as an active leak", "Trace the process and user that sent the token"],
  };

  function complianceFor(rule) {
    if (rule.type === "secret") return SECRET_TAGS;
    if (rule.id === "credit_card") return [...PII_TAGS, "PCI-DSS"];
    if (rule.type === "pii") return PII_TAGS;
    return ["ISO27001"];
  }

  const rule = (id, type, regex, severity, title, options = {}) => ({
    id, type, regex, severity, title, validator: null, keywords: [], valueGroups: [], confidence: 0.9, detector: "regex",
    mask: "default", tier: TIER_DEFAULT, ...options,
  });
  const secret = (id, regex, severity, title, options = {}) => rule(id, "secret", regex, severity, title, { tier: TIER_NAMED, ...options });
  const pii = (id, regex, severity, title, options = {}) => rule(id, "pii", regex, severity, title, options);

  const SECRET_RULES = [
    secret("aws_access_key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "critical", "AWS access key in AI prompt",
      { keywords: ["akia", "asia"], confidence: 0.97 }),
    secret("aws_secret_key", /aws.{0,20}(?:secret|private).{0,20}?(?<![0-9a-zA-Z/+])(?<value>[0-9a-zA-Z/+]{40})(?![0-9a-zA-Z/+=])/dgi,
      "critical", "AWS secret key in AI prompt", { keywords: ["aws"], valueGroups: ["value"], confidence: 0.95 }),
    secret("openai_key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, "critical", "OpenAI API key exposed",
      { validator: "openai_key", keywords: ["sk-"], confidence: 0.95 }),
    secret("anthropic_key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, "critical", "Anthropic API key exposed",
      { keywords: ["sk-ant-"], confidence: 0.98 }),
    secret("github_token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g, "critical", "GitHub token exposed",
      { keywords: ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"], confidence: 0.98 }),
    secret("google_api_key", /\bAIza[0-9A-Za-z_-]{35}(?![\w-])/g, "high", "Google API key exposed", { keywords: ["aiza"], confidence: 0.95 }),
    secret("slack_token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "high", "Slack token exposed", { keywords: ["xox"], confidence: 0.95 }),
    secret("stripe_key", /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, "critical", "{mode} Stripe key exposed",
      { validator: "stripe_key", keywords: ["sk_live_", "sk_test_", "rk_live_", "rk_test_"], confidence: 0.97 }),
    secret("hf_token", /\bhf_[A-Za-z0-9]{30,}\b/g, "high", "Hugging Face token exposed", { keywords: ["hf_"], confidence: 0.93 }),
    secret("groq_key", /\bgsk_[A-Za-z0-9]{40,}\b/g, "high", "Groq API key exposed", { keywords: ["gsk_"], confidence: 0.95 }),
    secret("npm_token", /\bnpm_[A-Za-z0-9]{36}\b/g, "high", "npm token exposed", { keywords: ["npm_"], confidence: 0.95 }),
    secret("sendgrid_key", /\bSG\.[\w-]{22}\.[\w-]{43}(?![\w-])/g, "high", "SendGrid key exposed", { keywords: ["sg."], confidence: 0.97 }),
    secret("jwt", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "high", "JWT in AI prompt{claims}",
      { validator: "jwt", keywords: ["eyj"], confidence: 0.95, detector: "validator" }),
    secret("private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/g, "critical", "Private key pasted into AI tool",
      { validator: "private_key", keywords: ["private key"], confidence: 0.99 }),
    secret("db_connection_url", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/'"]*:[^\s@/'"]+@[^\s/'"]+/g,
      "critical", "Database URL with credentials", { validator: "db_url", keywords: ["://"], confidence: 0.95 }),
    secret("azure_conn_string", /DefaultEndpointsProtocol=https?;AccountName=[^;\s'"]+;AccountKey=[^;\s'"]+/g, "critical",
      "Azure storage connection string", { keywords: ["defaultendpointsprotocol="], confidence: 0.98 }),
    secret("gcp_service_account", /"type"\s*:\s*"service_account"/g, "critical", "GCP service account JSON",
      { keywords: ["service_account"], confidence: 0.97 }),
    secret("generic_secret_assignment",
      /(?<![A-Za-z0-9])(?:password|passwd|pwd|secret(?:[_-]?key)?|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret)(?![A-Za-z0-9_-])['"]?\s*(?::=|=>|[:=])\s*(?:"(?<dq>[^"\n]{8,})"|'(?<sq>[^'\n]{8,})'|(?<bare>[^\s'"]{8,}))/dgi,
      "high", "Hard-coded secret assignment", {
        tier: TIER_GENERIC, validator: "generic_value", valueGroups: ["dq", "sq", "bare"], confidence: 0.75,
        keywords: ["password", "passwd", "pwd", "secret", "api_key", "api-key", "apikey", "token"],
      }),
  ];

  const PII_RULES = [
    pii("email", /(?<![\p{L}\p{N}_.+-])[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+/gu, "medium", "Customer email address",
      { validator: "email", keywords: ["@"], confidence: 0.9, mask: "email" }),
    pii("phone_in", /(?<![\w.+-])(?:\+91[\s-]?)?[6-9]\d{4}[ -]?\d{5}\b/g, "medium", "Indian mobile number", { confidence: 0.7 }),
    pii("phone_intl", /(?<![\w)\]+])\+\d{1,3}(?:[ -]?\d){6,14}\b/g, "low", "International phone number", { keywords: ["+"], confidence: 0.7 }),
    pii("aadhaar", /(?<![\d-])\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g, "high", "Aadhaar number (Verhoeff valid)",
      { validator: "aadhaar", confidence: 0.97, detector: "validator", mask: "aadhaar" }),
    pii("pan", /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/g, "high", "PAN number", { validator: "pan", confidence: 0.9 }),
    pii("gstin", /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g, "medium", "GSTIN", { confidence: 0.95 }),
    pii("upi_id", /(?<![\w.-])[\w.-]{2,}@(?:okaxis|okhdfcbank|okicici|oksbi|ybl|paytm|upi|apl|ibl|axl)\b(?!\.\w)/g, "medium", "UPI ID",
      { keywords: ["@ok", "@ybl", "@paytm", "@upi", "@apl", "@ibl", "@axl"], confidence: 0.9 }),
    pii("ifsc", /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, "low", "IFSC code", { confidence: 0.7 }),
    pii("passport_in", /\b[A-PR-WY][1-9]\d{6}\b/g, "medium", "Indian passport number",
      { validator: "passport", keywords: ["passport"], confidence: 0.85 }),
    pii("credit_card", /\b(?:\d[ -]?){13,19}\b/g, "critical", "Credit card number (Luhn valid)",
      { validator: "card", confidence: 0.95, detector: "validator" }),
    pii("us_ssn", /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, "high", "US social security number", { confidence: 0.85 }),
    pii("private_ip", /(?<![\w.])(?:10\.\d+|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d+\.\d+\b(?!\.?\d)/g, "low", "Internal IP address",
      { validator: "private_ip", keywords: ["10.", "172.", "192.168."], tier: TIER_INFRA, confidence: 0.8 }),
    pii("internal_host", /(?<![\w.-])[\w-]+(?:\.[\w-]+)*\.(?:internal|corp|intranet|local|lan)\b(?![\w-]|\.\w|\()/g, "low", "Internal hostname",
      { validator: "internal_host", tier: TIER_INFRA, confidence: 0.75, keywords: [".internal", ".corp", ".intranet", ".local", ".lan"] }),
  ];

  const RULES = [...SECRET_RULES, ...PII_RULES];
  const HIGH_ENTROPY = rule("high_entropy_string", "secret", null, "medium", "High-entropy token", { detector: "entropy", tier: 0 });
  const BULK_PII = rule("bulk_pii", "pii", null, "high", "Bulk customer PII in one payload", { detector: "heuristic", confidence: 0.9 });
  const CANARY = rule("canary_token", "canary", null, "critical", "Honeytoken tripped", { confidence: 1.0, tier: TIER_CANARY });
  const SOURCE_CODE = rule("source_code", "source_code", null, "medium", "Source code sent to AI tool", { confidence: 0.8, detector: "heuristic" });
  const PROPRIETARY_CODE = rule("proprietary_code", "source_code", null, "high", "Proprietary code sent to AI tool", { confidence: 0.9, detector: "heuristic" });

  // --- validators ---------------------------------------------------------------------------------------------------

  function luhn(digits) {
    let total = 0;
    for (let i = 0; i < digits.length; i += 1) {
      let d = digits.charCodeAt(digits.length - 1 - i) - 48;
      if (i % 2) d = d > 4 ? d * 2 - 9 : d * 2;
      total += d;
    }
    return total % 10 === 0;
  }

  function cardBrand(digits) {
    const two = digits.slice(0, 2), four = digits.slice(0, 4);
    if (digits[0] === "4") return "visa";
    if (two === "34" || two === "37") return "amex";
    if (four === "6011") return "discover";
    if (four === "6521" || four === "6522" || two === "60" || two === "81" || two === "82") return "rupay";
    if (two === "65") return "discover";
    if ((two >= "51" && two <= "55") || (four >= "2221" && four <= "2720")) return "mastercard";
    return null;
  }

  const CARD_LENGTHS = { visa: [19, 16, 13], mastercard: [16], amex: [15], discover: [19, 16], rupay: [16] };

  function findCard(raw) {
    const groups = [...raw.matchAll(/[0-9]+/g)];
    const digits = groups.map((m) => m[0]).join("");
    const positions = groups.flatMap((m) => [...m[0]].map((_, i) => m.index + i));
    let offset = 0;
    for (const group of groups) {
      const rest = digits.slice(offset);
      const brand = cardBrand(rest);
      for (const length of CARD_LENGTHS[brand] || []) {
        if (length <= rest.length && luhn(rest.slice(0, length))) {
          const start = positions[offset], end = positions[offset + length - 1] + 1;
          if (raw.slice(start, end).split(/[ -]/).every((g) => g.length >= 3)) return { brand, start, end };
        }
      }
      offset += group[0].length;
    }
    return null;
  }

  const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];

  function verhoeff(digits) {
    let c = 0;
    for (let i = 0; i < digits.length; i += 1) {
      c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits.charCodeAt(digits.length - 1 - i) - 48]];
    }
    return c === 0;
  }

  const PAN_ENTITY_CHARS = "ABCFGHLJPT";
  const panValid = (pan) => pan.length === 10 && PAN_ENTITY_CHARS.includes(pan[3]);

  function b64Json(segment) {
    try {
      const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
      const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
      const decoded = JSON.parse(new TextDecoder().decode(bytes));
      return decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }

  function decodeJwt(token) {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = b64Json(parts[0]), claims = b64Json(parts[1]);
    return header && claims ? { header, claims } : null;
  }

  const TEMPLATE_VALUE = /^(?:\$\{.*\}|\$\(.*\)|\{\{.*\}\}|<.*>|\[.*\]|%\(?\w*\)?s?|\*+|[xX]+|\.+)$|^your[_-]|[_-]here$|^(?:undefined|changeme|placeholder|redacted)$/i;
  const ENV_REFERENCE = /^\$[A-Z_][A-Z0-9_]*$/;
  const CODE_VALUE = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+|^[A-Za-z_]\w*[(\[]/;
  const isPlaceholder = (value) => TEMPLATE_VALUE.test(value) || ENV_REFERENCE.test(value);

  const NON_DOMAIN_TLDS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "css", "js", "ts", "json", "map"]);
  const CODE_RECEIVERS = new Set(["self", "this", "cls", "threading", "super"]);
  const PEM_BODY = /(?:[ \t]*(?:[A-Za-z0-9+/=]+|[A-Za-z][\w-]*: [^\n]*)?[ \t]*(?:\r?\n|(?:\\r)?\\n))*(?:[ \t]*[A-Za-z0-9+/=]+(?=[ \t]*(?:[\r\n"'\\]|$(?![\s\S]))))?/y;
  const PEM_END = /-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;

  const pass = {};
  const VALIDATORS = {
    openai_key: (value) => (!value.startsWith("sk-ant-") && !/^sk(?:-[a-z]+)+$/.test(value) ? pass : null),
    stripe_key(value) {
      const live = value.slice(0, 8).includes("_live_");
      return { severity: live ? "critical" : "medium", fields: { mode: live ? "Live" : "Test" } };
    },
    jwt(value) {
      const decoded = decodeJwt(value);
      if (!decoded) return { confidence: 0.6, fields: { claims: "" }, detail: "Header or claims did not decode." };
      const { header, claims } = decoded;
      const alg = String(header.alg ?? "unknown").replace(/[^\w-]/g, "").slice(0, 16);
      const verdict = { fields: { claims: ` (alg=${alg}, sub=redacted)` } };
      const parts = [`alg=${alg}`];
      if (typeof claims.exp === "number") parts.push(`exp=${Math.trunc(claims.exp)}`);
      parts.push(...["iss", "sub"].filter((claim) => claim in claims).map((claim) => `${claim}=redacted`));
      if (typeof claims.exp === "number" && claims.exp < Date.now() / 1000) {
        verdict.severity = "medium";
        parts.push("expired");
      }
      verdict.detail = `Decoded ${parts.join(", ")}.`;
      return verdict;
    },
    private_key(value, text, start) {
      const limit = Math.min(start + PEM_MAX, text.length);
      const headerEnd = start + value.length;
      const window = text.slice(headerEnd, limit);
      const end = PEM_END.exec(window);
      if (end) return { span: [start, headerEnd + end.index + end[0].length] };
      PEM_BODY.lastIndex = 0;
      const body = PEM_BODY.exec(window);
      return { span: [start, headerEnd + (body ? body[0].trimEnd().length : 0)] };
    },
    db_url(value) {
      const auth = value.split("://").slice(1).join("://");
      const password = auth.slice(0, auth.lastIndexOf("@")).split(":").slice(1).join(":");
      return isPlaceholder(password) ? null : pass;
    },
    generic_value(value, text, start) {
      if (isPlaceholder(value) || value.startsWith("http://") || value.startsWith("https://")) return null;
      if (start && !"\"'".includes(text[start - 1]) && CODE_VALUE.test(value)) return null;
      return value.length >= 16 || shannon(value) >= 3.0 ? pass : null;
    },
    email(value, text, start) {
      const tld = value.slice(value.lastIndexOf(".") + 1).toLowerCase();
      if (tld.length < 2 || !/^\p{L}+$/u.test(tld) || NON_DOMAIN_TLDS.has(tld)) return null;
      if (value.startsWith("git@") && text[start + value.length] === ":") return null;
      return pass;
    },
    aadhaar: (value) => (verhoeff(value.replace(/[ -]/g, "")) ? pass : null),
    pan: (value) => (panValid(value) ? pass : null),
    passport: (value, text, start) => (text.slice(Math.max(start - 30, 0), start + value.length + 30).toLowerCase().includes("passport") ? pass : null),
    card(value, text, start) {
      const found = findCard(value);
      return found ? { span: [start + found.start, start + found.end], detail: `Issuer prefix: ${found.brand}.` } : null;
    },
    private_ip: (value) => (value.split(".").every((octet) => Number(octet) <= 255) ? pass : null),
    internal_host: (value) => (CODE_RECEIVERS.has(value.split(".")[0].toLowerCase()) ? null : pass),
  };

  // --- entropy ------------------------------------------------------------------------------------------------------

  const TOKEN = /(?<![^\s'"=:,;(){}\[\]<>|`])[^\s'"=:,;(){}\[\]<>|`]{20,}/g;
  const HEX = /^[0-9a-fA-F]+$/, ALNUM = /^[0-9a-zA-Z]+$/, BASE64 = /^[0-9a-zA-Z+/_-]+$/;
  const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const DIGEST_PREFIX = /^sha(?:1|224|256|384|512)-/i;
  const HASH_CONTEXT = /\b(?:commit|sha\w*|rev|revision|merge|parent|tree|blob|digest|checksum|hash|md5|integrity)\b/i;
  const KEY_CONTEXT = /key|token|secret|passw|credential|auth/i;

  function shannon(value) {
    const sample = [...value.slice(0, ENTROPY_SAMPLE)];
    const counts = new Map();
    for (const ch of sample) counts.set(ch, (counts.get(ch) || 0) + 1);
    let total = 0;
    for (const n of counts.values()) total -= (n / sample.length) * Math.log2(n / sample.length);
    return total;
  }

  function classifyCharset(token) {
    if (HEX.test(token)) return "hex";
    if (ALNUM.test(token)) return "alnum";
    return BASE64.test(token) ? "base64" : null;
  }

  const thresholdFor = (charset, policy) => (charset === "hex" ? policy - HEX_THRESHOLD_OFFSET : policy);
  // Python's round() sends exact ties to the even neighbour; toFixed and Math.round do not.
  const roundEven = (value) => (Math.abs(value % 1) === 0.5 ? 2 * Math.round(value / 2) : Math.round(value));
  const round2 = (value) => (Math.abs((value * 100) % 1) === 0.5 ? roundEven(value * 100) / 100 : Number(value.toFixed(2)));

  function contextBefore(text, start) {
    const from = Math.max(start - CONTEXT_CHARS, 0);
    const window = text.slice(from, start);
    return window.slice(window.lastIndexOf("\n") + 1);
  }

  function looksRandom(token, charset) {
    if (/^[0-9]+$/.test(token) || DIGEST_PREFIX.test(token)) return false;
    if (charset === "hex") return true;
    if (!/[0-9]/.test(token)) return false;
    const separators = (token.match(/[/_-]/g) || []).length;
    return separators < 3 || separators * 12 < token.length;
  }

  // --- masking ------------------------------------------------------------------------------------------------------

  function maskValue(value) {
    const [head, tail] = value.length >= FULL_MASK_MIN ? [4, 2] : value.length >= 4 ? [1, 1] : [0, 0];
    const bullets = Math.min(Math.max(value.length - head - tail, 2), MAX_BULLETS);
    return value.slice(0, head) + MASK_CHAR.repeat(bullets) + value.slice(value.length - tail);
  }

  function maskEmail(value) {
    const at = value.lastIndexOf("@");
    const local = value.slice(0, at), domain = value.slice(at + 1);
    return `${local[0]}${MASK_CHAR.repeat(3)}@${domain[0]}${MASK_CHAR.repeat(3)}.${domain.slice(domain.lastIndexOf(".") + 1)}`;
  }

  const MASKERS = { default: maskValue, email: maskEmail, aadhaar: (value) => `XXXX XXXX ${value.slice(-4)}` };

  function mergeSpans(spans) {
    const merged = [];
    const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
    for (const span of sorted) {
      const last = merged[merged.length - 1];
      if (last && span.start < last.end) {
        if (span.end > last.end) merged[merged.length - 1] = { start: last.start, end: span.end, mask: "default" };
      } else {
        merged.push(span);
      }
    }
    return merged;
  }

  function applyMasks(text, spans) {
    const pieces = [], regions = [];
    let cursor = 0, length = 0;
    for (const span of mergeSpans(spans)) {
      const clear = text.slice(cursor, span.start);
      const masked = MASKERS[span.mask](text.slice(span.start, span.end));
      pieces.push(clear, masked);
      const redactedStart = length + clear.length;
      length = redactedStart + masked.length;
      regions.push({ start: span.start, end: span.end, redactedStart, redactedEnd: length });
      cursor = span.end;
    }
    pieces.push(text.slice(cursor));
    return { redacted: pieces.join(""), regions };
  }

  // --- source code --------------------------------------------------------------------------------------------------

  const CODE_LINE = new RegExp([
    String.raw`^[ \t]*(?:import[ \t]+[\w.*{"'(]|from[ \t]+[\w.]+[ \t]+import[ \t]|(?:async[ \t]+)?def[ \t]+\w+[ \t]*\(`,
    String.raw`(?:export[ \t]+|public[ \t]+|abstract[ \t]+)*class[ \t]+\w+[^\n]*[:({]`,
    String.raw`(?:export[ \t]+)?(?:const|let|var)[ \t]+[\w{\[]+[^\n=]*=`,
    String.raw`package[ \t]+[\w.]+;?[ \t]*$`,
    String.raw`#[ \t]*(?:include|define|ifndef|pragma)\b`,
    String.raw`(?:public|private|protected)[ \t]+(?:static|final|void|class|int|long|boolean|String)\b`,
    String.raw`(?:if|elif|for|while|with|try|except)\b[^\n]*:[ \t]*$`,
    String.raw`(?:SELECT|FROM|WHERE|JOIN|LEFT[ \t]+JOIN|GROUP[ \t]+BY|ORDER[ \t]+BY|INSERT[ \t]+INTO|DELETE[ \t]+FROM|UPDATE[ \t]+\w+[ \t]+SET|CREATE[ \t]+TABLE|ALTER[ \t]+TABLE)\b`,
    String.raw`@\w+)`,
    String.raw`=>`,
    String.raw`\bfunction[ \t]*\w*[ \t]*\(`,
    String.raw`\bSELECT\b[^\n]{1,200}\bFROM\b`,
    String.raw`\)[ \t]*\{[ \t]*$`,
    String.raw`;[ \t]*$`,
  ].join("|"), "gm");
  const PROPRIETARY = /\b(?:Proprietary|Confidential|Internal use only)\b|\bCopyright\b[^\n]*\b(?:Inc|Ltd|Pvt)\b/i;

  function lineAt(text, position) {
    const start = text.lastIndexOf("\n", position - 1) + 1;
    const end = text.indexOf("\n", position);
    return text.slice(position === 0 ? 0 : start, end >= 0 ? end : text.length).trim().slice(0, EXCERPT_CHARS);
  }

  function detectCode(input) {
    const text = input.replaceAll('": "', '":\n').replaceAll('":"', '":\n');
    let first = null, lines = 0, position = 0;
    while (lines < MIN_CODE_LINES) {
      CODE_LINE.lastIndex = position;
      const match = CODE_LINE.exec(text);
      if (!match) return null;
      if (first === null) first = match.index;
      lines += 1;
      const next = text.indexOf("\n", match.index + match[0].length - 1);
      if (next < 0) {
        if (lines < MIN_CODE_LINES) return null;
        break;
      }
      position = next + 1;
    }
    const marker = PROPRIETARY.exec(text);
    return marker ? { rule: PROPRIETARY_CODE, excerpt: lineAt(text, marker.index) } : { rule: SOURCE_CODE, excerpt: lineAt(text, first) };
  }

  // --- scan ---------------------------------------------------------------------------------------------------------

  const ESCAPED_QUOTE_OPEN = /(?<=[\s:=,(\[{"])\\"/g;
  const DATA_URI = /data:(?:image|font|audio|video)\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/g;

  function unescapeJson(text) {
    const view = text.replaceAll("\\n", " \n").replaceAll("\\r", "  ").replaceAll("\\t", "  ");
    return view.replace(ESCAPED_QUOTE_OPEN, ' "').replaceAll('\\"', '" ');
  }

  function scanView(text) {
    const view = '{["'.includes(text.slice(0, 64).trimStart().slice(0, 1) || " ") ? unescapeJson(text) : text;
    return view.includes("data:") ? view.replace(DATA_URI, (m) => " ".repeat(m.length)) : view;
  }

  function valueSpan(match, candidateRule) {
    for (const group of candidateRule.valueGroups) {
      const span = match.indices?.groups?.[group];
      if (span) return span;
    }
    return [match.index, match.index + match[0].length];
  }

  function regexCandidates(view) {
    const lowered = view.toLowerCase();
    const candidates = [];
    for (const current of RULES) {
      if (current.keywords.length && !current.keywords.some((keyword) => lowered.includes(keyword))) continue;
      const validate = current.validator ? VALIDATORS[current.validator] : null;
      for (const match of view.matchAll(current.regex)) {
        let [start, end] = valueSpan(match, current);
        const value = view.slice(start, end);
        if (value.includes(MASK_CHAR)) continue;
        const verdict = validate ? validate(value, view, start) : pass;
        if (verdict) {
          if (verdict.span) [start, end] = verdict.span;
          candidates.push({ rule: current, start, end, verdict });
        }
      }
    }
    return candidates;
  }

  function canaryCandidates(text, tokens) {
    const verdict = { detail: "A policy canary token appeared in this text." };
    const candidates = [];
    for (const token of tokens) {
      let start = token ? text.indexOf(token) : -1;
      while (start >= 0) {
        candidates.push({ rule: CANARY, start, end: start + token.length, verdict });
        start = text.indexOf(token, start + token.length);
      }
    }
    return candidates;
  }

  function bisectRight(values, target) {
    let low = 0, high = values.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (target < values[middle]) high = middle;
      else low = middle + 1;
    }
    return low;
  }

  function overlaps(starts, ends, start, end) {
    const i = bisectRight(starts, start);
    return (i > 0 && ends[i - 1] > start) || (i < starts.length && starts[i] < end);
  }

  function entropyCandidates(view, taken, threshold) {
    const starts = taken.map((s) => s.start), ends = taken.map((s) => s.end);
    const candidates = [];
    let entropyMax = 0;
    for (const match of view.matchAll(TOKEN)) {
      const token = match[0].replace(/[.!?]+$/, "");
      const charset = classifyCharset(token);
      if (charset === null) continue;
      const start = match.index, end = start + token.length;
      const valueEntropy = shannon(token);
      entropyMax = Math.max(entropyMax, valueEntropy);
      if (token.length < MIN_TOKEN_LEN || overlaps(starts, ends, start, end)) continue;
      if (UUID.test(token)) {
        if (KEY_CONTEXT.test(contextBefore(view, start))) {
          candidates.push({ rule: HIGH_ENTROPY, start, end, verdict: { severity: "info", confidence: 0.3, detail: "UUID in a credential context." } });
        }
        continue;
      }
      if (valueEntropy < thresholdFor(charset, threshold) || !looksRandom(token, charset)) continue;
      if (charset === "hex" && HASH_CONTEXT.test(contextBefore(view, start))) continue;
      candidates.push({
        rule: HIGH_ENTROPY, start, end,
        verdict: {
          confidence: round2(Math.max(0, Math.min(1, (valueEntropy - 3.5) / 1.5))),
          detail: `Shannon entropy ${valueEntropy.toFixed(2)} (${charset} charset).`,
        },
      });
    }
    return { candidates, entropyMax };
  }

  const severityOf = (candidate) => candidate.verdict.severity || candidate.rule.severity;

  function resolveOverlaps(candidates) {
    const ranked = [...candidates].sort((a, b) => b.rule.tier - a.rule.tier || SEVERITY_RANK[severityOf(b)] - SEVERITY_RANK[severityOf(a)]
      || (a.start - a.end) - (b.start - b.end) || a.start - b.start);
    const kept = [], starts = [], ends = [];
    for (const candidate of ranked) {
      if (!overlaps(starts, ends, candidate.start, candidate.end)) {
        const i = bisectRight(starts, candidate.start);
        starts.splice(i, 0, candidate.start);
        ends.splice(i, 0, candidate.end);
        kept.push(candidate);
      }
    }
    return kept.sort((a, b) => a.start - b.start);
  }

  function makeFinding(current, severity, confidence, title, description, evidence) {
    return {
      type: current.type, subtype: current.id, severity, confidence, title, description, evidence, detector: current.detector,
      compliance: [...complianceFor(current)], remediation: [...(REMEDIATION[current.id] || PURGE)],
    };
  }

  function renderTitle(template, fields = {}) {
    return template.replace(/\{(\w+)\}/g, (_, key) => fields[key] ?? "");
  }

  function riskScore(findings) {
    const weights = findings.map((f) => WEIGHTS[f.severity]).sort((a, b) => b - a);
    return Math.min(100, roundEven(weights.reduce((sum, weight, i) => sum + weight * RISK_DECAY ** i, 0)));
  }

  /**
   * scan(text, {policy}) → {findings, redacted_text, risk_score, stats} (same keys as Python), plus `values`, the raw matches
   * in finding order. `values` must stay in the page: it exists to hash fingerprints and is removed by `withFingerprints`.
   */
  function scan(text, options = {}) {
    const started = performance.now();
    const policy = options.policy || {};
    const threshold = policy.entropy_threshold ?? DEFAULT_THRESHOLD;
    const view = scanView(text);
    const candidates = [...regexCandidates(view), ...canaryCandidates(text, policy.canary_tokens || [])];
    const taken = mergeSpans(candidates.map((c) => ({ start: c.start, end: c.end, mask: "default" })));
    const entropy = entropyCandidates(view, taken, threshold);
    candidates.push(...entropy.candidates);

    const { redacted, regions } = applyMasks(text, candidates.map((c) => ({ start: c.start, end: c.end, mask: c.rule.mask })));
    const kept = resolveOverlaps(candidates);
    const regionStarts = regions.map((r) => r.start);
    const newlines = [];
    for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) newlines.push(i);

    const evidenceFor = (candidate) => {
      const value = text.slice(candidate.start, candidate.end);
      const region = regions[bisectRight(regionStarts, candidate.start) - 1];
      return {
        redacted_snippet: redacted.slice(Math.max(region.redactedStart - SNIPPET_CONTEXT, 0), region.redactedEnd + SNIPPET_CONTEXT),
        match_redacted: redacted.slice(region.redactedStart, region.redactedEnd),
        entropy: round2(shannon(value)), line: bisectRight(newlines, candidate.start - 1) + 1, offset: candidate.start, fingerprint: null,
      };
    };

    const rows = kept.map((candidate) => {
      const { rule: current, verdict } = candidate;
      const title = renderTitle(current.title, verdict.fields);
      const finding = makeFinding(current, severityOf(candidate), verdict.confidence ?? current.confidence, title,
        verdict.detail ? `${title}. ${verdict.detail}` : `${title}.`, evidenceFor(candidate));
      return { finding, value: text.slice(candidate.start, candidate.end) };
    });
    let entropyMax = entropy.entropyMax;
    for (const row of rows) entropyMax = Math.max(entropyMax, row.finding.evidence.entropy);

    const distinct = (ids, normal) => {
      const seen = new Map();
      for (const c of kept) {
        if (ids.includes(c.rule.id)) {
          const key = normal(text.slice(c.start, c.end));
          if (!seen.has(key)) seen.set(key, c);
        }
      }
      return seen;
    };
    const emails = distinct(["email"], (v) => v.toLowerCase());
    const documents = distinct(["aadhaar", "pan"], (v) => v.replace(/[ -]/g, ""));
    if (emails.size >= BULK_EMAILS || documents.size >= BULK_IDENTITY_DOCS) {
      const first = [...emails.values(), ...documents.values()].reduce((a, b) => (b.start < a.start ? b : a));
      const evidence = { ...evidenceFor(first), entropy: null };
      const description = `${BULK_PII.title}: ${emails.size} email addresses, ${documents.size} Aadhaar/PAN numbers.`;
      rows.push({
        finding: makeFinding(BULK_PII, BULK_PII.severity, BULK_PII.confidence, BULK_PII.title, description, evidence),
        value: [...emails.keys(), ...documents.keys()].sort().join("\n"),
      });
    }
    const code = detectCode(scanView(redacted));
    if (code) {
      const excerpt = maskValue(code.excerpt);
      rows.push({
        finding: makeFinding(code.rule, code.rule.severity, code.rule.confidence, code.rule.title, `${code.rule.title}.`, {
          redacted_snippet: excerpt, match_redacted: excerpt, entropy: null, line: null, offset: null, fingerprint: null,
        }),
        value: redacted,
      });
    }
    rows.sort((a, b) => SEVERITY_RANK[b.finding.severity] - SEVERITY_RANK[a.finding.severity]
      || (a.finding.evidence.offset || 0) - (b.finding.evidence.offset || 0));
    const findings = rows.map((row) => row.finding);
    return {
      findings, redacted_text: redacted, risk_score: riskScore(findings),
      stats: {
        chars: text.length, lines: text ? newlines.length + 1 : 0, entropy_max: round2(entropyMax), flagged_tokens: kept.length,
        duration_ms: round2(performance.now() - started),
      },
      values: rows.map((row) => row.value),
    };
  }

  async function sha256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  /** Fill in `evidence.fingerprint` (sha256(match)[:12], as in Python) and drop the raw values. Safe to serialise afterwards. */
  async function withFingerprints(result) {
    const { values, ...safe } = result;
    await Promise.all(safe.findings.map(async (finding, i) => {
      finding.evidence.fingerprint = (await sha256(values[i])).slice(0, 12);
    }));
    return safe;
  }

  const redact = (text, options) => scan(text, options).redacted_text;
  const api = { scan, withFingerprints, redact, luhn, cardBrand, findCard, verhoeff, panValid, decodeJwt, shannon, maskValue, MASK_CHAR };
  root.ShadowScopeScanner = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

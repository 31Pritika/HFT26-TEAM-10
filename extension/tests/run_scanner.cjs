// Reads [{id, text, policy}] on stdin, prints scanner.js results as JSON. Driven by test_parity.py.
const { scan, withFingerprints } = require("../src/scanner.js");

(async () => {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const out = [];
  for (const { id, text, policy } of JSON.parse(input)) {
    const result = await withFingerprints(scan(text, { policy }));
    delete result.stats.duration_ms;
    out.push({ id, ...result });
  }
  process.stdout.write(JSON.stringify(out));
})();

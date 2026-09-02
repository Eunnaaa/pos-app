import "dotenv/config";

const baseUrlValue = process.env.PRODUCTION_URL || process.argv.find((arg) => arg.startsWith("http"));
const testRateLimit = process.argv.includes("--rate-limit");
if (!baseUrlValue) {
  process.stderr.write("Usage: PRODUCTION_URL=https://pos.example.com npm run verify:runtime [-- --rate-limit]\n");
  process.exit(1);
}

const baseUrl = new URL(baseUrlValue);
if (baseUrl.protocol !== "https:") {
  process.stderr.write("ERROR: runtime verification requires an HTTPS URL\n");
  process.exit(1);
}

const errors: string[] = [];
const passed: string[] = [];

function expectHeader(headers: Headers, name: string, expected?: RegExp): void {
  const value = headers.get(name);
  if (!value) errors.push(`${name} is missing`);
  else if (expected && !expected.test(value)) errors.push(`${name} has an unexpected value`);
  else passed.push(`${name}: present`);
}

async function verifyHeaders(): Promise<void> {
  const response = await fetch(new URL("/", baseUrl), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  expectHeader(response.headers, "content-security-policy", /default-src 'self'/);
  expectHeader(response.headers, "strict-transport-security", /max-age=/);
  expectHeader(response.headers, "x-frame-options", /^DENY$/i);
  expectHeader(response.headers, "x-content-type-options", /^nosniff$/i);
  expectHeader(response.headers, "referrer-policy");
}

async function verifyHealth(): Promise<void> {
  const response = await fetch(new URL("/api/v1/health", baseUrl), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) errors.push(`health endpoint returned HTTP ${response.status}`);
  else passed.push("health endpoint: OK");
}

async function verifyPwaAssets(): Promise<void> {
  const [manifestResponse, workerResponse] = await Promise.all([
    fetch(new URL("/manifest.webmanifest", baseUrl), { signal: AbortSignal.timeout(15_000) }),
    fetch(new URL("/sw.js", baseUrl), { signal: AbortSignal.timeout(15_000) }),
  ]);
  if (!manifestResponse.ok) errors.push(`manifest returned HTTP ${manifestResponse.status}`);
  else {
    const manifest = await manifestResponse.json() as { display?: string; icons?: unknown[] };
    if (manifest.display !== "standalone") errors.push("manifest display must be standalone");
    else if (!manifest.icons?.length) errors.push("manifest must define at least one icon");
    else passed.push("PWA manifest: standalone with icons");
  }
  if (!workerResponse.ok) errors.push(`service worker returned HTTP ${workerResponse.status}`);
  else if (!(await workerResponse.text()).includes("serviceWorker") && workerResponse.headers.get("content-type")?.includes("text/html")) {
    errors.push("/sw.js returned HTML instead of a service worker");
  } else passed.push("service worker asset: reachable");
}

async function verifyRateLimit(): Promise<void> {
  if (!testRateLimit) return;
  const target = new URL("/api/v1/me/organizations", baseUrl);
  const responses = await Promise.all(Array.from({ length: 130 }, () => fetch(target, { redirect: "manual", signal: AbortSignal.timeout(20_000) })));
  const limited = responses.filter((response) => response.status === 429).length;
  if (!limited) errors.push("rate-limit test did not receive HTTP 429 after 130 reads");
  else passed.push(`rate limiting: ${limited} request(s) returned HTTP 429`);
}

try {
  await verifyHeaders();
  await verifyHealth();
  await verifyPwaAssets();
  await verifyRateLimit();
} catch (error) {
  errors.push(error instanceof Error ? error.message : "runtime verification failed");
}

for (const message of passed) process.stdout.write(`PASS: ${message}\n`);
if (!testRateLimit) process.stdout.write("SKIP: destructive rate-limit probe (add -- --rate-limit to run it)\n");
if (errors.length) {
  for (const error of errors) process.stderr.write(`ERROR: ${error}\n`);
  process.exitCode = 1;
} else process.stdout.write("Runtime verification passed.\n");

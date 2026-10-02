import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";

const requireFromBackend = createRequire(path.resolve(__dirname, "../backend/package.json"));
const dotenv = requireFromBackend("dotenv") as typeof import("dotenv");
const { ethers } = requireFromBackend("ethers") as typeof import("ethers");
const nodemailer = requireFromBackend("nodemailer") as typeof import("nodemailer");

const root = path.resolve(__dirname, "..");
const backendEnvPath = path.join(root, "backend/.env");
const frontendEnvPath = path.join(root, "frontend/.env");
const manifestPath = path.join(root, "shared/manifests/arc-testnet.json");

function readEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`[READINESS FAILED] Missing ${path.relative(root, filePath)}.`);
  }
  return dotenv.parse(fs.readFileSync(filePath));
}

function requireValue(env: Record<string, string>, key: string): string {
  const value = env[key]?.trim();
  if (!value || /replace-with|changeme|your-address|example/i.test(value)) {
    throw new Error(`[READINESS FAILED] ${key} is missing or still a placeholder.`);
  }
  return value;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

async function main() {
  const backend = readEnv(backendEnvPath);
  const frontend = readEnv(frontendEnvPath);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const signerKey = requireValue(backend, "AUTHORIZED_SIGNER_PRIVATE_KEY");
  const signer = new ethers.Wallet(signerKey);
  const expectedSigner = manifest.roles.authorizedSigner.address as string;
  if (!sameAddress(signer.address, expectedSigner)) {
    throw new Error(
      `[READINESS FAILED] Authorized signer derives ${signer.address}, expected ${expectedSigner}.`
    );
  }

  const operator = ethers.getAddress(requireValue(backend, "OPERATOR_ADDRESS"));
  if (!sameAddress(operator, manifest.roles.operator.address)) {
    throw new Error("[READINESS FAILED] OPERATOR_ADDRESS does not match the Arc manifest.");
  }
  if (Number(requireValue(backend, "ARC_CHAIN_ID")) !== manifest.chainId) {
    throw new Error("[READINESS FAILED] ARC_CHAIN_ID does not match the Arc manifest.");
  }
  if (!sameAddress(requireValue(backend, "GROUPDEAL_HUB_ADDRESS"), manifest.contracts.GroupDealHub.address)) {
    throw new Error("[READINESS FAILED] GROUPDEAL_HUB_ADDRESS does not match the Arc manifest.");
  }
  if (!sameAddress(requireValue(backend, "USDC_ADDRESS"), manifest.contracts.USDC.address)) {
    throw new Error("[READINESS FAILED] USDC_ADDRESS does not match the Arc manifest.");
  }
  if (Number(requireValue(backend, "DEPLOYMENT_BLOCK")) !== manifest.contracts.GroupDealHub.deploymentBlock) {
    throw new Error("[READINESS FAILED] DEPLOYMENT_BLOCK does not match the Arc manifest.");
  }

  const applicationSecrets = [
    requireValue(backend, "JWT_SECRET"),
    requireValue(backend, "CAMPAIGN_IDENTITY_SECRET"),
    requireValue(backend, "MASTER_ENCRYPTION_KEY"),
  ];
  if (applicationSecrets.some((value) => value.length < 32) || new Set(applicationSecrets).size !== 3) {
    throw new Error("[READINESS FAILED] Application secrets must be distinct and at least 32 characters.");
  }

  const smtpHost = requireValue(backend, "SMTP_HOST");
  const smtpPort = Number(requireValue(backend, "SMTP_PORT"));
  const smtpSecure = (backend.SMTP_SECURE || "false").toLowerCase() === "true";
  const smtpUser = requireValue(backend, "SMTP_USER");
  const smtpPassword = requireValue(backend, "SMTP_APP_PASSWORD").replace(/\s+/g, "");
  const smtpFrom = requireValue(backend, "SMTP_FROM");
  if (!Number.isInteger(smtpPort) || smtpPort <= 0 || !smtpFrom.toLowerCase().includes(smtpUser.toLowerCase())) {
    throw new Error("[READINESS FAILED] Gmail SMTP port/from configuration is invalid.");
  }
  const smtpTransport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: !smtpSecure,
    auth: { user: smtpUser, pass: smtpPassword },
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await smtpTransport.verify();

  const circleApiKey = requireValue(backend, "CIRCLE_API_KEY");
  const circleAppId = requireValue(frontend, "VITE_CIRCLE_APP_ID");
  const circleBaseUrl = (backend.CIRCLE_BASE_URL || "https://api.circle.com").replace(/\/$/, "");
  const circleResponse = await fetch(`${circleBaseUrl}/v1/w3s/config/entity`, {
    headers: { Authorization: `Bearer ${circleApiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!circleResponse.ok) {
    throw new Error(`[READINESS FAILED] Circle configuration API returned HTTP ${circleResponse.status}.`);
  }
  const circlePayload = (await circleResponse.json()) as { data?: { appId?: string } };
  if (!circlePayload.data?.appId || circlePayload.data.appId !== circleAppId) {
    throw new Error("[READINESS FAILED] VITE_CIRCLE_APP_ID does not match the Circle entity configuration.");
  }

  const reownProjectId = requireValue(frontend, "VITE_REOWN_PROJECT_ID");
  if (!/^[a-f0-9]{32}$/i.test(reownProjectId)) {
    throw new Error("[READINESS FAILED] VITE_REOWN_PROJECT_ID does not have the expected 32-hex format.");
  }

  const evidence = {
    verifiedAt: new Date().toISOString(),
    status: "PASS",
    chainId: manifest.chainId,
    hubAddress: manifest.contracts.GroupDealHub.address,
    authorizedSignerAddress: signer.address,
    operatorAddress: operator,
    checks: {
      applicationSecrets: "VALID_DISTINCT_VALUES",
      circleApiAndAppId: "MATCHED",
      gmailSmtpAuthentication: "VERIFIED_NO_MESSAGE_SENT",
      reownProjectId: "FORMAT_VALID",
      manifestEnvironment: "MATCHED",
    },
  };
  const evidencePath = path.join(root, "reports/evidence/LIVE_READINESS.json");
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");

  console.log("LIVE READINESS PASS");
  console.log(`Authorized signer: ${signer.address}`);
  console.log("Circle API/App ID: MATCHED");
  console.log("Gmail SMTP authentication: VERIFIED (no message sent)");
  console.log("Reown Project ID: FORMAT VALID");
  console.log(`Evidence: ${evidencePath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

/**
 * End-to-end developer bootstrap: Neon Auth email user + app invite.
 *
 * Neon Auth requires password length ≥ 8. Then set VITE_DEV_* in `.env.local`
 * and use Developer Login in the SPA.
 *
 * Usage:
 *   npx tsx scripts/setup-dev-user.ts \
 *     --email dev@example.com --name "Dev User" --password 'dev123456' --system-admin
 */

import {
  createDatabase,
  createPool,
  requireDatabaseUrl,
} from "../src/db/client";
import { normalizeEmail } from "../src/domain/rbac/email";
import { loadEnvLocal } from "../src/server/load-env-local";
import { bootstrapInviteUser, takeFlagValue } from "./lib/bootstrap-invite";

loadEnvLocal();

const MIN_PASSWORD_LENGTH = 8;

interface Args {
  email: string;
  name: string;
  password: string;
  systemAdmin: boolean;
}

function parseArgs(argv: string[]): Args {
  let email: string | undefined;
  let name: string | undefined;
  let password: string | undefined;
  let systemAdmin = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) {
      break;
    }
    if (arg === "--email") {
      const taken = takeFlagValue(argv, i, arg);
      email = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--name") {
      const taken = takeFlagValue(argv, i, arg);
      name = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--password") {
      const taken = takeFlagValue(argv, i, arg);
      password = taken.value;
      i = taken.nextIndex;
    } else if (arg === "--system-admin") {
      systemAdmin = true;
      i += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }

  if (email === undefined || name === undefined || password === undefined) {
    throw new Error(
      "Usage: --email <email> --name <name> --password <password≥8> [--system-admin]"
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters (Neon Auth / Better Auth)`
    );
  }

  return { email, name, password, systemAdmin };
}

function requireAuthBaseUrl(): string {
  const url = process.env.NEON_AUTH_BASE_URL?.trim();
  if (url === undefined || url === "") {
    throw new Error("NEON_AUTH_BASE_URL is not set (load .env.local)");
  }
  return url.replace(/\/$/, "");
}

async function ensureNeonAuthUser(input: {
  readonly email: string;
  readonly name: string;
  readonly password: string;
}): Promise<"created" | "exists"> {
  const base = requireAuthBaseUrl();
  const response = await fetch(`${base}/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      name: input.name,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
  };

  if (response.ok) {
    return "created";
  }

  const code = (body.code ?? "").toUpperCase();
  const message = (body.message ?? "").toLowerCase();
  if (
    response.status === 422 ||
    response.status === 400 ||
    response.status === 409 ||
    code.includes("USER_ALREADY") ||
    code.includes("EXISTING") ||
    message.includes("already") ||
    message.includes("exists")
  ) {
    // Confirm credentials still work for the existing Neon Auth user.
    const signIn = await fetch(`${base}/sign-in/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
      },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
      }),
    });
    if (!signIn.ok) {
      const signInBody = (await signIn.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(
        `Neon Auth user exists but password does not match (${signInBody.message ?? signIn.status}). Reset the password in Neon Console or use a new email.`
      );
    }
    return "exists";
  }

  throw new Error(
    `Neon Auth sign-up failed ${response.status}: ${body.code ?? ""} ${body.message ?? JSON.stringify(body)}`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const email = normalizeEmail(args.email);
  const pool = createPool(requireDatabaseUrl());
  const db = createDatabase(pool);

  try {
    console.log("\n=== Developer auth bootstrap ===\n");
    const neonStatus = await ensureNeonAuthUser({
      email,
      name: args.name,
      password: args.password,
    });
    console.log(
      neonStatus === "created"
        ? `✓ Neon Auth user created <${email}>`
        : `✓ Neon Auth user already exists <${email}> (password verified)`
    );

    await bootstrapInviteUser(db, {
      email,
      name: args.name,
      systemAdmin: args.systemAdmin,
      roleCode: null,
      companyId: null,
    });

    console.log("\nAdd to .env.local (then restart Vite):");
    console.log(`  VITE_DEV_EMAIL=${email}`);
    console.log(`  VITE_DEV_PASSWORD=${args.password}`);
    console.log("\nSmoke: npx tsx scripts/smoke-auth.ts\n");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

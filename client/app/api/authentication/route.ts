import { NextResponse } from "next/server";
import { requireRealmAdmin } from "../../lib/api-auth";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { getKeycloakError } from "../../lib/keycloak-users";

type AuthenticationSettingsBody = Record<string, unknown>;

function readPolicyValue(
  policy: string | undefined,
  key: string,
  fallback: number,
) {
  if (!policy) return fallback;
  const match = policy.match(new RegExp(`${key}\\((\\d+)\\)`));
  return match ? Number(match[1]) : fallback;
}

function hasPolicy(policy: string | undefined, key: string) {
  return Boolean(policy?.includes(`${key}(`));
}

function buildPasswordPolicy(body: AuthenticationSettingsBody) {
  const parts = [];
  if (body.minLength) parts.push(`length(${Number(body.minLength)})`);
  if (body.requireUppercase) parts.push("upperCase(1)");
  if (body.requireLowercase) parts.push("lowerCase(1)");
  if (body.requireDigits) parts.push("digits(1)");
  if (body.requireSpecialChars) parts.push("specialChars(1)");
  if (body.passwordHistory)
    parts.push(`passwordHistory(${Number(body.passwordHistory)})`);
  if (body.passwordExpiryDays)
    parts.push(
      `forceExpiredPasswordChange(${Number(body.passwordExpiryDays)})`,
    );
  return parts.join(" and ");
}

export async function GET() {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const res = await keycloakAdminFetch("");
    if (!res.ok)
      throw new Error(
        await getKeycloakError(res, "Failed to fetch authentication settings"),
      );
    const realm = await res.json();
    const policy = realm.passwordPolicy || "";

    return NextResponse.json({
      passwordPolicy: policy,
      minLength: readPolicyValue(policy, "length", 12),
      requireUppercase: hasPolicy(policy, "upperCase"),
      requireLowercase: hasPolicy(policy, "lowerCase"),
      requireDigits: hasPolicy(policy, "digits"),
      requireSpecialChars: hasPolicy(policy, "specialChars"),
      passwordHistory: readPolicyValue(policy, "passwordHistory", 0),
      passwordExpiryDays: readPolicyValue(
        policy,
        "forceExpiredPasswordChange",
        0,
      ),
      bruteForceProtected: Boolean(realm.bruteForceProtected),
      failureFactor: realm.failureFactor ?? 5,
      waitIncrementSeconds: realm.waitIncrementSeconds ?? 60,
      maxFailureWaitSeconds: realm.maxFailureWaitSeconds ?? 900,
      permanentLockout: Boolean(realm.permanentLockout),
      otpPolicyType: realm.otpPolicyType ?? "totp",
      otpPolicyAlgorithm: realm.otpPolicyAlgorithm ?? "HmacSHA1",
      otpPolicyDigits: realm.otpPolicyDigits ?? 6,
      otpPolicyLookAheadWindow: realm.otpPolicyLookAheadWindow ?? 1,
      otpPolicyPeriod: realm.otpPolicyPeriod ?? 30,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: await getKeycloakError(error, "Failed to load authentication settings"),
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const payload = {
      passwordPolicy: buildPasswordPolicy(body),
      bruteForceProtected: Boolean(body.bruteForceProtected),
      failureFactor: Number(body.failureFactor || 5),
      waitIncrementSeconds: Number(body.waitIncrementSeconds || 60),
      maxFailureWaitSeconds: Number(body.maxFailureWaitSeconds || 900),
      permanentLockout: Boolean(body.permanentLockout),
      otpPolicyType: body.otpPolicyType || "totp",
      otpPolicyAlgorithm: body.otpPolicyAlgorithm || "HmacSHA1",
      otpPolicyDigits: Number(body.otpPolicyDigits || 6),
      otpPolicyLookAheadWindow: Number(body.otpPolicyLookAheadWindow || 1),
      otpPolicyPeriod: Number(body.otpPolicyPeriod || 30),
    };

    const res = await keycloakAdminFetch("", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!res.ok)
      throw new Error(
        await getKeycloakError(res, "Failed to update authentication settings"),
      );
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: await getKeycloakError(error, "Failed to save authentication settings"),
      },
      { status: 500 },
    );
  }
}

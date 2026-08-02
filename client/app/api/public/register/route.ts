export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import {
  ensureAppUserProfileAttributes,
  getKeycloakError,
  resolveRealmRoles,
} from "../../../lib/keycloak-users";
import { sendEmailVerification } from "../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../i18n/english-normalizer";
import { rateLimitIdentifier } from "../../../lib/redis_utility";

export async function POST(req: Request) {
  let createdUserId: string | undefined;
  try {
    const rawBody = await req.json();
    const body = {
      ...rawBody,
      ...normalizeObjectTextFields(rawBody, ["username", "email"]),
    };

    const { firstName, lastName, username, email, password } = body;

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !username?.trim() ||
      !email?.trim() ||
      !password
    ) {
      return NextResponse.json(
        {
          error:
            "First name, last name, username, email and password are required",
        },
        { status: 400 },
      );
    }

    if (await rateLimitIdentifier("register-email", email.trim().toLowerCase(), 3, 86_400)) {
      return NextResponse.json(
        { error: "Too many registration attempts. Try again later." },
        { status: 429 },
      );
    }

    await ensureAppUserProfileAttributes();

    const createRes = await keycloakAdminFetch("/users", {
      method: "POST",
      body: JSON.stringify({
        username: username.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        enabled: true,
        emailVerified: false,
        requiredActions: [],
        attributes: {
          onboardingStatus: ["PENDING"],
          emailVerificationStatus: ["PENDING"],
          appMfaConfigured: ["false"],
        },
        credentials: [
          {
            type: "password",
            value: password,
            temporary: false,
          },
        ],
      }),
    });

    if (!createRes.ok) {
      const error = await getKeycloakError(createRes, "Failed to register user");
      return NextResponse.json({ error }, { status: createRes.status });
    }

    const userId = createRes.headers.get("location")?.split("/").pop();
    createdUserId = userId;

    if (!userId) {
      return NextResponse.json(
        { error: "User was created, but Keycloak did not return its ID" },
        { status: 502 },
      );
    }

    const appUserRole = await resolveRealmRoles(["app-user"]);
    if (appUserRole.length === 0) throw new Error('Realm role "app-user" does not exist');
    {
      const roleRes = await keycloakAdminFetch(
        `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
        { method: "POST", body: JSON.stringify(appUserRole) },
      );

      if (!roleRes.ok) {
        throw new Error(
          await getKeycloakError(roleRes, "Failed to assign app-user role"),
        );
      }
    }

    const userRes = await keycloakAdminFetch(
      `/users/${encodeURIComponent(userId)}`,
    );
    if (!userRes.ok) {
      throw new Error(await getKeycloakError(userRes, "Failed to load registered user"));
    }
    const createdUser = await userRes.json();
    const verification = await sendEmailVerification(createdUser);

    return NextResponse.json(
      {
        message: verification.emailSent
          ? "Registration successful. Enter the email OTP, then complete MFA setup from the login page."
          : verification.localOtpCode
            ? "Registration successful. App SMTP is not configured, so use the local email OTP shown below for testing."
            : "Registration successful, but email delivery is unavailable. Contact an administrator.",
        emailVerificationSent: verification.emailSent,
        verificationPageLink: verification.verificationPageLink,
        verificationLink: verification.verificationPageLink,
        localOtpCode: verification.localOtpCode,
        warning: verification.warning,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (createdUserId) {
      try {
        const cleanupResponse = await keycloakAdminFetch(`/users/${encodeURIComponent(createdUserId)}`, {
          method: "DELETE",
        });
        if (!cleanupResponse.ok) {
          void logError("Failed to roll back incomplete registration", {
            endpoint: "/api/public/register",
            method: "POST",
            operation: "register.rollback",
            userId: createdUserId,
            status: cleanupResponse.status,
          });
        }
      } catch (cleanupError) {
        void logError("Failed to roll back incomplete registration", {
          endpoint: "/api/public/register",
          method: "POST",
          operation: "register.rollback",
          userId: createdUserId,
          error: cleanupError,
        });
      }
    }
    void logError("Failed to register user", {
      endpoint: "/api/public/register",
      method: "POST",
      operation: "register",
      userId: createdUserId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to register user" },
      { status: 500 },
    );
  }
}

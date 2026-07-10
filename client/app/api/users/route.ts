export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../lib/api-auth";
import { logRequestEntry } from "../../lib/app-utilities";
import { keycloakAdminFetch } from "../../lib/keycloak";
import { normalizeObjectTextFields } from "../../i18n/english-normalizer";
import {
  getKeycloakError,
  getUserGroups,
  getUserRealmRoles,
  getUserOnboardingStatus,
  resolveRealmRoles,
  syncUserGroups,
} from "../../lib/keycloak-users";
import { sendEmailVerification } from "../../lib/app-email";

export async function GET(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;
  await logRequestEntry(req);

  try {
    const res = await keycloakAdminFetch("/users?max=1000");

    if (!res.ok) {
      const error = await getKeycloakError(res, "Failed to fetch users");
      return NextResponse.json({ error }, { status: res.status });
    }

    const users = await res.json();
    const usersWithRoles = await Promise.all(
      users.map(async (user: { id: string; enabled?: boolean; emailVerified?: boolean; requiredActions?: string[]; attributes?: Record<string, string[]> }) => {
        const [roles, groups] = await Promise.all([
          getUserRealmRoles(user.id),
          getUserGroups(user.id).catch(() => []),
        ]);

        const enabled = user.enabled !== false;

        return {
          ...user,
          enabled,
          realmRoles: roles.map((role: { name: string }) => role.name),
          groups: groups.map((group: { id: string }) => group.id),
          groupPaths: groups.map((group: { path?: string; name?: string }) => group.path || group.name).filter(Boolean),
          onboardingStatus: getUserOnboardingStatus(user),
          onboardingRequired: getUserOnboardingStatus(user) !== "READY",
        };
      }),
    );

    return NextResponse.json(usersWithRoles);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch users",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;
  await logRequestEntry(req);

  try {
    const rawBody = await req.json();
    const body = normalizeObjectTextFields(rawBody, [
      "username",
      "firstName",
      "lastName",
      "email",
    ]);

    const {
      username,
      firstName,
      lastName,
      email,
      password,
      roles = [],
      groups = [],
      enabled = true,
    } = body;

    if (!username?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { error: "Username, email and password are required" },
        { status: 400 },
      );
    }

    if (!Array.isArray(roles)) {
      return NextResponse.json(
        { error: "Roles must be an array" },
        { status: 400 },
      );
    }

    if (!Array.isArray(groups)) {
      return NextResponse.json(
        { error: "Groups must be an array" },
        { status: 400 },
      );
    }

    const requestedRoles = roles.length > 0 ? roles : ["app-user"];
    const roleRepresentations = await resolveRealmRoles(requestedRoles);

    const createRes = await keycloakAdminFetch("/users", {
      method: "POST",
      body: JSON.stringify({
        username: username.trim(),
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        email: email.trim(),
        enabled,
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
      const error = await getKeycloakError(createRes, "Failed to create user");
      return NextResponse.json({ error }, { status: createRes.status });
    }

    const location = createRes.headers.get("location");
    const userId = location?.split("/").pop();

    if (!userId) {
      return NextResponse.json(
        { error: "User was created, but Keycloak did not return its ID" },
        { status: 502 },
      );
    }

    try {
      if (roleRepresentations.length > 0) {
        const roleRes = await keycloakAdminFetch(
          `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
          {
            method: "POST",
            body: JSON.stringify(roleRepresentations),
          },
        );

        if (!roleRes.ok) {
          throw new Error(
            await getKeycloakError(
              roleRes,
              "Failed to assign roles; user creation was rolled back",
            ),
          );
        }
      }

      if (groups.length > 0) {
        await syncUserGroups(userId, groups);
      }
    } catch (assignmentError) {
      await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });

      throw assignmentError;
    }

    const userRes = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`);
    const createdUser = await userRes.json();
    const verification = await sendEmailVerification(createdUser);

    return NextResponse.json(
      {
        id: userId,
        message: verification.emailSent
          ? "User created successfully. Email verification OTP sent. User must verify email and set up MFA from the app."
          : "User created successfully. App SMTP is not configured, so use the local email OTP shown for testing.",
        emailVerificationSent: verification.emailSent,
        verificationPageLink: verification.verificationPageLink,
        verificationLink: verification.verificationPageLink,
        localOtpCode: verification.localOtpCode,
        warning: verification.warning,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create user",
      },
      { status: 500 },
    );
  }
}

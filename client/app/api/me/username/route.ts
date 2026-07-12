import { getServerSession } from "next-auth";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import { authOptions } from "../../../lib/auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import {
  ensureAppUserProfileAttributes,
  findUserByUsername,
  getKeycloakError,
  readAttributeValue,
} from "../../../lib/keycloak-users";

type UsernameSession = {
  userId?: string;
};

function cleanUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function cleanName(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isValidUsername(username: string) {
  return /^[a-z0-9._-]{3,32}$/.test(username) &&
    !username.startsWith(".") &&
    !username.endsWith(".");
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as typeof session & UsernameSession | null)?.userId;

    if (!session || !userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const username = cleanUsername(body.username);
    const firstName = cleanName(body.firstName);
    const lastName = cleanName(body.lastName);

    if (!isValidUsername(username)) {
      return NextResponse.json(
        {
          error:
            "Username must be 3-32 characters and use only lowercase letters, numbers, dot, underscore, or hyphen.",
        },
        { status: 400 },
      );
    }

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "First name and last name are required." },
        { status: 400 },
      );
    }

    if (firstName.length > 80 || lastName.length > 80) {
      return NextResponse.json(
        { error: "First name and last name must be 80 characters or less." },
        { status: 400 },
      );
    }

    const existing = await findUserByUsername(username);
    if (existing?.id && existing.id !== userId) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }

    await ensureAppUserProfileAttributes({ force: true });

    const userRes = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`);
    if (!userRes.ok) {
      const error = await getKeycloakError(userRes, "Failed to load user profile");
      return NextResponse.json({ error }, { status: userRes.status });
    }

    const user = await userRes.json();
    const attributes = {
      ...(user.attributes || {}),
      ssoUsernameRequired: ["false"],
      onboardingStatus: [readAttributeValue(user.attributes, "onboardingStatus") || "READY"],
    };
    const updateRes = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({
        username,
        firstName,
        lastName,
        email: user.email,
        emailVerified: user.emailVerified === true,
        enabled: user.enabled !== false,
        requiredActions: Array.isArray(user.requiredActions) ? user.requiredActions : [],
        attributes,
      }),
    });

    if (!updateRes.ok) {
      const error = await getKeycloakError(updateRes, "Failed to update username");
      void logError("Profile completion update failed", {
        endpoint: "/api/me/username",
        method: "PUT",
        operation: "username.update",
        userId,
        username,
        status: updateRes.status,
        error,
      });

      return NextResponse.json(
        { error },
        { status: updateRes.status },
      );
    }

    return NextResponse.json({ username, firstName, lastName });
  } catch (error: unknown) {
    void logError("Failed to update username", {
      endpoint: "/api/me/username",
      method: "PUT",
      operation: "username.update",
      error,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update username" },
      { status: 500 },
    );
  }
}

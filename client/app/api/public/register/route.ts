export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import {
  getKeycloakError,
  resolveRealmRoles,
} from "../../../lib/keycloak-users";
import { sendEmailVerification } from "../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../lib/english-normalizer";

export async function POST(req: Request) {
  try {
    const realmRes = await keycloakAdminFetch("");
    if (!realmRes.ok) {
      return NextResponse.json(
        { error: await getKeycloakError(realmRes, "Failed to check registration settings") },
        { status: realmRes.status },
      );
    }

    const realm = await realmRes.json();
    if (realm.registrationAllowed !== true) {
      return NextResponse.json(
        { error: "Public registration is disabled" },
        { status: 400 },
      );
    }

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
        { error: "First name, last name, username, email and password are required" },
        { status: 400 },
      );
    }

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
      return NextResponse.json(
        { error: await getKeycloakError(createRes, "Failed to register user") },
        { status: createRes.status },
      );
    }

    const userId = createRes.headers.get("location")?.split("/").pop();

    if (!userId) {
      return NextResponse.json(
        { error: "User was created, but Keycloak did not return its ID" },
        { status: 502 },
      );
    }

    const appUserRole = await resolveRealmRoles(["app-user"]);
    if (appUserRole.length > 0) {
      const roleRes = await keycloakAdminFetch(
        `/users/${encodeURIComponent(userId)}/role-mappings/realm`,
        { method: "POST", body: JSON.stringify(appUserRole) },
      );

      if (!roleRes.ok) {
        return NextResponse.json(
          { error: await getKeycloakError(roleRes, "Failed to assign app-user role") },
          { status: roleRes.status },
        );
      }
    }

    const userRes = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`);
    if (!userRes.ok) {
      return NextResponse.json(
        { error: await getKeycloakError(userRes, "Failed to load registered user") },
        { status: userRes.status },
      );
    }
    const createdUser = await userRes.json();
    const verification = await sendEmailVerification(createdUser);

    return NextResponse.json(
      {
        message: verification.emailSent
          ? "Registration successful. Enter the email OTP, then complete MFA setup from the login page."
          : "Registration successful. App SMTP is not configured, so use the local email OTP shown below for testing.",
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
      { error: error instanceof Error ? error.message : "Failed to register user" },
      { status: 500 },
    );
  }
}

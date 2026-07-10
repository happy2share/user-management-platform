export const runtime = "nodejs";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../../lib/api-auth";
import { logRequestEntry } from "../../../../lib/app-utilities";
import { keycloakAdminFetch } from "../../../../lib/keycloak";
import { sendEmailVerification } from "../../../../lib/app-email";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  await logRequestEntry(req, { id });

  try {
    const userRes = await keycloakAdminFetch(`/users/${encodeURIComponent(id)}`);

    if (!userRes.ok) {
      return NextResponse.json({ error: "User not found" }, { status: userRes.status });
    }

    const user = await userRes.json();

    if (user.emailVerified === true) {
      return NextResponse.json({ message: "Email is already verified." });
    }

    const verification = await sendEmailVerification(user);

    return NextResponse.json({
      message: verification.emailSent
        ? "Email verification OTP sent."
        : "App SMTP is not configured. Use the local email OTP shown for testing.",
      emailVerificationSent: verification.emailSent,
      verificationPageLink: verification.verificationPageLink,
        verificationLink: verification.verificationPageLink,
        localOtpCode: verification.localOtpCode,
      warning: verification.warning,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send verification email",
      },
      { status: 500 },
    );
  }
}

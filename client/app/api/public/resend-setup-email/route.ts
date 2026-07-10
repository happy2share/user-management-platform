import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { logError } from "@/app/lib/file-logger.mjs";
import {
  findUserByUsername,
  getUserOnboardingStatus,
} from "../../../lib/keycloak-users";
import { sendEmailVerification } from "../../../lib/app-email";
import { normalizeObjectTextFields } from "../../../i18n/english-normalizer";

export async function POST(req: Request) {
  try {
    const body = normalizeObjectTextFields(await req.json(), ["username"]);
    const username = body.username?.trim();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 },
      );
    }

    const user = await findUserByUsername(username);

    if (!user) {
      return NextResponse.json({
        message: "If setup is required, an email will be sent.",
      });
    }

    if (getUserOnboardingStatus(user) === "EMAIL_VERIFICATION_REQUIRED") {
      await sendEmailVerification(user);
    }

    return NextResponse.json({
      message: "If setup is required, an email will be sent.",
    });
  } catch (error: unknown) {
    void logError("Failed to resend setup email", {
      endpoint: "/api/public/resend-setup-email",
      method: "POST",
      operation: "setupEmail.resend",
      error,
    });
    return NextResponse.json({
      message: "If setup is required, an email will be sent.",
    });
  }
}

import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { requireRealmAdmin } from "../../../../lib/api-auth";
import { resetUserPassword } from "../../../../lib/activation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const unauthorized = await requireRealmAdmin();
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { password, temporary } = body;

    if (!password || typeof password !== "string" || password.length < 1) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 },
      );
    }

    await resetUserPassword(id, password, temporary === true);

    return NextResponse.json({
      message: temporary
        ? "Password reset successfully. User must change it on next login."
        : "Password reset successfully.",
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reset password",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { findUserByUsername, getUserOnboardingStatus } from "../../../lib/keycloak-users";
import { normalizeObjectTextFields } from "../../../lib/english-normalizer";

export async function POST(req: Request) {
  try {
    const body = normalizeObjectTextFields(await req.json(), ["username"]);
    const username = body.username?.trim();

    if (!username) {
      return NextResponse.json({ status: "UNKNOWN" });
    }

    const user = await findUserByUsername(username);

    if (!user) {
      return NextResponse.json({ status: "UNKNOWN" });
    }

    return NextResponse.json({ status: getUserOnboardingStatus(user) });
  } catch {
    return NextResponse.json({ status: "UNKNOWN" });
  }
}

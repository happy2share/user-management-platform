import { getServerSession } from "next-auth";
import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";
import { authOptions } from "../../../lib/auth";
import { keycloakAdminFetch } from "../../../lib/keycloak";
import { getKeycloakError, readAttributeValue } from "../../../lib/keycloak-users";

const SUPPORTED_LOCALES = new Set(["en", "hi", "te"]);
const LOCALE_ATTRIBUTE = "locale";

type LocaleSession = {
  userId?: string;
};

function normalizeLocale(value: unknown) {
  const locale = String(value || "").trim();
  return SUPPORTED_LOCALES.has(locale) ? locale : null;
}

async function getCurrentUserId() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  return (session as typeof session & LocaleSession).userId;
}

async function getCurrentUser(userId: string) {
  const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`);

  if (!response.ok) {
    throw new Error(await getKeycloakError(response, "Failed to load user locale"));
  }

  return response.json();
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json({ locale: null }, { status: 401 });
    }

    const user = await getCurrentUser(userId);
    const locale = normalizeLocale(readAttributeValue(user.attributes, LOCALE_ATTRIBUTE));

    return NextResponse.json({ locale });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load user locale" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const locale = normalizeLocale(body.locale);

    if (!locale) {
      return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
    }

    const user = await getCurrentUser(userId);
    const attributes = {
      ...(user.attributes || {}),
      [LOCALE_ATTRIBUTE]: [locale],
    };

    const response = await keycloakAdminFetch(`/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify({
        ...user,
        attributes,
      }),
    });

    if (!response.ok) {
      const error = await getKeycloakError(response, "Failed to save user locale");
      return NextResponse.json({ error }, { status: response.status });
    }

    return NextResponse.json({ locale });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save user locale" },
      { status: 500 },
    );
  }
}

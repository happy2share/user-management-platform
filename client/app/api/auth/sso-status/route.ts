import { ApiNextResponse as NextResponse } from "@/app/lib/api-response";

export async function GET() {
  return NextResponse.json({
    googleConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    ),
  });
}

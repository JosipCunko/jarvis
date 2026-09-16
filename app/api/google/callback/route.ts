import { NextRequest } from "next/server";
import { handleGoogleCallback } from "@/app/_lib/google-callback";

export async function GET(request: NextRequest) {
  return handleGoogleCallback(request);
}

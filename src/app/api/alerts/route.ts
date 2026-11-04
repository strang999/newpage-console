import { POST as alertsPost } from "@/features/alert-rules/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = alertsPost;

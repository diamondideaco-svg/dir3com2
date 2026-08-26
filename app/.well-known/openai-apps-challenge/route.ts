const OPENAI_APPS_CHALLENGE_TOKEN =
  "eVSp8xhpFk3rNHZo0PkVqD57oCgK6hbK6_v7aWwILso";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(OPENAI_APPS_CHALLENGE_TOKEN, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}

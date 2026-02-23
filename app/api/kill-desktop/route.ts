import { getCurrentDesktop } from "@/lib/e2b/desktop";

async function handleKillDesktop(request: Request) {
  const { searchParams } = new URL(request.url);
  const sandboxId = searchParams.get("sandboxId");

  console.log(`Kill desktop request: ${sandboxId}`);

  if (!sandboxId) {
    return new Response("No sandboxId provided", { status: 400 });
  }

  try {
    const desktop = getCurrentDesktop();
    if (desktop && desktop.sandboxId === sandboxId) {
      await desktop.kill();
    }
    return new Response("Desktop killed successfully", { status: 200 });
  } catch (error) {
    console.error(`Failed to kill desktop:`, error);
    return new Response("Failed to kill desktop", { status: 500 });
  }
}

export async function POST(request: Request) {
  return handleKillDesktop(request);
}

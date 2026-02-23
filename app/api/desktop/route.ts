import { getOrCreateDesktop, getLastSandboxId } from "@/lib/e2b/desktop";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 优先使用已存储的sandboxId来确保实例一致性
    const existingId = getLastSandboxId();
    const desktop = await getOrCreateDesktop(existingId || undefined);
    
    await desktop.stream.start();
    const streamUrl = desktop.stream.getUrl();
    
    return NextResponse.json({ 
      streamUrl, 
      sandboxId: desktop.sandboxId 
    });
  } catch (error) {
    console.error("Failed to get desktop:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

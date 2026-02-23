import { Sandbox } from "@e2b/desktop";

const resolution = { x: 1024, y: 768 };

// 全局单例，确保所有API路由共享同一个实例
let desktopInstance: Sandbox | null = null;
let lastSandboxId: string | null = null;

export async function getOrCreateDesktop(sandboxId?: string): Promise<Sandbox> {
  // 如果传入了sandboxId，尝试连接已存在的实例
  if (sandboxId && sandboxId !== lastSandboxId) {
    const connected = await connectDesktop(sandboxId);
    if (connected) {
      console.log("Connected to existing desktop:", sandboxId);
      return connected;
    }
  }
  
  // 检查现有实例
  if (desktopInstance) {
    try {
      const isRunning = await desktopInstance.isRunning();
      if (isRunning) {
        console.log("Reusing existing desktop:", desktopInstance.sandboxId);
        return desktopInstance;
      }
    } catch {
      desktopInstance = null;
    }
  }
  
  // 创建新实例
  desktopInstance = await Sandbox.create({
    resolution: [resolution.x, resolution.y],
    timeoutMs: 300000,
  });
  lastSandboxId = desktopInstance.sandboxId;
  console.log("Created new desktop:", desktopInstance.sandboxId);
  return desktopInstance;
}

export function getCurrentDesktop(): Sandbox | null {
  return desktopInstance;
}

export function getLastSandboxId(): string | null {
  return lastSandboxId;
}

export async function connectDesktop(id: string): Promise<Sandbox | null> {
  try {
    const connected = await Sandbox.connect(id);
    const isRunning = await connected.isRunning();
    if (isRunning) {
      desktopInstance = connected;
      lastSandboxId = id;
      return connected;
    }
  } catch {}
  return null;
}

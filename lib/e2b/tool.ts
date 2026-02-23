import { tool } from "ai";
import { z } from "zod";
import { Sandbox } from "@e2b/desktop";

export const resolution = { x: 1024, y: 768 };

// 全局桌面实例
let desktopInstance: Sandbox | null = null;

async function getDesktop(): Promise<Sandbox> {
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

  console.log("Creating new desktop...");
  desktopInstance = await Sandbox.create({
    resolution: [resolution.x, resolution.y],
    timeoutMs: 300000,
  });
  console.log("Created desktop:", desktopInstance.sandboxId);
  return desktopInstance;
}

export function createTools() {
  return {
    screenshot: tool({
      description: "截取当前桌面的截图，用于查看屏幕内容",
      inputSchema: z.object({}),
      execute: async () => {
        const desktop = await getDesktop();
        const image = await desktop.screenshot();
        const base64Data = Buffer.from(image).toString("base64");
        return {
          type: "image" as const,
          data: base64Data,
          width: resolution.x,
          height: resolution.y,
        };
      },
    }),

    click: tool({
      description: "点击屏幕上的指定位置",
      inputSchema: z.object({
        x: z.number().describe("X坐标 (0-1024)"),
        y: z.number().describe("Y坐标 (0-768)"),
        button: z.enum(["left", "right", "double"]).optional().default("left").describe("点击类型"),
      }),
      execute: async ({ x, y, button }) => {
        const desktop = await getDesktop();
        await desktop.moveMouse(x, y);
        
        switch (button) {
          case "right":
            await desktop.rightClick();
            break;
          case "double":
            await desktop.doubleClick();
            break;
          default:
            await desktop.leftClick();
        }
        
        return { success: true, action: `${button} click`, x, y };
      },
    }),

    type: tool({
      description: "在当前位置输入文字",
      inputSchema: z.object({
        text: z.string().describe("要输入的文字"),
      }),
      execute: async ({ text }) => {
        const desktop = await getDesktop();
        await desktop.write(text);
        return { success: true, typed: text };
      },
    }),

    press: tool({
      description: "按下键盘按键",
      inputSchema: z.object({
        key: z.string().describe("按键名称，如 enter, escape, tab, space"),
      }),
      execute: async ({ key }) => {
        const desktop = await getDesktop();
        const keyMap: Record<string, string> = {
          enter: "enter",
          return: "enter",
          escape: "escape",
          esc: "escape",
          tab: "tab",
          space: "space",
          backspace: "backspace",
          delete: "delete",
          up: "up",
          down: "down",
          left: "left",
          right: "right",
        };
        
        const normalizedKey = keyMap[key.toLowerCase()] || key;
        await desktop.press(normalizedKey);
        return { success: true, pressed: key };
      },
    }),

    scroll: tool({
      description: "滚动屏幕",
      inputSchema: z.object({
        direction: z.enum(["up", "down"]).describe("滚动方向"),
        amount: z.number().default(3).describe("滚动量"),
      }),
      execute: async ({ direction, amount }) => {
        const desktop = await getDesktop();
        await desktop.scroll(direction, amount);
        return { success: true, direction, amount };
      },
    }),

    mouseMove: tool({
      description: "移动鼠标到指定位置",
      inputSchema: z.object({
        x: z.number().describe("X坐标 (0-1024)"),
        y: z.number().describe("Y坐标 (0-768)"),
      }),
      execute: async ({ x, y }) => {
        const desktop = await getDesktop();
        await desktop.moveMouse(x, y);
        return { success: true, x, y };
      },
    }),

    wait: tool({
      description: "等待一段时间",
      inputSchema: z.object({
        seconds: z.number().min(0.5).max(5).default(1).describe("等待秒数"),
      }),
      execute: async ({ seconds }) => {
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        return { success: true, waited: seconds };
      },
    }),

    runCommand: tool({
      description: "执行 shell 命令",
      inputSchema: z.object({
        command: z.string().describe("要执行的命令"),
      }),
      execute: async ({ command }) => {
        const desktop = await getDesktop();
        try {
          const result = await desktop.commands.run(command);
          return {
            success: true,
            output: result.stdout || "(无输出)",
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),
  };
}

export type DesktopTools = ReturnType<typeof createTools>;

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, UIMessage, convertToModelMessages, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getOrCreateDesktop } from "@/lib/e2b/desktop";

const provider = createOpenAICompatible({
  name: "modelscope",
  apiKey: process.env.MODELSCOPE_API_KEY,
  baseURL: "https://api-inference.modelscope.cn/v1",
});

export const maxDuration = 300;

const SYSTEM_PROMPT = `你是一个可以控制电脑的AI助手。

屏幕分辨率：1024 x 768

可用工具：
- screenshot: 截取屏幕截图
- click: 点击位置 (x, y)，button可选 left/right/double
- type: 输入文字
- press: 按键 (enter, escape, tab, space, backspace, up, down, left, right)
- scroll: 滚动 (direction: up/down, amount)
- mouseMove: 移动鼠标
- wait: 等待 (seconds)
- runCommand: 执行命令

操作流程：先截图 → 分析 → 操作 → 再截图确认`;

export async function POST(req: Request) {
  try {
    const { messages, metadata }: { messages: UIMessage[]; metadata?: { sandboxId?: string } } = await req.json();
    
    // 使用前端传来的 sandboxId 确保连接到同一个桌面实例
    const sandboxId = metadata?.sandboxId;
    console.log("Chat API using sandboxId:", sandboxId);

    // 准备工具定义
    const tools = {
              screenshot: tool({
                description: "截取当前桌面的截图",
                inputSchema: z.object({}),
                execute: async () => {
                  const desktop = await getOrCreateDesktop(sandboxId);
                  const image = await desktop.screenshot();
                  // 压缩图片：降低质量和尺寸
                  const sharp = await import("sharp");
                  const compressed = await sharp.default(Buffer.from(image))
                    .resize(800, 600, { fit: "inside" }) // 缩小尺寸
                    .jpeg({ quality: 60 }) // 降低质量
                    .toBuffer();
                  return {
                    type: "image" as const,
                    data: compressed.toString("base64"),
                  };
                },
              }),      click: tool({
        description: "点击屏幕上的指定位置",
        inputSchema: z.object({
          x: z.number().describe("X坐标 (0-1024)"),
          y: z.number().describe("Y坐标 (0-768)"),
          button: z.enum(["left", "right", "double"]).optional().default("left"),
        }),
        execute: async ({ x, y, button }) => {
          const desktop = await getOrCreateDesktop(sandboxId);
          await desktop.moveMouse(x, y);
          if (button === "right") await desktop.rightClick();
          else if (button === "double") await desktop.doubleClick();
          else await desktop.leftClick();
          return { success: true, x, y, button };
        },
      }),
      type: tool({
        description: "在当前位置输入文字",
        inputSchema: z.object({
          text: z.string().describe("要输入的文字"),
        }),
        execute: async ({ text }) => {
          const desktop = await getOrCreateDesktop(sandboxId);
          await desktop.write(text);
          return { success: true, text };
        },
      }),
      press: tool({
        description: "按下键盘按键",
        inputSchema: z.object({
          key: z.string().describe("按键: enter, escape, tab, space, backspace, up, down, left, right"),
        }),
        execute: async ({ key }) => {
          const desktop = await getOrCreateDesktop(sandboxId);
          const keyMap: Record<string, string> = {
            enter: "enter", return: "enter",
            escape: "escape", esc: "escape",
            tab: "tab", space: "space",
            backspace: "backspace", delete: "delete",
            up: "up", down: "down", left: "left", right: "right",
          };
          await desktop.press(keyMap[key.toLowerCase()] || key);
          return { success: true, key };
        },
      }),
      scroll: tool({
        description: "滚动屏幕",
        inputSchema: z.object({
          direction: z.enum(["up", "down"]),
          amount: z.number().default(3),
        }),
        execute: async ({ direction, amount }) => {
          const desktop = await getOrCreateDesktop(sandboxId);
          await desktop.scroll(direction, amount);
          return { success: true, direction, amount };
        },
      }),
      mouseMove: tool({
        description: "移动鼠标到指定位置",
        inputSchema: z.object({
          x: z.number(),
          y: z.number(),
        }),
        execute: async ({ x, y }) => {
          const desktop = await getOrCreateDesktop(sandboxId);
          await desktop.moveMouse(x, y);
          return { success: true, x, y };
        },
      }),
      wait: tool({
        description: "等待一段时间",
        inputSchema: z.object({
          seconds: z.number().min(0.5).max(5).default(1),
        }),
        execute: async ({ seconds }) => {
          await new Promise(r => setTimeout(r, seconds * 1000));
          return { success: true, seconds };
        },
      }),
      runCommand: tool({
        description: "执行 shell 命令",
        inputSchema: z.object({
          command: z.string(),
        }),
        execute: async ({ command }) => {
          const desktop = await getOrCreateDesktop(sandboxId);
          try {
            const result = await desktop.commands.run(command);
            return { success: true, output: result.stdout || "(无输出)" };
          } catch (e) {
            return { success: false, error: String(e) };
          }
        },
      }),
    };

    // 只保留最近10条消息，防止token超限
    const recentMessages = messages.slice(-10);
    console.log(`Processing ${recentMessages.length} messages (truncated from ${messages.length})`);

    // 使用 generateText 自动处理多轮工具调用
    const result = await generateText({
      model: provider("Qwen/Qwen3.5-397B-A17B"),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(recentMessages),
      tools,
      stopWhen: stepCountIs(20), // 最多20轮工具调用
    });

    // 收集所有工具调用和结果
    const allToolCalls = result.toolCalls.map(tc => ({
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      input: tc.input,
    }));

    const allToolResults = result.toolResults.map(tr => ({
      toolCallId: tr.toolCallId,
      toolName: tr.toolName,
      result: tr.output,
    }));

    console.log(`Completed after ${result.toolCalls.length} tool call(s)`);

    // 非流式响应：返回完整结果
    return new Response(JSON.stringify({
      text: result.text,
      toolCalls: allToolCalls,
      toolResults: allToolResults,
      stepCount: result.toolCalls.length,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

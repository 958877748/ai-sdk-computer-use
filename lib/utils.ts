import { UIMessage } from "ai";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ABORTED = "User aborted";

type ToolInvocationPart = {
  type: "tool-invocation";
  toolInvocation: {
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
  };
};

export const prunedMessages = (messages: UIMessage[]): UIMessage[] => {
  if (messages.at(-1)?.role === "assistant") {
    return messages;
  }

  return messages.map((message) => {
    // check if last message part is a tool invocation in a call state, then append a part with the tool result
    message.parts = message.parts.map((part) => {
      if (part.type === "tool-invocation") {
        const toolPart = part as unknown as ToolInvocationPart;
        if (
          toolPart.toolInvocation.toolName === "computer" &&
          toolPart.toolInvocation.args.action === "screenshot"
        ) {
          return {
            ...part,
            toolInvocation: {
              ...toolPart.toolInvocation,
              result: {
                type: "text",
                text: "Image redacted to save input tokens",
              },
            },
          };
        }
        return part;
      }
      return part;
    });
    return message;
  });
};

"use client";

import type { UIMessage } from "ai";
import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";
import equal from "fast-deep-equal";
import { Streamdown } from "streamdown";

import { ABORTED, cn } from "@/lib/utils";
import {
  Camera,
  CheckCircle,
  CircleSlash,
  Clock,
  Keyboard,
  KeyRound,
  Loader2,
  MousePointer,
  MousePointerClick,
  ScrollText,
  StopCircle,
  Terminal,
  Move,
} from "lucide-react";

const ToolDisplay = ({
  toolName,
  args,
  state,
  result,
  isLatestMessage,
  status,
}: {
  toolName: string;
  args: Record<string, unknown>;
  state: "call" | "partial-call" | "result";
  result?: unknown;
  isLatestMessage: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
}) => {
  let actionLabel = "";
  let actionDetail = "";
  let ActionIcon = MousePointer;

  switch (toolName) {
    case "screenshot":
      actionLabel = "截取屏幕";
      ActionIcon = Camera;
      break;
    case "click":
      actionLabel = "点击";
      actionDetail = args.button === "double" 
        ? `双击 (${args.x}, ${args.y})` 
        : args.button === "right"
        ? `右键点击 (${args.x}, ${args.y})`
        : `左键点击 (${args.x}, ${args.y})`;
      ActionIcon = args.button === "double" ? MousePointerClick : MousePointer;
      break;
    case "type":
      actionLabel = "输入文字";
      actionDetail = `"${args.text}"`;
      ActionIcon = Keyboard;
      break;
    case "press":
      actionLabel = "按下按键";
      actionDetail = `"${args.key}"`;
      ActionIcon = KeyRound;
      break;
    case "scroll":
      actionLabel = "滚动";
      actionDetail = `${args.direction} ${args.amount}`;
      ActionIcon = ScrollText;
      break;
    case "mouseMove":
      actionLabel = "移动鼠标";
      actionDetail = `到 (${args.x}, ${args.y})`;
      ActionIcon = Move;
      break;
    case "wait":
      actionLabel = "等待";
      actionDetail = `${args.seconds} 秒`;
      ActionIcon = Clock;
      break;
    case "runCommand":
      actionLabel = "执行命令";
      actionDetail = `${(args.command as string)?.slice(0, 30)}...`;
      ActionIcon = Terminal;
      break;
    default:
      actionLabel = toolName;
      actionDetail = JSON.stringify(args).slice(0, 30);
  }

  return (
    <motion.div
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex flex-col gap-2 p-2 mb-3 text-sm bg-zinc-50 dark:bg-zinc-900 rounded-md border border-zinc-200 dark:border-zinc-800"
    >
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center justify-center w-8 h-8 bg-zinc-50 dark:bg-zinc-800 rounded-full">
          <ActionIcon className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="font-medium font-mono flex items-baseline gap-2">
            {actionLabel}
            {actionDetail && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-normal">
                {actionDetail}
              </span>
            )}
          </div>
        </div>
        <div className="w-5 h-5 flex items-center justify-center">
          {state === "call" ? (
            isLatestMessage && status !== "ready" ? (
              <Loader2 className="animate-spin h-4 w-4 text-zinc-500" />
            ) : (
              <StopCircle className="h-4 w-4 text-red-500" />
            )
          ) : state === "result" ? (
            result === ABORTED ? (
              <CircleSlash size={14} className="text-amber-600" />
            ) : (
              <CheckCircle size={14} className="text-green-600" />
            )
          ) : null}
        </div>
      </div>
      {state === "result" && result && typeof result === "object" && "type" in result && result.type === "image" ? (
        <div className="p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${(result as unknown as { data: string }).data}`}
            alt="Screenshot"
            className="w-full aspect-[1024/768] rounded-sm"
          />
        </div>
      ) : null}
      {state === "call" && toolName === "screenshot" ? (
        <div className="w-full aspect-[1024/768] rounded-sm bg-zinc-200 dark:bg-zinc-800 animate-pulse"></div>
      ) : null}
    </motion.div>
  );
};

const PurePreviewMessage = ({
  message,
  isLatestMessage,
  status,
}: {
  message: UIMessage;
  isLoading: boolean;
  status: "error" | "submitted" | "streaming" | "ready";
  isLatestMessage: boolean;
}) => {
  return (
    <AnimatePresence key={message.id}>
      <motion.div
        className="w-full mx-auto px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        key={`message-${message.id}`}
        data-role={message.role}
      >
        <div
          className={cn(
            "flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl",
            "group-data-[role=user]/message:w-fit",
          )}
        >
          <div className="flex flex-col w-full">
            {message.parts?.map((part, i) => {
              switch (part.type) {
                case "text":
                  return (
                    <motion.div
                      initial={{ y: 5, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      key={`message-${message.id}-part-${i}`}
                      className="flex flex-row gap-2 items-start w-full pb-4"
                    >
                      <div
                        className={cn("flex flex-col gap-4", {
                          "bg-secondary text-secondary-foreground px-3 py-2 rounded-xl":
                            message.role === "user",
                        })}
                      >
                        <Streamdown>{part.text}</Streamdown>
                      </div>
                    </motion.div>
                  );
                case "tool-invocation": {
                  const toolPart = part as unknown as {
                    toolInvocation: {
                      toolName: string;
                      state: "call" | "partial-call" | "result";
                      args: Record<string, unknown>;
                      result?: unknown;
                    };
                  };
                  const { toolName, state, args, result } = toolPart.toolInvocation;
                  return (
                    <ToolDisplay
                      key={`message-${message.id}-part-${i}`}
                      toolName={toolName}
                      args={args}
                      state={state}
                      result={result}
                      isLatestMessage={isLatestMessage}
                      status={status}
                    />
                  );
                }
                default:
                  return null;
              }
            })}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.status !== nextProps.status) return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;

    return true;
  },
);

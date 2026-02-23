"use client";

import { PreviewMessage } from "@/components/message";
import { useScrollToBottom } from "@/lib/use-scroll-to-bottom";
import { useEffect, useState, FormEvent } from "react";
import { Input } from "@/components/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DeployButton, ProjectInfo } from "@/components/project-info";
import { AISDKLogo } from "@/components/icons";
import { PromptSuggestions } from "@/components/prompt-suggestions";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { UIMessage } from "ai";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: Array<{
    type: "text" | "tool-invocation";
    text?: string;
    toolInvocation?: {
      toolName: string;
      state: "call" | "partial-call" | "result";
      args: Record<string, unknown>;
      result?: unknown;
    };
  }>;
}

export default function Chat() {
  const [desktopContainerRef, desktopEndRef] = useScrollToBottom();

  const [isInitializing, setIsInitializing] = useState(true);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isInitializing || !sandboxId) return;
    
    const content = input.trim();
    setInput("");
    
    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      parts: [{ type: "text", text: content }],
    };
    setMessages(prev => [...prev, userMessage]);
    
    // 准备发送请求
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            parts: m.parts,
          })) as UIMessage[],
          metadata: { sandboxId },
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 添加 AI 回复
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.text || "",
        parts: [{ type: "text", text: data.text || "" }],
      };
      
      // 添加工具调用结果
      if (data.toolResults && data.toolResults.length > 0) {
        data.toolResults.forEach((result: { toolCallId: string; toolName: string; result: unknown }) => {
          assistantMessage.parts.push({
            type: "tool-invocation",
            toolInvocation: {
              toolName: result.toolName,
              state: "result",
              args: {},
              result: result.result,
            },
          });
        });
      }
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("发送消息失败", {
        description: "请稍后重试。",
        richColors: true,
        position: "top-center",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const refreshDesktop = async () => {
    try {
      setIsInitializing(true);
      const res = await fetch("/api/desktop");
      const data = await res.json();
      setStreamUrl(data.streamUrl);
      setSandboxId(data.sandboxId);
    } catch (err) {
      console.error("Failed to refresh desktop:", err);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    if (!sandboxId) return;

    const killDesktop = () => {
      if (!sandboxId) return;
      navigator.sendBeacon(
        `/api/kill-desktop?sandboxId=${encodeURIComponent(sandboxId)}`,
      );
    };

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS || isSafari) {
      window.addEventListener("pagehide", killDesktop);
      return () => {
        window.removeEventListener("pagehide", killDesktop);
        killDesktop();
      };
    } else {
      window.addEventListener("beforeunload", killDesktop);
      return () => {
        window.removeEventListener("beforeunload", killDesktop);
        killDesktop();
      };
    }
  }, [sandboxId]);

  useEffect(() => {
    const init = async () => {
      try {
        setIsInitializing(true);
        const res = await fetch("/api/desktop");
        const data = await res.json();
        setStreamUrl(data.streamUrl);
        setSandboxId(data.sandboxId);
      } catch (err) {
        console.error("Failed to initialize desktop:", err);
        toast.error("初始化桌面失败");
      } finally {
        setIsInitializing(false);
      }
    };

    init();
  }, []);

  return (
    <div className="flex h-dvh relative">
      <div className="w-full block">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel
            defaultSize={70}
            minSize={40}
            className="bg-black relative items-center justify-center"
          >
            {streamUrl ? (
              <>
                <iframe
                  src={streamUrl}
                  className="w-full h-full"
                  style={{
                    transformOrigin: "center",
                    width: "100%",
                    height: "100%",
                  }}
                  allow="autoplay"
                />
                <Button
                  onClick={refreshDesktop}
                  className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white px-3 py-1 rounded text-sm z-10"
                  disabled={isInitializing}
                >
                  {isInitializing ? "创建桌面中..." : "新建桌面"}
                </Button>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-white">
                {isInitializing
                  ? "正在初始化桌面..."
                  : "加载流中..."}
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={30}
            minSize={25}
            className="flex flex-col border-l border-zinc-200"
          >
            <div className="bg-white py-4 px-4 flex justify-between items-center">
              <AISDKLogo />
              <DeployButton />
            </div>

            <div
              className="flex-1 space-y-6 py-4 overflow-y-auto px-4"
              ref={desktopContainerRef}
            >
              {messages.length === 0 ? <ProjectInfo /> : null}
              {messages.map((message, i) => (
                <PreviewMessage
                  message={message as unknown as import("ai").UIMessage}
                  key={message.id}
                  isLoading={isLoading}
                  status={isLoading ? "streaming" : "ready"}
                  isLatestMessage={i === messages.length - 1}
                />
              ))}
              <div ref={desktopEndRef} className="pb-2" />
            </div>

            {messages.length === 0 && (
              <PromptSuggestions
                disabled={isInitializing || isLoading}
                submitPrompt={(prompt: string) => {
                  setInput(prompt);
                  // 使用 setTimeout 确保 input 已更新
                  setTimeout(() => {
                    const fakeEvent = { preventDefault: () => {} } as FormEvent;
                    handleSubmit(fakeEvent);
                  }, 0);
                }}
              />
            )}
            <div className="bg-white">
              <form onSubmit={handleSubmit} className="p-4">
                <Input
                  handleInputChange={handleInputChange}
                  input={input}
                  isInitializing={isInitializing}
                  isLoading={isLoading}
                  status={isLoading ? "streaming" : "ready"}
                  stop={() => {}}
                />
              </form>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const starterMessages: Message[] = [
  {
    role: "assistant",
    content:
      "I’m VaultOn AI. Ask me about a warranty expiry, a return window, a merchant, or how your spending is distributed across tags.",
  },
];

const suggestedPrompts = [
  "Give me proactive money-saving tips based on my spending chart and tags.",
  "Which tag budgets are close to being exceeded?",
  "Which warranties expire soon?",
  "What can I still return this week?",
];

type AssistantMessage = { role: "user" | "assistant"; content: string };

export default function VaultOnAssistant({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(starterMessages);
  const assistantChat = trpc.assistant.chat.useMutation({
    onSuccess: ({ reply }) => {
      const normalizedReply = typeof reply === "string" ? reply : JSON.stringify(reply);
      setMessages(current => [...current, { role: "assistant", content: normalizedReply }]);
    },
    onError: error => {
      toast.error("VaultOn AI is unavailable", { description: error.message });
      setMessages(current => [
        ...current,
        {
          role: "assistant",
          content: "I couldn’t reach the assistant just now. Please try again in a moment.",
        },
      ]);
    },
  });

  if (!open) return null;

  const handleSend = (content: string) => {
    const nextMessages: Message[] = [
      ...messages,
      { role: "user", content },
    ];
    const apiMessages: AssistantMessage[] = nextMessages
      .filter(message => message.role !== "system")
      .map(message => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      }));
    setMessages(nextMessages);
    assistantChat.mutate({ messages: apiMessages });
  };

  return (
    <>
      <button
        aria-label="Close VaultOn AI assistant"
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default bg-[#173044]/25 backdrop-blur-[2px]"
      />
      <aside
        aria-label="VaultOn AI assistant"
        className="fixed inset-y-0 right-0 z-[70] flex w-[min(520px,100vw)] flex-col border-l border-[#e5dfd4] bg-[#fffdf8] shadow-[-20px_0_70px_rgba(23,48,68,.2)]"
      >
        <div className="flex items-center justify-between border-b border-[#eee9df] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fbe7e1] text-[#d86f62]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#d86f62]">VaultOn AI</p>
              <h2 className="mt-1 text-lg font-bold text-[#173044]">Your archive, explained</h2>
            </div>
          </div>
          <Button aria-label="Close assistant" onClick={onClose} variant="ghost" size="icon" className="text-[#72808b] hover:bg-[#f4efe7] hover:text-[#173044]"><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 p-4 sm:p-5">
          <AIChatBox
            messages={messages}
            onSendMessage={handleSend}
            isLoading={assistantChat.isPending}
            height="100%"
            className="h-full rounded-2xl border-[#e5dfd4] bg-[#fffdf8] shadow-none"
            placeholder="Ask about your purchases..."
            emptyStateMessage="Ask VaultOn AI about your purchase archive"
            suggestedPrompts={suggestedPrompts}
          />
        </div>
        <p className="border-t border-[#eee9df] px-5 py-3 text-[11px] leading-5 text-[#8a969a]">VaultOn AI only uses the purchases and notes in your authenticated archive. Verify important dates with the original receipt.</p>
      </aside>
    </>
  );
}

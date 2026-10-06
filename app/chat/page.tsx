import { TeamChat } from "@/components/TeamChat";

export const dynamic = "force-dynamic";

// 3ペイン（チャット一覧／詳細／タスク）。レイアウト下部余白を相殺して全画面表示。
export default function ChatPage() {
  return (
    <div className="-mb-24">
      <TeamChat />
    </div>
  );
}

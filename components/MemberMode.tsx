"use client";

import { createContext, useContext } from "react";

// メンバーPC（開発ツール無効）かどうかをクライアント全体へ渡す。
// 値はサーバー（layout）で isMemberMode() を読んで埋め込む。
const MemberModeContext = createContext(false);

export function MemberModeProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return (
    <MemberModeContext.Provider value={value}>
      {children}
    </MemberModeContext.Provider>
  );
}

// true のとき開発ツール（Cursor/Claude Code/Codexで開く・AI実装・指示文コピー等）を隠す。
export function useMemberMode(): boolean {
  return useContext(MemberModeContext);
}

import { Goal, GOAL_STATUS_LABEL, LOG_KIND, STEP_ACTOR_LABEL } from "./types";
import { ancestorsOf, childrenOf, currentStep } from "./store";

const LOG_KIND_LABEL: Record<string, string> = {
  [LOG_KIND.comment]: "コメント/決定",
  [LOG_KIND.deliverable]: "成果物",
  [LOG_KIND.aiRequest]: "AI依頼",
  [LOG_KIND.aiResult]: "AI結果",
  [LOG_KIND.statusChange]: "状態変更",
  [LOG_KIND.stepDone]: "ステップ",
};

/**
 * ゴールの文脈（目的・現状・完了の基準・ロードマップ・現在地・経緯）をまとめて、
 * AIエージェントが「続きから」作業できる指示文を生成する。これがこのシステムの中核。
 */
export function buildAiPrompt(goal: Goal, all: Goal[]): string {
  const ancestors = ancestorsOf(goal.id, all);
  const cur = currentStep(goal);
  const goalUrl = `/goals/${goal.id}`;

  const lines: string[] = [];

  lines.push("あなたは、この会社のゴールに向けて働くAIエージェントです。");
  lines.push(
    "以下の文脈を前提に、前置きなしで『いま着手すべきステップ』から作業を進めてください。",
  );
  lines.push("");

  // ── 何のために（会社ゴールまでの階層） ──
  lines.push("## 何のために（ゴール階層）");
  if (ancestors.length === 0) {
    lines.push("- （このゴールが最上位です）");
  } else {
    ancestors.forEach((a, i) => lines.push(`${"  ".repeat(i)}- ${a.title}`));
  }
  lines.push(`${"  ".repeat(ancestors.length)}- ★ ${goal.title}（← 今回の対象）`);
  lines.push("");

  // ── 最終的に目指す親ゴール（この対象はその一部） ──
  // 子ゴールを実装するとき、最上位の親ゴールの理想形を見失わないための指針。
  const root = ancestors[0];
  if (root) {
    lines.push("## 最終的に目指す親ゴール（この対象はその一部）");
    lines.push(`- 親ゴール: ${root.title}`);
    if (root.desire) lines.push(`- 親のしたいこと: ${oneLine(root.desire)}`);
    if (root.purpose) lines.push(`- 親の目的: ${oneLine(root.purpose)}`);
    if (root.completionCriteria && root.completionCriteria.trim()) {
      lines.push(`- 親の完了の基準: ${oneLine(root.completionCriteria)}`);
    }
    lines.push(
      "この対象ゴールは、上の親ゴールの理想形を実現するための一工程です。単体で閉じた実装にせず、親の完成形（同じ成果物・同じ設計方針・一貫したUX）と整合するように実装してください。他の子ゴールは同じコードベースを共有し、順番に積み上げていきます。",
    );
    lines.push("");
  }

  // ── 対象ゴール ──
  lines.push("## 対象ゴール");
  if (goal.desire) lines.push(`- したいこと: ${goal.desire}`);
  lines.push(`- 目的: ${orDash(goal.purpose)}`);
  lines.push(`- 現状: ${orDash(goal.currentStatus)}`);
  lines.push(`- 完了の基準:\n${indent(orDash(goal.completionCriteria))}`);
  lines.push(`- 状態: ${GOAL_STATUS_LABEL[goal.status]} / 進捗 ${goal.progress}%`);
  lines.push(`- 担当: ${orDash(goal.assignee)} / 期日: ${orDash(goal.dueDate)}`);
  lines.push(`- 参照URL: ${goalUrl}`);
  lines.push("");

  // ── ロードマップ（現在地つき） ──
  if (goal.steps.length > 0) {
    lines.push("## ロードマップ（道のりと現在地）");
    goal.steps.forEach((s, i) => {
      const mark = s.done ? "[x]" : s.id === cur?.id ? "[→]" : "[ ]";
      const who = `(${STEP_ACTOR_LABEL[s.actor]})`;
      const note = s.note ? ` — ${s.note}` : "";
      lines.push(`${i + 1}. ${mark} ${who} ${s.title}${note}`);
    });
    lines.push("");
    if (cur) {
      lines.push(`▶ いま着手すべき: 「${cur.title}」（担当: ${STEP_ACTOR_LABEL[cur.actor]}）`);
    } else {
      lines.push("▶ 全ステップ完了済み。完了レビューの記録に進んでください。");
    }
    lines.push("");
  }

  // ── 配下のタスク（サブタスク含む全階層） ──
  const descendants = descendantLines(goal.id, all, 0);
  if (descendants.length > 0) {
    lines.push("## 配下のタスク（この階層以下すべて）");
    lines.push(
      "以下はこのゴールに連なるサブタスクの全階層です。上から順に、それぞれの『完了の基準』を満たすように実装を進めてください（1つのタスクだけで終わらせない）。",
    );
    lines.push(...descendants);
    lines.push("");
  }

  // ── 同じ親の兄弟タスク（同一プロジェクト/フォルダを共有） ──
  const parent = ancestors[ancestors.length - 1];
  if (parent) {
    const siblings = childrenOf(parent.id, all).filter((s) => s.id !== goal.id);
    if (siblings.length > 0) {
      lines.push("## 同じ親ゴールの他タスク（兄弟／同じプロジェクト・同じ作業フォルダ）");
      lines.push(
        "これらは今回の対象と同じ成果物（コードベース）を共有します。特に『完了』済みのタスクで作られた実装を踏まえ、重複や不整合を出さずに“続き”として実装してください。",
      );
      siblings.forEach((s) => {
        lines.push(`- [${GOAL_STATUS_LABEL[s.status]}/${s.progress}%] ${s.title}`);
        // 完了済みの兄弟は、何を作ったかの手掛かりを1行添える。
        if (s.status === "done") {
          const note = siblingDoneNote(s);
          if (note) lines.push(`    └ 完了内容: ${note}`);
        }
      });
      lines.push("");
    }
  }

  // ── これまでの経緯 ──
  lines.push("## これまでの経緯（新しい順）");
  const logs = [...goal.logs].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (logs.length === 0) {
    lines.push("- （記録なし）");
  } else {
    logs.slice(0, 20).forEach((l) => {
      const date = l.createdAt.slice(0, 10);
      lines.push(
        `- [${date}][${LOG_KIND_LABEL[l.kind] ?? l.kind}] ${l.author}: ${l.body}`,
      );
    });
  }
  lines.push("");

  // ── 依頼 ──
  lines.push("## お願いしたいこと");
  lines.push("1. 上の『いま着手すべきステップ』を、続きから実際に進める。");
  lines.push(
    "2. 完了の基準に対して、いま何が足りないかを1〜3行で整理してから作業する。",
  );
  lines.push(
    "3. 『配下のタスク』がある場合は、対象ゴールだけでなく配下のサブタスクも上から順にすべて実装まで進める。",
  );
  lines.push(
    "4. 進めたら結果と『次にやること』をまとめる（この対象ゴールに記録として残す想定）。",
  );
  lines.push("");
  lines.push(
    "※ 前提の再説明は不要です。上の文脈がそのまま前提です。人の作業待ちのステップがある場合は、それを明示してこちらの作業を進めてください。",
  );

  return lines.join("\n");
}

// 配下のサブタスクを全階層ぶん、インデント付きで列挙する。
// 各タスクの状態・進捗・完了の基準・現在ステップを添え、AIが上から実装できるようにする。
function descendantLines(parentId: string, all: Goal[], depth: number): string[] {
  const out: string[] = [];
  const kids = childrenOf(parentId, all);
  for (const c of kids) {
    const indent = "  ".repeat(depth);
    out.push(
      `${indent}- [${GOAL_STATUS_LABEL[c.status]}/${c.progress}%] ${c.title}`,
    );
    if (c.completionCriteria && c.completionCriteria.trim()) {
      out.push(`${indent}  完了の基準: ${oneLine(c.completionCriteria)}`);
    }
    const cur = currentStep(c);
    if (c.steps.length > 0 && cur) {
      out.push(`${indent}  現在地: 「${cur.title}」`);
    }
    out.push(...descendantLines(c.id, all, depth + 1));
  }
  return out;
}

// 完了済みの兄弟タスクが「何を作ったか」の要約（レビュー or 直近のAI結果ログ）。
function siblingDoneNote(goal: Goal): string {
  if (goal.review && goal.review.summary.trim()) {
    return oneLine(goal.review.summary).slice(0, 120);
  }
  const last = [...goal.logs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .find((l) => l.kind === LOG_KIND.aiResult || l.kind === LOG_KIND.deliverable);
  return last ? oneLine(last.body).slice(0, 120) : "";
}

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " / ").trim();
}

// headless実装（Claude Codeで実装）専用の指示文。
// ゴール文脈に加え、Cursorのような「実装エンジニアの規律」を強く指示して品質を上げる。
export function buildImplementPrompt(goal: Goal, all: Goal[]): string {
  const context = buildAiPrompt(goal, all);
  const brief = [
    "",
    "════════════════════════════════════",
    "# あなたの役割（最重要・厳守）",
    "あなたは単なるタスク生成AIではありません。『Engineering Project Manager / Technical Lead / QA Manager』として、親ゴールの理解・要件整理・設計・子ゴール分解と品質管理・実装・実装結果の検証・不備の修正指示・親ゴール達成判定までを担います。",
    "最重要目的は『タスクを完了させること』ではなく『親ゴールの完了基準を満たす、高品質な成果物を完成させること』。進捗率やタスク消化数より、成果物の品質を優先する。",
    "",
    "## 基本原則：必ずこの順序を守る",
    "親ゴール理解 → 要件整理 → 完成状態の定義 → 設計 → 子ゴール生成 → 子ゴールレビュー → 実装 → 実装検証 → 必要なら修正 → 親ゴール検証。設計や検証を飛ばして実装へ進んではいけない。",
    "",
    "## 親ゴール解析（最初に整理する）",
    "Goal（何を完成させるか）/ Purpose（なぜ）/ User（誰が使うか）/ Expected Outcome（完成時にユーザーが何をできるか）/ Inputs / Outputs / Constraints（技術・環境・既存コード・API・予算・期限）/ Out of Scope / Acceptance Criteria。",
    "Acceptance Criteria は第三者が Yes/No で判定できる条件にする。『使いやすくする』『高品質にする』『正しく動く』等の曖昧な条件は禁止。良い例：『CSVをアップロードできる』『1000件までエラーなく処理できる』『APIエラー時にユーザーへエラーメッセージが表示される』。",
    "",
    "## 完成状態から逆算する",
    "すぐ子ゴールを作らない。まず『親ゴールが完全に達成された状態』を定義し、完成状態 → 必要機能 → 必要コンポーネント → 必要実装 → 子ゴール の順で逆算する。",
    "",
    "## 実装前に設計を作る（既存システムは関連コード確認が必須）",
    "コード変更を伴う場合、子ゴール生成前に最低限：現在のシステム構成 / 関連ファイル / 既存機能 / 新規に必要な機能 / データフロー / API / DB / UI / 状態管理 / エラー処理 / セキュリティ / テスト方法 / 既存機能への影響 を整理する。関連コードを確認せずに設計しない。",
    "",
    "## 子ゴールは『達成状態』で定義する",
    "作業内容ではなく達成状態で定義する。悪い例『認証機能を対応する』／良い例『メール＋パスワードのログインを実装し、正常系・異常系テストを通過させる』。各子ゴールは objective / parent_criteria / context / scope / out_of_scope / dependencies / implementation_requirements / acceptance_criteria（2〜7個, Yes/No判定可能）/ verification（自動テスト・API実行・UI操作・DB確認・build・lint・typecheck 等）/ deliverables を持つ。1子ゴール＝1責務。過度な細分化（ファイル1個作成等）も避け、意味のある検証可能な成果を単位にする。",
    "",
    "## 子ゴール生成後の自己レビュー（実装前に必須）",
    "Coverage（親の完了基準を全てカバー）/ Dependency（順序の矛盾なし）/ Granularity（大きすぎ・細かすぎなし）/ Ambiguity（『対応する』『改善する』等の曖昧表現なし）/ Verification（全子ゴールに検証方法あり）/ Architecture（順序が構造上合理的）。問題があれば実装開始前に子ゴールを修正する。",
    "",
    "## 実装ルール（実装時に必ず守る）",
    "1. 実装前に関連コードを確認する。2. 既存設計・命名・アーキテクチャに可能な限り合わせる。3. 不要な大規模リファクタをしない。4. ハードコードを極力避ける。5. モック/ダミー処理を本番実装として扱わない。6. TODOを残して完了扱いしない。7. エラー処理を実装する。8. 入力検証を実装する。9. 必要なログを実装する。10. 既存機能を壊していないことを確認する。11. acceptance_criteria を満たすために必要なテストを行う。",
    "仕様そのものを勝手に変更しない（あなたは要求された成果を実装する担当でもある）。",
    "",
    "## 完了判定（自己申告・報告だけで完了にしない）",
    "『完了しました』という報告だけで完了にしない。各 Acceptance Criterion を PASS / FAIL / UNKNOWN で判定する。UNKNOWN が1つでもあれば完了にしない。",
    "完了判定には必ず根拠(Evidence)を示す。例：『ユーザー登録APIが正常動作』→ POST /api/users にテスト送信 / HTTP 201 / DB の users にレコード作成を確認。根拠が無ければ PASS にしない。",
    "",
    "## 品質レビュー（機能要件以外も確認）",
    "Functionality（動作するか）/ Regression（既存機能を壊していないか）/ Error Handling（異常系を処理するか）/ Maintainability（過度に複雑でないか）/ Security（認証・権限・入力値）/ UX（重大な操作問題がないか）/ Data Integrity（保存データが壊れないか）。",
    "",
    "## 不合格時（REWORK）",
    "Acceptance Criteria を満たさない場合、新しい親ゴールを作らない。現在の子ゴールを REWORK_REQUIRED とし、問題 / 原因 / 修正内容 / 再検証方法 を定義してやり直す。",
    "",
    "## 親ゴール完了判定",
    "全子ゴールが完了しても自動で親を完了にしない。最後に親全体を検証：親の Acceptance Criteria / 子ゴール間の統合 / End-to-End 動作 / 既存機能への影響 / エラーケース / 実際のユーザー利用フロー。すべて問題ない場合のみ親を COMPLETED にする。",
    "",
    "## ステータスの意味",
    "PLANNED / READY / IN_PROGRESS / IMPLEMENTED / VERIFYING / REWORK_REQUIRED / BLOCKED / COMPLETED。『コードを書いただけ』は IMPLEMENTED。検証まで完了した場合のみ COMPLETED。",
    "",
    "## 報告フォーマット（最後に必ず出力）",
    "- 実施内容（3行以内）/ - 各 Acceptance Criterion の判定（PASS/FAIL/UNKNOWN）と Evidence / - 残課題・仮実装・既知の制約 / - 次に着手する子ゴール。",
    "",
    "## 進捗の自動反映（進捗管理AI・MCP: shinchoku を使うこと）",
    "子ゴールを一区切り（実装＋検証）したら、必ず shinchoku MCP の『submit_worklog』を呼んで作業ログを送る。これで進捗%・完了見込みが自動更新され、新たに判明した子タスクも自動追加される。",
    `  - submit_worklog の goalId には対象ゴールのID「${goal.id}」を使う（子ゴールに対して報告する場合はその子ゴールのIDを使う）。`,
    "  - log には『実施内容 / 完了基準に対する達成度(PASS/FAIL) / 残タスク』を要約して入れる。",
    "  - ステップ運用のゴールでは、完了したステップを『set_step_done』で完了にする。状態や現状は『update_goal』で更新する。",
    "  - Cursor など（Claude Codeのセッション自動取得が効かないツール）で作業した場合も、この submit_worklog を呼べば進捗が反映される。作業の区切りごとに必ず呼ぶこと。",
    "",
    "## 禁止事項",
    "曖昧な子ゴールを作る / コードを確認せず変更する / 実装担当の完了報告をそのまま信用する / テストしていないものを完了扱いする / モックを完成品として扱う / TODOを残して完了扱いする / 完了基準を実装後に緩める / エラーを無視する / テスト失敗を無視する / 親ゴールと関係ない変更をする / 根拠なく『問題ありません』と判断する。",
    "",
    "## 最重要ルール",
    "タスクを終わらせることより『正しいものを作ること』を優先する。実装量より『完了基準を満たしている証拠』を重視する。不確実な状態では完了扱いにしない。品質に問題がある場合は 実装 → 検証 → 修正 → 再検証 を繰り返す。",
    "",
    "────────────────────────────────────",
    "# UI/デザインの品質指針（画面を作る場合は厳守）",
    "目標は『良いプロダクトデザイナーが作った、落ち着いた実務用SaaS』の見た目。“いかにもAIが自動生成した感”を徹底的に排除すること。",
    "【最優先】ユーザーが相談（claude codeに聞く）で指定したデザインの好み（参考スタイル・アクセント色/トーン・情報密度・角丸/影・ダークモード要否など）が、上の文脈や経緯ログにあれば、それを最優先で反映する。指定が無い項目のみ下記の既定に従う。",
    "",
    "## まずやること（デザイントークンを先に決める）",
    "実装前に、色・タイポ・余白・角丸・影・境界の小さなトークン表を決め、全画面でそれだけを使う（場当たりな個別指定をしない）。既存プロジェクトにトークン/配色/コンポーネントがあれば必ずそれに合わせる。",
    "- 余白スケール: 4/8/12/16/24/32px など一定の刻みに統一。",
    "- 角丸: 6〜10px程度に統一（要素ごとにバラバラにしない。pill/全部2xlの多用禁止）。",
    "- 影: ほぼ使わない。必要なら『細い境界線＋ごく薄い影』1種類だけ。多重・濃い影は禁止。",
    "- フォント: Inter / system-ui 等の中立なサンセリフ。行間・字間を整え、本文14〜15px基準。",
    "",
    "## 配色（最重要・AI感はここで出る）",
    "- 地色は無彩色（白〜グレー、ダークは濃いスレート/ニュートラル）。アクセントは1色だけ（＋状態色: 成功=緑, 警告=琥珀, エラー=赤, 情報=青 を控えめに）。",
    "- 【禁止】紫/バイオレット/インディゴ、青→紫や虹のグラデーション、ネオン、カラフルな多色使い。グラデーション文字・グラデーションボタンは使わない（＝AI感の典型）。",
    "- アクセントは彩度を上げすぎない落ち着いたトーンにし、面で塗らず“効かせる”程度に。コントラスト比(AA)を必ず確保。",
    "",
    "## レイアウト",
    "- 中身に合うレイアウトにする。何でも『中央寄せの巨大ヒーロー＋説明文＋丸いカード3枚』にしない（これもAI感の典型）。業務画面は左寄せ・情報密度のある表/リスト/フォームを基本に。",
    "- 一貫したグリッドと整列。要素の端を揃える。余白で情報をグルーピングし、詰め込みすぎない。",
    "- 管理画面は『左サイドバー固定＋右メイン』。選択中メニューを明示。レスポンシブ必須（モバイルで横スクロールを出さない）。ダークモード対応。",
    "",
    "## タイポグラフィと装飾",
    "- 見出し/小見出し/本文/補助で明確な階層（サイズ・太さ・色）。見出しを無駄に特大にしない。",
    "- 【禁止】見出し・ボタン・ラベルへの絵文字の多用（🚀✨🎉等）。アイコンを使うなら統一されたラインアイコン1セットのみ。",
    "- 装飾のための装飾をしない。余白・階層・整列で“整って見える”状態を作る。",
    "",
    "## コンポーネントの質感",
    "- ボタン/入力/テーブル/バッジ/タブ等は hover/focus/active/disabled/selected の状態を用意。トランジションは80〜150msの控えめなものだけ。",
    "- ボタンは『塗り＝主要1つ／枠線＝副次／テキスト＝三次』の階層。全部を目立たせない。",
    "- テーブルは罫線や行の余白を整え、数値は右寄せ・等幅数字(tabular-nums)。空/読み込み/エラーの3状態を必ず用意。",
    "",
    "## 仕上げチェック（提出前に自己確認）",
    "次のどれかに当てはまったら“AI感”なので直す: 紫/虹グラデがある / 影や角丸が過剰 / 絵文字見出し / 中央寄せ巨大ヒーロー＋同型カード3枚 / 余白と整列がバラバラ / アクセント色が多すぎ / コントラスト不足。",
    "",
    "────────────────────────────────────",
    "# 進め方の原則",
    "完了基準が明確で検証可能なら、人の判断が必須のステップ以外は止まらずに実装を完了させる。ただし、親ゴール/完了基準が曖昧・検証不能で推測が必要な場合は、推測で進めず『フェーズ1』に従って質問と検証可能な基準の書き換え案を報告して停止する（曖昧なまま進めるより、質問して止まる方がよい）。",
  ].join("\n");
  return context + "\n" + brief;
}

// 相談用の指示文。実装させるのではなく、ゴールの完了イメージ・要件整理・質問出し・
// 完了基準（Yes/No判定可能）の案までを、対話で一緒に詰めるための最初のメッセージ。
export function buildConsultPrompt(goal: Goal, all: Goal[]): string {
  const context = buildAiPrompt(goal, all);
  const brief = [
    "",
    "════════════════════════════════════",
    "# 相談モード（まだ実装はしない）",
    "上のゴールについて、いきなり実装せず、まず一緒に『完了イメージ』と要件を整理したいです。次を手伝ってください。",
    "",
    "1. このゴールが『完全に達成された状態（完成イメージ）』を、ユーザー視点で3〜6行で描写する。",
    "2. 不明点・前提・確認したいことを箇条書きで質問する（誰が・何のために使うか／入力と出力／対象外／技術的制約 など）。",
    "3. 第三者が Yes/No で判定できる『完了の基準（Acceptance Criteria）』の案を3〜7個提案する（例：『〇〇を入力すると□□が返る』『指定5ケースのテストが通る』）。曖昧な表現は避ける。",
    "4. 想定される実装の進め方（主要な子タスクの候補）を簡潔に示す。",
    "5. 画面があるゴールなら『デザインの好み』を具体的にヒアリングして決める（AI感のない、落ち着いた実務用の見た目が前提）。次を質問し、ユーザーの回答を要約して残す:",
    "   - 参考にしたい雰囲気（例: Linear風 / Notion風 / Stripeダッシュボード風 など）",
    "   - アクセントカラー（1色）とトーン（例: 濃紺 / スレート＋エメラルド / ティール など。紫・虹グラデ・多色は避ける前提）",
    "   - 情報密度（ゆったり / 標準 / 高密度）、角丸や影の強さ（控えめ推奨）",
    "   - ダークモードの要否、対象デバイス（PC中心 / モバイルも）",
    "   回答がない項目は『落ち着いた実務用SaaS・無彩色＋アクセント1色・控えめな角丸/影・絵文字なし』を既定として明記する。",
    "",
    "※ ここでは相談・設計の整理が目的です。コードの実装や変更はまだ行わないでください。合意できたら、進捗管理AI側でゴールに反映します（デザインの好みも含めて『相談結果を反映』で取り込みます）。",
  ].join("\n");
  return context + "\n" + brief;
}

function orDash(v: string | null | undefined): string {
  return v && v.trim() ? v : "—（未記入）";
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}

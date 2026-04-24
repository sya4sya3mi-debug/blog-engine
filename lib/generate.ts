// ==========================================
// BlogEngine V2 - AI Article Generation Engine
// 薬機法・景表法・ステマ規制対応プロンプト設計
// ==========================================

import Anthropic from "@anthropic-ai/sdk";
import { SubTheme, TargetAge, THEME_TIER_MAP } from "./config";
import { autoFixCompliance } from "./compliance";
import { getIngredientCandidate, type IngredientCandidate } from "./ingredient-data";

// 日本語キーワード→英語スラッグ変換マップ
const JA_TO_EN_SLUG: Record<string, string> = {
  "シミ": "dark-spots", "美白": "whitening", "美容液": "serum", "化粧水": "toner",
  "乳液": "emulsion", "クリーム": "cream", "日焼け止め": "sunscreen", "毛穴": "pore",
  "ニキビ": "acne", "肌荒れ": "skin-trouble", "エイジング": "aging", "シワ": "wrinkle",
  "たるみ": "sagging", "ハリ": "firmness", "レチノール": "retinol", "ナイアシンアミド": "niacinamide",
  "ビタミンC": "vitamin-c", "セラミド": "ceramide", "ヒアルロン酸": "hyaluronic-acid",
  "トラネキサム酸": "tranexamic-acid", "医療脱毛": "medical-hair-removal",
  "脱毛": "hair-removal", "ハイフ": "hifu", "ボトックス": "botox",
  "ピーリング": "peeling", "ダーマペン": "dermapen", "クレンジング": "cleansing",
  "洗顔": "face-wash", "シャンプー": "shampoo", "トリートメント": "treatment",
  "ヘアオイル": "hair-oil", "頭皮": "scalp", "白髪": "gray-hair",
  "おすすめ": "best", "比較": "comparison", "ランキング": "ranking",
  "選び方": "guide", "口コミ": "reviews", "効果": "effects", "使い方": "how-to",
  "30代": "30s", "20代": "20s", "40代": "40s", "スキンケア": "skincare",
  "コスメ": "cosmetics", "美容": "beauty", "ヘアケア": "hair-care",
};

/** スラッグを英語小文字+ハイフンにサニタイズ */
function sanitizeSlug(raw: string): string {
  // 既に英語のみならそのまま整形
  if (/^[a-z0-9-]+$/.test(raw)) return raw.replace(/--+/g, "-").replace(/^-|-$/g, "");

  // 日本語を含む場合：キーワードマップで変換
  let slug = raw;
  for (const [ja, en] of Object.entries(JA_TO_EN_SLUG)) {
    slug = slug.replace(new RegExp(ja, "g"), ` ${en} `);
  }
  // 残った日本語を除去、英語部分のみ抽出
  slug = slug
    .replace(/[^\x20-\x7E]/g, " ") // 非ASCII除去
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");

  // 空になったらタイムスタンプベースのスラッグ
  return slug || `beauty-article-${Date.now().toString(36)}`;
}

/** 日本語テキストのbigram類似度（Jaccard係数）でカニバリを検出 */
export function titleSimilarity(a: string, b: string): number {
  const toBigrams = (s: string): string[] => {
    const chars = Array.from(s.replace(/\s+/g, ""));
    const result: string[] = [];
    for (let i = 0; i < chars.length - 1; i++) {
      result.push(chars[i] + chars[i + 1]);
    }
    return result;
  };
  const arrA = toBigrams(a);
  const arrB = toBigrams(b);
  if (arrA.length === 0 || arrB.length === 0) return 0;
  const setB = new Set(arrB);
  let intersection = 0;
  const seen = new Set<string>();
  for (let i = 0; i < arrA.length; i++) {
    if (!seen.has(arrA[i]) && setB.has(arrA[i])) {
      intersection++;
      seen.add(arrA[i]);
    }
  }
  const unionSet = new Set(arrA.concat(arrB));
  return unionSet.size > 0 ? intersection / unionSet.size : 0;
}

export interface GeneratedArticle {
  title: string;
  seoTitle: string;
  metaDescription: string;
  htmlContent: string;
  keyword: string;
  themeLabel: string;
  slug: string;
  focusKeyword: string;
  tags: string[];
  faqSchema: { question: string; answer: string }[];
  products: { name: string; description?: string; brand?: string; price?: number; url?: string; rating?: number; reviewCount?: number }[];
  seoNotes?: {
    primaryKeyword?: string;
    secondaryKeywords?: string[];
    searchIntent?: string[];
    titleAngle?: string;
    latentNeeds?: string[];
  };
  internalLinks?: { anchorText: string; targetHint: string; placementReason: string; linkRole?: "parent" | "child" | "money" | "related" }[];
  externalSources?: { label: string; url: string; sourceType: string; citationReason: string }[];
  auditSummary?: { score: number; topRisks: string[]; nextFixes: string[] };
  imageSeo?: { position: string; imageIntent: string; fileNameHint: string; alt: string }[];
  eyecatchUrl?: string;  // アイキャッチ画像URL（生成後に設定）
}

export type { TargetAge } from "./config";

const CURRENT_YEAR = new Date().getFullYear();

export const STRICT_REFERENCES_BLOCK = `
## 参考文献・出典の記載（SEO/E-E-A-T強化・必須）
- 新たに追加した事実・数値・成分作用・施術説明・ガイドライン言及には、必ず対応する外部リンクURLを付けること
- 参考文献・公的情報・研究・公式サイトを引用する場合は、必ず外部リンクURLを本文または参考文献欄に含めること。URLが不明な出典は記載禁止
- 組織名だけの疑似出典は禁止。出典を書くなら該当URLまで明示する
- 参考文献は最低2件、最大5件。一次情報、公的機関、学会、論文、公式サイトを優先する
- 参考文献リンクは編集目的の外部リンクとして rel="noopener noreferrer nofollow" を付ける
- アフィリエイトリンクにのみ rel="nofollow sponsored" を使う。参考文献リンクに sponsored は付けない
- 架空の論文名・URL・著者名・公開年は絶対に記載しない
- URLを確認できない参考文献は件数合わせで入れない

### 参考文献セクションのHTML形式
\`\`\`html
<div class="references">
  <p class="references__title">参考文献</p>
  <ul class="references__list">
    <li><a href="https://example.com/source-1" rel="noopener noreferrer nofollow" target="_blank">出典1の名称</a> - この出典を引用した理由</li>
    <li><a href="https://example.com/source-2" rel="noopener noreferrer nofollow" target="_blank">出典2の名称</a> - この出典を引用した理由</li>
  </ul>
</div>
\`\`\`
`;

export const ARTICLE_GENERATION_SEO_ADDON_BLOCK = `
## 共通SEO設計（全記事生成で必須）
- 本文を書く前に検索意図を Know / Compare / Do / Trust の4視点で整理し、最優先意図を1つ決めること
- 主キーワード1個、補助キーワード3〜6個、共起語6〜12個を想定し、タイトル・導入文・H2・FAQ・まとめで役割を分けて自然に反映すること
- 読者の潜在ニーズを2〜5個推測し、比較・注意点・FAQ・次行動の案内で補完すること
- H2ごとに役割を分け、結論、理由、比較、注意点、向いている人、FAQ、次に読む記事の流れを整理すること
- 内部リンクは件数稼ぎではなく、親記事 / 子記事 / 収益記事の役割を意識して配置すること
- 参考文献・公的情報・研究・公式サイトを使う場合は、必ず実URL付きで記載すること。URL不明の出典は書かないこと

## 追加JSONフィールド（既存JSON契約は維持したまま、可能なら追加）
\`\`\`json
{
  "seoNotes": {
    "primaryKeyword": "主キーワード",
    "secondaryKeywords": ["補助キーワード1", "補助キーワード2"],
    "searchIntent": ["Know", "Compare"],
    "titleAngle": "タイトルの訴求角度",
    "latentNeeds": ["検索者の潜在ニーズ1", "検索者の潜在ニーズ2"]
  },
  "internalLinks": [
    {
      "anchorText": "アンカーテキスト",
      "targetHint": "リンク先記事タイトルやテーマ",
      "placementReason": "その位置に置く理由",
      "linkRole": "parent"
    }
  ],
  "externalSources": [
    {
      "label": "出典名",
      "url": "https://example.com",
      "sourceType": "official",
      "citationReason": "どの主張の根拠に使ったか"
    }
  ],
  "imageSeo": [
    {
      "position": "導入直後",
      "imageIntent": "比較表",
      "fileNameHint": "vitamin-c-comparison-table",
      "alt": "ビタミンC系成分の違いをまとめた比較表"
    }
  ]
}
\`\`\`
- 追加した optional fields は、本文で実際に採用した内容に合わせて記載すること
- imageSeo は画像を入れるべき位置がある場合だけ記載すればよい
`;

const SEO_REWRITE_SHARED_BLOCK = `
## SEO設計プロセス（全SEO系モード共通・必須）
- まず検索意図を Know / Compare / Do / Trust の4視点で整理し、この検索で何を先に答えるべきかを明確にする
- 主キーワード1個、補助キーワード3〜6個、共起語6〜12個を決め、それぞれの役割を分けて自然に配置する
- タイトル、導入文、H2、FAQ、まとめで同じキーワードを機械的に繰り返さず、役割ごとに言い換える
- 各H2は主キーワードの別角度を担当させ、見出し重複を避ける
- 上位表示目的の編集では「読者が次に知りたいこと」をH2単位で補完し、情報欠落を埋める
- 体験談・事実・出典・比較・FAQを混同しない。主張には根拠、比較には基準、注意点には条件を置く
- タイトルはCTR狙いだけでなく、検索意図との一致を最優先すること
- FAQは本文の焼き直しではなく、PAAを狙う補完質問にすること
- 内部リンクは数を増やすことが目的ではなく、検索ユーザーの次の疑問を解決する導線として配置すること
`;

const SEO_REWRITE_JSON_BLOCK = `
## JSON出力（これだけ出力。他のテキスト不要）
\`\`\`json
{
  "title": "SEO最適化タイトル",
  "metaDescription": "120〜160文字程度のメタディスクリプション",
  "htmlContent": "完成したHTML本文",
  "slug": "english-seo-slug",
  "focusKeyword": "メインキーワード",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "faq": [
    { "question": "質問1", "answer": "回答1" },
    { "question": "質問2", "answer": "回答2" },
    { "question": "質問3", "answer": "回答3" }
  ],
  "products": [
    { "name": "商品名", "description": "特徴", "brand": "ブランド", "price": 3980, "rating": 4.5, "reviewCount": 100 }
  ],
  "seoNotes": {
    "primaryKeyword": "主キーワード",
    "secondaryKeywords": ["補助キーワード1", "補助キーワード2"],
    "searchIntent": ["Know", "Compare"],
    "titleAngle": "タイトルの訴求角度"
  },
  "internalLinks": [
    { "anchorText": "アンカーテキスト", "targetHint": "リンク先記事タイトルやテーマ", "placementReason": "この位置に置く理由" }
  ],
  "externalSources": [
    { "label": "出典名", "url": "https://example.com", "sourceType": "official", "citationReason": "何の根拠として使ったか" }
  ]
}
\`\`\`
- htmlContentは記事全文を最後まで省略せず出力する
- seoNotes / internalLinks / externalSources は、本文で実際に採用した内容に合わせて記載する
`;

// ----- 動的な日付ラベル生成（JST基準） -----
function getJstNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 9 * 60 * 60 * 1000);
}

function getDateLabels(): { year: number; month: number; monthLabel: string; halfLabel: string; seasonLabel: string; quarterLabel: string } {
  const jst = getJstNow();
  const year = jst.getFullYear();
  const month = jst.getMonth() + 1;

  const monthLabel = `${year}年${month}月`;
  const halfLabel = month <= 6 ? `${year}年上半期` : `${year}年下半期`;

  const seasonMap: Record<number, string> = {
    1: "冬", 2: "冬", 3: "春", 4: "春", 5: "春",
    6: "夏", 7: "夏", 8: "夏", 9: "秋", 10: "秋", 11: "秋", 12: "冬",
  };
  const seasonLabel = `${year}年${seasonMap[month]}`;

  const quarterMap: Record<number, string> = {
    1: "Q1", 2: "Q1", 3: "Q1", 4: "Q2", 5: "Q2", 6: "Q2",
    7: "Q3", 8: "Q3", 9: "Q3", 10: "Q4", 11: "Q4", 12: "Q4",
  };
  const quarterLabel = `${year}年${quarterMap[month]}`;

  return { year, month, monthLabel, halfLabel, seasonLabel, quarterLabel };
}

// ----- 吹き出しブロック（全記事共通・ON/OFF切替） -----
export function buildBalloonBlock(authorIconUrl?: string, authorName?: string): string {
  const name = authorName || "みお";
  const iconHtml = authorIconUrl
    ? `<img src="${authorIconUrl}" alt="${name}" width="60" height="60" style="width:60px;height:60px;border-radius:50%;border:2px solid #FFE066;object-fit:cover;display:block" />`
    : `<div style="width:60px;height:60px;border-radius:50%;background:#FFE066;display:flex;align-items:center;justify-content:center;font-size:24px">👩</div>`;

  // Google Fonts Kosugi Maru（丸ゴシック）を記事内で読み込み
  const fontLink = `<link href="https://fonts.googleapis.com/css2?family=Kosugi+Maru&display=swap" rel="stylesheet">`;

  return `
## 重要：筆者の吹き出しコメント（必ず実行すること）
記事内の要所に筆者のコメントを吹き出し形式で3〜5箇所挿入してください。

### フォント読み込み（記事HTML冒頭に1回だけ挿入すること）
${fontLink}

### 吹き出しHTML（このHTMLを1つの吹き出しとして使う。「ここに筆者のコメント」部分だけ書き換える）
**重要: 必ず <!-- wp:html --> と <!-- /wp:html --> で囲むこと（WordPressの自動整形を防ぐため）**

<!-- wp:html -->
<div style="display:flex;align-items:flex-start;gap:14px;margin:20px 0;padding:0;clear:both"><div style="flex-shrink:0;width:68px;text-align:center">${iconHtml}<div style="font-size:11px;color:#888;margin-top:1px;font-family:'Kosugi Maru',sans-serif">${name}</div></div><div style="position:relative;background:#FFF9E5;border:2px solid #FFE066;border-radius:16px;padding:10px 16px;flex:1;max-width:calc(100% - 82px);margin-top:12px;font-family:'Kosugi Maru',sans-serif;font-size:15px;line-height:1.6;color:#333;box-sizing:border-box"><div style="position:absolute;left:-10px;top:16px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:10px solid #FFE066"></div><div style="position:absolute;left:-7px;top:16px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:10px solid #FFF9E5"></div>ここに筆者のコメント</div></div>
<!-- /wp:html -->

### 吹き出しの挿入ルール
- 「ここに筆者のコメント」を筆者の感想・アドバイス・体験談に置き換える
- 1記事に3〜5箇所挿入（多すぎ・少なすぎ禁止）
- コメントは50-100文字程度の一言感想
- 記事の流れに合わせた自然なコメントにする
- **重要: コメント部分を<p>タグで囲まないこと（テキストを直接書く）**
- **重要: 吹き出しHTMLは必ず <!-- wp:html --> と <!-- /wp:html --> で囲むこと**
- **重要: 吹き出しのdivは改行を入れず1行で書くこと（WordPressが改行を<p>に変換するため）**
- フォント読み込みの<link>タグは記事HTML冒頭に1回だけ挿入する（吹き出しごとに入れない）
- 例: 「正直、最初は半信半疑だったけど、使ってみたら想像以上でした！」
- 例: 「ここは個人差があるので、敏感肌の方はパッチテスト推奨です」
`;
}

/**
 * 吹き出しHTMLのアイコンを強制的に正しいものに差し替える（Claude生成後の後処理）
 * Claudeがテンプレートを改変してアイコンが欠落・変更されるケースに対応
 */
export function fixBalloonIcons(html: string, authorIconUrl?: string, authorName?: string): string {
  if (!authorIconUrl) return html;
  const name = authorName || "みお";
  const correctIconHtml = `<img src="${authorIconUrl}" alt="${name}" width="60" height="60" style="width:60px;height:60px;border-radius:50%;border:2px solid #FFE066;object-fit:cover;display:block" />`;

  // パターン1: 絵文字デフォルトアイコン（👩 div）を正しいGravatar imgに差し替え
  let fixed = html.replace(
    /<div style="[^"]*width:60px;height:60px;border-radius:50%;background:#FFE066[^"]*">[^<]*<\/div>/g,
    correctIconHtml,
  );

  // パターン2: 吹き出しブロック内のimgタグのsrcがGravatarでない場合に修正
  // 吹き出し構造: display:flex;align-items:flex-start;gap:14px 内の最初のimg
  fixed = fixed.replace(
    /(<div style="[^"]*display:\s*flex;align-items:\s*(?:flex-start|center);gap:\s*14px[^"]*">[\s\S]*?)<img\s+src="(?!data:)[^"]*"\s+alt="[^"]*"[^>]*?style="[^"]*border-radius:\s*50%[^"]*"[^>]*?\/?>/g,
    (match, prefix) => {
      // 既にGravatarのURLが含まれていればスキップ
      if (match.includes(authorIconUrl)) return match;
      return match.replace(/<img\s+src="(?!data:)[^"]*"\s+alt="[^"]*"[^>]*?style="[^"]*border-radius:\s*50%[^"]*"[^>]*?\/?>/,
        correctIconHtml);
    },
  );

  // パターン3: 吹き出しブロック内にimgがなく、名前だけある場合にアイコンを挿入
  fixed = fixed.replace(
    /(<div style="[^"]*flex-shrink:\s*0;width:\s*68px;text-align:\s*center[^"]*">)(\s*<div style="[^"]*font-size:\s*11px)/g,
    `$1${correctIconHtml}$2`,
  );

  return fixed;
}

// ----- 法令遵守ブロック（全記事共通） -----
export const COMPLIANCE_BLOCK = `
## 法令遵守ルール（必ず守ること）
以下に違反する表現は絶対に使わないでください：

### 薬機法
- 化粧品の効能を逸脱する表現（「シミが消える」「シワが治る」等）は禁止
- 医薬品的な効能効果の断定は禁止（「確実に改善」「必ず治る」等）
- 「最強」「日本一」等の最大級表現は禁止
- 医師推薦を装う表現は禁止

### 景表法（優良誤認・有利誤認）
- 根拠なき効果保証（「誰でも簡単に」「短期間で必ず」等）は禁止
- Before/Afterで効果を保証する表現は禁止（ビフォーアフター写真・数値の明示禁止）
- 比較記事では条件・根拠を明示し、一方的に優劣をつけない

### ランキング根拠明記（景表法対応）
- ランキング記事・比較記事では冒頭に「選定基準」を必ず明記する
- 例：「本記事は、料金・口コミ評価・施術実績数を当サイト独自に調査し総合評価しています」
- 順位の根拠が不明確なランキングは作成しない

### 年数の表記ルール（厳守）
- 記事内で年数を表記する場合、必ず現在の西暦${CURRENT_YEAR}年を使うこと
- 絶対に過去の年数（${CURRENT_YEAR - 1}年以前）を使わないこと
- 「最新」と表記する場合は必ず「${CURRENT_YEAR}年最新」とすること
- タイトル・本文・FAQ全てにおいてこのルールを適用すること
- 商品の発売年に言及する場合のみ過去の年数を使ってよい（例：「2024年に発売された〇〇」）

### ステマ規制（2023年10月施行）
- 記事はアフィリエイト広告を含むことを前提に書く
- 誠実で公平な情報提供を心がける
- アフィリエイトリンクには rel="nofollow sponsored" を必ず付与する
- 「広告」「PR」「提携」いずれかの表記を含める

### 体験談・口コミの表現ルール
- 体験談を記載した直後に「※ 効果には個人差があります」を必ず付ける
- 「〇〇人が効果を実感」等の数値は根拠がない限り使用禁止
- 口コミ引用は「個人の感想であり、効果を保証するものではありません」と注記

### 使用期間の表現ルール（重要：矛盾防止）
- 商品の発売日が不明なため、具体的な長期間の使用を断言しないこと
- NG例：「3ヶ月使い続けた結果」「半年間愛用して」「1年使ってみた」
- OK例：「最近使い始めて」「しばらく使ってみて」「数週間試してみた」「使い始めてから」
- 施術やクリニック系は「先日体験してきた」「実際に受けてみた」のように1回体験ベースにする
- 楽天レビューの口コミを引用する場合は「購入者の口コミでは」「利用者のレビューによると」とし、自分の体験として語らない
- 具体的な日数・月数を書く場合は短期間（「1〜2週間」「数日間」）に限定する

### 代替表現ガイド
- 「治る」→「ケアをサポート」「整える」
- 「効果がある」→「〇〇が期待できる」「〇〇にアプローチ」
- 「おすすめNo.1」→「〇〇な方に向いている」
- 「医師も推薦」→「皮膚科でも使われている成分」
- 「確実に」「絶対に」→「〇〇が見込める」「〇〇の可能性がある」
- 料金・回数は「目安」「一般的には」と但し書きを付ける

### 黄色マーカー（重要箇所のハイライト）
- 読者にとって特に重要な情報には黄色マーカーを引くこと
- 1記事あたり3〜5箇所が目安（多すぎると効果が薄れる）
- HTML形式: <span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- マーカーを引くべき箇所：
  - 結論・まとめのポイント（「〇〇が最もおすすめ」）
  - 注意点・警告（「〇〇には注意が必要です」）
  - 読者が最も知りたい回答（「結論から言うと〇〇です」）
  - 数値・価格・期間（「約¥3,000〜¥5,000が目安」）
  - 比較記事の結論（「コスパを重視するなら〇〇」）
- マーカーを引いてはいけない箇所：
  - 見出し（h2/h3）には使わない
  - リンクテキストには使わない
  - 1文が長すぎるテキスト（短いフレーズに限定）
`;

// ----- Google AdSense審査対応：独自性・有用性の担保 -----
export const ADSENSE_QUALITY_BLOCK = `
## Google AdSense審査対応：有用性の高いコンテンツ要件（最重要）
Googleが「有用性の低いコンテンツ」と判定しないよう、以下を全て満たしてください。

### ① 独自の視点・分析を必ず含める
- 検索すれば誰でも見つかる情報だけの記事は禁止
- 以下の「独自価値」を最低2つ以上記事に含めること：
  - 「なぜその成分が◯◯に効くのか」の仕組みの解説（メカニズム）
  - 「◯◯な人には向かない」という具体的な適性・不適性の判断基準
  - 複数の選択肢を「こういう状況ならこっち」と条件付きで整理した独自の分類
  - 一般的に言われていることへの「ただし、◯◯という点は注意が必要」という補足
  - 成分・価格・口コミを組み合わせた独自の評価軸

### ② 深みのある解説（薄い内容禁止）
- 各H2セクションは最低200文字以上の本文を含める（箇条書きのみは禁止）
- 「◯◯がおすすめです」で終わる説明は禁止。必ず「なぜなら〜だから」という理由を添える
- 成分・技術・施術について説明する際は「仕組み」まで踏み込む
  - NG例：「ヒアルロン酸配合で保湿力が高い」
  - OK例：「ヒアルロン酸は自重の6000倍の水分を保持できる成分で、角層に水分を留めることで翌朝のもっちり感が持続しやすくなります」

### ③ 読者の疑問に完全回答（検索意図の完全充足）
- 記事を読み終えた読者が「他のサイトも見る必要がない」状態にする
- 読者が抱きそうな次の疑問（「でも◯◯な場合は？」）を先回りして答える
- 「専門家への相談が必要なケース」を明示して読者の安全を守る

### ④ 人間らしい文体（AI的な定型文を排除）
- 以下の表現パターンは使用禁止（AIと見抜かれる典型表現）：
  - 「〇〇について詳しく解説します」「まとめると以下の通りです」
  - 「〇〇は非常に重要です」「〇〇には様々な種類があります」
  - 「以上を踏まえると」「結論として」（接続詞として使う場合は可）
  - 見出しと全く同じ内容を本文冒頭で繰り返す
- 読者に語りかける自然な口語体を意識する（「〜ではないでしょうか」「気になりますよね」等）
- 一文の長さにメリハリをつける（短い文と長い文を混在させる）

### ⑤ コンテンツ量の確保
- htmlContentの文字数：**最低3500字、目標5000字以上**
- H2セクション数：6〜8個
- 比較・ランキング記事は各商品に300字以上の独自解説を設ける

### ⑥ ユーザーファースト原則（収益より価値を前面に）
- 記事の最初の1000文字はアフィリエイトリンクや広告表示なし
- 記事の目的は「読者の悩みを解決すること」であり、商品販売は手段に過ぎない
- デメリット・向いていない人の説明を必ず含め、中立的な情報提供者として振る舞う
- 読者が「この記事を読んでよかった」と感じる具体的な知識・気づきを1つ以上提供する
`;

// ----- 参考文献・出典の記載指示（E-E-A-T強化） -----
export const REFERENCES_BLOCK = `
## 参考文献・出典の記載（必須）
- 成分の効果や施術の説明には、根拠となる情報源を本文中に自然に記述すること
- 以下のいずれかの形式で出典を組み込む：
  - 「○○皮膚科学会のガイドラインによると」
  - 「○○メーカーの公式サイトによると」
  - 「○○研究（○○誌、○○年）では」
- 記事末尾（FAQの後、まとめの前後）に参考文献セクションを設ける
- 最低2件、最大5件の出典を記載
- 架空の論文名・URL・著者名は絶対に記載しない。特定できる場合のみ記載する
- URLが特定できない場合は「○○公式サイト」「○○学会ガイドライン」等の組織名のみで可

### 参考文献セクションのHTML形式
\`\`\`html
<div class="references">
  <p class="references__title">参考文献</p>
  <ul class="references__list">
    <li>出典1の説明</li>
    <li>出典2の説明</li>
  </ul>
</div>
\`\`\`
`;

// ----- 体験有無に応じた記事トーン指示 -----
function buildExperienceBlock(hasExperience: boolean, experienceNote: string): string {
  if (hasExperience) {
    return `## 筆者の実体験について（重要）
この商品は筆者が**実際に使用した体験があります**。以下の体験メモをもとに、リアルな使用感を記事に反映してください。

【筆者の体験メモ】
${experienceNote || "（詳細メモなし — 「実際に使ってみた」という前提で書いてください）"}

### 体験ベースの記事ルール
- 「実際に使ってみて」「使い始めてから」など、体験者の視点で書いてよい
- 体験メモに書かれている感想・使用感を自然に織り交ぜる
- 体験メモにない情報を捏造しない（「3ヶ月使った」等、メモにない期間を断言しない）
- 体験談の後に「※ 個人の感想であり、効果を保証するものではありません」を付ける
- 体験メモの内容を大げさにしない（「すごく良かった」→「個人的には気に入った」程度に）`;
  } else {
    return `## 筆者の体験について（重要）
この商品は筆者が**まだ使用していません**。以下のトーンで記事を書いてください。

### 未体験の記事ルール（必ず守ること）
- 「実際に使ってみた」「使ってみて感じた」等の体験者視点の表現は**絶対に使わない**
- 代わりに以下の視点で書く：
  - 「美容情報を調べている中で見つけた」
  - 「口コミで評判が良かったので気になっている」
  - 「成分や特徴を調べてみたところ、良さそうだと感じた」
  - 「今度実際に試してみたいと思っている」
  - 「購入者のレビューを見ると〇〇という声が多い」
- 楽天レビューの口コミがある場合は「購入者の口コミによると」「レビューでは」と第三者の声として紹介
- 記事の締めは「気になった方はぜひチェックしてみてください」のようなニュアンスにする
- 「おすすめです！」のような断定的な推薦は避け、「気になる方は試してみる価値がありそうです」程度にする`;
  }
}

// ----- 価格帯に応じた文体・訴求ポイント指示 -----
function buildPriceToneBlock(pricePreset?: string): string {
  switch (pricePreset) {
    case "budget":
      return `## 価格帯に応じた文体指示（コスパ重視・¥1,000-5,000）
- 読者は予算を重視する20代〜美容初心者
- 「プチプラなのに優秀」「コスパ最強」「ドラッグストアで買える」等のワードが響く
- 「高い化粧品＝良い」ではないことを伝え、賢い買い物を応援する姿勢
- 比較ポイントは「コスパ」「使いやすさ」「入手しやすさ」を重視
- 「まずはこれから試してみて」のような入門的なトーン
- 1000円台で買えることの嬉しさ・お得感を自然に表現する
- カジュアルで親しみやすい文体（「〜だよ」「〜かも！」は使わず、ですます調で親近感）`;

    case "balanced":
      return `## 価格帯に応じた文体指示（売れ筋・¥3,000-10,000）
- 読者は「ちょっと良いもの」を求める20-30代のOL・社会人
- 「ワンランク上のケア」「自分へのプチ投資」等の表現が効果的
- コスパと品質のバランスを重視する読者に、納得感のある情報を提供
- 比較ポイントは「成分」「使用感」「価格の妥当性」をバランスよく
- 「毎日使うものだからこそ、ここは少しこだわりたい」という共感型
- デパコスほど高くなく、プチプラより確実な満足感があることを伝える`;

    case "premium":
      return `## 価格帯に応じた文体指示（高単価・¥8,000-20,000）
- 読者は成分・技術にこだわる30-40代の品質重視層
- 「本気のケア」「結果を求める方へ」「成分で選ぶ」等の表現が響く
- 成分名や技術の詳しい解説を求めている（レチノール、ナイアシンアミド等）
- 「安いからではなく、良いから選ぶ」という価値観に寄り添う
- 比較ポイントは「有効成分の濃度」「臨床データ」「皮膚科医の見解」等
- やや専門的だが読みやすい文体。信頼感と知性を感じさせる`;

    case "luxury":
      return `## 価格帯に応じた文体指示（ラグジュアリー・¥20,000以上）
- 読者は美容への投資を惜しまない40代以上のエグゼクティブ層
- 「自分へのご褒美」「最高峰のケア」「特別な一品」等の表現が響く
- ブランドの歴史・哲学・独自技術にフォーカス
- 「値段以上の価値」を感じさせるストーリーテリング
- 比較ポイントは「ブランド力」「独自成分」「テクスチャーの上質さ」「パッケージの美しさ」
- 上品で洗練された文体。焦らせない、余裕のあるトーン`;

    default:
      return ""; // プリセットなし or 全価格帯
  }
}

// ----- ターゲット年代に応じたペルソナ＆文体指示 -----
function buildPersonaBlock(targetAge: TargetAge): string {
  switch (targetAge) {
    case "20s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性の美容ブロガー。20代後半の読者に向けて書く。
- 少し先輩の立場から「20代のうちから知っておくと良い美容知識」を伝える語り口にする。
- 20代の予算感（プチプラ〜ミドルレンジ）を意識した商品選びにする。
- 仕事・恋愛・結婚準備など20代ならではのライフイベントに絡めた悩みに共感する。
- 少し先輩の立場から語る、親近感のあるですます調にする。
- ※ 商品の使用感は「体験有無フラグ」の指示に従うこと（このペルソナ指示で使用を断言しない）
- ターゲット：20代後半女性（社会人〜アラサー）`;

    case "30s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性の美容ブロガー。同世代の読者に向けて書く。
- 美容情報に詳しく、成分や特徴を調べるのが好きな視点で語る。
- 同世代の友達に話すような自然体のトーンにする。
- 品質重視・成分重視の商品選びを意識し、ミドル〜ハイレンジの商品も含める。
- エイジングケア・仕事と家庭の両立・時短など、30代のリアルな悩みに寄り添う。
- 等身大で信頼感のあるですます調にする。
- ※ 商品の使用感は「体験有無フラグ」の指示に従うこと（このペルソナ指示で使用を断言しない）
- ターゲット：30代女性`;

    case "40s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性の美容ブロガー。40代前半の読者に向けて書く。
- 年齢の変化に向き合い、成分や技術の根拠を重視する姿勢で書く。
- エイジングサインへの"本気のケア"を求める読者に応える、信頼感ある文体にする。
- 投資価値のある商品・施術を、根拠（成分・技術・臨床データの有無）とともに紹介する。
- たるみ・シミ・肝斑・ほうれい線など、40代に顕在化しやすい悩みに具体的に触れる。
- 丁寧で落ち着いた、でも親しみのあるですます調にする。
- ※ 商品の使用感は「体験有無フラグ」の指示に従うこと（このペルソナ指示で使用を断言しない）
- ターゲット：40代前半女性`;
  }
}

// ----- 記事タイプ別の構成指示 -----
function buildArticleTypeBlock(articleType: string): string {
  switch (articleType) {
    case "comparison":
      return `## 記事タイプ：比較・選び方ガイド【売る記事】
- 導入文で「何を基準に選べば失敗しないか」を提示
- 比較軸を3〜4つ明示（料金目安・回数目安・ダウンタイム・特徴など）
- <table>で比較一覧を作成（※料金は「目安」「一般的な相場」と明記）
- 各選択肢を<h3>で個別解説（メリット・注意点を公平に）
- まとめで「こんな方にはこれが向いている」という提案型CTAにする`;

    case "ranking":
      return `## 記事タイプ：ランキング記事【売る記事】
- 冒頭に選定基準を必ず明記する：「本記事のランキングは、料金・口コミ評価・施術実績・成分などを当サイト独自に調査し、総合的に評価して作成しています」
- 「選定基準」は<div class="ranking-criteria">で囲む
- ランキング形式で5〜7項目を<h3>で紹介（1位から順に）
- 各項目に「おすすめポイント」「注意点」「料金目安」「こんな人に向いている」を含める
- <table>で全項目の比較一覧表を作成
- 各ランキング項目の直後にアフィリエイトCTAを配置
- まとめで「目的別おすすめ」を簡潔に再提示`;

    case "review":
      return `## 記事タイプ：レビュー記事【売る記事】
- 導入文で「この商品/施術に注目した理由」を提示
- 商品の特徴・成分・スペックを客観的に解説
- メリット3〜4点、デメリット/注意点2〜3点を公平に記載
- 「※ 効果には個人差があります」をレビュー後に必ず記載
- 他の選択肢との簡単な比較（1〜2文程度）
- 料金・購入方法・返金保証の有無を明記
- まとめで「こんな方におすすめ」+購入CTA
- ※ 筆者の使用感は「体験有無フラグ」の指示に従うこと。フラグが未体験の場合は体験談を書かない`;

    case "qa":
      return `## 記事タイプ：Q&A（悩み→結論→理由→注意点）
- 導入文で読者の具体的な悩み・疑問を提示
- 結論を先に述べる（PREP法）
- 理由・根拠を2〜3点示す
- 注意点・リスク・よくある誤解を必ず含める
- 「こんな場合は専門家に相談」という但し書きを適宜入れる`;

    case "howto":
      return `## 記事タイプ：ハウツー・選び方【集める記事】
- 導入文で「正しい選び方を知らないとこうなる」という問題提起
- ステップ形式または選び方のポイントを<h2>で構成
- 各ステップに具体例と注意点を含める
- 成分・技術の基礎知識を分かりやすく解説
- おすすめ商品は「条件別の提案」として紹介（ランキングの根拠が薄い形は避ける）
- 関連する比較記事・ランキング記事への内部リンクを自然に3〜5箇所配置`;

    case "problem-solving":
      return `## 記事タイプ：悩み解決記事【集める記事】
- 導入文で読者の悩みに深く共感する（「○○で悩んでいませんか？」）
- 悩みの原因を3〜4つ分析（医学的根拠や一般的な知見をベースに）
- 各原因に対する解決策を具体的に提示
- セルフケア（ホームケア）と専門的ケア（クリニック・専門商品）の両方を紹介
- セルフケアパートでは手軽な方法を紹介しつつ、限界も正直に伝える
- 専門的ケアパートで関連するクリニック比較記事・商品ランキング記事への内部リンクを配置
- アフィリエイトCTAは控えめに（記事末尾に1箇所のみ）
- 関連する比較記事・ランキング記事への内部リンクを自然に3〜5箇所配置`;

    case "trend":
      return `## 記事タイプ：トレンド記事【集める記事】
- 導入文で「今なぜこれが注目されているのか」を提示
- SNSや美容業界でのトレンド背景を解説
- トレンドの具体的な内容・方法を紹介
- メリットと注意点を公平に記載
- 「始めるならまずこれから」という入門的なアドバイス
- 関連する詳細比較記事・ランキング記事への内部リンクを配置
- アフィリエイトCTAは控えめに（記事末尾に1箇所のみ）`;

    case "guide":
    default:
      return `## 記事タイプ：完全ガイド（ピラー記事）
- 導入文でこのテーマの全体像を提示
- 原因・種類・治療法/ケア法を体系的に解説
- 費用の目安・期間・リスクを公平に記載
- よくある質問（FAQ）セクションを含める
- 関連テーマへの内部リンクを意識した構成にする
- 文字数は多めに（5000〜7000字目安）`;
  }
}

// ----- 記事意図別のCTA配置指示 -----
function buildCtaBlock(articleIntent: "uru" | "atsumeru", themeId: string): string {
  return `## アフィリエイトリンク＆関連記事の配置ルール
記事冒頭に「<div class="pr-notice" style="font-size:11px;color:#999;margin-bottom:16px;">PR：本記事にはアフィリエイト広告が含まれています</div>」を含める（小さく目立たない形で）。

### アフィリエイトリンクの最適配置（CVR最大化）
アフィリエイトリンクは以下の「読者の購買意欲が最も高まるポイント」に配置してください：

配置ルール（優先度順）：
1. **商品の個別レビュー直後**（最重要）：各商品の「こんな人におすすめ」の直後に配置。読者が「自分に合う」と感じた直後が最もクリック率が高い
2. **比較表の直後**：比較を見終えて「じゃあどれにしよう」と思った瞬間
3. **まとめ・結論セクション内**：最後の一押し

形式：「<p class="affiliate-placeholder">【アフィリエイトリンク挿入予定】</p>」
- ${articleIntent === "uru" ? "売る記事なので2〜3箇所に配置" : "集める記事なので1箇所のみ（記事末尾）"}

### 配置してはいけない場所
- 記事の冒頭（読者がまだ情報を読んでいない段階）
- FAQ内（Q&Aの流れを断ち切る）
- 注意点・デメリットの直後（ネガティブな印象の直後）

### 関連記事リンク（1〜2箇所）
- 形式：「<p class="internal-link-suggestion">▶ 【関連記事】{関連するテーマの記事タイトル例}</p>」
- 配置場所：セクション間、悩み解決の提案後、まとめの前など
- このテーマ（${themeId}）に関連する別テーマの記事タイトルを考えて配置
- 「詳しく知りたい方はこちら」「比較記事もチェック」など導入文付きで自然に配置
- ${articleIntent === "atsumeru" ? "集める記事なので関連記事リンクを多めに（2箇所）" : "売る記事でも関連記事を1箇所は入れる"}`;
}

// ----- 記事タイプ別タイトル指示 -----
function buildTitleInstruction(articleType: string): string {
  const d = getDateLabels();

  // 記事タイプに応じて適切な日付ラベルを選択
  // 比較・ランキング → 月 or 半期 / レビュー → なし / トレンド → 季節 / ハウツー → なし
  const titlePatterns: Record<string, string> = {
    comparison: `タイトルに日付を入れる場合は「${d.monthLabel}」「${d.halfLabel}」「${d.year}年最新」のいずれかを使い分ける。
- 例：「【${d.monthLabel}最新】○○おすすめ△選｜後悔しない選び方」
- 例：「【${d.halfLabel}版】○○を徹底比較｜コスパ最強はどれ？」
- 毎回同じ形にせず、キーワードに応じて自然な形を選ぶ`,
    ranking: `タイトルに日付を入れる場合は「${d.monthLabel}」「${d.halfLabel}」のいずれかを使い分ける。
- 例：「${d.monthLabel}版 ○○人気ランキング△選｜本当に良かったのは…」
- 例：「【${d.halfLabel}】○○おすすめランキング｜□□目線で厳選」
- ランキングの根拠（選定基準）がタイトルから伝わるようにする`,
    review: `タイトルに年月は基本不要。商品名＋体験感＋正直さを強調する。
- 例：「○○を30代が本音レビュー｜${d.month}ヶ月使った正直な感想」
- 例：「話題の○○を実際に試してみた｜期待はずれ？それとも…」`,
    howto: `タイトルに年月は基本不要。具体的な手順数や注意点を含める。
- 例：「○○の正しいやり方□ステップ｜プロが教える失敗しないコツ」
- 例：「知らないと損する○○の選び方｜△△との違いも解説」`,
    qa: `タイトルに年月は基本不要。疑問形＋専門性を含める。
- 例：「○○って実際どうなの？美容のプロが本音で解説」
- 例：「○○のよくある誤解△つ｜正しい知識で賢くケア」`,
    "problem-solving": `タイトルに年月は基本不要。悩み共感＋原因提示＋解決を含める。
- 例：「○○が治らないのはなぜ？意外な原因と正しい対処法」
- 例：「△△世代の○○悩みを解決｜今日からできる□つの習慣」`,
    trend: `タイトルに季節感を入れる場合は「${d.seasonLabel}」「${d.monthLabel}」を使う。
- 例：「【${d.seasonLabel}トレンド】今話題の○○って何？注目の理由を解説」
- 例：「${d.monthLabel}の注目コスメ｜SNSで話題の○○を調査」`,
    guide: `タイトルに年を入れる場合は「${d.year}年版」を使う。
- 例：「○○完全ガイド｜初めてでも分かる基礎知識まとめ」
- 例：「【${d.year}年版】○○の始め方｜費用・期間・選び方を網羅」`,
  };

  const instruction = titlePatterns[articleType] || titlePatterns.guide;

  return `## タイトルの要件
${instruction}
- 32文字以内を目安にする（Google検索結果で省略されない長さ）
- メインキーワードをタイトル前半に含める
- 他の記事と被らない、このテーマ・キーワード固有のユニークなタイトルにする
- 【】や｜を使ってメリハリをつける
- 「徹底比較」「完全ガイド」等の定型句ばかりにならないよう、言い回しを工夫する
- 日付の入れ方はパターンを参考に、最も自然な形を選ぶ（必ず入れる必要はない）`;
}

// ----- 内部リンク挿入ブロック（既存記事URLベース） -----
function buildInternalLinkBlock(existingPosts?: { title: string; url: string }[]): string {
  if (!existingPosts || existingPosts.length === 0) {
    return `## 内部リンク
サイト内の関連記事がまだないため、内部リンクプレースホルダーのみ配置してください。
- 形式：「<p class="internal-link-suggestion">▶ 【関連記事】{関連するテーマの記事タイトル例}</p>」
- 1〜2箇所に配置`;
  }

  const postList = existingPosts.map((p, i) => `${i + 1}. 「${p.title}」 → ${p.url}`).join("\n");

  return `## 内部リンク（SEO最重要 — 必ず実行すること）
以下はサイト内の既存記事一覧です。この中から関連性の高い記事を選んで**必ず内部リンクを挿入**してください。

### 既存記事リスト
${postList}

### 内部リンク挿入ルール（厳守）
1. **必ず3〜5箇所**の内部リンクを本文中に挿入すること（0箇所はNG）
2. リンク形式: <a href="記事URL" style="color:#7c3aed;text-decoration:underline;font-weight:500;">アンカーテキスト</a>
3. **アンカーテキスト**: リンク先の記事内容を表す自然なフレーズ（2〜15文字）。「こちら」「この記事」は絶対NG
4. 配置場所: 本文中の関連トピックに言及している箇所に自然に溶け込ませる
5. 加えて、各H2セクション末尾付近に関連記事ボックスを1〜2箇所配置:
   <div class="internal-link-box" style="background:#f8f0ff;border-left:4px solid #9b59b6;padding:12px 16px;margin:16px 0;border-radius:4px;font-size:14px;">
     <a href="記事URL" rel="noopener" style="color:#7c3aed;text-decoration:none;font-weight:bold;">▶ 【関連記事】記事タイトル</a>
   </div>
6. **存在しないURLへのリンクは絶対に作らない**。上記リストにある記事のみリンクすること
7. 同じ記事への重複リンクは最大2回まで（インライン1回＋ボックス1回）
8. 記事の上部（導入文〜最初のH2）に最も重要な関連記事リンクを配置する（SEOクロール優先度が高い）`;
}

// ----- 自動生成用プロンプト -----
function buildAutoPrompt(keyword: string, theme: SubTheme, genreName: string, targetAge: TargetAge, existingPosts?: { title: string; url: string }[]): string {
  const articleIntent = theme.articleIntent || "uru";

  return `あなたはSEOに精通した美容ブログのプロライターです。
以下の条件で、WordPress投稿用の完全なHTML記事を作成してください。

【ブログ名】${genreName}
【カテゴリ】${theme.label}
【メインキーワード】${keyword}
【現在の日付情報】${(() => { const d = getDateLabels(); return `${d.monthLabel}（${d.halfLabel} / ${d.seasonLabel}）`; })()}
【記事タイプ】${theme.articleType}
【記事意図】${articleIntent === "uru" ? "売る記事（CVR重視・アフィリエイト成果直結）" : "集める記事（トラフィック重視・内部リンクで売る記事へ誘導）"}

${buildPersonaBlock(targetAge)}

${buildArticleTypeBlock(theme.articleType)}

${buildTitleInstruction(theme.articleType)}

${ADSENSE_QUALITY_BLOCK}

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

${buildCtaBlock(articleIntent, theme.id)}

${buildInternalLinkBlock(existingPosts)}

## 重要：黄色マーカー装飾（必ず実行すること）
htmlContent内で読者にとって特に重要な箇所に、以下のHTMLタグで黄色マーカーを引いてください：
<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- 1記事あたり3〜5箇所に使用（多すぎNG）
- 結論・注意点・価格・おすすめポイントなど重要な短いフレーズに使う
- 見出し（h2/h3）やリンクには使わない

## 出力形式
以下のJSON形式で出力してください（他のテキストは一切不要）：

\`\`\`json
{
  "htmlContent": "HTML本文",
  "title": "記事タイプに応じたSEO最適化タイトル",
  "metaDescription": "120文字以内のSEOメタディスクリプション",
  "slug": "keyword-based-seo-slug",
  "focusKeyword": "メインのSEOキーワード1つ",
  "tags": ["関連タグ1", "関連タグ2", "関連タグ3"],
  "faq": [
    {"question": "よくある質問1", "answer": "回答1"},
    {"question": "よくある質問2", "answer": "回答2"},
    {"question": "よくある質問3", "answer": "回答3"}
  ],
  "products": [
    {"name": "商品名1", "description": "商品の特徴を1文で", "brand": "ブランド名", "price": 3980, "rating": 4.5, "reviewCount": 120},
    {"name": "商品名2", "description": "商品の特徴を1文で", "brand": "ブランド名", "price": 2980, "rating": 4.2, "reviewCount": 85}
  ]
}
\`\`\`

## SEO最適化の要件
- slug: 必ず英語の小文字+ハイフンのみ。日本語・ローマ字は使わない。記事内容を表す英単語2-4語で構成する。例: whitening-serum-comparison, hair-care-ranking, acne-skincare-guide, medical-hair-removal-tips
- focusKeyword: 記事のメインキーワード1つ（タイトルとh2に含まれる語）
- tags: 記事に関連するSEOタグを3〜5個（サブキーワードやカテゴリ）
- faq: 記事末尾のFAQから3〜5問を抽出（Google FAQリッチスニペット用）
- products: 記事内で紹介した商品のリスト（Google商品リッチリザルト用、3〜5件）
  - name: 商品名、brand: ブランド名、price: 参考価格（数値）、rating: 評価（5点満点）、reviewCount: レビュー件数

## htmlContent の要件
- HTML構造：<h2>大見出し / <h3>小見出し / <p>段落 / <table>比較表 / <ul><li>リスト
- 文字数：3500〜6000字程度（AdSense審査基準を満たすため最低3500字必須）
- 筆者の体験談は「体験有無フラグ」の指示がある場合はそれに従う。フラグ指示がない場合（Cron自動生成）は体験談を入れず、客観的な情報紹介に徹する
- 体験談を入れる場合、直後に「<p class="disclaimer">※ 効果には個人差があります</p>」を入れる
- 料金・回数は「目安」「一般的には」と但し書き必須
- 外部リンクには rel="nofollow sponsored" を付与
- 自然な日本語で、AIっぽさを排除した読みやすい文体
- 「私はこれを愛用しています」「毎日使っています」等の使用断言は体験フラグがない限り禁止

## SEO最適化の高度な要件（Google上位表示のために必須）
### 検索意図の完全カバー
- メインキーワードで検索するユーザーが知りたいことを漏れなく網羅する
- 「何を」「なぜ」「どうやって」「いくらで」「どこで」の5W視点で情報を整理

### LSI（共起語）キーワードの自然な組み込み
- メインキーワードに関連する共起語を記事全体に自然に散りばめる
- 例：「医療脱毛」なら「永久脱毛」「レーザー」「回数」「痛み」「VIO」「全身」等
- 不自然なキーワード詰め込みは避け、文脈に沿った形で使う

### 見出し構造の最適化
- H2見出しにはサブキーワードを含める（読者と検索エンジンの両方に有効）
- H2は5〜7個程度（多すぎず少なすぎず）
- H3で詳細を補足する階層構造を維持

### 導入文（リード文）の最適化
- 最初の100文字以内にメインキーワードを含める
- 読者の悩みに共感し、この記事を読むメリットを明示する
- 「この記事では〇〇について△△の観点から解説します」のような構成予告を含める

### メタディスクリプションの最適化
- 120文字以内でメインキーワードを含める
- 「この記事では」で始めず、読者の悩みに直接アプローチする書き出しにする
- 行動を促す表現を含める（「選び方のポイントも解説」「比較表付き」等）

## FAQ（よくある質問）セクションの要件（重要）
記事末尾に<h2>よくある質問</h2>セクションを必ず含め、<h3>で質問、<p>で回答を記述する。

### FAQの内容ルール
- 読者が実際に検索しそうな疑問を3〜5問作成する
- 回答は記事本文の内容と矛盾しないこと
- 楽天の商品データ（価格・成分・特徴）が提供されている場合、そのデータと矛盾する回答は絶対に書かない
- 回答内で効果を断定しない（「〇〇に効果があります」→「〇〇が期待できるとされています」）
- 価格に言及する場合は「記事執筆時点の参考価格」と注記する

### FAQ禁止事項
- 使用感を問う質問（「使い心地は？」「効果はありましたか？」「実際に使ってみてどうですか？」）は入れない
- FAQでは客観的な質問のみ：「どんな人に向いていますか？」「主な成分は？」「どこで買えますか？」「返品は可能ですか？」等
- 医学的効果を断言する回答は禁止（「シミが消えます」→「シミへのアプローチが期待できます」）
- 捏造した数値（「〇〇%の人が効果を実感」等）は禁止

## Yoast SEO完全対応チェックリスト（必須）
以下の全項目をクリアしてください：

### 1. フォーカスキーフレーズの設定
- focusKeywordフィールドに「メインキーフレーズ（1〜4語）」を必ず設定する
- キーフレーズは検索ボリュームがある自然な日本語表現にする（例：「医療脱毛 おすすめ」「シミケア 美容液」）

### 2. SEOタイトルのキーフレーズ
- seoTitleはフォーカスキーフレーズで**始まる**こと（例：「医療脱毛おすすめクリニック5選」）
- 32文字以内を厳守

### 3. メタディスクリプションのキーフレーズ
- metaDescriptionにフォーカスキーフレーズを必ず含める
- 120文字以内で、読者の悩みに直接アプローチする文にする
- 例：「[キーフレーズ]を選ぶポイントと、おすすめを徹底解説。〇〇で悩む方はこちらから。」

### 4. 導入文（リード文）のキーフレーズ
- 記事冒頭の**最初の100文字以内**にフォーカスキーフレーズを含める
- 読者の悩みに共感し、記事の価値を明示する

### 5. キーフレーズ密度（1〜3%）
- フォーカスキーフレーズは記事全体に**自然に**散りばめる（詰め込みNG）
- 目安：1000文字あたり2〜4回程度

### 6. サブ見出しへのキーフレーズ組み込み
- H2見出しの**うち少なくとも1つ**にフォーカスキーフレーズを含める
- 例：「[キーフレーズ]の選び方」「[キーフレーズ]おすすめ5選」

### 7. 画像のalt属性にキーフレーズ
- 記事内の画像（<img>タグ）には必ずalt属性を付ける
- アイキャッチ相当の最初の画像のaltにはフォーカスキーフレーズを含める
- 例：<img src="..." alt="[キーフレーズ]の比較画像" />
- 記事内にimgタグがない場合、アイキャッチ用のプレースホルダーを1つ挿入する：
  <img src="" alt="[キーフレーズ]" class="eyecatch" style="display:none" />

### 8. 内部リンク（必須：最低3箇所）
- 記事内に同ブログ内の関連記事への内部リンクを**最低3箇所**配置する
- 内部リンクはアンカーテキストにキーフレーズ・関連語を含める
- 形式：<a href="/[slug]">[アンカーテキスト]</a>
- 配置場所の例：
  - 導入文直後（「詳しくはこちら：[関連記事タイトル]」）
  - 本文中の関連トピック説明箇所
  - まとめセクション`;
}

// ----- 商品指定生成用プロンプト -----
function buildProductPrompt(products: string[], genreName: string, targetAge: TargetAge, customKeyword?: string, comparisonMode?: { enabled: boolean; recommendIndex?: number; productPrices?: number[]; productScores?: number[] }): string {
  const productList = products.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const keywordLine = customKeyword
    ? `【狙いたいキーワード】${customKeyword}`
    : `【キーワード】商品名から最適なSEOキーワードを自動決定してください`;

  const isSingleProduct = products.length === 1;
  const isComparison = comparisonMode?.enabled && products.length >= 2;
  const isRanking = comparisonMode?.enabled && products.length >= 3;

  return `あなたはSEOに精通した美容ブログのプロライターです。
以下の商品を${isRanking ? `ランキング形式で紹介する（${products.length}選）` : isComparison ? "徹底比較する" : isSingleProduct ? "レビューする" : "比較・レビューする"}記事を作成してください。

【ブログ名】${genreName}
${keywordLine}
【現在の日付情報】${(() => { const d = getDateLabels(); return `${d.monthLabel}（${d.halfLabel} / ${d.seasonLabel}）`; })()}

【紹介する商品/サービス】
${productList}

${buildPersonaBlock(targetAge)}

## タイトルの要件
${(() => {
  const d = getDateLabels();
  return isSingleProduct
    ? `- 商品名を含めた具体的なレビュータイトルにする
- 例：「○○を30代が本音レビュー｜使って分かったメリットとデメリット」
- 例：「○○の口コミは本当？実際に${d.month >= 2 ? Math.floor(d.month / 2) : 1}ヶ月使った正直な感想」
- 例：「【${d.seasonLabel}の新定番】○○が人気の理由を正直レビュー」
- 年月は入れても入れなくてもよい。入れるなら「${d.monthLabel}」「${d.seasonLabel}」等を自然に`
    : isRanking
    ? `- ランキング形式のタイトルにする
- 例：「みおの勝手に○○ランキング！30代が本気で選んだ${products.length}選」
- 例：「【${d.monthLabel}版】○○おすすめ${products.length}選｜口コミ・成分で徹底比較」
- 例：「○○${products.length}選を正直レビュー｜${d.seasonLabel}の注目アイテム」
- 「みおの勝手にランキング」のような個性的なタイトルも歓迎
- 年月は入れても入れなくてもよい。入れるなら「${d.monthLabel}」「${d.halfLabel}」等を自然に
- 【禁止】「全部使って」「実際に試して」等の使用体験を装う表現は絶対に使わないこと`
    : isComparison
    ? `- 2つの商品を正面から比較するタイトルにする
- 例：「○○ vs △△ 徹底比較｜成分・価格・口コミの違いは？」
- 例：「○○と△△どっちがいい？スペックと口コミで比較」
- 例：「【${d.monthLabel}版】○○ vs △△ 本当に買うべきはどっち？」
- 年月は入れても入れなくてもよい。入れるなら「${d.monthLabel}」「${d.halfLabel}」等を自然に
- 【禁止】「両方試して」「実際に使って」等の使用体験を装う表現は絶対に使わないこと`
    : `- 商品を比較するタイトルにする（全商品名を入れる必要はない）
- 例：「○○ vs △△ どっちがいい？実際に使って比較してみた」
- 例：「【${d.monthLabel}版】○○系コスメ□選を正直レビュー｜本当に良かったのは…」
- 年月は入れても入れなくてもよい。入れるなら「${d.monthLabel}」「${d.halfLabel}」等を自然に`;
})()}
- 32文字以内を目安にする
- メインキーワードをタイトル前半に含める

${ADSENSE_QUALITY_BLOCK}

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

## 重要：黄色マーカー装飾（必ず実行すること）
htmlContent内で読者にとって特に重要な箇所に、以下のHTMLタグで黄色マーカーを引いてください：
<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- 1記事あたり3〜5箇所に使用（多すぎNG）
- 結論・注意点・価格・おすすめポイントなど重要な短いフレーズに使う
- 見出し（h2/h3）やリンクには使わない

## 出力形式
以下のJSON形式で出力してください（他のテキストは一切不要）：

\`\`\`json
{
  "htmlContent": "HTML本文",
  "title": "商品に固有のSEO最適化タイトル",
  "metaDescription": "120文字以内のSEOメタディスクリプション",
  "slug": "product-based-seo-slug",
  "focusKeyword": "メインのSEOキーワード1つ",
  "tags": ["関連タグ1", "関連タグ2", "関連タグ3"],
  "faq": [
    {"question": "よくある質問1", "answer": "回答1"},
    {"question": "よくある質問2", "answer": "回答2"},
    {"question": "よくある質問3", "answer": "回答3"}
  ],
  "products": [
    {"name": "商品名1", "description": "商品の特徴を1文で", "brand": "ブランド名", "price": 3980, "rating": 4.5, "reviewCount": 120},
    {"name": "商品名2", "description": "商品の特徴を1文で", "brand": "ブランド名", "price": 2980, "rating": 4.2, "reviewCount": 85}
  ]
}
\`\`\`

## SEO最適化の要件
- slug: 必ず英語の小文字+ハイフンのみ。日本語・ローマ字は使わない。記事内容を表す英単語2-4語で構成する。例: vitamin-c-serum-review, retinol-cream-comparison, shampoo-ranking-top5
- focusKeyword: 記事のメインキーワード1つ（タイトルとh2に含まれる語）
- tags: 記事に関連するSEOタグを3〜5個（商品名、カテゴリ、特徴など）
- faq: 記事末尾のFAQから3〜5問を抽出（Google FAQリッチスニペット用）
- products: 記事で紹介した商品のリスト（Google商品リッチリザルト用）
  - name: 商品名、brand: ブランド名、price: 参考価格（数値）、rating: 評価（5点満点）、reviewCount: レビュー件数

## htmlContent の要件
- HTML構造：<h2>大見出し / <h3>小見出し / <p>段落 / <table>比較表 / <ul><li>リスト
- 文字数：3500〜6000字程度（AdSense審査基準を満たすため最低3500字必須）
- 記事冒頭に「<div class="pr-notice" style="font-size:11px;color:#999;margin-bottom:16px;">PR：本記事にはアフィリエイト広告が含まれています</div>」を含める（小さく目立たない形で）
- 比較表は価格帯（目安）・特徴・向いている人を含む
- 各商品を<h3>で個別レビュー（メリット・注意点を公平に）
${isComparison ? `
## 【重要】比較記事の構成ルール
この記事は**商品比較記事**です。以下の構成で書いてください：

### 記事構成（この順番で）
1. <h2>○○と△△を徹底比較！</h2> — 導入文（なぜ比較するか、読者の悩みに寄り添う）
2. <h2>基本情報の比較表</h2> — <table>で価格・容量・主要成分・テクスチャー・特徴を並べて比較
3. <h2>○○の特徴とメリット・デメリット</h2> — 商品Aの詳細レビュー
4. <h2>△△の特徴とメリット・デメリット</h2> — 商品Bの詳細レビュー
5. <h2>口コミを比較してみた</h2> — 両商品の口コミ傾向の違い（楽天レビューデータがあればそれを参照）
6. <h2>こんな人にはこっちがおすすめ</h2> — ターゲット別の使い分け提案
7. <h2>個人的にはこっちが好み</h2> — ${comparisonMode?.recommendIndex !== undefined ? `商品${comparisonMode.recommendIndex + 1}（${products[comparisonMode.recommendIndex]}）を自然に推す` : "総合的に優れた方を推す"}。ただし断定的にならず「個人的な好み」「総合的に見て」という表現で。
8. まとめ — 両方の良さを認めつつ、迷ったらこっち、と背中を押す
9. よくある質問

### 推薦ロジック
- 推す商品は「コスパの良さ」「口コミ評価の高さ」「成分の充実度」など**客観的な理由**で推す
- 「こっちの方が安い」「レビュー評価が高い」「成分が○○配合で充実」など具体的根拠を示す
- もう一方の商品も「○○な人にはこちらの方が合う」とフォローし、両方のリンクを活かす
- ランキングや順位づけをする場合は「筆者の使用感と口コミを総合した個人的評価です」と明記
` : ""}
${isRanking ? `
## 【重要】ランキング記事の構成ルール
この記事は**ランキング形式の記事（${products.length}選）**です。商品は既に収益最適化順に並んでいます。この順番通りにランキングを作成してください。

### 記事構成（この順番で）
1. <h2>はじめに</h2> — 「みおが本気で選んだ○○ランキング」的な導入。選定基準を簡潔に説明
2. <h2>○○おすすめランキング${products.length}選</h2> — 全商品を順位付きで一覧（簡易比較表）
${products.map((p, i) => `3-${i + 1}. <h2>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}位`} ${p}</h2> — 個別レビュー（メリット・デメリット・こんな人におすすめ）`).join("\n")}
${products.length + 3}. <h2>全商品比較表</h2> — <table>で価格・特徴・評価を一覧比較
${products.length + 4}. <h2>まとめ｜迷ったらこれ！</h2> — 1位の商品を改めて推す。「迷ったらこれを選べば間違いなし」
${products.length + 5}. よくある質問

### ランキングの推薦ロジック
- **1位の商品を特に手厚く紹介する**（文字数を他の1.5倍程度に）
- 各商品に「こんな人におすすめ」を必ず入れ、読者が自分に合う商品を見つけやすくする
- 1位: 「総合力の高さ」「コスパと品質のバランス」等の客観的理由で推す
- 2位: 「口コミ人気の高さ」で推す
- 3位: 「コスパ最強」「初心者向け」で推す
- 4位以降: 「こだわり派向け」「特定の悩みに特化」等で差別化
- まとめで1位を再度推し、「迷ったらこれ」と背中を押す

### 【絶対禁止】使用体験を装う表現
以下の表現はランキング・比較記事では絶対に使わないこと：
- ❌「全部使って比べた」「実際に試してみた」「○ヶ月使用して」
- ❌「使ってみた感想」「使い心地は」「テクスチャーは」（自分の使用感として書く場合）
- ❌「塗った瞬間」「肌につけると」（自分が体験したかのように書く場合）
代わりに以下の表現を使うこと：
- ✅「口コミを調べてみると」「成分を比較すると」「スペックを見ると」
- ✅「口コミでは○○という声が多い」「公式サイトによると」
- ✅「成分表を見ると」「価格帯から考えると」
- ✅「気になって調べてみたところ」「注目している商品」

### コンプライアンス必須表記
- 記事冒頭に「<p style="font-size:12px;color:#888;margin:12px 0;">※ このランキングは筆者の使用感・口コミ評価・成分分析を総合した個人的評価に基づいています</p>」を挿入
- 「No.1」「業界最高」等の客観的根拠のない最上級表現は使わない
- 各商品のデメリットも必ず1つは記載する（公平性の担保）
` : ""}

## アフィリエイトリンクの最適配置（CVR最大化）
各商品のレビュー末尾の「こんな人におすすめ」の直後に、その商品のアフィリエイトリンクを配置してください。
商品名を必ず含めた形式にすること：

「<p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：${"{その商品の正確な名前}"}】</p>」

配置ルール：
1. **各商品レビューの「おすすめポイント」直後**に配置（読者が「自分に合う」と感じた瞬間）
2. **比較表の直後**にも1つ配置（比較検討後の行動喚起）
3. 記事冒頭やFAQ内には配置しない
4. デメリット・注意点の直後には配置しない（ネガティブ印象の直後は逆効果）

### 関連記事リンク（1箇所）
- 記事の末尾（まとめの後、FAQの前）に自然に配置
- 形式：「<p class="internal-link-suggestion">▶ 【関連記事】{関連テーマの記事タイトル例}</p>」

- まとめで「こんな方にはこの商品/サービス」という提案型にする
- 筆者の体験談を自然に2〜3箇所織り交ぜる
- 体験談の直後には「<p class="disclaimer">※ 効果には個人差があります</p>」を入れる
- 料金は「目安」「一般的には」と但し書き必須
- 外部リンクには rel="nofollow sponsored" を付与
- 自然な日本語で、AIっぽさを排除した読みやすい文体

## FAQ（よくある質問）セクションの要件（重要）
記事末尾に<h2>よくある質問</h2>セクションを必ず含め、<h3>で質問、<p>で回答を記述する。

### FAQの内容ルール
- 読者が実際に検索しそうな疑問を3〜5問作成する
- 回答は記事本文の内容と矛盾しないこと
- 楽天の商品データ（価格・成分・特徴）が提供されている場合、そのデータと矛盾する回答は絶対に書かない
- 回答内で効果を断定しない（「〇〇に効果があります」→「〇〇が期待できるとされています」）
- 価格に言及する場合は「記事執筆時点の参考価格」と注記する

### FAQ禁止事項
- 「実際に使ってみてどうですか？」系の使用感を問う質問は入れない（体験の有無はFAQ外で制御するため）
- FAQでは客観的な質問のみ：「どんな人に向いていますか？」「主な成分は？」「どこで買えますか？」「返品は可能ですか？」等
- 医学的効果を断言する回答は禁止（「シミが消えます」→「シミへのアプローチが期待できます」）
- 捏造した数値（「〇〇%の人が効果を実感」等）は禁止`;
}

interface ParsedProduct {
  name: string;
  description?: string;
  brand?: string;
  price?: number;
  url?: string;
  rating?: number;
  reviewCount?: number;
}

interface ParsedArticle {
  title: string;
  metaDescription: string;
  htmlContent: string;
  slug?: string;
  focusKeyword?: string;
  tags?: string[];
  faq?: { question: string; answer: string }[];
  products?: ParsedProduct[];
  seoNotes?: {
    primaryKeyword?: string;
    secondaryKeywords?: string[];
    searchIntent?: string[];
    titleAngle?: string;
    latentNeeds?: string[];
  };
  internalLinks?: { anchorText?: string; targetHint?: string; placementReason?: string; linkRole?: string }[];
  externalSources?: { label?: string; url?: string; sourceType?: string; citationReason?: string }[];
  imageSeo?: { position?: string; imageIntent?: string; fileNameHint?: string; alt?: string }[];
}

function extractJSON(text: string): ParsedArticle {
  // Step 1: { を起点にブレースマッチングでJSON抽出
  // regex の非貪欲マッチは HTML 内の ``` 等で誤切断するため使わない
  let jsonStr = "";
  const braceStart = text.indexOf('{');
  if (braceStart !== -1) {
    // 文字列リテラルを考慮したブレースマッチング
    let depth = 0;
    let inString = false;
    let endPos = -1;
    for (let i = braceStart; i < text.length; i++) {
      const c = text[i];
      if (c === '\\' && inString) { i++; continue; } // エスケープシーケンスをスキップ
      if (c === '"') { inString = !inString; continue; }
      if (!inString) {
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { endPos = i; break; } }
      }
    }
    // 正常に閉じている場合はそこまで、途中切断の場合は { 以降全部
    jsonStr = endPos !== -1 ? text.slice(braceStart, endPos + 1) : text.slice(braceStart);
  } else {
    jsonStr = text.trim();
  }

  // Step 1.5: JSON文字列内の不要な<link>/<style>タグを除去
  jsonStr = jsonStr.replace(/<link\b[^>]*>/gi, "");
  jsonStr = jsonStr.replace(/<style\b[\s\S]*?<\/style>/gi, "");

  // Step 2: パース試行
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Step 3: max_tokensで途中切断された場合の修復
    // 末尾が閉じていないJSONを修復する
    try {
      const repaired = repairTruncatedJSON(jsonStr);
      parsed = JSON.parse(repaired);
    } catch {
      throw new Error(`Claude APIのレスポンスをJSONとして解析できませんでした。レスポンス先頭: ${text.slice(0, 200)}`);
    }
  }

  // Step 4: htmlContent フィールドの正規化（Claudeが別名で返す場合の対応）
  if (!parsed.htmlContent) {
    parsed.htmlContent = parsed.html_content || parsed.html || parsed.content || parsed.body || "";
  }
  if (!parsed.htmlContent) {
    // 最終手段: JSON文字列から htmlContent の値を直接正規表現で抽出
    const rawMatch = jsonStr.match(/"htmlContent"\s*:\s*"([\s\S]+)/);
    if (rawMatch) {
      // 切断されたhtmlContentの値を回収（末尾の閉じクォート・括弧がなくてもOK）
      let rawVal = rawMatch[1];
      // 末尾の "} や ", 等を除去
      rawVal = rawVal.replace(/"\s*[,}}\]]*\s*$/, "");
      // JSONエスケープをデコード
      try { parsed.htmlContent = JSON.parse('"' + rawVal + '"'); } catch { parsed.htmlContent = rawVal.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"); }
    }
  }
  if (!parsed.htmlContent) {
    throw new Error("Claude APIのレスポンスに htmlContent が含まれていません。レスポンス先頭: " + text.slice(0, 200));
  }

  // Step 5: 不要なHTML要素を除去（Claudeが指示に反して挿入する場合の対策）
  if (typeof parsed.htmlContent === "string") {
    // <link>タグ（外部CSS/Google Fonts等）を除去
    parsed.htmlContent = parsed.htmlContent.replace(/<link\b[^>]*>/gi, "");
    // <style>ブロックを除去
    parsed.htmlContent = parsed.htmlContent.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  }

  return parsed as ParsedArticle;
}

/** max_tokensで途中切断されたJSONを修復する */
function repairTruncatedJSON(json: string): string {
  let s = json.trim();

  // 末尾の不完全な文字列値を閉じる
  // 開いている引用符を数える
  let inString = false;
  let lastQuotePos = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      if (inString) lastQuotePos = i;
    }
  }

  // 文字列が開いたまま → 閉じる
  if (inString) {
    s += '"';
  }

  // 末尾のカンマを削除
  s = s.replace(/,\s*$/, '');

  // 開いている括弧を閉じる
  const stack: string[] = [];
  inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (s[i] === '{') stack.push('}');
    else if (s[i] === '[') stack.push(']');
    else if (s[i] === '}' || s[i] === ']') stack.pop();
  }

  // スタックに残っている括弧を逆順で閉じる
  while (stack.length > 0) {
    s += stack.pop();
  }

  return s;
}

async function callClaude(apiKey: string, prompt: string, maxTokens?: number) {
  const client = new Anthropic({ apiKey });
  const effectiveMaxTokens = maxTokens || 16000;

  // ストリーミングで受信（Vercel Hobby の関数タイムアウト対策）
  const stream = client.messages.stream({
    model: "claude-haiku-4-5",
    max_tokens: effectiveMaxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  let text = "";
  let stopReason: string | null = null;
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      text += event.delta.text;
    } else if (event.type === "message_delta" && event.delta.stop_reason) {
      stopReason = event.delta.stop_reason;
    }
  }

  if (!text) {
    throw new Error("Claude APIから空のレスポンスが返されました");
  }

  // max_tokens で途中切断された場合は警告（本文が途中で切れる原因）
  if (stopReason === "max_tokens") {
    console.warn(
      `[callClaude] Response truncated by max_tokens (limit=${effectiveMaxTokens}, got=${text.length} chars). ` +
      `Article may be cut off mid-sentence. Consider raising max_tokens for this call.`
    );
  }

  return text;
}

/** FAQ構造化データ（JSON-LD）を生成してHTMLに埋め込む */
function buildFaqSchema(faq: { question: string; answer: string }[]): string {
  if (!faq || faq.length === 0) return "";
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer,
      },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/** Article構造化データ（JSON-LD）を生成 — imageUrlは後から差し替え可能 */
function buildArticleSchema(title: string, description: string, keyword: string, imageUrl?: string): string {
  const schema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "keywords": keyword,
    "author": { "@type": "Person", "name": "美容トレンドノート編集部" },
    "publisher": { "@type": "Organization", "name": "美容トレンドノート" },
    "datePublished": new Date().toISOString().split("T")[0],
    "dateModified": new Date().toISOString().split("T")[0],
  };
  // 画像URLがある場合はArticleスキーマに含める（Google検索結果に画像表示）
  if (imageUrl) {
    schema.image = imageUrl;
  }
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/** Product構造化データ（JSON-LD）を生成 — Google商品リッチリザルト対応 */
function buildProductSchema(products: ParsedProduct[]): string {
  if (!products || products.length === 0) return "";

  const schemas = products.map((p) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": p.name,
    "description": p.description || "",
    ...(p.brand ? { "brand": { "@type": "Brand", "name": p.brand } } : {}),
    ...(p.price ? {
      "offers": {
        "@type": "Offer",
        "price": p.price,
        "priceCurrency": "JPY",
        "availability": "https://schema.org/InStock",
        "url": p.url || "",
      },
    } : {}),
    ...(p.rating ? {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": p.rating,
        "bestRating": "5",
        "reviewCount": p.reviewCount || "1",
      },
    } : {}),
  }));

  return schemas
    .map((s) => `<script type="application/ld+json">${JSON.stringify(s)}</script>`)
    .join("\n");
}

/** ItemList構造化データ — おすすめランキング系記事向け */
function buildItemListSchema(title: string, products: ParsedProduct[]): string {
  if (!products || products.length === 0) return "";

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": title,
    "itemListElement": products.map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": p.name,
      ...(p.url ? { "url": p.url } : {}),
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/** SEOタイトルを生成（Yoast用 — 60文字以内 + ブランド名） */
function buildSeoTitle(title: string): string {
  // 長すぎるタイトルを60文字以内に切り詰める
  const brandSuffix = " | 美容トレンドノート";
  const maxLen = 60 - brandSuffix.length;
  const trimmed = title.length > maxLen ? title.substring(0, maxLen) + "…" : title;
  return trimmed + brandSuffix;
}

/** パース結果からGeneratedArticleを組み立てる（コンプライアンス修正） */
function buildGeneratedArticle(parsed: ParsedArticle, keyword: string, themeLabel: string): GeneratedArticle {
  const faq = parsed.faq || [];
  const products = parsed.products || [];
  const focusKeyword = parsed.focusKeyword || keyword;
  const seoTitle = buildSeoTitle(parsed.title);
  const seoNotes = parsed.seoNotes
    ? {
        primaryKeyword: parsed.seoNotes.primaryKeyword || focusKeyword,
        secondaryKeywords: Array.isArray(parsed.seoNotes.secondaryKeywords)
          ? parsed.seoNotes.secondaryKeywords.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          : [],
        searchIntent: Array.isArray(parsed.seoNotes.searchIntent)
          ? parsed.seoNotes.searchIntent.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          : [],
        titleAngle: parsed.seoNotes.titleAngle || "",
        latentNeeds: Array.isArray(parsed.seoNotes.latentNeeds)
          ? parsed.seoNotes.latentNeeds.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          : [],
      }
    : undefined;
  const normalizeLinkRole = (value?: string): "parent" | "child" | "money" | "related" | undefined => {
    if (value === "parent" || value === "child" || value === "money" || value === "related") {
      return value;
    }
    return undefined;
  };
  const internalLinks = Array.isArray(parsed.internalLinks)
    ? parsed.internalLinks
        .filter((link) => link && typeof link.anchorText === "string" && typeof link.targetHint === "string" && typeof link.placementReason === "string")
        .map((link) => ({
          anchorText: link.anchorText!.trim(),
          targetHint: link.targetHint!.trim(),
          placementReason: link.placementReason!.trim(),
          linkRole: normalizeLinkRole(link.linkRole),
        }))
        .filter((link) => link.anchorText && link.targetHint && link.placementReason)
    : [];
  const externalSources = Array.isArray(parsed.externalSources)
    ? parsed.externalSources
        .filter((source) =>
          source &&
          typeof source.label === "string" &&
          typeof source.url === "string" &&
          /^https?:\/\//i.test(source.url) &&
          typeof source.sourceType === "string" &&
          typeof source.citationReason === "string",
        )
        .map((source) => ({
          label: source.label!.trim(),
          url: source.url!.trim(),
          sourceType: source.sourceType!.trim(),
          citationReason: source.citationReason!.trim(),
        }))
        .filter((source) => source.label && source.url && source.sourceType && source.citationReason)
    : [];
  const imageSeo = Array.isArray(parsed.imageSeo)
    ? parsed.imageSeo
        .filter((image) =>
          image &&
          typeof image.position === "string" &&
          typeof image.imageIntent === "string" &&
          typeof image.fileNameHint === "string" &&
          typeof image.alt === "string",
        )
        .map((image) => ({
          position: image.position!.trim(),
          imageIntent: image.imageIntent!.trim(),
          fileNameHint: image.fileNameHint!.trim(),
          alt: image.alt!.trim(),
        }))
        .filter((image) => image.position && image.imageIntent && image.fileNameHint && image.alt)
    : [];

  // コンプライアンス自動修正
  const { html: complianceFixed, result: complianceResult } = autoFixCompliance(parsed.htmlContent);
  if (complianceResult.fixes.length > 0) {
    console.log("[Compliance] Auto-fixes applied:", complianceResult.fixes);
  }
  if (complianceResult.warnings.length > 0) {
    console.warn("[Compliance] Warnings:", complianceResult.warnings);
  }

  // 構造化データはWordPressテーマ側(schema.php)で一元管理。
  // post_contentへの埋め込みは重複の原因になるため廃止。
  const htmlContent = complianceFixed;

  return {
    title: parsed.title,
    seoTitle,
    metaDescription: parsed.metaDescription,
    htmlContent,
    keyword,
    themeLabel,
    slug: sanitizeSlug(parsed.slug || keyword),
    focusKeyword,
    tags: parsed.tags || [],
    faqSchema: faq,
    products,
    seoNotes,
    internalLinks,
    externalSources,
    imageSeo,
  };
}

/** 自動生成（Cronテーマローテーション用） */
export async function generateArticle(
  apiKey: string,
  keyword: string,
  theme: SubTheme,
  genreName: string,
  targetAge: TargetAge = "30s",
  trendContext?: string,
  balloonOpts?: { authorIconUrl?: string; authorName?: string },
  existingPosts?: { title: string; url: string }[],
): Promise<GeneratedArticle> {
  let prompt = buildAutoPrompt(keyword, theme, genreName, targetAge, existingPosts);
  prompt += `\n\n${ARTICLE_GENERATION_SEO_ADDON_BLOCK}`;
  if (trendContext) {
    prompt += `\n\n【最新トレンド情報】以下の最新トレンド情報を記事に反映してください。ただし、情報の正確性を確認できない場合は「最近注目されている」程度の言及にとどめてください：\n${trendContext}`;
  }
  if (balloonOpts) {
    prompt += "\n" + buildBalloonBlock(balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  const responseText = await callClaude(apiKey, prompt);
  const parsed = extractJSON(responseText);
  const article = buildGeneratedArticle(parsed, keyword, theme.label);
  if (balloonOpts?.authorIconUrl) {
    article.htmlContent = fixBalloonIcons(article.htmlContent, balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  return article;
}

/** 商品指定生成（手動 / 複数商品対応） */
export async function generateProductArticle(
  apiKey: string,
  products: string[],
  genreName: string,
  targetAge: TargetAge = "30s",
  customKeyword?: string
): Promise<GeneratedArticle> {
  const prompt = `${buildProductPrompt(products, genreName, targetAge, customKeyword)}\n\n${ARTICLE_GENERATION_SEO_ADDON_BLOCK}`;
  const responseText = await callClaude(apiKey, prompt);
  const parsed = extractJSON(responseText);
  return buildGeneratedArticle(parsed, customKeyword || products.join(" / "), "商品レビュー");
}

/** 商品指定生成（楽天レビュー + 体験フラグ + 価格帯文体対応） */
export async function generateProductArticleWithReviews(
  apiKey: string,
  products: string[],
  genreName: string,
  targetAge: TargetAge = "30s",
  reviewsText: string = "",
  customKeyword?: string,
  hasExperience?: boolean,
  experienceNote?: string,
  pricePreset?: string,
  comparisonMode?: { enabled: boolean; recommendIndex?: number; productPrices?: number[]; productScores?: number[] },
  balloonOpts?: { authorIconUrl?: string; authorName?: string },
): Promise<GeneratedArticle> {
  let prompt = buildProductPrompt(products, genreName, targetAge, customKeyword, comparisonMode);
  prompt += `\n\n${ARTICLE_GENERATION_SEO_ADDON_BLOCK}`;

  // 価格帯に応じた文体指示
  const priceTone = buildPriceToneBlock(pricePreset);
  if (priceTone) prompt += `\n\n${priceTone}`;

  // 体験有無に応じた記事トーン指示を追加
  prompt += `\n\n${buildExperienceBlock(hasExperience || false, experienceNote || "")}`;

  if (reviewsText) {
    prompt += `\n\n${reviewsText}`;
  }
  if (balloonOpts) {
    prompt += "\n" + buildBalloonBlock(balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  const responseText = await callClaude(apiKey, prompt);
  const parsed = extractJSON(responseText);
  const label = comparisonMode?.enabled ? "商品比較" : "商品レビュー";
  const article = buildGeneratedArticle(parsed, customKeyword || products.join(" / "), label);
  if (balloonOpts?.authorIconUrl) {
    article.htmlContent = fixBalloonIcons(article.htmlContent, balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  return article;
}

// ==========================================
// カテゴリー記事（ピラーページ）生成
// SEO: トピカルオーソリティ確立用
// ==========================================

interface ExistingPost {
  title: string;
  url: string;
  slug: string;
}

// サブテーマ定義
export interface SubThemeOption {
  id: string;
  label: string;
  seoKeywords: string[];
  sections: string[];
}

// カテゴリー設定（サブテーマ付き）
const CATEGORY_CONFIGS: Record<string, {
  label: string;
  description: string;
  seoKeywords: string[];
  sections: string[];
  tone: string;
  multiSelect?: boolean; // 複数選択で比較記事にできるか
  subThemes: SubThemeOption[];
}> = {
  "clinic-comparison": {
    label: "クリニック比較",
    description: "美容クリニックの選び方・施術の違い・費用相場を網羅するガイド",
    seoKeywords: ["美容クリニック 選び方", "美容皮膚科 違い", "施術 比較"],
    sections: [],
    tone: "専門的だが初心者にも分かりやすい。医療情報は断定せず「一般的に」「とされています」等の表現を使う",
    multiSelect: true,
    subThemes: [
      { id: "clinic-datsumo", label: "医療脱毛クリニック", seoKeywords: ["医療脱毛 クリニック 比較", "医療脱毛 選び方"], sections: ["医療脱毛の種類（蓄熱式vs熱破壊式）", "部位別の料金相場と回数目安", "痛みへの対策とアフターケア", "カウンセリングで確認すべき5つのポイント", "よくある質問（FAQ）"] },
      { id: "clinic-shimi", label: "シミ取りレーザー", seoKeywords: ["シミ取り レーザー 比較", "シミ取り クリニック 選び方"], sections: ["シミの種類と適したレーザーの違い", "施術の流れ・痛み・ダウンタイム", "料金相場（1回/コース）", "失敗しないクリニック選びのポイント", "よくある質問（FAQ）"] },
      { id: "clinic-hifu", label: "ハイフ・たるみ治療", seoKeywords: ["ハイフ クリニック 比較", "たるみ治療 おすすめ"], sections: ["ハイフの仕組みと効果が出るまでの期間", "医療ハイフ vs エステハイフの違い", "部位別の料金相場", "施術前後の注意点", "よくある質問（FAQ）"] },
      { id: "clinic-dermapen", label: "ダーマペン・毛穴治療", seoKeywords: ["ダーマペン クリニック 比較", "毛穴治療 おすすめ"], sections: ["ダーマペンの仕組みと効果", "ニキビ跡・毛穴への効果と必要回数", "ダウンタイムと経過", "他の毛穴治療との比較", "よくある質問（FAQ）"] },
      { id: "clinic-botox", label: "ボトックス・小顔施術", seoKeywords: ["ボトックス クリニック 比較", "小顔 施術 おすすめ"], sections: ["ボトックスの種類と効果", "注入部位別の効果と持続期間", "料金相場とリスク", "クリニック選びのポイント", "よくある質問（FAQ）"] },
      { id: "clinic-peeling", label: "ピーリング・光治療", seoKeywords: ["ピーリング クリニック 比較", "フォトフェイシャル 比較"], sections: ["ケミカルピーリングの種類と選び方", "フォトフェイシャル・IPLの仕組み", "施術の流れとダウンタイム", "自宅ピーリングとの違い", "よくある質問（FAQ）"] },
    ],
  },
  "cosmetics": {
    label: "コスメ",
    description: "化粧品の成分・選び方・使い方を解説するコスメ百科",
    seoKeywords: ["コスメ 選び方", "化粧品 成分", "スキンケア 基本"],
    sections: [],
    tone: "美容好きの友人に教えるような親しみやすさ。成分の説明は科学的根拠を交えつつ噛み砕いて",
    multiSelect: true,
    subThemes: [
      { id: "cosme-bihaku", label: "美白・シミ対策コスメ", seoKeywords: ["美白 化粧品 選び方", "シミ対策 コスメ おすすめ"], sections: ["美白有効成分の種類と効果の違い", "医薬部外品とコスメの違い", "正しい使い方と効果が出るまでの期間", "年代別おすすめの選び方", "よくある質問（FAQ）"] },
      { id: "cosme-aging", label: "エイジングケア", seoKeywords: ["エイジングケア 化粧品 選び方", "シワ改善 コスメ"], sections: ["エイジングケア成分（レチノール・ナイアシンアミド・ペプチド）", "年代別で変えるべきケアポイント", "シワ・たるみ・くすみ別の選び方", "効果的な使い方と注意点", "よくある質問（FAQ）"] },
      { id: "cosme-keana", label: "毛穴ケア・クレンジング", seoKeywords: ["毛穴ケア 化粧品 おすすめ", "クレンジング 選び方"], sections: ["毛穴タイプ別（開き・黒ずみ・たるみ）のケア方法", "クレンジングの種類と選び方", "酵素洗顔・ピーリングの正しい使い方", "毛穴に効く成分ガイド", "よくある質問（FAQ）"] },
      { id: "cosme-uv", label: "日焼け止め・UV対策", seoKeywords: ["日焼け止め 選び方", "UV対策 コスメ おすすめ"], sections: ["SPF・PAの正しい見方と選び方", "テクスチャー別（ジェル・ミルク・スティック）の特徴", "敏感肌・子ども向けの選び方", "塗り直しのタイミングと方法", "よくある質問（FAQ）"] },
      { id: "cosme-nikibi", label: "ニキビ・肌荒れケア", seoKeywords: ["ニキビケア 化粧品 選び方", "肌荒れ スキンケア"], sections: ["ニキビの種類と原因", "有効成分（サリチル酸・グリコール酸・CICA）", "スキンケアの順番とNG行為", "ニキビ跡のケア方法", "よくある質問（FAQ）"] },
      { id: "cosme-allinone", label: "オールインワン・時短", seoKeywords: ["オールインワン おすすめ", "時短スキンケア 選び方"], sections: ["オールインワンのメリット・デメリット", "成分で選ぶポイント", "朝・夜の使い分け", "ライン使いとの比較", "よくある質問（FAQ）"] },
    ],
  },
  "basics-howto": {
    label: "基礎知識・使い方",
    description: "美容の基礎知識と正しいケア方法を徹底解説する教科書",
    seoKeywords: ["スキンケア 基礎", "美容 初心者", "正しい洗顔"],
    sections: [],
    tone: "美容初心者に寄り添う教科書的な語り口。専門用語は必ず説明を添える",
    multiSelect: false,
    subThemes: [
      { id: "basics-routine", label: "スキンケアの正しい順番", seoKeywords: ["スキンケア 順番 正しい", "化粧水 乳液 順番"], sections: ["朝のスキンケアルーティン", "夜のスキンケアルーティン", "各アイテムの役割と塗り方", "やりがちなNG習慣", "よくある質問（FAQ）"] },
      { id: "basics-ingredients", label: "成分の読み方・選び方", seoKeywords: ["化粧品 成分 読み方", "美容成分 種類 効果"], sections: ["成分表示の読み方（配合量順ルール）", "注目の美容成分10選とその効果", "避けるべき成分と肌タイプ別の注意点", "成分で化粧品を選ぶコツ", "よくある質問（FAQ）"] },
      { id: "basics-skintype", label: "肌タイプ別ケア方法", seoKeywords: ["肌タイプ 診断", "乾燥肌 脂性肌 混合肌 ケア"], sections: ["肌タイプの見分け方（セルフ診断法）", "乾燥肌のケアポイント", "脂性肌・混合肌のケアポイント", "敏感肌のケアポイント", "よくある質問（FAQ）"] },
      { id: "basics-seasonal", label: "季節別スキンケア", seoKeywords: ["季節 スキンケア 切り替え", "夏 冬 スキンケア 違い"], sections: ["春のスキンケア（花粉・紫外線対策）", "夏のスキンケア（皮脂・UV対策）", "秋のスキンケア（夏ダメージ回復）", "冬のスキンケア（保湿・乾燥対策）", "よくある質問（FAQ）"] },
      { id: "basics-cleansing", label: "メイク落とし・洗顔の基本", seoKeywords: ["クレンジング 正しいやり方", "洗顔 方法 基本"], sections: ["クレンジングの種類と選び方", "正しい洗顔方法（泡立て・すすぎ・温度）", "ダブル洗顔 vs 不要クレンジング", "洗顔後のスキンケアの入り方", "よくある質問（FAQ）"] },
      { id: "basics-medical-intro", label: "美容医療の基礎知識", seoKeywords: ["美容医療 初めて", "美容皮膚科 何する"], sections: ["美容医療 vs エステ vs セルフケアの違い", "初めての美容医療で知っておくべきこと", "よくある施術の概要と効果", "費用の目安と保険適用の有無", "よくある質問（FAQ）"] },
    ],
  },
  "medical-beauty": {
    label: "美容医療",
    description: "美容医療の施術・仕組み・リスクを客観的に解説するガイド",
    seoKeywords: ["美容医療 種類", "美容施術 仕組み", "ダウンタイム"],
    sections: [],
    tone: "客観的で信頼できる解説。医療行為に関する内容は断定を避け「医師に相談してください」を適切に挿入",
    multiSelect: false,
    subThemes: [
      { id: "medical-types", label: "施術の種類と選び方", seoKeywords: ["美容医療 施術 種類", "美容施術 選び方"], sections: ["レーザー系施術の種類と違い", "注入系施術（ヒアルロン酸・ボトックス）", "機械系施術（ハイフ・ダーマペン・IPL）", "悩み別おすすめ施術マップ", "よくある質問（FAQ）"] },
      { id: "medical-downtime", label: "ダウンタイム・リスク解説", seoKeywords: ["美容医療 ダウンタイム", "美容施術 リスク 副作用"], sections: ["施術別ダウンタイム一覧（日数・症状）", "起こりうるリスクと対処法", "施術前の準備と施術後の過ごし方", "万が一のときの相談先", "よくある質問（FAQ）"] },
      { id: "medical-cost", label: "費用相場・保険適用", seoKeywords: ["美容医療 費用 相場", "美容施術 値段"], sections: ["施術別の費用相場一覧表", "保険適用される美容医療", "モニター・キャンペーンの賢い活用法", "分割払い・医療ローンの注意点", "よくある質問（FAQ）"] },
      { id: "medical-counseling", label: "カウンセリングの受け方", seoKeywords: ["美容クリニック カウンセリング", "美容医療 初めて 流れ"], sections: ["カウンセリング当日の流れ", "聞くべき質問リスト", "押し売りへの対処法", "契約前に確認すべきポイント", "よくある質問（FAQ）"] },
      { id: "medical-aftercare", label: "施術前後の注意点", seoKeywords: ["美容施術 前日 準備", "美容施術 後 注意"], sections: ["施術前にやるべきこと・やめるべきこと", "施術当日の持ち物と服装", "施術後のスキンケアと生活習慣", "次回施術までの間隔と経過観察", "よくある質問（FAQ）"] },
      { id: "medical-vs-esthe", label: "美容皮膚科 vs エステ", seoKeywords: ["美容皮膚科 エステ 違い", "医療 エステ どっち"], sections: ["美容皮膚科とエステサロンの根本的な違い", "効果・持続期間の比較", "費用・通う頻度の比較", "どんな人にどちらが向いているか", "よくある質問（FAQ）"] },
    ],
  },
};

function buildCategoryPrompt(
  categoryId: string,
  existingPosts: ExistingPost[],
  targetAge: TargetAge = "30s",
  subThemeIds?: string[],
): string {
  const cat = CATEGORY_CONFIGS[categoryId];
  if (!cat) throw new Error(`Unknown category: ${categoryId}`);
  const subThemes = Array.isArray(cat.subThemes) ? cat.subThemes : [];
  const normalizedSubThemeIds = Array.isArray(subThemeIds)
    ? subThemeIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  const d = getDateLabels();
  const ageLabel = targetAge === "20s" ? "20代" : targetAge === "30s" ? "30代" : "40代";

  // サブテーマの解決
  const selectedSubs = normalizedSubThemeIds.length > 0
    ? subThemes.filter((s) => normalizedSubThemeIds.includes(s.id))
    : [];
  const isMultiSub = selectedSubs.length >= 2 && cat.multiSelect;

  // サブテーマからセクションとキーワードを構築
  let effectiveSections: string[];
  let effectiveKeywords: string[];
  let subThemeContext = "";

  if (isMultiSub) {
    // 複数サブテーマ → 比較記事
    effectiveSections = [
      `${selectedSubs.map(s => s.label).join("と")}の概要`,
      ...selectedSubs.map(s => `${s.label}の特徴・ポイント`),
      `${selectedSubs.map(s => s.label).join(" vs ")}：違いと選び方`,
      "こんな人にはこの施術/コスメがおすすめ（タイプ別おすすめマップ）",
      "よくある質問（FAQ）",
    ];
    effectiveKeywords = selectedSubs.flatMap(s => s.seoKeywords);
    subThemeContext = `\n\n## 比較テーマ\n以下の${selectedSubs.length}つのテーマを比較する記事を作成してください：\n${selectedSubs.map((s, i) => `${i + 1}. **${s.label}**`).join("\n")}\n\n各テーマの特徴を公平に解説し、読者が自分に合った選択をできるよう導いてください。`;
  } else if (selectedSubs.length === 1) {
    // 単一サブテーマ → 専門ガイド記事
    effectiveSections = selectedSubs[0].sections;
    effectiveKeywords = selectedSubs[0].seoKeywords;
    subThemeContext = `\n\n## テーマ詳細\n「${selectedSubs[0].label}」に特化した専門ガイド記事を作成してください。`;
  } else {
    // サブテーマ未選択 → カテゴリー全体のガイド
    effectiveSections = subThemes.length > 0
      ? [
          `${cat.label}とは`,
          ...subThemes.slice(0, 4).map((s) => `${s.label}の基礎知識`),
          "よくある質問（FAQ）",
        ]
      : cat.sections;
    effectiveKeywords = cat.seoKeywords;
  }

  // 既存記事リスト（内部リンク用）
  const existingPostsList = existingPosts.length > 0
    ? existingPosts.map((p, i) => `${i + 1}. 「${p.title}」 → ${p.url}`).join("\n")
    : "（まだ関連記事がありません）";

  return `あなたは美容専門Webメディア「みおのミハダノート」の編集者です。

## 今回のミッション
カテゴリー「${cat.label}」の${isMultiSub ? "比較ガイド" : "ピラーページ（まとめ・教科書記事）"}を作成してください。
この記事は、サイト内の関連記事への**ハブ（入口）**として機能する重要なページです。${subThemeContext}

## カテゴリー情報
- カテゴリー名: ${cat.label}
- 概要: ${cat.description}
- SEOキーワード: ${effectiveKeywords.join("、")}
- ターゲット読者: ${ageLabel}の美容に関心がある女性

## 記事構成（以下のセクションを必ず含める）
${effectiveSections.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## 文体
- ${cat.tone}
- ペルソナ: みお（${ageLabel}美容ブロガー）の視点で書く
- 一人称は「私」、読者への呼びかけは「みなさん」「あなた」

## 自サイトの既存記事（内部リンクとして自然に挿入すること）
${existingPostsList}

### 内部リンクの挿入ルール
- 各セクションの中で、関連する既存記事があれば**自然な文脈で**リンクを挿入する
- リンク形式: <a href="記事URL" style="color:#FF6B9D;text-decoration:underline;font-weight:bold;">記事タイトル</a>
- 例：「詳しくは<a href="URL" style="color:#FF6B9D;text-decoration:underline;font-weight:bold;">○○の記事</a>で解説しています。」
- 1記事あたり3〜6箇所の内部リンクが理想
- **存在しないURLへのリンクは絶対に作らない**。上記リストにある記事のみリンクすること
- 既存記事が少ない場合は「今後詳しい記事を公開予定です」と記載してOK

## コンプライアンス
- アフィリエイトリンクは挿入しない（この記事は情報提供が目的）
- PR表記は不要（アフィリエイト記事ではないため）

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

## タイトル設計
- 「${cat.label}」の教科書・完全ガイドであることが伝わるタイトル
- 例：「美容クリニックの選び方完全ガイド｜初めてでも失敗しないポイント」
- 例：「スキンケアの基礎知識｜${ageLabel}から始める正しいケア方法」
- 例：「美容医療の教科書｜施術の種類・費用・リスクを徹底解説」
- 年月は入れない（常緑コンテンツとして長期間有効にする）

## 重要：黄色マーカー装飾（必ず実行すること）
htmlContent内で読者にとって特に重要な箇所に、以下のHTMLタグで黄色マーカーを引いてください：
<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- 1記事あたり3〜5箇所に使用（多すぎNG）
- 結論・注意点・費用目安・選び方のポイントなど重要な短いフレーズに使う
- 見出し（h2/h3）やリンクには使わない

## 出力フォーマット
以下のJSON形式で出力してください。JSON以外のテキストは含めないでください。

\`\`\`json
{
  "htmlContent": "HTML本文（h2/h3構造）",
  "title": "記事タイトル",
  "metaDescription": "120文字以内のメタディスクリプション",
  "focusKeyword": "メインのSEOキーワード",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "slug": "english-seo-slug",
  "faq": [{"question": "質問", "answer": "回答"}]
}
\`\`\`

## SEO最適化の要件
- slug: 必ず英語の小文字+ハイフンのみ。例: clinic-comparison-guide, skincare-basics-complete-guide
- focusKeyword: 記事のメインキーワード1つ
- tags: 関連タグ3〜5個
- faq: FAQセクションから3〜5問を抽出（Google FAQリッチスニペット用）
- 見出し（h2/h3）にキーワードを自然に含める
- 本文は3000〜5000文字を目安に充実した内容にする
- 各セクション冒頭に要約文を入れ、読者がスキャンしやすい構造にする

## 【絶対禁止】
- アフィリエイトリンクの挿入
- 商品の購入を直接促す表現
- 「実際に使ってみた」等の使用体験を装う表現（カテゴリー記事では不適切）
- 存在しないURLへのリンク
- 過去の年号（現在は${d.year}年${d.month}月）

## FAQ（よくある質問）の禁止事項
- 使用感を問う質問（「使い心地は？」「効果はありましたか？」）は入れない
- FAQでは客観的な質問のみ：「どんな人に向いていますか？」「主な成分は？」等
- 医学的効果を断言する回答は禁止（「シミが消えます」→「シミへのアプローチが期待できます」）
- 捏造した数値（「〇〇%の人が効果を実感」等）は禁止`;
}

/** カテゴリー記事（ピラーページ）生成 */
export async function generateCategoryArticle(
  apiKey: string,
  categoryId: string,
  existingPosts: ExistingPost[],
  targetAge: TargetAge = "30s",
  subThemeIds?: string[],
  suggestTopic?: string,
  balloonOpts?: { authorIconUrl?: string; authorName?: string },
): Promise<GeneratedArticle> {
  const cat = CATEGORY_CONFIGS[categoryId];
  if (!cat) throw new Error(`Unknown category: ${categoryId}`);

  let prompt = buildCategoryPrompt(categoryId, existingPosts, targetAge, subThemeIds);
  prompt += `\n\n${ARTICLE_GENERATION_SEO_ADDON_BLOCK}`;
  if (suggestTopic) {
    prompt += `\n\n## 注目トピック（Google検索で今注目されているキーワード）\n「${suggestTopic}」が今検索で注目されています。このトピックを記事の中心テーマまたは重要セクションとして取り上げてください。タイトルにも自然に含めてください。`;
  }
  if (balloonOpts) {
    prompt += "\n" + buildBalloonBlock(balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  // カテゴリー記事は長文なのでmax_tokensを増やす
  const responseText = await callClaude(apiKey, prompt, 20000);
  const parsed = extractJSON(responseText);
  const article = buildGeneratedArticle(parsed, cat.seoKeywords[0], cat.label);
  if (balloonOpts?.authorIconUrl) {
    article.htmlContent = fixBalloonIcons(article.htmlContent, balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  return article;
}

function buildIngredientPrompt(
  ingredient: IngredientCandidate,
  targetAge: TargetAge,
  existingPosts: ExistingPost[],
): string {
  const d = getDateLabels();
  const ageLabel = targetAge === "20s" ? "20代" : targetAge === "30s" ? "30代" : "40代";
  const relatedPosts = existingPosts
    .slice(0, 12)
    .map((post) => `- ${post.title} (${post.url})`)
    .join("\n");
  const relatedPostsBlock = relatedPosts
    ? `\n## 内部リンク候補\n${relatedPosts}\n`
    : "";
  const toneNote = ingredient.status === "watchlist"
    ? "この成分は話題先行の側面もあるため、推奨一辺倒にせず、期待値調整と注意点の説明を厚めにしてください。"
    : "この成分はおすすめ候補として扱いますが、万能・絶対・治療のような断定表現は避けてください。";

  return `あなたは美容メディアの編集者です。${d.monthLabel}時点の情報として、成分解説を中心にした日本語のSEO記事を1本作成してください。

## 記事のテーマ
- 成分名: ${ingredient.name}
- 記事スタンス: ${ingredient.status === "recommended" ? "おすすめ成分" : "流行中だが慎重に扱う成分"}
- 想定読者: ${ageLabel}を中心にスキンケア成分を理解したい人
- 記事の主軸: ${ingredient.articleAngle}
- 成分概要: ${ingredient.summary}
- エビデンス水準: ${ingredient.evidenceLevel}
- トレンドスコア: ${ingredient.trendScore}/100
- 想定悩み: ${ingredient.concernTags.join(" / ")}
- ベネフィットタグ: ${ingredient.benefitTags.join(" / ")}
- 今流行している理由:
${ingredient.trendSignals.map((signal) => `  - ${signal}`).join("\n")}
- 推薦理由:
${ingredient.whyRecommended.map((reason) => `  - ${reason}`).join("\n")}
- 注意点:
${ingredient.caution.map((note) => `  - ${note}`).join("\n")}
- NG表現:
${ingredient.avoidClaims.map((claim) => `  - ${claim}`).join("\n")}

## 重要な編集方針
- ${toneNote}
- 記事は「成分の説明」が主役。商品おすすめは主役にしない
- 効果は「期待できる可能性がある」「〜しやすい」「〜をサポートすることがある」などで表現する
- 医薬品・医療行為のような断定、治療表現、再生表現は禁止
- 濃度、併用、頻度、刺激リスク、パッチテストなど、読者が失敗しにくい情報を優先する
- 2026年のトレンドとして、なぜ再注目されているかを導入か中盤で必ず説明する
- 比較が有効な場合は、近い成分との違いを1セクション入れる
- FAQは3問。検索で聞かれやすい内容にする
- 商品を出す場合でも一般論の範囲に留め、ランキング調にしない
- 必要なら内部リンク候補を1〜2件だけ自然に挿入する
${relatedPostsBlock}

## 必須構成
1. 導入: ${ingredient.name}が${d.year}年に注目される理由
2. ${ingredient.name}とは何か
3. どんな悩みに向いているか
4. 期待できる働きと、期待しすぎない方がいい点
5. 向いている人・慎重に使いたい人
6. 使い方のコツ
7. 相性のよい成分・避けたい組み合わせ
8. アイテム選びのポイント
9. よくある質問
10. まとめ

## HTMLルール
- htmlContentは完成したHTML全文を返す
- h2/h3、ul/li、table、blockquoteなどを適切に使う
- 冒頭に要点ボックスを1つ入れる
- 注意点セクションでは読み飛ばされないように箇条書きを使う
- FAQはHTML内にも見出し付きで記載する

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

## 出力形式
\`\`\`json
{
  "title": "${ingredient.name}の効果と使い方を解説【${d.year}年版】",
  "metaDescription": "120文字前後のメタディスクリプション",
  "htmlContent": "完成したHTML全文",
  "slug": "${ingredient.slug}-effects-how-to-use-${d.year}",
  "focusKeyword": "${ingredient.searchKeywords[0]}",
  "keyword": "${ingredient.searchKeywords[0]}",
  "themeLabel": "${ingredient.name}成分記事",
  "tags": ["${ingredient.name}", "${ingredient.concernTags[0] || "スキンケア"}", "成分解説"],
  "faq": [
    { "question": "Q1", "answer": "A1" },
    { "question": "Q2", "answer": "A2" },
    { "question": "Q3", "answer": "A3" }
  ]
}
\`\`\`

JSON以外は返さないでください。`;
}

export async function generateIngredientArticle(
  apiKey: string,
  ingredientId: string,
  existingPosts: ExistingPost[],
  targetAge: TargetAge = "30s",
  balloonOpts?: { authorIconUrl?: string; authorName?: string },
): Promise<GeneratedArticle> {
  const ingredient = getIngredientCandidate(ingredientId);
  if (!ingredient) throw new Error(`Unknown ingredient: ${ingredientId}`);

  let prompt = buildIngredientPrompt(ingredient, targetAge, existingPosts);
  prompt += `\n\n${ARTICLE_GENERATION_SEO_ADDON_BLOCK}`;
  if (balloonOpts) {
    prompt += "\n" + buildBalloonBlock(balloonOpts.authorIconUrl, balloonOpts.authorName);
  }

  const responseText = await callClaude(apiKey, prompt, 20000);
  const parsed = extractJSON(responseText);
  const article = buildGeneratedArticle(
    parsed,
    ingredient.searchKeywords[0] || ingredient.name,
    `${ingredient.name}成分記事`,
  );
  if (balloonOpts?.authorIconUrl) {
    article.htmlContent = fixBalloonIcons(article.htmlContent, balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  return article;
}

/** カテゴリー設定をexport（UI用） */
export const CATEGORY_OPTIONS = Object.entries(CATEGORY_CONFIGS).map(([id, config]) => ({
  id,
  label: config.label,
  description: config.description,
  multiSelect: config.multiSelect || false,
  subThemes: config.subThemes.map(s => ({ id: s.id, label: s.label })),
}));

/**
 * アイキャッチ画像URLを記事に反映する（OGP用）
 * WordPress投稿後に呼び出し、featured_media で画像を設定済みのため
 * Article JSON-LDの画像はWordPressテーマ側(schema.php)で処理される。
 */
export function injectEyecatchIntoArticle(article: GeneratedArticle, eyecatchUrl: string): GeneratedArticle {
  article.eyecatchUrl = eyecatchUrl;
  return article;
}

// ==========================================
// 本人使用投稿（Personal Review）記事生成
// ==========================================

export interface PersonalReviewData {
  productName: string;
  rating: number;
  usagePeriod: string;
  skinType: string;
  texture: string;
  goodPoints: string;
  badPoints: string;
  repurchase: boolean;
  price?: number;
  channel?: string;
  skinConcerns?: string[];
  comparisonNote?: string;
}

function buildPersonalReviewPrompt(
  review: PersonalReviewData,
  photoUrls: string[],
  targetAge: TargetAge,
): string {
  const d = getDateLabels();
  const ageLabel = targetAge === "20s" ? "20代" : targetAge === "30s" ? "30代" : "40代";

  // 写真HTMLをプリビルド（Claudeに生成させるのではなく完成形を渡す）
  const photoDescriptions = ["商品全体", "テクスチャー", "パッケージ裏面", "使用イメージ", "サイズ感"];
  const prebuiltPhotoHtml = photoUrls.map((url, i) => {
    const desc = photoDescriptions[i] || `写真${i + 1}`;
    return `<figure style="text-align:center;margin:24px 0"><img src="${url}" alt="${review.productName} ${desc}" style="max-width:640px;width:100%;height:auto;border-radius:8px" /><figcaption style="font-size:12px;color:#888;margin-top:6px">${review.productName} ${desc}（筆者撮影）</figcaption></figure>`;
  });
  const photoPlaceholders = photoUrls.length > 0
    ? photoUrls.map((_, i) => `【写真${i + 1}をここに挿入】`).join("\n")
    : "";

  return `あなたはSEOに精通した美容ブログ「みおのミハダノート」のプロライターです。
筆者が**実際に購入し使用した商品**のリアルレビュー記事を作成してください。

【ブログ名】みおのミハダノート
【ペルソナ】${ageLabel}・${review.skinType}・美容好き
【商品名】${review.productName}
【総合評価】${review.rating}/5
【使用期間】${review.usagePeriod}
【リピート意向】${review.repurchase ? "リピートしたい" : "検討中"}

## 筆者の実体験データ（記事の核心 — 必ず全て記事に反映すること）

### テクスチャー・使用感
${review.texture}

### 良かった点
${review.goodPoints}

### 気になった点
${review.badPoints}

${review.price ? `### 購入情報\n- 購入価格: ¥${review.price}\n- 購入先: ${review.channel || "不明"}` : ""}
${review.skinConcerns?.length ? `### 肌悩み\n${review.skinConcerns.join("、")}` : ""}
${review.comparisonNote ? `### 他商品との比較メモ\n${review.comparisonNote}` : ""}

## 【重要】写真の挿入（以下のHTMLをそのままコピーして記事に含めること）
${prebuiltPhotoHtml.length > 0 ? `
以下の写真HTMLは**完成形**です。変更せずにそのまま記事内の指定位置に含めてください：

写真1（導入文の直後に挿入）:
${prebuiltPhotoHtml[0] || ""}

${prebuiltPhotoHtml[1] ? `写真2（テクスチャー解説の後に挿入）:\n${prebuiltPhotoHtml[1]}` : ""}

${prebuiltPhotoHtml[2] ? `写真3（成分・パッケージ解説の後に挿入）:\n${prebuiltPhotoHtml[2]}` : ""}

${prebuiltPhotoHtml.slice(3).map((h, i) => `写真${i + 4}（適切なセクションに挿入）:\n${h}`).join("\n\n")}
` : "（写真なし）"}

## 記事構成（この順番で）
1. <h2>はじめに</h2> — 商品に出会った経緯。「${review.skinType}で${review.skinConcerns?.join("・") || "美容"}に悩む${ageLabel}が実際に${review.usagePeriod}使ってみた正直レビュー」的な導入
2. ${prebuiltPhotoHtml[0] ? "↑の写真1をここに挿入（HTMLをそのまま）" : ""}
3. <h2>基本情報・スペック</h2> — 商品名・価格・容量・主要成分の表
4. <h2>テクスチャー・使用感</h2> — 筆者の実体験を詳細に
5. ${prebuiltPhotoHtml[1] ? "↑の写真2をここに挿入（HTMLをそのまま）" : ""}
6. <h2>${review.usagePeriod}使って良かった点</h2> — goodPointsを膨らませて詳述
7. <h2>正直に気になった点</h2> — badPointsを正直に。信頼性が上がる
8. <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：${review.productName}】</p>
9. <h2>こんな人におすすめ / おすすめしない人</h2>
10. ${review.comparisonNote ? `<h2>他商品と比べてみると</h2>` : ""}
11. <h2>まとめ：${review.repurchase ? "リピート確定！" : "もう少し様子見"}</h2>
12. <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：${review.productName}】</p>
13. <h2>よくある質問</h2> — 3問

## E-E-A-T強化（必ず実行）
- 冒頭で「この記事は筆者が実際に購入し、${review.usagePeriod}使用した上でのリアルレビューです」と明記
- 「※ 個人の感想であり、効果を保証するものではありません」を体験談の後に
- 良い点だけでなく気になった点も正直に書く（信頼性が最も重要）
- 写真キャプションに「筆者撮影」を含める

## 重要：黄色マーカー装飾（必ず実行すること）
htmlContent内で読者にとって特に重要な箇所に、以下のHTMLタグで黄色マーカーを引いてください：
<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- 1記事あたり3〜5箇所に使用
- 結論・注意点・使用感のポイントなど重要なフレーズに使う

## タイトル設計
- 「${review.productName}を${review.usagePeriod}使った正直レビュー｜${review.skinType}の${ageLabel}の本音」のような実体験感のあるタイトル
- 年月は入れても入れなくてもよい

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

## JSON出力（これだけ出力。他のテキスト不要）
\`\`\`json
{
  "htmlContent": "HTML記事本文（写真・黄色マーカー・アフィリエイトプレースホルダー含む）",
  "title": "SEO最適化タイトル",
  "metaDescription": "120文字以内のメタディスクリプション",
  "slug": "english-seo-slug",
  "focusKeyword": "メインSEOキーワード",
  "keyword": "${review.productName}",
  "themeLabel": "本人使用レビュー",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "faq": [{"question":"Q1","answer":"A1"},{"question":"Q2","answer":"A2"},{"question":"Q3","answer":"A3"}]
}
\`\`\``;
}

export async function generatePersonalReviewArticle(
  apiKey: string,
  review: PersonalReviewData,
  photoUrls: string[],
  targetAge: TargetAge,
  balloonOpts?: { authorIconUrl?: string; authorName?: string },
): Promise<GeneratedArticle> {
  let prompt = buildPersonalReviewPrompt(review, photoUrls, targetAge);
  prompt += `\n\n${ARTICLE_GENERATION_SEO_ADDON_BLOCK}`;
  if (balloonOpts) {
    prompt += "\n" + buildBalloonBlock(balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  const rawJson = await callClaude(apiKey, prompt);
  const parsed = extractJSON(rawJson);
  const article = buildGeneratedArticle(parsed, review.productName, "本人使用レビュー");

  // コンプライアンス自動修正
  const complianceResult = autoFixCompliance(article.htmlContent);
  article.htmlContent = complianceResult.html;

  // フォールバック: Claudeが写真を挿入しなかった場合、自動挿入
  if (photoUrls.length > 0) {
    const photoDescriptions = ["商品全体", "テクスチャー", "パッケージ裏面", "使用イメージ", "サイズ感"];
    for (let i = 0; i < photoUrls.length; i++) {
      const url = photoUrls[i];
      // この写真URLが記事内に存在するかチェック
      if (article.htmlContent && !article.htmlContent.includes(url)) {
        const desc = photoDescriptions[i] || `写真${i + 1}`;
        const photoHtml = `<figure style="text-align:center;margin:24px 0"><img src="${url}" alt="${review.productName} ${desc}" style="max-width:640px;width:100%;height:auto;border-radius:8px" /><figcaption style="font-size:12px;color:#888;margin-top:6px">${review.productName} ${desc}（筆者撮影）</figcaption></figure>`;

        // H2タグの後に挿入（i番目のH2の後）
        const h2Matches = Array.from(article.htmlContent.matchAll(/<\/h2>/g));
        const targetH2Index = Math.min(i + 1, h2Matches.length - 1); // 最初のH2は飛ばす
        if (h2Matches[targetH2Index]) {
          const insertPos = h2Matches[targetH2Index].index! + h2Matches[targetH2Index][0].length;
          article.htmlContent = article.htmlContent.slice(0, insertPos) + "\n" + photoHtml + "\n" + article.htmlContent.slice(insertPos);
        } else {
          // H2が見つからない場合は記事末尾に追加
          article.htmlContent += "\n" + photoHtml;
        }
      }
    }
  }

  // Review JSON-LDはWordPressテーマ側(schema.php)で出力。
  // _article_type='review' と _affiliate_products メタで制御される。

  if (balloonOpts?.authorIconUrl) {
    article.htmlContent = fixBalloonIcons(article.htmlContent, balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  return article;
}

/** テキスト貼り付けモード — 他社AI文章をベースにClaude APIでリライト生成 */
export async function generatePasteArticle(
  apiKey: string,
  pasteTitle: string,
  pasteHtml: string,
  pasteKeyword: string,
  targetAge: TargetAge = "30s",
  balloonOpts?: { authorIconUrl?: string; authorName?: string },
): Promise<GeneratedArticle> {
  const { year, monthLabel, seasonLabel } = getDateLabels();
  const ageLabel = targetAge === "20s" ? "20代" : targetAge === "30s" ? "30代" : "40代";
  const keywordNote = pasteKeyword ? `SEOキーワード: 「${pasteKeyword}」を自然に含めること。` : "";

  let prompt = `あなたはプロの美容ライター兼SEOコンサルタントです。
以下に「元記事」のタイトルとHTML本文を貼り付けます。この元記事の内容・構成をベースに、
SEO最適化された高品質なブログ記事として**全面リライト**してください。

## 元記事タイトル
${pasteTitle}

## 元記事HTML本文
${pasteHtml}

## リライトルール（必ず守ること）
- 元記事の情報・主張をベースにするが、**文章は完全にオリジナルで書き直す**（コピー率0%が目標）
- 元記事にない独自の切り口・補足情報・具体例を追加して付加価値を出す
- SEOを意識した見出し構成（h2/h3）に再構築する
- ${ageLabel}女性をメインターゲットに、親しみやすく信頼感のある文体で書く
- ${monthLabel}・${seasonLabel}の最新情報として書く（年数は${year}年を使うこと）
${keywordNote}

## 記事のクオリティ基準
- 文字数: 4,000〜8,000文字（元記事より充実させる）
- 導入文で読者の悩みに共感し、記事を読むメリットを明示
- 各セクションに具体的な情報（数値・成分名・価格帯など）を含める
- 「まとめ」セクションで要点を箇条書きで整理
- FAQ（よくある質問）を3問含める

## FAQ禁止事項
- 使用感を問う質問（「使い心地は？」「効果はありましたか？」）は入れない
- FAQでは客観的な質問のみ：「どんな人に向いていますか？」「主な成分は？」「どこで買えますか？」等
- 医学的効果を断言する回答は禁止（「シミが消えます」→「シミへのアプローチが期待できます」）
- 捏造した数値（「〇〇%の人が効果を実感」等）は禁止

## HTML出力ルール（厳守）
- 外部CSSリンク（Google Fonts等の<link>タグ）は絶対に含めない
- インラインスタイルのみ使用可（WordPressで正しく表示するため）
- <style>タグは使わない
- 画像タグ（<img>）は含めない（アイキャッチは別途生成される）

## 重要：黄色マーカー装飾（必ず実行すること）
htmlContent内で読者にとって特に重要な箇所に、以下のHTMLタグで黄色マーカーを引いてください：
<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- 1記事あたり3〜5箇所に使用
- 結論・注意点・ポイントなど重要なフレーズに使う

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

## JSON出力（これだけ出力。他のテキスト不要）
` + "```json\n" + `{
  "title": "SEO最適化タイトル（32文字以内）",
  "metaDescription": "120文字以内のメタディスクリプション",
  "htmlContent": "リライトしたHTML記事本文（黄色マーカー含む）",
  "slug": "english-seo-slug",
  "focusKeyword": "メインSEOキーワード",
  "keyword": "${pasteKeyword || "美容"}",
  "themeLabel": "テキスト貼り付け",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "faq": [{"question":"Q1","answer":"A1"},{"question":"Q2","answer":"A2"},{"question":"Q3","answer":"A3"}]
}
` + "```";

  prompt = buildPasteSeoPrompt(pasteTitle, pasteHtml, pasteKeyword, ageLabel, year, monthLabel, seasonLabel);

  if (balloonOpts) {
    prompt += "\n" + buildBalloonBlock(balloonOpts.authorIconUrl, balloonOpts.authorName);
  }

  const rawJson = await callClaude(apiKey, prompt, 24000);
  const parsed = extractJSON(rawJson);
  const article = buildGeneratedArticle(parsed, pasteKeyword || "paste-article", "テキスト貼り付け");

  if (balloonOpts?.authorIconUrl) {
    article.htmlContent = fixBalloonIcons(article.htmlContent, balloonOpts.authorIconUrl, balloonOpts.authorName);
  }
  return article;
}

function buildPasteSeoPrompt(
  pasteTitle: string,
  pasteHtml: string,
  pasteKeyword: string,
  ageLabel: string,
  year: number,
  monthLabel: string,
  seasonLabel: string,
): string {
  const keywordNote = pasteKeyword ? `- 狙う主キーワード: ${pasteKeyword}` : "- 狙う主キーワードは元記事から推定して設定すること";

  return `あなたはプロの美容ライター兼SEOコンサルタントです。
以下に「元記事」のタイトルとHTML本文を貼り付けます。この元記事の内容・構成をベースに、
検索順位を本気で取りにいく前提で、SEO最適化された高品質なブログ記事として全面リライトしてください。

## 元記事タイトル
${pasteTitle}

## 元記事HTML本文
${pasteHtml}

## 記事の前提
- メインターゲット: ${ageLabel}女性
- 季節・年月ラベル: ${monthLabel} / ${seasonLabel} / ${year}年
- 元記事の主張や事実は尊重しつつ、文章はオリジナルに書き直す
- コピー率0%を目指すが、根拠や事実は捏造しない
${keywordNote}

${SEO_REWRITE_SHARED_BLOCK}

## リライト方針
- 元記事にない補足を加える場合も、検索意図の補完に必要な内容だけを追加する
- 導入文は検索ユーザーの悩みと結論を最短で伝え、最初の100文字以内に主キーワードを含める
- H2/H3は検索意図を分担し、読者が次に知りたい順に並べる
- FAQは本文の重複ではなく、PAAに入りやすい補完質問を3問以上入れる
- まとめでは結論・注意点・次の行動を簡潔に示す
- 内部リンク候補が想定できる箇所には、自然な文脈で内部リンク案を本文に組み込む

## 内部リンク方針
- 導入文付近に1本、主要H2配下に2〜4本、まとめ直前に関連記事群を置く想定で構成する
- アンカーテキストは「リンク先の主キーワード + 読者便益」が伝わる自然文にする
- 同一URLへの重複リンクは最大2回まで
- 本文中の文脈リンクを優先し、関連記事ボックスは補助として使う

## 品質基準
- 文字数は4,000〜8,000文字を目安に、元記事より情報価値を上げる
- 各セクションに具体情報を入れるが、数値や効能は根拠URLがある場合のみ追加する
- AIっぽい抽象表現を避け、自然で読みやすい日本語にする
- 比較・選び方・注意点の見出しが必要なら追加してよい

## HTML出力ルール
- 外部CSSリンク（Google Fonts等の<link>タグ）は含めない
- <style>タグは使わない
- インラインスタイルのみ使用可
- 画像タグ（<img>）は含めない

## 重要：黄色マーカー装飾
htmlContent内で重要箇所に以下のHTMLタグで黄色マーカーを入れること
<span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
- 1記事あたり3〜5箇所
- 結論・注意点・おすすめ条件など短いフレーズに使う
- 見出しやリンクには使わない

${COMPLIANCE_BLOCK}

${STRICT_REFERENCES_BLOCK}

${SEO_REWRITE_JSON_BLOCK}`;
}

// ==========================================
// 既存記事リライト
// ==========================================

export type RewriteMode = "seo" | "add-products" | "full" | "internal-links" | "youtube-seo";

function buildRewritePrompt(
  existingTitle: string,
  existingHtml: string,
  mode: RewriteMode,
  options?: { keyword?: string; themeLabel?: string; products?: string[]; relatedPostsContext?: string },
): string {
  const d = getDateLabels();
  const keyword = options?.keyword || "(既存記事から推定)";
  const themeLabel = options?.themeLabel || "(既存記事から推定)";

  // --- 共通ヘッダー ---
  const header = `あなたはSEOに精通した美容ブログのプロ編集者です。
以下の既存記事を「編集」してください。

★ 最重要ルール：記事の内容・構成・論調はそのまま維持すること。
ゼロから書き直すのではなく、既存記事をベースに部分的な修正・追加だけを行う。
既存の文章で問題ない箇所はそのまま残すこと。

【既存タイトル】${existingTitle}
【既存HTML本文】
${existingHtml}

【現在の日付情報】${d.monthLabel}（${d.halfLabel} / ${d.seasonLabel}）
【狙うキーワード】${keyword}
【テーマ】${themeLabel}`;

  // --- モード別指示 ---
  let modeBlock = "";

  if (mode === "seo") {
    modeBlock = `
## 編集方針：SEO改善（内容は変えない）

### 修正対象（これだけ直す）
1. **日付の更新**: 古い年月表記（${CURRENT_YEAR - 1}年以前）→「${CURRENT_YEAR}年」「${d.monthLabel}」に置換
2. **タイトル微調整**: 32文字以内。キーワードが前半に入っていなければ語順調整。年月ラベル更新
3. **メタディスクリプション**: 120文字以内。既存を微調整（行動喚起が弱ければ追加）
4. **H2見出しの微調整**: キーワードや共起語が不足している見出しだけ、自然な形で補強
5. **導入文の微調整**: 最初の100文字にキーワードが含まれていなければ自然に追加
6. **内部リンクの追加**: 関連記事への内部リンクプレースホルダーを1〜2箇所追加
   形式: <p class="internal-link-suggestion">▶ 【関連記事】{テーマに関連する記事タイトル例}</p>
7. **黄色マーカー**: 重要ポイントに3〜5箇所。形式: <span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
8. **FAQ更新**: 古い情報があれば更新。検索需要が高そうな質問に差し替え
9. **参考文献の追加**: 参考文献セクションがなければ追加（最低2件）

### 変えてはいけないこと（厳守）
- 本文の内容・主張・論調はそのまま維持する
- 既存のアフィリエイトリンク・商品紹介は一切触らない
- 見出しの順序・階層構造は維持（H2/H3の追加は不要であれば行わない）
- 段落の削除・大幅な書き換えはしない
- 文体（ですます調等）は既存を踏襲`;
  } else if (mode === "add-products") {
    const productList = (options?.products || []).map((p, i) => `${i + 1}. ${p}`).join("\n");
    modeBlock = `
## 編集方針：アフィリエイト商品の追加のみ

【追加する商品】
${productList}

### やること（これだけ）
- 上記の商品を記事内の適切な位置に追加する
- 各商品について「特徴」「こんな人におすすめ」を2〜3文で自然に紹介
- 商品紹介の直後にアフィリエイトプレースホルダーを配置:
  <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：商品名】</p>
- 既存の比較表があれば新商品の行を追加
- 「※ 効果には個人差があります」の注記を追加

### 挿入位置のルール
- 既存の商品紹介セクションがあればその直後に追加
- なければ、まとめセクションの直前に新しい<h2>セクションとして挿入
- 記事冒頭やFAQ内には絶対に挿入しない

### 変えてはいけないこと（厳守）
- 既存のタイトル・メタディスクリプション・スラッグはそのまま返す
- 既存の本文テキストは1文字も変えない
- 既存の商品紹介・アフィリエイトリンクは触らない
- 既存の見出し構造は変えない`;
  } else if (mode === "internal-links") {
    const relatedCtx = options?.relatedPostsContext || "（関連記事データなし）";
    modeBlock = `
## 編集方針：内部リンク構造の強化のみ（SEO特化）

★ この編集の目的はSEOのための内部リンク最適化のみです。本文の内容・表現は一切変えません。

### 関連度分析に基づく挿入候補記事（スコア順）
${relatedCtx}

### やること（内部リンクの挿入のみ）

#### 1. コンテキスト内部リンク（最重要 — 3〜5箇所）
本文中で関連記事のトピックに自然に言及している箇所に、文脈に溶け込む形でインラインリンクを挿入。
形式:
<a href="{記事URL}" class="inline-internal-link" style="color:#7c3aed;text-decoration:underline;font-weight:500;">{アンカーテキスト}</a>

**アンカーテキストのSEOルール（厳守）:**
- リンク先記事のメインキーワードを含めること（「こちら」「この記事」は絶対NG）
- 2〜15文字の自然な日本語フレーズ
- 同じアンカーテキストを2回使わない
- リンク先の内容を正確に表すこと

#### 2. 関連記事ボックス（2〜3箇所）
各H2セクションの末尾付近で、そのセクションの内容に最も関連する記事へのボックスリンクを配置。
形式:
<div class="internal-link-box" style="background:#f8f0ff;border-left:4px solid #9b59b6;padding:12px 16px;margin:16px 0;border-radius:4px;font-size:14px;">
  <a href="{記事URL}" rel="noopener" style="color:#7c3aed;text-decoration:none;font-weight:bold;">▶ 【関連記事】{リンク先記事タイトル}</a>
</div>

#### 3. まとめセクション前の関連記事リスト（1箇所）
まとめ（H2）の直前に、記事全体に関連する3〜5記事のリストを配置。
形式:
<div class="related-posts-section" style="background:#f0f4ff;border:1px solid #d0d8f0;border-radius:8px;padding:16px 20px;margin:24px 0;">
  <p style="font-weight:700;font-size:15px;margin:0 0 10px;">📚 あわせて読みたい記事</p>
  <ul style="margin:0;padding-left:20px;line-height:2;">
    <li><a href="{URL}" style="color:#7c3aed;">{記事タイトル}</a></li>
  </ul>
</div>

### SEO内部リンク配置の原則（厳守）
- **トピカルクラスター構造**: 同じトピック群の記事同士をリンクで結ぶ（Googleがトピック権威性を評価）
- **ハブ＆スポーク**: この記事をハブとして、関連するスポーク記事に均等にリンクジュースを分配
- **リンクの深さ**: 記事上部（導入文〜最初のH2）に最も重要な関連記事へのリンクを配置（クロール優先度が高い）
- **過剰リンク禁止**: 1記事あたり合計8〜12本の内部リンクが上限。それ以上は逆効果
- **自然な文脈**: リンクは読者が「もっと知りたい」と思うタイミングに配置
- **重複回避**: 同じ記事への内部リンクは最大2回まで（インライン1回＋ボックス1回）
- **関連度スコアが高い記事を優先**: スコア上位の記事により多くのリンクを割り当てる

### 変えてはいけないこと（厳守）
- 本文の内容・主張・論調・表現は1文字も変えない
- 既存の内部リンク・外部リンク・アフィリエイトリンクは一切触らない
- タイトル・メタディスクリプション・スラッグは既存をそのまま返す
- 見出し（H2/H3）のテキストは変えない
- 画像・テーブル・リストの内容は変えない
- FAQの内容は変えない（既存をそのまま返す）
- 文体・フォントスタイル・装飾は変えない`;
  } else if (mode === "youtube-seo") {
    // YouTube記事専用SEOリライト
    modeBlock = `
## 編集方針：YouTube紹介記事のSEO完全リライト

★ 既存記事の「情報・事実・アフィリエイトリンク」は維持しつつ、構成・見出し・SEO要素を現在の最高水準に全面刷新する。

---

### 【STEP 1】タイトル刷新（55〜60文字）
形式：「[メインキーワード]を[チャンネル名]様が解説！[数字]つのポイントまとめ・成分解析レビュー」
- 数字を必ず含める（「〇選」「〇つのポイント」）
- 「徹底解説」「おすすめ」などCTRが高いワードを含める
- キーワードを先頭に

### 【STEP 2】メタディスクリプション刷新（120〜160文字）
- 冒頭にキーワード
- 「〜について〇つのポイントを解説。筆者みおの実体験レビューもあり。」という具体的な内容
- 感情を動かすワード（「正直レビュー」「実際に試した」「気になる人必見」）を含める

### 【STEP 3】スラッグ刷新（必須）
現在のスラッグが日本語文字エンコードの場合は英数字ハイフンのみに変更。
形式：「{メインキーワードの英字}-{チャンネル名英字}-review」
例：「skincare-ingredients-sumisho-review」

### 【STEP 4】記事構成を9セクション制に刷新（4500〜6000文字）

#### ① 導入文（150文字以内）
- **冒頭1文目にメインキーワード**を必ず含める
- 「この記事でわかること：」で読者が得られる情報を示す

#### ② 「この記事でわかること」ボックス（Featured Snippet狙い・必須）
以下のHTMLで作成：
<div style="background:#f0f9f4;border-left:4px solid #3a8f7a;border-radius:8px;padding:16px 20px;margin:20px 0;">
  <p style="font-weight:bold;font-size:14px;margin:0 0 8px;color:#3a8f7a;">📌 この記事でわかること</p>
  <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.9;">
    <li>（既存記事の内容から3〜4項目を箇条書き）</li>
  </ul>
</div>

#### ③ YouTube動画埋め込み
既存記事内のYouTube埋め込みをそのままこの位置に配置

#### ④ H2：「[チャンネル名]様はどんな専門家？信頼性をチェック」（200〜300文字）
既存記事にある経歴・専門性情報を使ってE-E-A-T「権威性」を強化する段落を書く

#### ⑤ H2：「[メインキーワード]とは？動画の要点[数字]選」（600〜800文字）
- **番号付きリスト（ol）で3〜5つのポイント**に整理（Featured Snippet狙い）
- 各ポイントはH3で見出しを付け、100〜150文字で解説
- H3タグには必ずキーワード（成分名・概念名）を含める
- 既存の内容を再構成する（削除はしない）

#### ⑥ H2：「[成分名/概念]を正しく理解する｜作用機序から解説」（700〜900文字）
- 既存の成分・商品解説をベースに「作用機序レベル」で深掘り
- 肌悩み別の効果を整理
- 既存アフィリエイトリンクはそのまま維持し、自然な文脈に溶け込ませる

#### ⑦ H2：「みおの実体験レビュー｜実際に[成分/商品]を試してみた」（500〜700文字）
- 既存の「みおのコメント」セクションを拡充する
- 具体的な使用シーン・期間・変化を追加（「朝晩2週間使ったら〜」等）
- 正直な注意点を1つ書く（信頼性向上）
- 肌タイプ別（乾燥肌・混合肌・敏感肌）の向き不向きを示す
- 黄色マーカー2〜3か所を挿入

#### ⑧ H2：「よくある質問｜[メインキーワード]について」（FAQ・PAA狙い）
Googleの「他のユーザーの質問」に掲載されやすい形式で3つのQ&Aを作成：
- Q: （具体的な疑問。「〜は効果ありますか？」でなく「〜を使うと何が変わりますか？」等）
- A: 3〜4文で完結した回答
既存FAQがあれば内容を参考にしつつ刷新

#### ⑨ H2：「まとめ｜[メインキーワード]を活かしたスキンケアを」（200文字）
- 記事全体の結論を1段落
- 動画へのCTA（「ぜひ動画本編もご覧ください」等）
- 黄色マーカー1か所

---

### 【STEP 5】VideoObject + FAQPage スキーマを末尾に追加（必須）
既存記事のYouTube動画URLとFAQの内容を使ってJSON-LDを生成し記事末尾に追加する：
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Q1","acceptedAnswer":{"@type":"Answer","text":"A1"}},...]}</script>

---

### 変えてはいけないこと（厳守）
- 既存のアフィリエイトリンク・楽天商品リンクは一切触らない（HTMLのまま維持）
- YouTube動画の埋め込みコードはそのまま維持
- 出典元チャンネル名・参考文献の事実情報は変えない
- 既存にある厚労省・JCIA等の外部リンクはそのまま維持
- 文体（ですます調）は既存を踏襲`;

  } else {
    // full mode
    const productList = (options?.products || []).map((p, i) => `${i + 1}. ${p}`).join("\n");
    const productSection = productList
      ? `\n8. **商品追加**: 以下の商品を適切な位置に挿入。各商品に「特徴」「こんな人におすすめ」を2〜3文で紹介し、直後にプレースホルダー配置:\n   <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：商品名】</p>\n\n【追加する商品】\n${productList}`
      : "";

    modeBlock = `
## 編集方針：総合改善（既存記事をベースに）

★ 大原則：既存記事の内容・構成を尊重しつつ、以下の改善を加える。
ゼロから書き直すのではなく「赤ペン添削」のイメージ。

### 修正対象
1. **情報の鮮度**: 古い年月→${CURRENT_YEAR}年に更新。古くなった情報があれば最新に
2. **SEO**: タイトル微調整（32文字以内）、メタディスクリプション最適化（120文字以内）、H2への共起語補強、導入文にキーワード追加
3. **文章の質**: 不自然な日本語・AIっぽい表現があれば自然な言い回しに修正。冗長な箇所を簡潔に
4. **リンク改善**: 内部リンクプレースホルダーを1〜2箇所追加
   形式: <p class="internal-link-suggestion">▶ 【関連記事】{関連テーマ記事タイトル例}</p>
5. **黄色マーカー**: 3〜5箇所に調整。形式: <span style="background:linear-gradient(transparent 60%,#fff799 60%)">重要なテキスト</span>
6. **FAQ**: 古い情報更新。検索需要に合わせて質問を差し替え
7. **参考文献**: なければ追加、あれば必要に応じて更新${productSection}

### 変えてはいけないこと（厳守）
- 記事の主旨・結論を変えない
- 既存のアフィリエイトリンク・商品紹介の内容は維持
- 段落の大量削除はしない（削る場合は冗長な1〜2文のみ）
- 文体（ですます調等）は既存を踏襲
- 見出しの順序は基本維持（明らかに読者体験を損なう場合のみ入れ替え可）`;
  }

  // --- 共通フッター: コンプライアンス + 参考文献 + 出力形式 ---
  const footer = `

${COMPLIANCE_BLOCK}

${REFERENCES_BLOCK}

## 出力形式
以下のJSON形式で出力してください（他のテキストは一切不要）：

\`\`\`json
{
  "htmlContent": "編集後のHTML本文（★このフィールドは必ず最後まで出力すること。途中で切らない）",
  "title": "編集後のタイトル（変更不要なら既存タイトルをそのまま）",
  "metaDescription": "120文字以内のメタディスクリプション",
  "slug": "既存スラッグをそのまま維持（変更不要）",
  "focusKeyword": "メインキーワード",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "faq": [
    {"question": "質問1", "answer": "回答1"},
    {"question": "質問2", "answer": "回答2"}
  ],
  "products": [
    {"name": "商品名", "description": "特徴", "brand": "ブランド", "price": 3980, "rating": 4.5, "reviewCount": 100}
  ]
}
\`\`\`

★重要：htmlContentは記事の全HTMLを省略せず完全に出力してください。トークン数が多くても途中で止めないでください。`;

  return header + modeBlock + footer;
}

function buildRewritePromptV2(
  existingTitle: string,
  existingHtml: string,
  mode: RewriteMode,
  options?: { keyword?: string; themeLabel?: string; products?: string[]; relatedPostsContext?: string },
): string {
  const d = getDateLabels();
  const keyword = options?.keyword || "(既存記事から推定)";
  const themeLabel = options?.themeLabel || "(既存記事から推定)";
  const relatedCtx = options?.relatedPostsContext
    ? `\n## 関連記事候補（内部リンク設計に使うこと）\n${options.relatedPostsContext}\n`
    : "";
  const sharedSeoBlock = mode === "add-products" ? "" : SEO_REWRITE_SHARED_BLOCK;

  const header = `あなたはSEOに精通した美容ブログのプロ編集者です。
以下の既存記事を、検索順位改善を最優先にしながら編集してください。

★ 大原則
- 記事の主張・事実・論調は維持する
- ゼロから書き直すのではなく、既存記事をベースに改善する
- ただしSEO改善に必要な見出し再編、補足段落追加、FAQ再設計、参考文献整理、内部リンク再設計は許容する
- 検索意図との一致を優先し、読者の次の疑問を先回りして解消する

【既存タイトル】${existingTitle}
【既存HTML本文】
${existingHtml}

【現在の日付情報】${d.monthLabel}（${d.halfLabel} / ${d.seasonLabel}）
【狙うキーワード】${keyword}
【テーマ】${themeLabel}

${sharedSeoBlock}${relatedCtx}`;

  let modeBlock = "";

  if (mode === "seo") {
    modeBlock = `
## 編集方針：SEO改善（検索順位強化）

### 目的
- 軽微修正ではなく、検索意図補完 + H2最適化 + 導入文改善 + FAQ/PAA再設計 + 内外部リンク強化を行う
- 本文の主張や主要事実は維持するが、読者理解を高めるための見出し再編と補足段落追加は許容する

### 必須修正
1. 日付・鮮度表現を ${CURRENT_YEAR}年 / ${d.monthLabel} 基準で見直す
2. タイトルを検索意図優先で再設計し、主キーワードを前半に置く
3. 導入文の最初の100文字に主キーワードを自然に含める
4. H2ごとに異なる検索意図を担当させ、見出し重複を避ける
5. 本文の不足情報を補う短い補足段落を必要箇所に追加する
6. FAQはPAAを狙う補完質問に刷新する
7. 根拠を追加した箇所には必ず外部リンクURL付きの参考文献を付ける

### 内部リンク設計
- 導入文付近に最重要の関連記事リンクを1本配置する
- 主要H2配下に2〜4本の文脈内部リンクを入れる
- まとめ直前に関連記事リストを1箇所入れる
- アンカーテキストは「リンク先の主キーワード + 読者便益」が伝わる自然文にする
- 同一URLへのリンクは最大2回まで
- 内部リンク挿入用に必要なら以下の形式も使ってよい
  <p class="internal-link-suggestion">▶ 【関連記事】関連する記事タイトル</p>

### 変えてはいけないこと
- 医学的断定や根拠のない強い表現を追加しない
- 既存のアフィリエイトリンクは壊さない
- 記事の結論を別物にしない`;
  } else if (mode === "add-products") {
    const productList = (options?.products || []).map((p, i) => `${i + 1}. ${p}`).join("\n");
    modeBlock = `
## 編集方針：アフィリエイト商品の追加のみ

【追加する商品】
${productList}

### やること
- 上記の商品を記事内の適切な位置にだけ追加する
- 各商品は「特徴」「こんな人におすすめ」を2〜3文で自然に紹介する
- 商品紹介の直後に以下のプレースホルダーを置く
  <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：商品名】</p>
- 比較表があれば必要な行だけ追加する
- 「※ 効果には個人差があります」の注記を入れる

### 変えてはいけないこと
- 既存本文は必要最小限以外書き換えない
- タイトル・メタディスクリプション・スラッグはそのまま返す
- 既存アフィリエイトリンクを壊さない`;
  } else if (mode === "internal-links") {
    modeBlock = `
## 編集方針：内部リンク構造の強化のみ（SEO特化）

### 目的
- 本文の主張や表現を壊さず、内部リンクの役割設計だけを最適化する
- どのH2で何の疑問を次の記事に送るかを明確にする

### 実行ルール
1. 導入文付近に最重要リンクを1本入れる
2. 主要H2配下に2〜4本の文脈内部リンクを入れる
3. まとめ直前に関連記事群を1箇所入れる
4. 同一URLへのリンクは最大2回まで
5. 本文リンクを優先し、関連記事ボックスは補助にする
6. 上位スコアの記事から優先して使い、可能なら上位3件はどこかで必ず触れる

### アンカーテキストのルール
- 「こちら」「この記事」など曖昧語は禁止
- リンク先の主キーワードを含めつつ、読者便益が伝わる自然文にする
- 2〜20文字程度の自然な日本語フレーズにする

### 出力上の注意
- 本文の意味を変えない
- タイトル・メタディスクリプション・スラッグは原則維持
- 既存の外部リンク・アフィリエイトリンクは壊さない`;
  } else if (mode === "youtube-seo") {
    modeBlock = `
## 編集方針：YouTube紹介記事のSEO完全リライト

### 目的
- 動画要約だけで終わらせず、動画要点の整理、専門性/E-E-A-T補強、PAA向けFAQ、出典URL付き参考文献まで入れる
- 既存の動画埋め込み、事実、アフィリエイトリンクは維持する

### 必須要件
1. タイトルは主キーワード先頭 + 数字 + 読者便益が伝わる形にする
2. 導入文の1文目に主キーワードを入れる
3. 「この記事でわかること」ボックスを入れる
4. チャンネルの専門性・信頼性を示すH2を入れる
5. 動画の要点を番号付きで整理するH2を入れる
6. FAQをPAA向けに3問以上作る
7. 参考文献はURL付きで2〜5件入れる
8. 既存動画URLとFAQ内容に基づくFAQPage / VideoObject用の構造化データを本文末尾に置く

### 変えてはいけないこと
- YouTube埋め込みコードは維持
- 既存アフィリエイトリンクは壊さない
- 事実が確認できない補足を作らない`;
  } else {
    const productList = (options?.products || []).map((p, i) => `${i + 1}. ${p}`).join("\n");
    const productSection = productList
      ? `\n### 商品追加\n- 以下の商品は必要な場合のみ差し込む\n${productList}\n- 追加直後に <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：商品名】</p> を置く`
      : "";

    modeBlock = `
## 編集方針：総合改善（SEO + 可読性 + 導線）

### 目的
- \`seo\` モードの改善に加え、冗長削除、比較観点の補強、CTA整理、必要時のみ商品差し込みまで行う

### 必須修正
1. 古い情報や鮮度の低い表現を更新する
2. タイトル・導入文・H2・FAQ・まとめを検索意図に合わせて再設計する
3. 冗長な言い回しを削り、AIっぽい抽象表現を自然文に直す
4. 内部リンクを役割設計ベースで配置する
5. 参考文献をURL付きで整理する
6. 必要なら比較基準・選び方・向いている人/向かない人を補う
${productSection}

### 変えてはいけないこと
- 記事の結論を別物にしない
- 根拠のない比較優位を作らない
- 既存アフィリエイトリンクを壊さない`;
  }

  return `${header}

${modeBlock}

${COMPLIANCE_BLOCK}

${STRICT_REFERENCES_BLOCK}

${SEO_REWRITE_JSON_BLOCK}`;
}

/** 既存記事のリライト（SEO改善 / 商品追加 / 総合改善 / 内部リンク強化） */
export async function rewriteArticle(
  apiKey: string,
  existingHtml: string,
  existingTitle: string,
  mode: RewriteMode,
  options?: { keyword?: string; themeLabel?: string; products?: string[]; relatedPostsContext?: string },
): Promise<GeneratedArticle> {
  const prompt = buildRewritePromptV2(existingTitle, existingHtml, mode, options);
  const responseText = await callClaude(apiKey, prompt, 16000);
  const parsed = extractJSON(responseText);
  return buildGeneratedArticle(
    parsed,
    options?.keyword || existingTitle,
    options?.themeLabel || "リライト",
  );
}

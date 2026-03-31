// ==========================================
// BlogEngine V2 - AI Image Generator (DALL-E 3)
// 記事内容に基づく動的アイキャッチ画像生成
// ==========================================

import OpenAI from "openai";

export interface GeneratedImage {
  imageUrl: string;       // DALL-E が返す一時URL（有効期限あり）
  prompt: string;         // 使用したプロンプト
  revisedPrompt: string;  // DALL-E が修正したプロンプト
  altText: string;        // WordPress用 alt テキスト
}

// ----- ビジュアルスタイルのバリエーション -----
const VISUAL_STYLES = [
  "soft pastel flat-lay on white marble, shot from directly above, natural window light",
  "minimalist arrangement on light linen fabric, warm golden hour sunlight, shallow depth of field",
  "elegant glass shelf display with soft bokeh background, cool-toned studio lighting",
  "dreamy bathroom vanity setup with steam and soft focus, morning light through frosted glass",
  "clean wooden tray arrangement with fresh flowers and greenery accents, bright airy feel",
  "luxury dressing table scene with mirror reflections, soft pink ambient lighting",
  "modern ceramic tile background with geometric shadows, harsh but artistic sunlight",
  "cozy bedroom nightstand scene with candles, warm evening atmosphere",
  "fresh and dewy aesthetic with water droplets, cool blue-green tones",
  "high-contrast editorial style on dark slate surface, dramatic spotlight",
];

// ----- テーマ別のビジュアル要素 -----
const THEME_VISUAL_ELEMENTS: Record<string, string[]> = {
  "医療脱毛（女性）": ["smooth silk fabric texture", "clinical beauty tools", "clean white aesthetic with rose gold accents"],
  "IPL・フォトフェイシャル": ["light beams and prism effects", "glowing translucent materials", "high-tech beauty device"],
  "ハイフ（HIFU）": ["advanced beauty technology device", "skin-tightening concept art", "futuristic beauty tool"],
  "肝斑・くすみ治療": ["brightening vitamin C serums", "citrus and luminous elements", "glass bottles with golden liquid"],
  "レーザートーニング": ["precision laser light effects", "clinical elegance", "modern dermatology aesthetic"],
  "ピーリング・毛穴治療": ["exfoliating textures and smooth surfaces", "before-concept of rough to smooth", "AHA/BHA serum bottles"],
  "エレクトロポレーション": ["electronic beauty device close-up", "scientific skincare", "high-tech facial treatment"],
  "エラボトックス・ボトックス": ["precision medical aesthetics", "youthful elegance concept", "clinical beauty vials"],
  "オンライン美容診療": ["tablet showing consultation", "home skincare setup", "digital health meets beauty"],
  "エイジングケア化粧品": ["luxury anti-aging serums and creams", "retinol bottles", "elegant gold-accent packaging"],
  "日焼け止め・UVケア": ["sunscreen bottles with tropical leaves", "beach-inspired beauty", "UV protection concept with sunshine"],
  "敏感肌スキンケア": ["gentle calming products", "chamomile and aloe ingredients", "minimal pure white packaging"],
  "クレンジング・洗顔": ["foam and bubbles texture", "cleansing oil bottles", "fresh water splash concept"],
  "毛穴ケア（ホームケア）": ["clay mask texture", "pore-refining serums", "smooth porcelain surface contrast"],
  "ニキビ・肌荒れケア": ["acne treatment products", "tea tree and salicylic acid bottles", "clear skin recovery journey"],
  "シャンプー・ヘアケア": ["shampoo bottles with flowing hair strands", "botanical hair ingredients", "glossy hair texture"],
  "ボディケア・デリケートゾーン": ["body lotion and cream jars", "soft towel and spa elements", "moisturizing textures"],
  "美容サプリ・インナーケア": ["colorful supplement capsules", "collagen powder and drink", "wellness and nutrition"],
  "時短スキンケア": ["all-in-one gel jars", "simple minimalist routine", "clock concept with skincare"],
};

/**
 * 記事タイトル・キーワード・テーマから動的にDALL-Eプロンプトを生成
 * 毎回異なるスタイルとビジュアル要素を組み合わせる
 */
export function buildEyecatchPrompt(
  title: string,
  keyword: string,
  themeLabel: string,
): string {
  // タイトルのハッシュからスタイルを選択（同じタイトルなら同じスタイル、違うタイトルなら違うスタイル）
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  const styleIndex = Math.abs(hash) % VISUAL_STYLES.length;
  const style = VISUAL_STYLES[styleIndex];

  // テーマ別ビジュアル要素（ランダム1つ選択）
  const elements = THEME_VISUAL_ELEMENTS[themeLabel] || ["beauty skincare products", "elegant cosmetics", "luxury beauty items"];
  const elementIndex = Math.abs(hash >> 3) % elements.length;
  const visualElement = elements[elementIndex];

  // キーワードから具体的な被写体を推定
  const subjectHints = extractVisualSubject(keyword);

  // 比較・ランキング記事対応
  const isComparison = themeLabel === "商品比較";
  const isRanking = themeLabel === "商品ランキング" || title.includes("ランキング") || title.includes("選");
  const layoutHint = isRanking
    ? "Layout: Multiple beauty products arranged in a visually appealing podium or stepped arrangement suggesting a ranking. Gold, silver, bronze accents."
    : isComparison
    ? "Layout: Two beauty products placed side by side in an elegant comparison arrangement, with subtle VS or split-screen composition."
    : "";

  return `A beautiful, unique beauty blog header photograph.
Scene: ${style}.
Main subject: ${visualElement}.
Visual details inspired by: ${subjectHints}.
${layoutHint}
The image should evoke the feeling of "${title}" - make it specific to this exact topic.
High-end beauty magazine editorial quality. Photorealistic.
NO text, NO letters, NO words, NO watermarks, NO brand logos.
NO human faces or identifiable body parts.
Aspect ratio 16:9.`;
}

/**
 * 商品名リストから商品イメージのアイキャッチプロンプトを生成する
 */
export function buildProductEyecatchPrompt(productNames: string[]): string {
  const productDesc = productNames.slice(0, 3).join(", ");

  // 商品名のハッシュからスタイル選択
  let hash = 0;
  for (const name of productNames) {
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
  }
  const styleIndex = Math.abs(hash) % VISUAL_STYLES.length;
  const style = VISUAL_STYLES[styleIndex];

  return `A stunning beauty product photography for a blog header.
Products to represent: ${productDesc}.
Scene: ${style}.
Show elegant beauty product bottles, jars, or tubes that represent these specific items.
Each product should look distinct and identifiable by its type.
Professional commercial photography quality with perfect composition.
NO text, NO letters, NO words, NO watermarks, NO brand logos on the image.
NO human faces or identifiable body parts.
Aspect ratio 16:9.`;
}

/**
 * 日本語キーワードからビジュアル被写体のヒントを抽出
 */
function extractVisualSubject(keyword: string): string {
  const keywordMap: [RegExp, string][] = [
    [/脱毛/, "smooth skin, silk fabric, clean aesthetic"],
    [/シミ|美白|ブライトニング/, "brightening serums, vitamin C, luminous glow"],
    [/シワ|たるみ|エイジング|ほうれい線/, "anti-aging luxury creams, firming serums, gold accents"],
    [/毛穴/, "pore-minimizing products, smooth textures, magnifying concept"],
    [/ニキビ|肌荒れ/, "acne care products, soothing green tones, tea tree elements"],
    [/日焼け|UV|紫外線/, "sunscreen bottles, tropical sun concept, beach-inspired"],
    [/敏感肌/, "gentle products, calming lavender tones, hypoallergenic feel"],
    [/クレンジング|洗顔/, "cleansing foam, water droplets, freshness"],
    [/化粧水|ローション/, "toner bottles, hydrating mist, dewy texture"],
    [/美容液|セラム/, "glass dropper bottles, concentrated essence, premium serum"],
    [/クリーム|保湿/, "rich cream jars, moisturizing texture, luxurious feel"],
    [/シャンプー|ヘアケア/, "shampoo bottles, flowing silky hair, botanical ingredients"],
    [/サプリ|コラーゲン/, "supplement capsules, wellness drinks, inner beauty"],
    [/ハイフ|HIFU/, "ultrasound beauty device, skin tightening concept"],
    [/ボトックス/, "clinical beauty vials, precise treatment concept"],
    [/ピーリング/, "exfoliation concept, smooth gradient texture"],
    [/レーザー/, "light beam effects, precision technology"],
    [/IPL|フォトフェイシャル/, "light therapy concept, radiant glow effect"],
    [/オンライン|診療/, "digital device with beauty products, modern telehealth"],
    [/時短|オールインワン/, "single product simplicity, minimalist approach"],
    [/ボディ/, "body care products, spa atmosphere, self-care ritual"],
    [/おすすめ|比較|ランキング/, "multiple products arranged for comparison"],
    [/料金|安い/, "value and quality balance concept"],
    [/効果|口コミ/, "before-and-after concept art, transformation"],
  ];

  const matches: string[] = [];
  for (const [regex, visual] of keywordMap) {
    if (regex.test(keyword)) {
      matches.push(visual);
    }
  }

  return matches.length > 0 ? matches.join(", ") : "beauty and skincare products, elegant cosmetics arrangement";
}

/**
 * DALL-E 3 でアイキャッチ画像を生成する（テーマモード）
 */
export async function generateEyecatchImage(
  apiKey: string,
  title: string,
  keyword: string,
  themeLabel: string,
): Promise<GeneratedImage> {
  const client = new OpenAI({ apiKey });
  const prompt = buildEyecatchPrompt(title, keyword, themeLabel);

  const response = await client.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1792x1024",
    quality: "standard",
    response_format: "url",
  });

  const imageData = response.data?.[0];
  if (!imageData?.url) {
    throw new Error("DALL-E 3 から画像URLが返されませんでした");
  }

  return {
    imageUrl: imageData.url,
    prompt,
    revisedPrompt: imageData.revised_prompt || prompt,
    altText: `${title} - ${themeLabel}`,
  };
}

/**
 * DALL-E 3 でアイキャッチ画像を生成する（商品モード）
 */
export async function generateProductEyecatchImage(
  apiKey: string,
  productNames: string[],
  title: string,
): Promise<GeneratedImage> {
  const client = new OpenAI({ apiKey });
  const prompt = buildProductEyecatchPrompt(productNames);

  const response = await client.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1792x1024",
    quality: "standard",
    response_format: "url",
  });

  const imageData = response.data?.[0];
  if (!imageData?.url) {
    throw new Error("DALL-E 3 から画像URLが返されませんでした");
  }

  return {
    imageUrl: imageData.url,
    prompt,
    revisedPrompt: imageData.revised_prompt || prompt,
    altText: `${title} - ${productNames.slice(0, 3).join("・")}`,
  };
}

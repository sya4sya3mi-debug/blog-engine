"use client";
import { useState, useEffect, useCallback } from "react";
import { buildBookmarkableTweet, TWEET_STYLES, type TweetStyle, type TweetLength } from "@/lib/x-poster";

// ==========================================
// useMediaQuery Hook for responsive design
// ==========================================
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

// ==========================================
// Safe JSON response parser
// ==========================================
async function safeJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 200) || `サーバーエラー (${res.status})`);
  }
  const trimmed = text.trim();
  if (!trimmed) throw new Error("サーバーから空のレスポンスが返されました");
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}$/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error("レスポンスの解析に失敗しました: " + trimmed.slice(0, 100));
  }
}

// ==========================================
// Types
// ==========================================
interface SubTheme {
  id: string;
  label: string;
  keywords: string[];
  articleIntent?: "uru" | "atsumeru";
}

interface AffiliateLink {
  themeId: string;
  html: string;
}

type CommissionType = "cpa" | "cpc" | "percent";

type AffiliateTier = "S" | "A" | "B";

interface AffiliatePartner {
  id: string;
  asp: string;
  programName: string;
  themeIds: string[];
  commissionType: CommissionType;
  commissionValue: string;
  priority: number;
  html: string;
  active: boolean;
  tier: AffiliateTier;
  estimatedCpa: number;
}

interface HistoryItem {
  id: number;
  title: string;
  keyword: string;
  themeLabel: string;
  mode: "auto" | "theme" | "product" | "category";
  htmlContent: string;
  metaDescription: string;
  wpPostId?: number;
  wpStatus?: string;
  wpLink?: string;
  savedXText?: string;
  scheduledDate?: string;
  createdAt: string;
}

// ==========================================
// Themes data (mirror of server config)
// ==========================================
// V3: 6テーマ × ロングテール悩み系キーワード
const THEMES: SubTheme[] = [
  { id: "bihaku-shimi", label: "シミ・美白ケア", articleIntent: "uru", keywords: ["30代 シミ 急に増えた 原因", "シミ 消したい 自宅ケア 方法", "頬のシミ 薄くする 美容液 選び方", "マスク跡 色素沈着 消す方法", "肝斑 シミ 違い 見分け方", "産後 シミ 増えた スキンケア", "トラネキサム酸 シミ 効果 期間", "ビタミンC誘導体 美容液 選び方 濃度", "ハイドロキノン 市販 使い方 注意点"] },
  { id: "keana-nikibi", label: "毛穴・ニキビ悩み", articleIntent: "atsumeru", keywords: ["鼻の毛穴 黒ずみ 取れない 原因", "30代 毛穴 開き 改善 スキンケア", "大人ニキビ 繰り返す 原因 対策", "顎ニキビ 治らない 内側からケア", "ニキビ跡 赤み 消す方法 自宅", "毛穴 酵素洗顔 正しい使い方", "ピーリング 自宅 やり方 頻度"] },
  { id: "aging-care", label: "エイジングケア", articleIntent: "uru", keywords: ["30代 ほうれい線 目立ってきた 対策", "目の下 たるみ スキンケア 30代", "おでこ シワ 改善 クリーム", "レチノール 初心者 使い方 注意点", "ナイアシンアミド レチノール 併用 方法", "30代 基礎化粧品 見直し タイミング", "たるみ毛穴 ハリ美容液 選び方"] },
  { id: "datsumo", label: "医療脱毛", articleIntent: "uru", keywords: ["医療脱毛 痛い 我慢できる レベル", "VIO脱毛 恥ずかしい 初めて 流れ", "医療脱毛 何回で終わる リアル体験", "脱毛サロン 医療脱毛 違い 結局どっち", "医療脱毛 後悔 した人 理由", "医療脱毛 学生 安い 分割払い"] },
  { id: "biyou-clinic", label: "美容クリニック施術", articleIntent: "uru", keywords: ["ハイフ 痛い 効果 いつから わかる", "ボトックス 初めて 不安 副作用", "シミ取り レーザー 料金 1個いくら", "美容皮膚科 初めて 何する 費用", "ダーマペン 毛穴 効果 ダウンタイム", "美容クリニック 選び方 失敗しない ポイント"] },
  { id: "hair-care", label: "ヘアケア・頭皮ケア", articleIntent: "uru", keywords: ["髪 パサパサ 広がる 原因 対策", "頭皮 かゆい フケ 原因 シャンプー", "白髪 30代 増えてきた 対策", "アミノ酸シャンプー 市販 ドラッグストア", "カラー後 色落ち 防ぐ シャンプー", "トリートメント 市販 サロン級 おすすめ"] },
];

// ==========================================
// Styles
// ==========================================
const C = {
  bg: "#0A0A0F", bgCard: "#0F0F1A", border: "#1E1E30", borderLight: "#2A2A3C",
  accent: "#FF6B9D", accentAlt: "#00D4FF", green: "#00C896", orange: "#FFB347", red: "#FF6B6B",
  text: "#E8E8F0", textDim: "#888899", textMuted: "#555570",
};

// ==========================================
// Component
// ==========================================
export default function Dashboard() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authToken, setAuthToken] = useState("");
  // JWTトークン取得ヘルパー
  function getPwd(): string {
    if (authToken) return authToken;
    try {
      const t = localStorage.getItem("be_token");
      if (t) return t;
    } catch {}
    return "";
  }
  // 401レスポンス時にログイン画面に戻す
  function handleAuthError() {
    setAuthToken("");
    try { localStorage.removeItem("be_token"); } catch {}
    setLoggedIn(false);
    alert("セッションが切れました。再ログインしてください。");
  }
  // 認証付きfetchラッパー（401時に自動ログアウト）
  async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers || {});
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${getPwd()}`);
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) { handleAuthError(); throw new Error("セッションが切れました"); }
    return res;
  }
  const [loginError, setLoginError] = useState("");

  // セッション復元（localStorage + sessionStorage）
  useEffect(() => {
    try {
      const session = localStorage.getItem("be_session");
      const savedToken = localStorage.getItem("be_token");
      if (session && savedToken) {
        const parsed = JSON.parse(session);
        if (parsed.loggedIn && Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          setLoggedIn(true);
          setAuthToken(savedToken);
        } else {
          localStorage.removeItem("be_session");
          localStorage.removeItem("be_token");
        }
      }
    } catch {}
  }, []);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("be_tab") || "dashboard";
    }
    return "dashboard";
  });
  // タブ変更時にsessionStorageに保存
  useEffect(() => {
    try { sessionStorage.setItem("be_tab", activeTab); } catch {}
  }, [activeTab]);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Generate state
  const [genMode, setGenMode] = useState<"theme" | "product" | "category" | "personal-review">("category");
  // 本人使用投稿用state
  const [reviewProductName, setReviewProductName] = useState("");
  const [reviewRating, setReviewRating] = useState(4);
  const [reviewUsagePeriod, setReviewUsagePeriod] = useState("1ヶ月程度");
  const [reviewSkinType, setReviewSkinType] = useState("混合肌");
  const [reviewTexture, setReviewTexture] = useState("");
  const [reviewGoodPoints, setReviewGoodPoints] = useState("");
  const [reviewBadPoints, setReviewBadPoints] = useState("");
  const [reviewRepurchase, setReviewRepurchase] = useState(true);
  const [reviewPrice, setReviewPrice] = useState("");
  const [reviewChannel, setReviewChannel] = useState("楽天");
  const [reviewSkinConcerns, setReviewSkinConcerns] = useState<string[]>([]);
  const [reviewComparisonNote, setReviewComparisonNote] = useState("");
  const [reviewPhotos, setReviewPhotos] = useState<{ file?: File; preview: string; wpUrl?: string; wpId?: number }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("clinic-comparison");
  const [selectedSubThemes, setSelectedSubThemes] = useState<string[]>([]);
  const [suggestTopics, setSuggestTopics] = useState<string[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [selectedSuggest, setSelectedSuggest] = useState("");
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [selectedKeyword, setSelectedKeyword] = useState(THEMES[0].keywords[0]);
  // 記事テーマAI提案
  const [articleThemes, setArticleThemes] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem("be_article_themes");
      if (cached) return JSON.parse(cached).themes || [];
    } catch {}
    return [];
  });
  const [articleThemesLoading, setArticleThemesLoading] = useState(false);
  // カテゴリーテーマ提案（三者会議）
  const [categoryThemeSuggestions, setCategoryThemeSuggestions] = useState<any[]>([]);
  const [categoryThemesLoading, setCategoryThemesLoading] = useState(false);
  // 商品モード: 商品名とアフィリエイトHTMLをセットで管理
  interface ProductEntry { name: string; affiliateHtml?: string; imageUrl?: string; price?: number; profitScore?: number; }
  const [products, setProducts] = useState<ProductEntry[]>([{ name: "" }]);
  const [customKeyword, setCustomKeyword] = useState("");
  // 比較モード
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [targetAge, setTargetAge] = useState<"20s" | "30s" | "40s">("30s");
  const [postToWP, setPostToWP] = useState(true);
  const [postToX, setPostToX] = useState(true);
  const [generateImages, setGenerateImages] = useState(true);
  const [enableBalloon, setEnableBalloon] = useState(true);
  const [hasExperience, setHasExperience] = useState(false);
  const [experienceNote, setExperienceNote] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  // ファクトチェック
  const [enableFactCheck, setEnableFactCheck] = useState(false);
  const [factChecking, setFactChecking] = useState(false);
  const [factCheckResult, setFactCheckResult] = useState<any>(null);
  const [useImprovedVersion, setUseImprovedVersion] = useState(true);

  // ブログURL（設定から登録）
  const [blogUrl, setBlogUrl] = useState("");
  const [authorIconUrl, setAuthorIconUrl] = useState("");
  const [authorName, setAuthorName] = useState("みお");
  useEffect(() => {
    try { setBlogUrl(localStorage.getItem("be_blog_url") || ""); } catch {}
    try { setAuthorIconUrl(localStorage.getItem("be_author_icon") || ""); } catch {}
    try { setAuthorName(localStorage.getItem("be_author_name") || "みお"); } catch {}
  }, []);

  // Preview state
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);

  // WP test state
  const [wpStatus, setWpStatus] = useState<{ ok?: boolean; name?: string; error?: string } | null>(null);
  const [wpTesting, setWpTesting] = useState(false);

  // Trends state
  interface TrendItemUI { id: string; source: string; sourceUrl: string; title: string; titleJa: string; summary: string; summaryJa: string; category: string; relevanceScore: number; trendScore: number; combinedScore: number; publishedAt: string; collectedAt: string; keywords: string[]; matchedThemeIds: string[]; language: string; used: boolean; metadata: Record<string, unknown>; }
  const [trends, setTrends] = useState<TrendItemUI[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendFilter, setTrendFilter] = useState<{ source: string; category: string; search: string }>({ source: "all", category: "all", search: "" });
  const [trendLastCollected, setTrendLastCollected] = useState<string | null>(null);

  // Affiliate partner DB state
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [editingPartner, setEditingPartner] = useState<AffiliatePartner | null>(null);
  const [affFilterTheme, setAffFilterTheme] = useState("all");
  const safePartners = Array.isArray(partners) ? partners : [];
  const safeSelectedSubThemes = Array.isArray(selectedSubThemes) ? selectedSubThemes : [];
  const safeReviewSkinConcerns = Array.isArray(reviewSkinConcerns) ? reviewSkinConcerns : [];

  // Rakuten search state
  const [rakutenKeyword, setRakutenKeyword] = useState("");
  const [rakutenResults, setRakutenResults] = useState<any[]>([]);
  const [rakutenSearching, setRakutenSearching] = useState(false);
  const [rakutenTheme, setRakutenTheme] = useState(THEMES[0].id);
  const [rakutenError, setRakutenError] = useState("");
  const [rakutenMinPrice, setRakutenMinPrice] = useState<number | undefined>(3000);
  const [rakutenMaxPrice, setRakutenMaxPrice] = useState<number | undefined>(10000);
  const [rakutenPricePreset, setRakutenPricePreset] = useState("balanced");
  // 比較・ランキングリスト（楽天検索から直接記事を作る用）
  const [compareList, setCompareList] = useState<any[]>([]);
  // ランキングモード（3商品以上でON可能）
  const [rankingEnabled, setRankingEnabled] = useState(false);

  const PRICE_PRESETS: Record<string, { label: string; min?: number; max?: number; desc: string }> = {
    all:       { label: "全価格帯", min: undefined, max: undefined, desc: "フィルタなし" },
    budget:    { label: "コスパ重視", min: 1000, max: 5000, desc: "¥1,000-5,000・20代向け" },
    balanced:  { label: "売れ筋", min: 3000, max: 10000, desc: "¥3,000-10,000・最高効率" },
    premium:   { label: "高単価", min: 8000, max: 20000, desc: "¥8,000-20,000・本格ケア" },
    luxury:    { label: "ラグジュアリー", min: 20000, max: undefined, desc: "¥20,000以上・デパコス" },
    custom:    { label: "カスタム", min: rakutenMinPrice, max: rakutenMaxPrice, desc: "自由入力" },
  };

  // New partner form defaults
  const emptyPartner: AffiliatePartner = {
    id: "", asp: "A8.net", programName: "", themeIds: [], commissionType: "cpa",
    commissionValue: "", priority: 50, html: "", active: true,
    tier: "B", estimatedCpa: 0,
  };

  // Load partners from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("blogengine_partners");
      if (!saved) return;
      const parsed = JSON.parse(saved);
      setPartners(Array.isArray(parsed) ? parsed : []);
    } catch {}
  }, []);

  // Save partners to localStorage
  function savePartners(list: AffiliatePartner[]) {
    setPartners(list);
    localStorage.setItem("blogengine_partners", JSON.stringify(list));
  }

  // Get affiliate links for a theme (sorted by priority)
  function getLinksForTheme(themeId: string): AffiliateLink[] {
    return safePartners
      .filter((p) => p.active && Array.isArray(p.themeIds) && p.themeIds.includes(themeId) && (p.html || "").trim())
      .sort((a, b) => b.priority - a.priority)
      .map((p) => ({ themeId, html: p.html }));
  }

  // AI記事テーマ会議
  const [articleThemeError, setArticleThemeError] = useState("");
  async function suggestArticleThemes() {
    setArticleThemesLoading(true); setArticleThemeError("");
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 120000);
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${getPwd()}` };
      const res = await fetch("/api/article-theme-suggest", { method: "POST", headers: h, signal: controller.signal });
      const rawText = await res.text();
      if (!res.ok) throw new Error(rawText.slice(0, 200) || `サーバーエラー (${res.status})`);
      const trimmed = rawText.trim();
      const jsonMatch = trimmed.match(/\{[^{}]*"(success|error|themes)"[\s\S]*\}/);
      if (!jsonMatch) { setArticleThemeError("AI会議の応答を解析できませんでした"); setArticleThemesLoading(false); return; }
      const data = JSON.parse(jsonMatch[0]);
      if (data.error) {
        setArticleThemeError(data.error);
      } else if (data.themes?.length > 0) {
        setArticleThemes(data.themes);
        try { localStorage.setItem("be_article_themes", JSON.stringify({ themes: data.themes, date: new Date().toISOString() })); } catch {}
      }
    } catch (e: any) { setArticleThemeError(e.message); }
    setArticleThemesLoading(false);
  }

  // AI記事テーマを選択 → selectedTheme/selectedKeywordにセット
  function useArticleTheme(theme: any) {
    const matched = THEMES.find((t) => t.id === theme.themeId);
    if (matched) {
      setSelectedTheme(matched);
      setSelectedKeyword(theme.keyword || matched.keywords[0]);
    }
    if (theme.targetAge) setTargetAge(theme.targetAge);
  }

  // ---- Login ----
  async function handleLogin() {
    setLoginError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password }),
    });
    if (res.ok) {
      const data = await res.json();
      const token = data.token || "";
      setLoggedIn(true);
      setAuthToken(token);
      try {
        localStorage.setItem("be_session", JSON.stringify({ loggedIn: true, timestamp: Date.now() }));
        localStorage.setItem("be_token", token);
      } catch {}
    } else {
      setLoginError("メールアドレスまたはパスワードが違います");
    }
  }

  // ---- Fact-Check ----
  async function runFactCheck(articleData: any) {
    if (!enableFactCheck) return;
    setFactChecking(true);
    setFactCheckResult(null);
    try {
      const pwd = getPwd();
      const res = await fetch("/api/fact-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pwd}` },
        body: JSON.stringify({
          article: {
            title: articleData.title,
            htmlContent: articleData.htmlContent,
            metaDescription: articleData.metaDescription,
            keyword: articleData.keyword || "",
            tags: articleData.tags || [],
            themeLabel: articleData.themeLabel || "",
          },
        }),
      });
      const rawText = await res.text();
      if (!res.ok) throw new Error(rawText.slice(0, 200) || `サーバーエラー (${res.status})`);
      const jsonMatch = rawText.trim().match(/\{[\s\S]*\}$/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        setFactCheckResult(result);
        setUseImprovedVersion(result.success);
      }
    } catch (e: any) {
      console.warn("[FactCheck] Error:", e.message);
    }
    setFactChecking(false);
  }

  // ---- Generate ----
  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    try {
      const body: any = { postToWP, postToX, targetAge, generateImages, hasExperience, experienceNote: hasExperience ? experienceNote : "", pricePreset: rakutenPricePreset, enableBalloon, authorIconUrl: enableBalloon ? (authorIconUrl || undefined) : undefined, authorName: enableBalloon ? (authorName || "みお") : undefined };
      if (genMode === "category") {
        // カテゴリー記事モード（別APIを使用）
        const pwd = getPwd();
        const catController = new AbortController();
        const catTimeoutId = setTimeout(() => catController.abort(), 180000);
        const catRes = await fetch("/api/generate-category", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${pwd}` },
          body: JSON.stringify({ categoryId: selectedCategory, targetAge, subThemeIds: safeSelectedSubThemes, suggestTopic: selectedSuggest || undefined, enableBalloon, authorIconUrl: enableBalloon ? (authorIconUrl || undefined) : undefined, authorName: enableBalloon ? (authorName || "みお") : undefined }),
          signal: catController.signal,
        });
        clearTimeout(catTimeoutId);
        const catRaw = await catRes.text();
        const catJsonMatch = catRaw.trim().match(/\{[\s\S]*\}$/);
        if (!catJsonMatch) throw new Error("カテゴリー記事の生成に失敗しました");
        const catData = JSON.parse(catJsonMatch[0]);
        if (!catData.success) throw new Error(catData.error || "生成エラー");
        const catItem: HistoryItem = {
          id: Date.now(),
          title: catData.article.title,
          keyword: catData.article.keyword,
          themeLabel: catData.article.themeLabel,
          mode: "category",
          htmlContent: catData.article.htmlContent,
          metaDescription: catData.article.metaDescription,
          createdAt: new Date().toLocaleString("ja-JP"),
        };
        setHistory((prev) => [catItem, ...prev]);
        setGenResult({
          success: true,
          articleData: catData.article,
          pendingPublish: true,
        });
        setPreviewItem(catItem);
        setGenerating(false);
        runFactCheck(catData.article);
        return;
      } else if (genMode === "personal-review") {
        // 本人使用投稿モード
        const pwd = getPwd();
        const prController = new AbortController();
        const prTimeoutId = setTimeout(() => prController.abort(), 180000);
        const photoUrls = reviewPhotos.filter((p) => p.wpUrl).map((p) => p.wpUrl!);
        const prRes = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${pwd}` },
          body: JSON.stringify({
            mode: "personal-review",
            targetAge,
            reviewData: {
              productName: reviewProductName,
              rating: reviewRating,
              usagePeriod: reviewUsagePeriod,
              skinType: reviewSkinType,
              texture: reviewTexture,
              goodPoints: reviewGoodPoints,
              badPoints: reviewBadPoints,
              repurchase: reviewRepurchase,
              price: reviewPrice ? Number(reviewPrice) : undefined,
              channel: reviewChannel,
              skinConcerns: safeReviewSkinConcerns,
              comparisonNote: reviewComparisonNote,
            },
            photoUrls,
            authorIconUrl: authorIconUrl || undefined,
            authorName: authorName || "みお",
          }),
          signal: prController.signal,
        });
        clearTimeout(prTimeoutId);
        const prRaw = await prRes.text();
        const prJsonMatch = prRaw.trim().match(/\{[\s\S]*\}$/);
        if (!prJsonMatch) throw new Error("レビュー記事の生成に失敗しました");
        const prData = JSON.parse(prJsonMatch[0]);
        if (!prData.success && prData.status !== "success") throw new Error(prData.error || prData.message || "生成エラー");
        const article = prData.article || prData;
        const prItem: HistoryItem = {
          id: Date.now(),
          title: article.title,
          keyword: article.keyword || reviewProductName,
          themeLabel: "本人使用レビュー",
          mode: "personal-review" as any,
          htmlContent: article.htmlContent,
          metaDescription: article.metaDescription,
          createdAt: new Date().toLocaleString("ja-JP"),
        };
        setHistory((prev) => [prItem, ...prev]);
        setGenResult({ success: true, articleData: article, pendingPublish: true, productNames: [reviewProductName] });
        setPreviewItem(prItem);
        setGenerating(false);
        runFactCheck(article);
        return;
      } else if (genMode === "theme") {
        body.mode = "theme";
        body.themeId = selectedTheme.id;
        body.keyword = selectedKeyword;
        const themeLinks = getLinksForTheme(selectedTheme.id);
        if (themeLinks.length > 0) body.affiliateLinks = themeLinks;
      } else {
        body.mode = "product";
        const validProducts = products.filter((p) => p.name.trim());
        body.products = validProducts.map((p) => p.name);
        body.customKeyword = customKeyword || undefined;
        // 商品モードでは楽天の商品に紐づくアフィリエイトHTMLを直接送信
        const productLinks = validProducts
          .filter((p) => p.affiliateHtml)
          .map((p) => ({ themeId: "product", html: p.affiliateHtml! }));
        if (productLinks.length > 0) body.affiliateLinks = productLinks;
        // 比較モード: 2商品以上の場合に有効
        if (comparisonEnabled && validProducts.length >= 2) {
          // 収益スコアが最も高い商品をおすすめに設定
          const prices = validProducts.map((p) => p.price || 0);
          const scores = validProducts.map((p) => p.profitScore || 0);
          const recommendIndex = scores.indexOf(Math.max(...scores));
          body.comparisonMode = {
            enabled: true,
            recommendIndex: recommendIndex >= 0 ? recommendIndex : 0,
            productPrices: prices,
            productScores: scores,
          };
        }
      }

      // AbortSignal.timeout は iOS Safari 16以前で未サポートのためfallback
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);
      const genPwd = getPwd();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${genPwd}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      // ストリーミングレスポンス対応: ハートビート(スペース)を除去してJSONパース
      const rawText = await res.text();
      if (!res.ok) throw new Error(rawText.slice(0, 200) || `サーバーエラー (${res.status})`);
      const cleaned = rawText.trim();
      if (!cleaned) {
        throw new Error("サーバーから空のレスポンスが返されました。時間をおいて再度お試しください。");
      }
      // ハートビートスペースを除去してJSON部分だけ抽出
      const jsonMatch = cleaned.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) {
        throw new Error("レスポンスの解析に失敗しました: " + cleaned.substring(0, 100));
      }
      const data = JSON.parse(jsonMatch[0]);

      if (data.status === "success") {
        const item: HistoryItem = {
          id: Date.now(),
          title: data.article.title,
          keyword: data.article.keyword,
          themeLabel: data.article.themeLabel,
          mode: genMode,
          htmlContent: data.article.htmlContent,
          metaDescription: data.article.metaDescription,
          createdAt: new Date().toLocaleString("ja-JP"),
        };
        setHistory((prev) => [item, ...prev]);
        // プレビュー表示（まだ公開しない）
        setPreviewItem(item);
        setGenResult({
          ok: true,
          title: item.title,
          pendingPublish: true,
          articleData: data.article,
          productNames: data.productNames,
        });
        runFactCheck(data.article);
      } else {
        setGenResult({ ok: false, error: data.message });
      }
    } catch (e: any) {
      setGenResult({ ok: false, error: e.message });
    }
    setGenerating(false);
  }

  // ---- Publish (Step 2: WP + 画像 + X) ----
  const [publishing, setPublishing] = useState(false);
  async function handlePublish(opts?: { xText: string; imageUrl?: string; publishStatus?: string; scheduledDate?: string }) {
    if (!genResult?.articleData) return;
    setPublishing(true);
    // ファクトチェック改善版を使う場合、articleDataを差し替え
    const articleToPublish = (useImprovedVersion && factCheckResult?.success && factCheckResult?.improved)
      ? { ...genResult.articleData, title: factCheckResult.improved.title || genResult.articleData.title, htmlContent: factCheckResult.improved.htmlContent || genResult.articleData.htmlContent, metaDescription: factCheckResult.improved.metaDescription || genResult.articleData.metaDescription, tags: factCheckResult.improved.tags || genResult.articleData.tags }
      : genResult.articleData;
    try {
      const pubPwd = getPwd();
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pubPwd}` },
        body: JSON.stringify({
          article: articleToPublish,
          generateImages: !!opts?.imageUrl,
          postToX: opts?.publishStatus === "future" ? false : postToX, // 予約投稿時はX投稿しない
          productNames: genResult.productNames,
          customXText: opts?.xText,
          preGeneratedImageUrl: opts?.imageUrl,
          publishStatus: opts?.publishStatus || "publish",
          scheduledDate: opts?.scheduledDate,
        }),
        signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 180000); return c.signal; })(),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 200) || `サーバーエラー (${res.status})`);
      const cleaned = text.replace(/^\s+/, "");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}$/);
      if (!jsonMatch) throw new Error("公開レスポンスの解析に失敗");
      const data = JSON.parse(jsonMatch[0]);

      if (data.status === "success") {
        if (data.wordpress) {
          setHistory((prev) => prev.map((h) =>
            h.id === previewItem?.id
              ? { ...h, wpPostId: data.wordpress.postId, wpStatus: data.wordpress.status, wpLink: data.wordpress.link, savedXText: data.savedXText, scheduledDate: data.wordpress.scheduledDate }
              : h
          ));
        }
        setGenResult({
          ...genResult,
          pendingPublish: false,
          wpStatus: data.wordpress?.status,
          wpLink: data.wordpress?.link,
          x: data.x,
        });
      } else {
        setGenResult({ ...genResult, publishError: data.message });
      }
    } catch (e: any) {
      setGenResult({ ...genResult, publishError: e.message });
    }
    setPublishing(false);
  }

  // ---- Rakuten Search ----
  async function handleRakutenSearch() {
    setRakutenSearching(true);
    setRakutenError("");
    setRakutenResults([]);
    try {
      const rakPwd = getPwd();
      const res = await fetch("/api/rakuten-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${rakPwd}` },
        body: JSON.stringify({ keyword: rakutenKeyword, hits: 10, themeId: rakutenTheme, minPrice: rakutenMinPrice, maxPrice: rakutenMaxPrice }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setRakutenResults(data.products);
      } else {
        setRakutenError(data.error || data.message);
      }
    } catch (e: any) {
      setRakutenError(e.message);
    }
    setRakutenSearching(false);
  }

  // ---- WP Test ----
  // ---- Trend collection ----
  async function collectTrends() {
    setTrendLoading(true);
    try {
      const res = await authFetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 120000); return c.signal; })(),
      });
      const rawText = await res.text();
      if (!res.ok) throw new Error(rawText.slice(0, 200) || `サーバーエラー (${res.status})`);
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        const jsonMatch = rawText.match(/\{[\s\S]*\}$/);
        if (jsonMatch) { data = JSON.parse(jsonMatch[0]); }
        else { throw new Error(rawText.slice(0, 200) || "レスポンス解析エラー"); }
      }
      if (data.items) {
        setTrends(data.items);
        setTrendLastCollected(new Date().toLocaleString("ja-JP"));
        localStorage.setItem("blogengine_trends", JSON.stringify(data.items));
        localStorage.setItem("blogengine_trends_time", new Date().toISOString());
      }
    } catch (e: any) {
      alert("トレンド収集エラー: " + e.message);
    }
    setTrendLoading(false);
  }

  // Load saved trends from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("blogengine_trends");
    const savedTime = localStorage.getItem("blogengine_trends_time");
    if (saved) {
      try { setTrends(JSON.parse(saved)); } catch {}
    }
    if (savedTime) {
      setTrendLastCollected(new Date(savedTime).toLocaleString("ja-JP"));
    }
  }, []);

  const [trendGenerating, setTrendGenerating] = useState<string | null>(null);
  // YouTube追加情報入力モーダル
  const [trendModalTarget, setTrendModalTarget] = useState<TrendItemUI | null>(null);
  const [trendExtraText, setTrendExtraText] = useState("");

  // YouTube動画の場合はモーダルを表示、それ以外は直接生成
  function handleTrendArticleClick(trend: TrendItemUI) {
    if (trendGenerating) return;
    if (trend.source === "youtube") {
      setTrendModalTarget(trend);
      setTrendExtraText("");
    } else {
      useTrendForArticle(trend);
    }
  }

  async function useTrendForArticle(trend: TrendItemUI, extraText?: string) {
    if (trendGenerating) return;
    setTrendModalTarget(null);
    setTrendGenerating(trend.id);
    try {
      const pwd = getPwd();
      const res = await fetch("/api/trend-article", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pwd}` },
        body: JSON.stringify({ trend, extraText: extraText || undefined }),
        signal: (() => { const c = new AbortController(); setTimeout(() => c.abort(), 180000); return c.signal; })(),
      });
      const rawText = await res.text();
      if (!res.ok) throw new Error(rawText.slice(0, 200) || `サーバーエラー (${res.status})`);
      const text = rawText.trim();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        // ハートビート方式: スペース + JSON なので、JSONだけ抽出
        try {
          // {"success": で始まるJSONを探す
          const match = text.match(/\{"success"[\s\S]*$/);
          if (match) {
            data = JSON.parse(match[0]);
          } else {
            // {"error": で始まるJSONを探す
            const errMatch = text.match(/\{"error"[\s\S]*$/);
            if (errMatch) {
              data = JSON.parse(errMatch[0]);
            } else {
              throw new Error("JSONが見つかりません");
            }
          }
        } catch {
          throw new Error(text.slice(0, 300) || "サーバーから空のレスポンス");
        }
      }
      if (data.article) {
        const historyItem: HistoryItem = {
          id: Date.now(),
          title: data.article.title,
          keyword: data.article.keyword,
          themeLabel: `トレンド(${trend.source === "youtube" ? "YouTube" : trend.source === "pubmed" ? "論文" : "ニュース"})`,
          mode: "product",
          htmlContent: data.article.htmlContent,
          metaDescription: data.article.metaDescription,
          createdAt: new Date().toISOString(),
        };
        setHistory((prev) => [historyItem, ...prev]);
        setPreviewItem(historyItem);
        // genResultを設定してプレビューに「公開する」ボタンを表示
        setGenResult({
          pendingPublish: true,
          articleData: {
            title: data.article.title,
            seoTitle: data.article.title,
            metaDescription: data.article.metaDescription,
            htmlContent: data.article.htmlContent,
            keyword: data.article.keyword,
            themeLabel: historyItem.themeLabel,
            slug: data.article.slug,
            focusKeyword: data.article.keyword,
            tags: data.article.tags || [],
            faqSchema: data.article.faqSchema || [],
            products: [],
          },
        });
        runFactCheck(data.article);
        // トレンドを使用済みに
        setTrends((prev) => prev.map((t) => t.id === trend.id ? { ...t, used: true } : t));
        localStorage.setItem("blogengine_trends", JSON.stringify(trends.map((t) => t.id === trend.id ? { ...t, used: true } : t)));
      } else {
        alert("記事生成エラー: " + (data.error || "不明なエラー"));
      }
    } catch (e: any) {
      alert("記事生成エラー: " + e.message);
    }
    setTrendGenerating(null);
  }

  async function testWP() {
    setWpTesting(true);
    setWpStatus(null);
    try {
      const res = await fetch("/api/wp-test");
      setWpStatus(await res.json());
    } catch (e: any) {
      setWpStatus({ ok: false, error: e.message });
    }
    setWpTesting(false);
  }

  // ---- Product inputs ----
  function updateProduct(index: number, name: string) {
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, name } : p)));
  }
  function addProduct() {
    if (products.length < 10) setProducts((prev) => [...prev, { name: "" }]);
  }
  function addProductFromRakuten(product: any) {
    // 楽天検索結果から商品を追加（アフィリエイトHTMLも一緒に保持）
    const entry: ProductEntry = {
      name: product.itemName,
      affiliateHtml: product.affiliateHtml || `<a href="${product.affiliateUrl}" target="_blank" rel="nofollow noopener sponsored">${product.itemName}</a>`,
      imageUrl: product.imageUrl,
      price: product.itemPrice,
      profitScore: product.profitScore || 0,
    };
    setProducts((prev) => {
      // 最初のエントリが空なら置き換え、そうでなければ追加
      if (prev.length === 1 && !prev[0].name.trim()) return [entry];
      return [...prev, entry];
    });
  }
  function removeProduct(index: number) {
    if (products.length > 1) setProducts((prev) => prev.filter((_, i) => i !== index));
  }

  // ==========================================
  // Login Screen
  // ==========================================
  if (!loggedIn) {
    return (
      <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.text }}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, padding: isMobile ? "32px 24px" : "48px 40px", width: "100%", maxWidth: 380, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, background: `linear-gradient(135deg,${C.accent},${C.green})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>BlogEngine</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 32 }}>v3 — Auto Affiliate Blog System</div>
          <input
            type="email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            placeholder="メールアドレス"
            autoComplete="email"
            style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "14px 16px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 12 }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="パスワード"
            autoComplete="current-password"
            style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "14px 16px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 16 }}
          />
          {loginError && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{loginError}</div>}
          <button onClick={handleLogin} style={{ width: "100%", background: `linear-gradient(135deg,${C.accent},${C.green})`, border: "none", borderRadius: 10, padding: "14px", color: "#000", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>ログイン</button>
        </div>
      </div>
    );
  }

  // ==========================================
  // Main Dashboard
  // ==========================================
  const tabs = [
    { id: "dashboard", label: "ダッシュボード", icon: "◈" },
    { id: "generate", label: "記事生成", icon: "✦" },
    { id: "history", label: "生成履歴", icon: "≡" },
    { id: "affiliate", label: "アフィリエイト", icon: "¥" },
    { id: "trends", label: "トレンド", icon: "📊" },
    { id: "x-schedule", label: "X投稿管理", icon: "𝕏" },
    { id: "themes", label: "テーマ一覧", icon: "◎" },
    { id: "settings", label: "設定", icon: "⚙" },
  ];

  // モバイル下部タブバーの項目
  const mobileBottomTabs = [
    { id: "dashboard", label: "ホーム", icon: "🏠" },
    { id: "generate", label: "記事生成", icon: "✏️" },
    { id: "affiliate", label: "アフィリエイト", icon: "💰" },
    { id: "trends", label: "トレンド", icon: "📊" },
    { id: "_menu", label: "メニュー", icon: "☰" },
  ];

  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text, display: "flex", flexDirection: isMobile ? "column" : "row" }}>

      {/* Sidebar overlay backdrop (mobile only) */}
      {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />}

      {/* Sidebar - Desktop: always visible, Mobile: overlay drawer from hamburger */}
      <aside className={isMobile ? "" : "desktop-sidebar"} style={{
        width: isMobile ? "80%" : 220,
        maxWidth: isMobile ? 320 : undefined,
        background: C.bgCard,
        borderRight: `1px solid ${C.border}`,
        display: (isMobile && !sidebarOpen) ? "none" : "flex",
        flexDirection: "column", padding: "24px 0", flexShrink: 0,
        ...(isMobile ? { position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 45, overflowY: "auto" } : {})
      }}>
        <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, background: `linear-gradient(135deg,${C.accent},${C.green})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>BlogEngine v3</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Auto Affiliate System</div>
          </div>
          {isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: C.text, fontSize: 22, cursor: "pointer", padding: 4 }}>✕</button>}
        </div>
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); if (isMobile) setSidebarOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: activeTab === tab.id ? 700 : 400, background: activeTab === tab.id ? `${C.accent}14` : "transparent", color: activeTab === tab.id ? C.accent : C.textDim, transition: "all 0.15s", marginBottom: 2 }}
            >
              <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
          <button onClick={() => { setLoggedIn(false); try { localStorage.removeItem("be_session"); sessionStorage.removeItem("be_pw"); } catch {} }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: `1px solid ${C.borderLight}`, background: "transparent", color: C.textDim, fontSize: 13, cursor: "pointer" }}>ログアウト</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto", minWidth: 0, paddingBottom: isMobile ? 64 : 0 }}>
        {/* Page header - desktop */}
        {!isMobile && (
          <header style={{ padding: "20px 32px", borderBottom: `1px solid ${C.border}`, background: C.bg, position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                {tabs.find((t) => t.id === activeTab)?.label}
              </h1>
              <span style={{ fontSize: 11, color: C.textMuted }}>
                {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
              </span>
            </div>
          </header>
        )}

        <div style={{ padding: isMobile ? "12px 16px" : "28px 32px" }}>
          {/* Mobile page title */}
          {isMobile && (
            <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>
              {tabs.find((t) => t.id === activeTab)?.icon} {tabs.find((t) => t.id === activeTab)?.label}
            </h2>
          )}
          {/* ====== DASHBOARD TAB ====== */}
          {activeTab === "dashboard" && (
            <div>
              {/* ブログへのクイックリンク */}
              {blogUrl && (
                <a href={blogUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, background: `linear-gradient(135deg,${C.accent}18,${C.green}18)`, border: `1px solid ${C.accent}33`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? "12px 16px" : "14px 20px", marginBottom: 16, textDecoration: "none", color: C.text }}>
                  <span style={{ fontSize: 20 }}>🌐</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>ブログを見る</div>
                    <div style={{ fontSize: 11, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{blogUrl}</div>
                  </div>
                  <span style={{ fontSize: 16, color: C.accent }}>→</span>
                </a>
              )}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: isMobile ? 10 : 16, marginBottom: 28 }}>
                {[
                  { label: "生成記事数", value: history.length, color: C.accent },
                  { label: "WP投稿済み", value: history.filter((h) => h.wpPostId).length, color: C.green },
                  { label: "テーマ数", value: THEMES.length, color: C.accentAlt },
                ].map((kpi, i) => (
                  <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? "14px 16px" : "20px 22px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: kpi.color }} />
                    <div style={{ fontSize: isMobile ? 10 : 11, color: C.textMuted, marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{kpi.label}</div>
                    <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Cron info */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: isMobile ? 14 : 15, fontWeight: 700 }}>Cron自動投稿</h3>
                <div style={{ fontSize: isMobile ? 12 : 13, color: C.textDim, lineHeight: 1.8 }}>
                  <div>Vercel Cronが毎日1回実行（UTC 0:00 = JST 9:00）、記事を自動生成＆WP投稿します。</div>
                  <div style={{ display: "flex", gap: isMobile ? 8 : 20, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 6, background: `${C.green}18`, color: C.green, fontSize: isMobile ? 11 : 12, fontWeight: 600 }}>朝 9-12時</span>
                    <span style={{ padding: "4px 10px", borderRadius: 6, background: `${C.orange}18`, color: C.orange, fontSize: isMobile ? 11 : 12, fontWeight: 600 }}>昼 15-18時</span>
                    <span style={{ padding: "4px 10px", borderRadius: 6, background: `${C.accent}18`, color: C.accent, fontSize: isMobile ? 11 : 12, fontWeight: 600 }}>夜 19-22時</span>
                  </div>
                </div>
              </div>

              {/* Recent history */}
              {history.length > 0 && (
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? 16 : 24 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: isMobile ? 14 : 15, fontWeight: 700 }}>最近の生成</h3>
                  {history.slice(0, 3).map((item) => (
                    <div key={item.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: item.wpPostId ? `${C.green}22` : `${C.orange}22`, color: item.wpPostId ? C.green : C.orange }}>
                        {item.wpPostId ? "WP投稿済" : "生成のみ"}
                      </span>
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                      <span style={{ fontSize: 11, color: C.textMuted }}>{item.createdAt}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ====== GENERATE TAB ====== */}
          {activeTab === "generate" && (
            <div style={{ maxWidth: isMobile ? "100%" : 760 }}>
              {/* Mode switch */}
              <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                {([
                  { id: "category" as const, label: "カテゴリー記事", desc: "まとめ・教科書ページを作成" },
                  { id: "personal-review" as const, label: "本人使用投稿", desc: "写真付き実体験レビュー" },
                  { id: "product" as const, label: "商品指定", desc: "紹介したい商品を直接入力" },
                  { id: "theme" as const, label: "テーマ指定", desc: "サブテーマ＆キーワードから生成" },
                ] as const).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setGenMode(m.id)}
                    style={{ flex: 1, padding: "16px 20px", borderRadius: 12, border: `1.5px solid ${genMode === m.id ? C.accent : C.borderLight}`, background: genMode === m.id ? `${C.accent}14` : "transparent", cursor: "pointer", textAlign: "left" }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: genMode === m.id ? C.accent : C.text, marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 11, color: C.textMuted }}>{m.desc}</div>
                  </button>
                ))}
              </div>

              {/* Fact-check toggle（全モード共通） */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: C.bgCard, borderRadius: 10, marginBottom: 16, border: `1px solid ${C.borderLight}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>🔍 AIファクトチェック</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>生成後にAIが事実確認・薬機法チェック・文章改善を実行</div>
                </div>
                <button
                  onClick={() => setEnableFactCheck(!enableFactCheck)}
                  style={{ width: 48, height: 26, borderRadius: 13, border: "none", background: enableFactCheck ? C.accentAlt : C.borderLight, cursor: "pointer", position: "relative", transition: "background 0.2s" }}
                >
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3, left: enableFactCheck ? 25 : 3, transition: "left 0.2s" }} />
                </button>
              </div>

              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
                {genMode === "category" ? (
                  <>
                    {/* カテゴリー三者会議テーマ提案 */}
                    <div style={{ marginBottom: 20 }}>
                      <button
                        onClick={async () => {
                          setCategoryThemesLoading(true);
                          try {
                            const h: HeadersInit = { "Content-Type": "application/json" };
                            const res = await fetch("/api/category-theme-suggest", { method: "POST", headers: h });
                            let trimmed = "";
                            const reader = res.body?.getReader();
                            const dec = new TextDecoder();
                            if (reader) {
                              while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;
                                trimmed += dec.decode(value);
                              }
                            }
                            const jsonMatch = trimmed.trim().match(/{[sS]*"(success|error|themes)"[sS]*}/);
                            if (jsonMatch) {
                              const data = JSON.parse(jsonMatch[0]);
                              if (data.themes) setCategoryThemeSuggestions(data.themes);
                            }
                          } catch (e: any) { console.error(e); }
                          setCategoryThemesLoading(false);
                        }}
                        disabled={categoryThemesLoading}
                        style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: categoryThemesLoading ? "#1A1A28" : "linear-gradient(135deg, #FFD700, #FF6B9D, #00D4FF)", color: categoryThemesLoading ? C.textMuted : "#000", fontWeight: 800, fontSize: 13, cursor: categoryThemesLoading ? "not-allowed" : "pointer", width: "100%", marginBottom: 10 }}
                      >
                        {categoryThemesLoading ? "🧠 3人のプロが会議中... (約30秒)" : "🧠 3人のプロにカテゴリーテーマを聞く"}
                      </button>
                      {categoryThemeSuggestions.length > 0 && (
                        <div style={{ maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                          {categoryThemeSuggestions.map((t: any, i: number) => (
                            <div key={i} style={{ padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${t.rank <= 2 ? C.accent : C.borderLight}`, background: C.bgCard }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: t.rank <= 2 ? C.accent : C.textDim }}>#{t.rank}</span>
                                  <span style={{ fontSize: 13, fontWeight: 700 }}>{t.topic}</span>
                                </div>
                                <button
                                  onClick={() => {
                                    setSelectedCategory(t.categoryId);
                                    setSelectedSubThemes(t.subThemeIds || []);
                                    setSelectedSuggest(t.suggestTopic || "");
                                  }}
                                  style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.accent}55`, background: "transparent", color: C.accent, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                                >
                                  このテーマで作成 →
                                </button>
                              </div>
                              <div style={{ fontSize: 11, color: C.accentAlt, marginBottom: 4 }}>{t.keyword}</div>
                              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6 }}>{t.reason}</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                                {t.categoryId && <span style={{ padding: "2px 8px", borderRadius: 10, background: `${C.accent}22`, color: C.accent, fontSize: 10, fontWeight: 600 }}>{({ "clinic-comparison": "🏥 クリニック", "cosmetics": "💄 コスメ", "basics-howto": "📖 基礎知識", "medical-beauty": "💉 美容医療" } as any)[t.categoryId] || t.categoryId}</span>}
                                {t.isMulti && <span style={{ padding: "2px 8px", borderRadius: 10, background: `${C.green}22`, color: C.green, fontSize: 10 }}>比較ガイド</span>}
                                {t.scores && <><span style={{ padding: "2px 8px", borderRadius: 10, background: "#FF69B422", color: "#FF69B4", fontSize: 10 }}>美容{t.scores.beauty}</span><span style={{ padding: "2px 8px", borderRadius: 10, background: "#FFD70022", color: "#FFD700", fontSize: 10 }}>収益{t.scores.affiliate}</span><span style={{ padding: "2px 8px", borderRadius: 10, background: "#00D4FF22", color: "#00D4FF", fontSize: 10 }}>SEO{t.scores.seo}</span></>}
                              </div>
                              {t.expert_comments && (
                                <div style={{ fontSize: 10, color: C.textMuted }}>
                                  🧴 {t.expert_comments.misaki} / 💰 {t.expert_comments.ryota} / 🔥 {t.expert_comments.yuna}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* カテゴリー記事モード */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>カテゴリーを選択</label>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                        {[
                          { id: "clinic-comparison", label: "クリニック比較", icon: "🏥", desc: "美容クリニックの選び方・施術比較" },
                          { id: "cosmetics", label: "コスメ", icon: "💄", desc: "成分解説・選び方・使い方" },
                          { id: "basics-howto", label: "基礎知識・使い方", icon: "📖", desc: "スキンケアの教科書" },
                          { id: "medical-beauty", label: "美容医療", icon: "💉", desc: "施術の仕組み・リスク・費用" },
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => { setSelectedCategory(cat.id); setSelectedSubThemes([]); }}
                            style={{
                              padding: "14px 16px", borderRadius: 10, textAlign: "left", cursor: "pointer",
                              border: `1.5px solid ${selectedCategory === cat.id ? C.accent : C.borderLight}`,
                              background: selectedCategory === cat.id ? `${C.accent}14` : "transparent",
                            }}
                          >
                            <div style={{ fontSize: 18, marginBottom: 4 }}>{cat.icon}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: selectedCategory === cat.id ? C.accent : C.text }}>{cat.label}</div>
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{cat.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* サブテーマ選択 */}
                    {(() => {
                      const subThemeMap: Record<string, { id: string; label: string }[]> = {
                        "clinic-comparison": [
                          { id: "clinic-datsumo", label: "医療脱毛クリニック" },
                          { id: "clinic-shimi", label: "シミ取りレーザー" },
                          { id: "clinic-hifu", label: "ハイフ・たるみ治療" },
                          { id: "clinic-dermapen", label: "ダーマペン・毛穴治療" },
                          { id: "clinic-botox", label: "ボトックス・小顔施術" },
                          { id: "clinic-peeling", label: "ピーリング・光治療" },
                        ],
                        "cosmetics": [
                          { id: "cosme-bihaku", label: "美白・シミ対策コスメ" },
                          { id: "cosme-aging", label: "エイジングケア" },
                          { id: "cosme-keana", label: "毛穴ケア・クレンジング" },
                          { id: "cosme-uv", label: "日焼け止め・UV対策" },
                          { id: "cosme-nikibi", label: "ニキビ・肌荒れケア" },
                          { id: "cosme-allinone", label: "オールインワン・時短" },
                        ],
                        "basics-howto": [
                          { id: "basics-routine", label: "スキンケアの正しい順番" },
                          { id: "basics-ingredients", label: "成分の読み方・選び方" },
                          { id: "basics-skintype", label: "肌タイプ別ケア方法" },
                          { id: "basics-seasonal", label: "季節別スキンケア" },
                          { id: "basics-cleansing", label: "メイク落とし・洗顔の基本" },
                          { id: "basics-medical-intro", label: "美容医療の基礎知識" },
                        ],
                        "medical-beauty": [
                          { id: "medical-types", label: "施術の種類と選び方" },
                          { id: "medical-downtime", label: "ダウンタイム・リスク解説" },
                          { id: "medical-cost", label: "費用相場・保険適用" },
                          { id: "medical-counseling", label: "カウンセリングの受け方" },
                          { id: "medical-aftercare", label: "施術前後の注意点" },
                          { id: "medical-vs-esthe", label: "美容皮膚科 vs エステ" },
                        ],
                      };
                      const subs = subThemeMap[selectedCategory] || [];
                      const isMulti = selectedCategory === "clinic-comparison" || selectedCategory === "cosmetics";
                      return subs.length > 0 ? (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                            テーマを選択 {isMulti && <span style={{ fontSize: 11, color: C.accentAlt, fontWeight: 500 }}>（複数選択で比較記事に）</span>}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {subs.map((sub) => {
                              const isSelected = safeSelectedSubThemes.includes(sub.id);
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => {
                                    if (isMulti) {
                                      setSelectedSubThemes((prev) => {
                                        const list = Array.isArray(prev) ? prev : [];
                                        return isSelected ? list.filter((s) => s !== sub.id) : [...list, sub.id];
                                      });
                                    } else {
                                      setSelectedSubThemes(isSelected ? [] : [sub.id]);
                                    }
                                  }}
                                  style={{
                                    padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: isSelected ? 700 : 500, cursor: "pointer",
                                    border: `1.5px solid ${isSelected ? C.accent : C.borderLight}`,
                                    background: isSelected ? `${C.accent}22` : "transparent",
                                    color: isSelected ? C.accent : C.textDim,
                                  }}
                                >
                                  {isSelected ? "✓ " : ""}{sub.label}
                                </button>
                              );
                            })}
                          </div>
                          {isMulti && safeSelectedSubThemes.length >= 2 && (
                            <div style={{ marginTop: 8, fontSize: 11, color: C.green, padding: "6px 10px", background: `${C.green}11`, borderRadius: 6 }}>
                              {safeSelectedSubThemes.length}つ選択中 → 比較ガイド記事が生成されます
                            </div>
                          )}
                        </div>
                      ) : null;
                    })()}

                    {/* 注目トピック自動提案 */}
                    {safeSelectedSubThemes.length > 0 && (() => {
                      const subKeywordMap: Record<string, string> = {
                        "clinic-datsumo": "医療脱毛", "clinic-shimi": "シミ取り レーザー", "clinic-hifu": "ハイフ 美容",
                        "clinic-dermapen": "ダーマペン", "clinic-botox": "ボトックス 美容", "clinic-peeling": "ピーリング 美容",
                        "cosme-bihaku": "美白 美容液", "cosme-aging": "エイジングケア 化粧品", "cosme-keana": "毛穴ケア コスメ",
                        "cosme-uv": "日焼け止め おすすめ", "cosme-nikibi": "ニキビケア 化粧品", "cosme-allinone": "オールインワン コスメ",
                        "basics-routine": "スキンケア 順番", "basics-ingredients": "美容成分 効果", "basics-skintype": "肌タイプ 診断",
                        "basics-seasonal": "季節 スキンケア", "basics-cleansing": "クレンジング 正しい", "basics-medical-intro": "美容医療 初めて",
                        "medical-types": "美容医療 施術 種類", "medical-downtime": "美容施術 ダウンタイム", "medical-cost": "美容医療 費用",
                        "medical-counseling": "美容クリニック カウンセリング", "medical-aftercare": "美容施術 アフターケア", "medical-vs-esthe": "美容皮膚科 エステ 違い",
                      };
                      const lastSub = safeSelectedSubThemes[safeSelectedSubThemes.length - 1];
                      const searchKw = subKeywordMap[lastSub] || "";

                      // サブテーマ変更時に自動取得
                      const fetchSuggestions = async () => {
                        if (!searchKw) return;
                        setSuggestLoading(true);
                        setSuggestTopics([]);
                        setSelectedSuggest("");
                        try {
                          const res = await fetch(`/api/suggest?q=${encodeURIComponent(searchKw)}`);
                          const data = await res.json();
                          setSuggestTopics(data.suggestions || []);
                        } catch {}
                        setSuggestLoading(false);
                      };

                      return (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>
                              🔥 今注目のトピック
                            </div>
                            <button
                              onClick={fetchSuggestions}
                              disabled={suggestLoading}
                              style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${C.accent}55`, background: "transparent", color: C.accent, fontSize: 11, fontWeight: 600, cursor: suggestLoading ? "not-allowed" : "pointer" }}
                            >
                              {suggestLoading ? "取得中..." : suggestTopics.length > 0 ? "更新" : "トピックを取得"}
                            </button>
                          </div>
                          {suggestTopics.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {suggestTopics.map((topic, i) => (
                                <button
                                  key={i}
                                  onClick={() => setSelectedSuggest(selectedSuggest === topic ? "" : topic)}
                                  style={{
                                    padding: "5px 10px", borderRadius: 16, fontSize: 11, cursor: "pointer",
                                    border: `1px solid ${selectedSuggest === topic ? C.green : C.borderLight}`,
                                    background: selectedSuggest === topic ? `${C.green}22` : `${C.bg}88`,
                                    color: selectedSuggest === topic ? C.green : C.textDim,
                                  }}
                                >
                                  {selectedSuggest === topic ? "✓ " : "🔍 "}{topic}
                                </button>
                              ))}
                            </div>
                          )}
                          {selectedSuggest && (
                            <div style={{ marginTop: 8, fontSize: 11, color: C.green, padding: "6px 10px", background: `${C.green}11`, borderRadius: 6 }}>
                              「{selectedSuggest}」をテーマに記事が生成されます
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div style={{ padding: "12px 16px", background: `${C.accentAlt}11`, borderRadius: 10, border: `1px solid ${C.accentAlt}33`, marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.accentAlt, marginBottom: 4 }}>ピラーページとは？</div>
                      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6 }}>
                        カテゴリーの「まとめ・教科書」として機能する重要ページです。<br/>
                        ・アフィリエイトリンクは挿入されません<br/>
                        ・WordPress上の既存記事へのリンクが自動挿入されます<br/>
                        ・サイトの専門性（トピカルオーソリティ）を高めるSEO効果があります
                      </div>
                    </div>
                  </>
                ) : genMode === "personal-review" ? (
                  <>
                    {/* 本人使用投稿モード */}
                    <div style={{ fontSize: 13, color: C.green, marginBottom: 16, padding: "10px 14px", background: `${C.green}11`, borderRadius: 8 }}>
                      📸 実際に使用した商品の写真付きレビュー記事を作成します（E-E-A-T最強）
                    </div>

                    {/* 商品名 */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>商品名 *</label>
                      <input value={reviewProductName} onChange={(e) => setReviewProductName(e.target.value)} placeholder="例: SK-II フェイシャルトリートメントエッセンス" style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                    </div>

                    {/* 総合評価 ★ */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>総合評価 *</label>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setReviewRating(n)} style={{ background: "none", border: "none", fontSize: 28, cursor: "pointer", color: n <= reviewRating ? "#FFD700" : "#333", padding: 0 }}>★</button>
                        ))}
                        <span style={{ fontSize: 14, color: C.text, marginLeft: 8, alignSelf: "center" }}>{reviewRating}/5</span>
                      </div>
                    </div>

                    {/* 使用期間 + 肌タイプ */}
                    <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>使用期間 *</label>
                        <select value={reviewUsagePeriod} onChange={(e) => setReviewUsagePeriod(e.target.value)} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: "10px", color: C.text, fontSize: 13 }}>
                          {["1週間未満", "1-2週間", "1ヶ月程度", "2-3ヶ月", "3ヶ月以上"].map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>肌タイプ *</label>
                        <select value={reviewSkinType} onChange={(e) => setReviewSkinType(e.target.value)} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: "10px", color: C.text, fontSize: 13 }}>
                          {["乾燥肌", "脂性肌", "混合肌", "敏感肌", "普通肌"].map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* 写真アップロード */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>写真（1-5枚）*</label>
                      <input type="file" accept="image/*" multiple onChange={(e) => {
                        const files = Array.from(e.target.files || []).slice(0, 5);
                        const newPhotos = files.map((f) => ({ file: f, preview: URL.createObjectURL(f) }));
                        setReviewPhotos((prev) => [...prev, ...newPhotos].slice(0, 5));
                        e.target.value = "";
                      }} style={{ display: "none" }} id="photo-upload" />
                      <label htmlFor="photo-upload" style={{ display: "block", border: `2px dashed ${C.borderLight}`, borderRadius: 10, padding: 20, textAlign: "center", cursor: "pointer", color: C.textMuted, fontSize: 13 }}>
                        📷 タップして写真を選択（カメラ/ギャラリー）
                      </label>
                      {reviewPhotos.length > 0 && (
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          {reviewPhotos.map((p, i) => (
                            <div key={i} style={{ position: "relative", width: 80, height: 80 }}>
                              <img src={p.preview} alt={`写真${i + 1}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: p.wpUrl ? `2px solid ${C.green}` : `1px solid ${C.border}` }} />
                              {p.wpUrl && <div style={{ position: "absolute", top: 2, right: 2, fontSize: 12, background: C.green, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>}
                              <button onClick={() => setReviewPhotos((prev) => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, background: C.red, color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {reviewPhotos.length > 0 && !reviewPhotos.every((p) => p.wpUrl) && (
                        <button onClick={async () => {
                          setUploadingPhotos(true);
                          try {
                            const formData = new FormData();
                            formData.append("productName", reviewProductName || "商品");
                            reviewPhotos.forEach((p) => { if (p.file) formData.append("photos", p.file); });
                            const res = await fetch("/api/upload-photo", { method: "POST", headers: { Authorization: `Bearer ${getPwd()}` }, body: formData });
                            const data = await res.json();
                            if (data.success && data.photos) {
                              setReviewPhotos((prev) => prev.map((p, i) => data.photos[i] ? { ...p, wpUrl: data.photos[i].url, wpId: data.photos[i].id } : p));
                            }
                          } catch (e: any) { console.error(e); }
                          setUploadingPhotos(false);
                        }} disabled={uploadingPhotos} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "none", background: uploadingPhotos ? "#1A1A28" : C.accent, color: uploadingPhotos ? C.textMuted : "#000", fontSize: 12, fontWeight: 700, cursor: uploadingPhotos ? "not-allowed" : "pointer" }}>
                          {uploadingPhotos ? "アップロード中..." : "📤 WordPressにアップロード"}
                        </button>
                      )}
                    </div>

                    {/* テクスチャー・使用感 */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>テクスチャー・使用感 *</label>
                      <textarea value={reviewTexture} onChange={(e) => setReviewTexture(e.target.value)} placeholder="例: さらっとした水のようなテクスチャー。肌にのせるとすーっと馴染む。べたつきはなし。朝使っても化粧崩れしにくい。" rows={3} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 10, color: C.text, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                    </div>

                    {/* 良かった点 */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>良かった点 *</label>
                      <textarea value={reviewGoodPoints} onChange={(e) => setReviewGoodPoints(e.target.value)} placeholder="例: 使い始めて2週間で肌のトーンが明るくなった気がする。保湿力も高い。コスパが良い。" rows={3} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 10, color: C.text, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                    </div>

                    {/* 気になった点 */}
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>気になった点 *</label>
                      <textarea value={reviewBadPoints} onChange={(e) => setReviewBadPoints(e.target.value)} placeholder="例: 香りが少し強め。ポンプ式だと出しすぎることがある。即効性は感じにくい。" rows={3} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 10, color: C.text, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                    </div>

                    {/* リピート意向 */}
                    <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" checked={reviewRepurchase} onChange={(e) => setReviewRepurchase(e.target.checked)} id="repurchase" style={{ width: 20, height: 20 }} />
                      <label htmlFor="repurchase" style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>リピートしたい</label>
                    </div>

                    {/* 任意項目（折りたたみ） */}
                    <details style={{ marginBottom: 16 }}>
                      <summary style={{ fontSize: 13, color: C.accent, cursor: "pointer", fontWeight: 600 }}>＋ 任意項目（購入情報・肌悩み等）</summary>
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 4 }}>購入価格</label>
                            <input type="number" value={reviewPrice} onChange={(e) => setReviewPrice(e.target.value)} placeholder="3980" style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 8, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 4 }}>購入先</label>
                            <select value={reviewChannel} onChange={(e) => setReviewChannel(e.target.value)} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 8, color: C.text, fontSize: 13 }}>
                              {["楽天", "Amazon", "ドラッグストア", "公式サイト", "百貨店", "その他"].map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginBottom: 12 }}>
                          <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 4 }}>肌悩み（複数選択可）</label>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {["シミ", "毛穴", "乾燥", "ニキビ", "シワ", "くすみ", "たるみ", "敏感"].map((c) => (
                              <button key={c} onClick={() => setReviewSkinConcerns((prev) => { const list = Array.isArray(prev) ? prev : []; return list.includes(c) ? list.filter((x) => x !== c) : [...list, c]; })} style={{ padding: "4px 12px", borderRadius: 20, border: `1px solid ${safeReviewSkinConcerns.includes(c) ? C.accent : C.borderLight}`, background: safeReviewSkinConcerns.includes(c) ? `${C.accent}22` : "transparent", color: safeReviewSkinConcerns.includes(c) ? C.accent : C.textDim, fontSize: 12, cursor: "pointer" }}>{c}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: C.textMuted, display: "block", marginBottom: 4 }}>他商品との比較メモ</label>
                          <textarea value={reviewComparisonNote} onChange={(e) => setReviewComparisonNote(e.target.value)} placeholder="例: 以前使っていた○○と比べると保湿力が高い" rows={2} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 8, color: C.text, fontSize: 12, resize: "none", outline: "none", boxSizing: "border-box" }} />
                        </div>
                      </div>
                    </details>
                  </>
                ) : genMode === "theme" ? (
                  <>
                    {/* AI記事テーマ提案 */}
                    <div style={{ marginBottom: 24 }}>
                      <button
                        onClick={suggestArticleThemes}
                        disabled={articleThemesLoading}
                        style={{ padding: "14px 24px", borderRadius: 10, border: "none", background: articleThemesLoading ? "#1A1A28" : `linear-gradient(135deg, #FFD700, #FF6B9D, #00D4FF)`, color: articleThemesLoading ? C.textMuted : "#000", fontWeight: 800, fontSize: 14, cursor: articleThemesLoading ? "not-allowed" : "pointer", width: "100%", marginBottom: 12 }}
                      >
                        {articleThemesLoading ? "🧠 3人のプロが会議中... (約30秒)" : "🧠 3人のプロに記事テーマを聞く"}
                      </button>
                      {articleThemeError && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{articleThemeError}</div>}
                      {articleThemes.length > 0 && (
                        <div style={{ maxHeight: 400, overflowY: "auto", borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
                          {articleThemes.map((t: any, i: number) => (
                            <div
                              key={i}
                              onClick={() => useArticleTheme(t)}
                              style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background 0.15s", background: selectedKeyword === t.keyword ? `${C.accent}18` : "transparent" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = `${C.accent}12`)}
                              onMouseLeave={(e) => (e.currentTarget.style.background = selectedKeyword === t.keyword ? `${C.accent}18` : "transparent")}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: i < 3 ? C.accent : C.textDim, minWidth: 24 }}>#{t.rank}</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>{t.topic}</span>
                              </div>
                              <div style={{ fontSize: 11, color: C.accentAlt, marginBottom: 4, paddingLeft: 32 }}>{t.keyword}</div>
                              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, paddingLeft: 32 }}>{t.reason}</div>
                              <div style={{ display: "flex", gap: 6, paddingLeft: 32, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${C.accent}22`, color: C.accent }}>美容 {t.scores?.beauty}</span>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${C.green}22`, color: C.green }}>収益 {t.scores?.affiliate}</span>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${C.accentAlt}22`, color: C.accentAlt }}>SEO {t.scores?.seo}</span>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${C.orange}22`, color: C.orange }}>{t.articleType}</span>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${C.borderLight}`, color: C.textDim }}>{t.targetAge}</span>
                              </div>
                              {t.expert_comments && (
                                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 6, paddingLeft: 32, lineHeight: 1.6 }}>
                                  🧴 {t.expert_comments.misaki} / 💰 {t.expert_comments.ryota} / 🔥 {t.expert_comments.yuna}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Theme selector */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>テーマ</label>
                      <select
                        value={selectedTheme?.id || ""}
                        onChange={(e) => {
                          const t = THEMES.find((th) => th.id === e.target.value)!;
                          setSelectedTheme(t);
                          setSelectedKeyword(t.keywords[0]);
                        }}
                        style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "12px 16px", color: C.text, fontSize: 14, outline: "none" }}
                      >
                        {THEMES.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Keyword selector + AI提案キーワード直接入力 */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>キーワード</label>
                      <input
                        value={selectedKeyword}
                        onChange={(e) => setSelectedKeyword(e.target.value)}
                        placeholder="キーワードを入力 or 下から選択"
                        style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "12px 16px", color: C.text, fontSize: 14, outline: "none", marginBottom: 8, boxSizing: "border-box" }}
                      />
                      <select
                        value={selectedTheme && Array.isArray(selectedTheme.keywords) && selectedTheme.keywords.includes(selectedKeyword) ? selectedKeyword : ""}
                        onChange={(e) => { if (e.target.value) setSelectedKeyword(e.target.value); }}
                        style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 16px", color: C.textDim, fontSize: 12, outline: "none" }}
                      >
                        <option value="">定型キーワードから選択...</option>
                        {(selectedTheme?.keywords || []).map((kw) => (
                          <option key={kw} value={kw}>{kw}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 比較モードトグル */}
                    <div style={{ marginBottom: 16, padding: "12px 16px", background: comparisonEnabled ? `${C.accent}15` : `${C.bgCard}`, border: `1.5px solid ${comparisonEnabled ? C.accent : C.borderLight}`, borderRadius: 12, cursor: "pointer", transition: "all 0.2s" }} onClick={() => setComparisonEnabled(!comparisonEnabled)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: comparisonEnabled ? C.accent : C.text }}>
                            ⚔️ 商品比較モード {comparisonEnabled ? "ON" : "OFF"}
                          </div>
                          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                            {comparisonEnabled ? "2商品を徹底比較する記事を生成（CVR 5-8%）" : "2商品以上で有効。比較表＋おすすめ提案記事を自動生成"}
                          </div>
                        </div>
                        <div style={{ width: 44, height: 24, borderRadius: 12, background: comparisonEnabled ? C.accent : C.borderLight, position: "relative", transition: "all 0.2s" }}>
                          <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 2, left: comparisonEnabled ? 22 : 2, transition: "all 0.2s" }} />
                        </div>
                      </div>
                      {comparisonEnabled && (
                        <div style={{ fontSize: 11, color: C.green, marginTop: 8, lineHeight: 1.6 }}>
                          💡 収益スコアが高い商品を自然におすすめする記事を生成します。<br />
                          楽天検索から「記事に追加」で2商品以上追加してください。
                        </div>
                      )}
                    </div>

                    {/* Product inputs */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>紹介する商品（複数可）</label>
                      <div style={{ fontSize: 11, color: C.accentAlt, marginBottom: 10, padding: "8px 12px", background: `${C.accentAlt}11`, borderRadius: 8, lineHeight: 1.7 }}>
                        下の楽天検索で商品を探して「記事に追加」ボタンを押すと、アフィリエイトリンク付きで追加されます
                      </div>
                      {products.map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                          <input
                            value={p.name}
                            onChange={(e) => updateProduct(i, e.target.value)}
                            placeholder={`商品${i + 1}の名前（例：キュレル 潤浸保湿クリーム）`}
                            style={{ flex: 1, background: "#14141F", border: `1.5px solid ${p.affiliateHtml ? C.green : C.borderLight}`, borderRadius: 10, padding: "12px 16px", color: C.text, fontSize: 14, outline: "none" }}
                          />
                          {p.affiliateHtml && <span style={{ fontSize: 9, padding: "3px 8px", borderRadius: 4, background: `${C.green}22`, color: C.green, fontWeight: 700, whiteSpace: "nowrap" }}>楽天リンク付</span>}
                          {products.length > 1 && (
                            <button onClick={() => removeProduct(i)} style={{ padding: "0 12px", borderRadius: 8, border: `1px solid ${C.red}44`, background: "transparent", color: C.red, fontSize: 18, cursor: "pointer" }}>-</button>
                          )}
                        </div>
                      ))}
                      <button onClick={addProduct} style={{ padding: "8px 16px", borderRadius: 8, border: `1px dashed ${C.borderLight}`, background: "transparent", color: C.textDim, fontSize: 13, cursor: "pointer" }}>+ 手動で商品名を入力</button>
                    </div>

                    {/* Inline Rakuten search for product mode */}
                    <div style={{ marginBottom: 20, background: "#14141F", borderRadius: 12, padding: 16, border: `1px solid #bf000033` }}>
                      <label style={{ fontSize: 12, color: "#bf0000", display: "block", marginBottom: 8, fontWeight: 700 }}>楽天から商品を検索して追加</label>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <input
                          value={rakutenKeyword}
                          onChange={(e) => setRakutenKeyword(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !rakutenSearching && handleRakutenSearch()}
                          placeholder="商品名で検索（例：ビタミンC 美容液）"
                          style={{ flex: 1, background: C.bg, border: `1.5px solid ${C.borderLight}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none" }}
                        />
                        <button
                          onClick={handleRakutenSearch}
                          disabled={rakutenSearching || !rakutenKeyword.trim()}
                          style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: rakutenSearching ? "#1A1A28" : "#bf0000", color: rakutenSearching ? C.textMuted : "#fff", fontWeight: 700, fontSize: 12, cursor: rakutenSearching ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                        >
                          {rakutenSearching ? "検索中..." : "検索"}
                        </button>
                      </div>
                      {rakutenError && <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>{rakutenError}</div>}
                      {rakutenResults.length > 0 && (
                        <div style={{ maxHeight: 300, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                          {rakutenResults.slice(0, 5).map((product, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: C.bg, borderRadius: 8, border: products.some((p) => p.name === product.itemName) ? `1px solid ${C.green}66` : "none" }}>
                              {product.imageUrl && <img src={product.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: "contain", borderRadius: 4, flexShrink: 0 }} />}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{product.itemName}</div>
                                <div style={{ fontSize: 11, color: C.textDim }}>
                                  <span style={{ color: "#bf0000", fontWeight: 700 }}>¥{product.itemPrice?.toLocaleString()}</span>
                                  <span style={{ marginLeft: 6 }}>{product.shopName}</span>
                                  {product.reviewCount > 0 && <span style={{ marginLeft: 4 }}>★{product.reviewAverage}</span>}
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
                                  {product.affiliateRate > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, background: "#FF6B9D22", color: "#FF6B9D", fontWeight: 700 }}>{product.affiliateRate}%</span>}
                                  {product.freeShipping && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, background: "#00C89622", color: "#00C896", fontWeight: 700 }}>送料無料</span>}
                                  {product.pointRate >= 2 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, background: "#FFB34722", color: "#FFB347", fontWeight: 700 }}>P{product.pointRate}倍</span>}
                                  {product.onSale && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 2, background: "#FF6B6B22", color: "#FF6B6B", fontWeight: 700 }}>セール</span>}
                                </div>
                              </div>
                              <button
                                onClick={() => addProductFromRakuten(product)}
                                disabled={products.some((p) => p.name === product.itemName)}
                                style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: products.some((p) => p.name === product.itemName) ? "#1A1A28" : C.accent, color: products.some((p) => p.name === product.itemName) ? C.textMuted : "#000", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                              >
                                {products.some((p) => p.name === product.itemName) ? "追加済" : "記事に追加"}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Optional keyword */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>SEOキーワード（任意）</label>
                      <input
                        value={customKeyword}
                        onChange={(e) => setCustomKeyword(e.target.value)}
                        placeholder="空欄ならAIが商品名から自動決定"
                        style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "12px 16px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </>
                )}

                {/* Experience checkbox & note */}
                <div style={{ marginBottom: 20, padding: "14px 16px", background: "#14141F", borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: hasExperience ? 12 : 0 }}>
                    <input
                      type="checkbox"
                      checked={hasExperience}
                      onChange={(e) => { setHasExperience(e.target.checked); if (!e.target.checked) setExperienceNote(""); }}
                      style={{ width: 18, height: 18, cursor: "pointer", accentColor: C.accent }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>実際に使用した体験がある</div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                        {hasExperience ? "体験をもとにしたリアルなレビュー記事を生成します" : "未体験の場合は「気になって調べてみた」という視点で記事を生成します"}
                      </div>
                    </div>
                  </div>
                  {hasExperience && (
                    <textarea
                      value={experienceNote}
                      onChange={(e) => setExperienceNote(e.target.value)}
                      placeholder={"実体験を簡単に記入してください（例）\n・使い始めて2週間くらい\n・テクスチャーはサラッとしていて伸びが良い\n・翌朝の肌のもっちり感が気に入った\n・少し価格が高いのがネック"}
                      rows={5}
                      style={{ width: "100%", background: C.bg, border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "12px 16px", color: C.text, fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.7 }}
                    />
                  )}
                </div>

                {/* Target age selector */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>ターゲット年代</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([
                      { id: "20s" as const, label: "20代向け", desc: "20代の頃の体験談ベース" },
                      { id: "30s" as const, label: "30代向け", desc: "同世代のリアルな使用感" },
                      { id: "40s" as const, label: "40代向け", desc: "たるみ・シミ等の本気ケア" },
                    ] as const).map((age) => (
                      <button
                        key={age.id}
                        onClick={() => setTargetAge(age.id)}
                        style={{
                          flex: 1, padding: "12px 14px", borderRadius: 10,
                          border: `1.5px solid ${targetAge === age.id ? C.accent : C.borderLight}`,
                          background: targetAge === age.id ? `${C.accent}14` : "transparent",
                          cursor: "pointer", textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 700, color: targetAge === age.id ? C.accent : C.text, marginBottom: 2 }}>{age.label}</div>
                        <div style={{ fontSize: 10, color: C.textMuted }}>{age.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* WP toggle */}
                <div style={{ marginBottom: 24, padding: "14px 16px", background: "#14141F", borderRadius: 10, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>WordPress に投稿する</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>記事確認後に「公開する」ボタンで投稿します</div>
                  </div>
                  <button
                    onClick={() => setPostToWP(!postToWP)}
                    style={{ width: 48, height: 26, borderRadius: 13, border: "none", background: postToWP ? C.green : C.borderLight, cursor: "pointer", position: "relative", transition: "background 0.2s" }}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3, left: postToWP ? 25 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                {/* X (Twitter) posting toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#14141F", borderRadius: 10, marginBottom: 16, border: `1px solid ${C.borderLight}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>X (Twitter) に自動投稿</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>記事公開後にXへ自動ポスト（WP投稿ON時のみ）</div>
                  </div>
                  <button
                    onClick={() => setPostToX(!postToX)}
                    style={{ width: 48, height: 26, borderRadius: 13, border: "none", background: postToX && postToWP ? "#1DA1F2" : C.borderLight, cursor: "pointer", position: "relative", transition: "background 0.2s", opacity: postToWP ? 1 : 0.4 }}
                    disabled={!postToWP}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3, left: postToX ? 25 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                {/* Image generation toggle */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#14141F", borderRadius: 10, marginBottom: 16, border: `1px solid ${C.borderLight}` }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>AIアイキャッチ画像を生成</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>DALL-E 3でアイキャッチ画像を自動生成（$0.08/枚）</div>
                  </div>
                  <button
                    onClick={() => setGenerateImages(!generateImages)}
                    style={{ width: 48, height: 26, borderRadius: 13, border: "none", background: generateImages ? C.accentAlt : C.borderLight, cursor: "pointer", position: "relative", transition: "background 0.2s" }}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3, left: generateImages ? 25 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                {/* Balloon toggle */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#14141F", borderRadius: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>💬 筆者の吹き出しコメント</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>記事内に筆者のコメントを吹き出しで3〜5箇所挿入{authorIconUrl ? "（Gravatar設定済み）" : "（設定タブでGravatar取得してください）"}</div>
                  </div>
                  <button
                    onClick={() => setEnableBalloon(!enableBalloon)}
                    style={{ width: 48, height: 26, borderRadius: 13, border: "none", background: enableBalloon ? C.accentAlt : C.borderLight, cursor: "pointer", position: "relative", transition: "background 0.2s" }}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3, left: enableBalloon ? 25 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || (genMode === "product" && products.every((p) => !p.name.trim()))}
                  style={{
                    width: "100%",
                    background: generating ? "#1A1A28" : `linear-gradient(135deg,${C.accent},${C.green})`,
                    border: "none", borderRadius: 10, padding: "14px", color: generating ? C.textMuted : "#000",
                    fontWeight: 800, fontSize: 15, cursor: generating ? "not-allowed" : "pointer",
                  }}
                >
                  {generating ? "生成中... (30〜60秒)" : "記事を生成する"}
                </button>

                {/* Result */}
                {genResult && (
                  <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: 10, border: `1px solid ${genResult.ok ? C.green : C.red}44`, background: genResult.ok ? `${C.green}11` : `${C.red}11`, fontSize: 13 }}>
                    {genResult.ok ? (
                      <div>
                        <div style={{ color: C.green, fontWeight: 700, marginBottom: 4 }}>
                          {genResult.pendingPublish ? "記事生成完了 — プレビューで内容を確認してください" : "公開完了"}
                        </div>
                        <div style={{ color: C.textDim, marginBottom: 8 }}>{genResult.title}</div>

                        {/* 公開前：プレビュー確認 → 公開ボタン */}
                        {genResult.pendingPublish && (
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <button
                              onClick={() => { if (history[0]) setPreviewItem(history[0]); }}
                              style={{ padding: "12px 20px", borderRadius: 8, border: `1px solid ${C.accent}55`, background: "transparent", color: C.accent, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                            >
                              プレビューを再表示
                            </button>
                            {postToWP && (
                              <button
                                onClick={() => handlePublish()}
                                disabled={publishing}
                                style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: publishing ? "#1A1A28" : `linear-gradient(135deg,${C.accent},${C.green})`, color: publishing ? C.textMuted : "#000", fontWeight: 800, fontSize: 14, cursor: publishing ? "not-allowed" : "pointer" }}
                              >
                                {publishing ? "公開処理中..." : "WordPressに公開する"}
                              </button>
                            )}
                          </div>
                        )}

                        {/* 公開後：結果表示 */}
                        {genResult.wpStatus && <div style={{ color: C.green, marginTop: 8 }}>WordPress: {genResult.wpStatus} {genResult.wpLink && <a href={genResult.wpLink} target="_blank" rel="noopener" style={{ color: C.accentAlt, marginLeft: 8 }}>記事を見る →</a>}</div>}
                        {genResult.x && (
                          <div style={{ marginTop: 4, color: genResult.x.success ? "#1DA1F2" : C.red }}>
                            X: {genResult.x.success ? <a href={genResult.x.tweetUrl} target="_blank" rel="noopener" style={{ color: "#1DA1F2" }}>投稿成功 →</a> : `エラー: ${genResult.x.error}`}
                          </div>
                        )}
                        {genResult.publishError && <div style={{ color: C.red, marginTop: 4 }}>公開エラー: {genResult.publishError}</div>}
                      </div>
                    ) : (
                      <div style={{ color: C.red }}>{genResult.error}</div>
                    )}
                  </div>
                )}
              </div>

              {/* Info box */}
              <div style={{ marginTop: 16, padding: "14px 18px", background: "#0F1A14", border: `1px solid ${C.green}33`, borderRadius: 12, fontSize: 12, color: C.green, lineHeight: 1.9 }}>
                テーマ指定: 20カテゴリ × 3キーワード = 60パターンのSEO記事を自動生成<br />
                商品指定: 紹介したい商品を入力すると、その商品に最適化された比較記事を生成<br />
                Cron自動投稿: Vercelが毎日ランダムな時間に自動でテーマローテーション生成
              </div>
            </div>
          )}

          {/* ====== HISTORY TAB ====== */}
          {activeTab === "history" && (
            <div>
              {history.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: C.textMuted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>◈</div>
                  <div style={{ fontSize: 14 }}>まだ記事が生成されていません</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>「記事生成」タブから手動生成するか、Cronの自動実行をお待ちください</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {history.map((item) => (
                    <div key={item.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 22px", display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ width: 4, height: 56, borderRadius: 2, background: item.wpPostId ? C.green : C.orange, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: item.wpPostId ? `${C.green}22` : `${C.orange}22`, color: item.wpPostId ? C.green : C.orange }}>
                            {item.wpPostId ? "WP投稿済" : "生成のみ"}
                          </span>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: `${C.accentAlt}22`, color: C.accentAlt }}>
                            {item.mode === "product" ? "商品指定" : "テーマ"}
                          </span>
                          <span style={{ fontSize: 11, color: C.textMuted }}>{item.themeLabel}</span>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                          {item.keyword} · {item.createdAt}
                        </div>
                      </div>
                      <button
                        onClick={() => setPreviewItem(item)}
                        style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.accent}55`, background: "transparent", color: C.accent, fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
                      >
                        プレビュー
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ====== AFFILIATE TAB ====== */}
          {activeTab === "affiliate" && (
            <div style={{ maxWidth: isMobile ? "100%" : 860 }}>
              {/* Header stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "提携先数", value: partners.length, color: C.accent },
                  { label: "有効", value: partners.filter((p) => p.active).length, color: C.green },
                  { label: "テーマカバー", value: new Set(partners.flatMap((p) => p.themeIds)).size + "/" + THEMES.length, color: C.accentAlt },
                ].map((s, i) => (
                  <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: s.color }} />
                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Rakuten search — 上部に配置 */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: isMobile ? 16 : 24, marginBottom: 24 }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: "#bf0000" }}>🔍 収益最適化 楽天商品検索</h3>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 12, lineHeight: 1.5 }}>
                  💡 ワンタップで稼げる商品が見つかります。美容知識不要！
                </div>

                {/* おまかせ検索ボタン群 */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, marginBottom: 8 }}>⚡ おまかせ検索（タップするだけ）</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 6 }}>
                    {[
                      { label: "🥇 今売れてる美白美容液", kw: "美白 美容液 ランキング", theme: "bihaku-shimi", emoji: "💎", desc: "報酬¥120-400" },
                      { label: "🧴 人気の毛穴ケア", kw: "毛穴ケア 美容液 人気", theme: "keana-nikibi", emoji: "✨", desc: "報酬¥60-200" },
                      { label: "💆 高単価エイジングケア", kw: "エイジングケア 美容液 レチノール", theme: "aging-care", emoji: "👑", desc: "報酬¥200-600" },
                      { label: "💇 売れ筋シャンプー", kw: "アミノ酸 シャンプー 女性 人気", theme: "hair-care", emoji: "🧴", desc: "報酬¥60-320" },
                      { label: "🌞 UVケア・日焼け止め", kw: "日焼け止め 顔用 トーンアップ", theme: "bihaku-shimi", emoji: "☀️", desc: "報酬¥40-200" },
                      { label: "🔬 ドクターズコスメ", kw: "ドクターズコスメ 美容液 皮膚科", theme: "biyou-clinic", emoji: "🏥", desc: "報酬¥200-1200" },
                      { label: "🧖 クレンジング", kw: "クレンジング 毛穴 角栓 人気", theme: "keana-nikibi", emoji: "🫧", desc: "報酬¥40-200" },
                      { label: "💰 高額美顔器", kw: "美顔器 EMS リフトアップ", theme: "biyou-clinic", emoji: "⚡", desc: "報酬¥400-1500" },
                      { label: "🆕 新作コスメ", kw: "新作 コスメ 2026 話題", theme: "bihaku-shimi", emoji: "🆕", desc: "トレンド狙い" },
                    ].map((preset) => (
                      <button
                        key={preset.kw}
                        onClick={async () => {
                          setRakutenKeyword(preset.kw);
                          setRakutenTheme(preset.theme);
                          // 直接検索実行
                          setRakutenSearching(true);
                          setRakutenError("");
                          try {
                            const params = new URLSearchParams({ keyword: preset.kw, themeId: preset.theme, hits: "10" });
                            if (rakutenMinPrice) params.set("minPrice", String(rakutenMinPrice));
                            if (rakutenMaxPrice) params.set("maxPrice", String(rakutenMaxPrice));
                            const res = await authFetch(`/api/rakuten-search?${params}`);
                            const data = await res.json();
                            if (data.error) { setRakutenError(data.error); } else { setRakutenResults(data.products || []); }
                          } catch (e: any) { setRakutenError(e.message); }
                          setRakutenSearching(false);
                        }}
                        disabled={rakutenSearching}
                        style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.borderLight}`, background: "#14141F", color: C.text, fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "left", lineHeight: 1.4 }}
                      >
                        <div>{preset.label}</div>
                        <div style={{ fontSize: 9, color: C.green, marginTop: 2 }}>{preset.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 成分フィルター検索 */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, marginBottom: 8 }}>🧪 成分で探す（アフィリエイト高収益成分順）</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 6 }}>
                    {[
                      { label: "☀️ 日焼け止め", kw: "日焼け止め SPF50 顔用", theme: "bihaku-shimi", price: "¥1,500-4,000", badge: "通年需要" },
                      { label: "🍋 ビタミンC美容液", kw: "ビタミンC誘導体 美容液 高濃度", theme: "bihaku-shimi", price: "¥2,000-8,000", badge: "美白定番" },
                      { label: "💎 トラネキサム酸", kw: "トラネキサム酸 ナイアシンアミド 美容液", theme: "bihaku-shimi", price: "¥2,000-6,000", badge: "シミ対策" },
                      { label: "✨ レチノール", kw: "レチノール 美容液 エイジングケア", theme: "aging-care", price: "¥3,000-10,000", badge: "高単価" },
                      { label: "🔬 アゼライン酸", kw: "アゼライン酸 美容液 毛穴", theme: "keana-nikibi", price: "¥2,000-5,000", badge: "注目成分" },
                      { label: "🛡️ セラミド", kw: "セラミド 化粧水 保湿 高保湿", theme: "keana-nikibi", price: "¥1,500-5,000", badge: "敏感肌◎" },
                      { label: "💧 ヒアルロン酸", kw: "ヒアルロン酸 美容液 保湿", theme: "aging-care", price: "¥1,000-4,000", badge: "保湿定番" },
                      { label: "🌿 CICA/シカ", kw: "シカ CICA 美容液 肌荒れ", theme: "keana-nikibi", price: "¥1,500-4,000", badge: "韓国コスメ" },
                      { label: "🧴 酵素洗顔", kw: "酵素洗顔 パウダー 毛穴 角栓", theme: "keana-nikibi", price: "¥1,000-3,000", badge: "毛穴ケア" },
                      { label: "🌸 プラセンタ", kw: "プラセンタ 美容液 原液", theme: "aging-care", price: "¥2,000-8,000", badge: "エイジング" },
                      { label: "💆 ペプチド", kw: "ペプチド 美容液 シワ改善", theme: "aging-care", price: "¥3,000-12,000", badge: "最高単価" },
                      { label: "🫧 BHA/サリチル酸", kw: "サリチル酸 BHA ピーリング 美容液", theme: "keana-nikibi", price: "¥1,500-4,000", badge: "ニキビ対策" },
                    ].map((ing) => (
                      <button
                        key={ing.kw}
                        onClick={async () => {
                          setRakutenKeyword(ing.kw);
                          setRakutenTheme(ing.theme);
                          setRakutenSearching(true);
                          setRakutenError("");
                          try {
                            const params = new URLSearchParams({ keyword: ing.kw, themeId: ing.theme, hits: "10" });
                            if (rakutenMinPrice) params.set("minPrice", String(rakutenMinPrice));
                            if (rakutenMaxPrice) params.set("maxPrice", String(rakutenMaxPrice));
                            const res = await authFetch(`/api/rakuten-search?${params}`);
                            const data = await res.json();
                            if (data.error) { setRakutenError(data.error); } else { setRakutenResults(data.products || []); }
                          } catch (e: any) { setRakutenError(e.message); }
                          setRakutenSearching(false);
                        }}
                        disabled={rakutenSearching}
                        style={{ padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.borderLight}`, background: "#14141F", color: C.text, fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "left", lineHeight: 1.3 }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span>{ing.label}</span>
                          <span style={{ fontSize: 8, background: `${C.accent}33`, color: C.accent, padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>{ing.badge}</span>
                        </div>
                        <div style={{ fontSize: 9, color: C.green, marginTop: 2 }}>{ing.price}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 手動検索 */}
                <details style={{ marginBottom: 12 }}>
                  <summary style={{ fontSize: 12, color: C.textDim, cursor: "pointer", marginBottom: 8 }}>🔎 自分でキーワード検索</summary>
                  <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8, marginBottom: 10, marginTop: 8 }}>
                    <input
                      value={rakutenKeyword}
                      onChange={(e) => setRakutenKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !rakutenSearching && handleRakutenSearch()}
                      placeholder="商品名やキーワードで検索"
                      style={{ flex: 1, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <select value={rakutenTheme} onChange={(e) => setRakutenTheme(e.target.value)} style={{ background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 12, outline: "none", flex: isMobile ? 1 : undefined, maxWidth: isMobile ? undefined : 160 }}>
                        {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                      <button
                        id="rakuten-search-btn"
                        onClick={handleRakutenSearch}
                        disabled={rakutenSearching || !rakutenKeyword.trim()}
                        style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: rakutenSearching ? "#1A1A28" : "#bf0000", color: rakutenSearching ? C.textMuted : "#fff", fontWeight: 700, fontSize: 13, cursor: rakutenSearching ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
                      >
                        {rakutenSearching ? "検索中..." : "検索"}
                      </button>
                    </div>
                  </div>
                  {/* 価格帯フィルター */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                      {Object.entries(PRICE_PRESETS).filter(([k]) => k !== "custom").map(([key, preset]) => (
                        <button
                          key={key}
                          onClick={() => {
                            setRakutenPricePreset(key);
                            setRakutenMinPrice(preset.min);
                            setRakutenMaxPrice(preset.max);
                          }}
                          style={{
                            padding: "5px 12px", borderRadius: 6, border: `1px solid ${rakutenPricePreset === key ? "#bf0000" : C.borderLight}`,
                            background: rakutenPricePreset === key ? "#bf000022" : "transparent",
                            color: rakutenPricePreset === key ? "#bf0000" : C.textDim, fontSize: 11, fontWeight: rakutenPricePreset === key ? 700 : 400, cursor: "pointer",
                          }}
                        >
                          {preset.label}
                          <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>{preset.desc}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: C.textDim }}>¥</span>
                      <input type="number" value={rakutenMinPrice || ""} onChange={(e) => { setRakutenMinPrice(e.target.value ? Number(e.target.value) : undefined); setRakutenPricePreset("custom"); }} placeholder="下限" style={{ width: 90, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 6, padding: "6px 10px", color: C.text, fontSize: 12, outline: "none" }} />
                      <span style={{ fontSize: 11, color: C.textDim }}>〜 ¥</span>
                      <input type="number" value={rakutenMaxPrice || ""} onChange={(e) => { setRakutenMaxPrice(e.target.value ? Number(e.target.value) : undefined); setRakutenPricePreset("custom"); }} placeholder="上限" style={{ width: 90, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 6, padding: "6px 10px", color: C.text, fontSize: 12, outline: "none" }} />
                    </div>
                  </div>
                </details>
                {rakutenError && <div style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{rakutenError}</div>}

                {rakutenResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, padding: "6px 10px", background: "#1A1A28", borderRadius: 6 }}>
                      収益スコア順 | 料率×送料無料×ポイント倍率×あす楽×セール×評価 を総合評価
                    </div>
                    {rakutenResults.map((product, i) => (
                      <div key={i} style={{ padding: isMobile ? "10px" : "10px 14px", background: "#14141F", borderRadius: 10, border: i < 3 ? `1px solid ${i === 0 ? "#FFD70044" : i === 1 ? "#C0C0C044" : "#CD7F3244"}` : "none" }}>
                        <div style={{ display: "flex", gap: isMobile ? 8 : 12, alignItems: "flex-start" }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0, background: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : C.borderLight, color: i < 3 ? "#000" : C.textDim }}>
                            {i + 1}
                          </div>
                          {product.imageUrl && <img src={product.imageUrl} alt="" style={{ width: isMobile ? 44 : 56, height: isMobile ? 44 : 56, objectFit: "contain", borderRadius: 4, flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: isMobile ? 12 : 13, fontWeight: 600, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as any}>
                              {product.itemName}
                            </div>
                            <div style={{ fontSize: isMobile ? 11 : 12, color: C.textDim, marginTop: 2 }}>
                              <span style={{ color: "#bf0000", fontWeight: 700 }}>¥{product.itemPrice?.toLocaleString()}</span>
                              <span style={{ marginLeft: 6, fontSize: 10 }}>{product.shopName}</span>
                              {product.reviewCount > 0 && <span style={{ marginLeft: 6, fontSize: 10 }}>★{product.reviewAverage} ({product.reviewCount})</span>}
                            </div>
                            {!isMobile && (
                              <div style={{ fontSize: 11, color: C.accent, marginTop: 2 }}>
                                スコア: {product.profitScore?.toFixed(1) ?? "-"} | 料率: {product.affiliateRate ?? "-"}% | 報酬: ¥{product.estimatedCommission ?? "-"}/件
                              </div>
                            )}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                              {product.freeShipping && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#00C89622", color: "#00C896", fontWeight: 700 }}>送料無料</span>}
                              {product.nextDayDelivery && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#00D4FF22", color: "#00D4FF", fontWeight: 700 }}>あす楽</span>}
                              {product.pointRate >= 2 && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#FFB34722", color: "#FFB347", fontWeight: 700 }}>P{product.pointRate}倍</span>}
                              {product.onSale && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#FF6B6B22", color: "#FF6B6B", fontWeight: 700 }}>セール</span>}
                            </div>
                          </div>
                        </div>
                        {/* ボタン行 */}
                        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                          <a href={product.itemUrl || product.affiliateUrl} target="_blank" rel="noopener noreferrer"
                            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.accentAlt, fontSize: 11, fontWeight: 600, textDecoration: "none", textAlign: "center", flex: isMobile ? 1 : undefined }}>
                            楽天で見る
                          </a>
                          <button
                            onClick={() => {
                              const newPartner: AffiliatePartner = {
                                id: `aff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                asp: "楽天アフィリエイト",
                                programName: product.itemName.slice(0, 50),
                                themeIds: [rakutenTheme],
                                commissionType: "percent",
                                commissionValue: `${product.affiliateRate || 3}%`,
                                priority: Math.round(product.profitScore || 40),
                                html: product.affiliateHtml,
                                active: true,
                                tier: "B",
                                estimatedCpa: product.estimatedCommission || 0,
                              };
                              savePartners([...partners, newPartner]);
                            }}
                            disabled={partners.some((p) => product.affiliateUrl && (p.html || "").includes(product.affiliateUrl))}
                            style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: partners.some((p) => product.affiliateUrl && (p.html || "").includes(product.affiliateUrl)) ? "#1A1A28" : C.green, color: partners.some((p) => product.affiliateUrl && (p.html || "").includes(product.affiliateUrl)) ? C.textMuted : "#000", fontSize: 11, fontWeight: 700, cursor: "pointer", flex: isMobile ? 1 : undefined }}
                          >
                            {partners.some((p) => product.affiliateUrl && (p.html || "").includes(product.affiliateUrl)) ? "登録済" : "DB登録"}
                          </button>
                          <button
                            onClick={() => {
                              addProductFromRakuten(product);
                              setGenMode("product");
                              setActiveTab("generate");
                            }}
                            disabled={products.some((p) => p.name === product.itemName)}
                            style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: products.some((p) => p.name === product.itemName) ? "#1A1A28" : C.accent, color: products.some((p) => p.name === product.itemName) ? C.textMuted : "#000", fontSize: 11, fontWeight: 700, cursor: "pointer", flex: isMobile ? 1 : undefined }}
                          >
                            {products.some((p) => p.name === product.itemName) ? "追加済" : "記事に追加"}
                          </button>
                          <button
                            onClick={() => {
                              if (compareList.some((c) => c.itemName === product.itemName)) {
                                setCompareList((prev) => prev.filter((c) => c.itemName !== product.itemName));
                              } else if (compareList.length < 5) {
                                setCompareList((prev) => [...prev, product]);
                              }
                            }}
                            style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${compareList.some((c) => c.itemName === product.itemName) ? "#FFB347" : C.borderLight}`, background: compareList.some((c) => c.itemName === product.itemName) ? "#FFB34722" : "transparent", color: compareList.some((c) => c.itemName === product.itemName) ? "#FFB347" : C.textDim, fontSize: 11, fontWeight: 700, cursor: "pointer", flex: isMobile ? 1 : undefined }}
                          >
                            {compareList.some((c) => c.itemName === product.itemName) ? "⚔️ 比較中" : "⚔️ 比較"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 比較・ランキングリスト */}
                {compareList.length > 0 && (
                  <div style={{ marginTop: 16, padding: 16, background: rankingEnabled ? "#FF6B9D11" : "#FFB34711", border: `1.5px solid ${rankingEnabled ? "#FF6B9D44" : "#FFB34744"}`, borderRadius: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: rankingEnabled ? C.accent : "#FFB347" }}>
                        {rankingEnabled ? `🏆 ランキングリスト（${compareList.length}/5）` : `⚔️ 比較リスト（${compareList.length}/5）`}
                      </div>
                      {compareList.length >= 3 && (
                        <button onClick={() => setRankingEnabled(!rankingEnabled)} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${rankingEnabled ? C.accent : "#FFB347"}55`, background: "transparent", color: rankingEnabled ? C.accent : "#FFB347", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {rankingEnabled ? "比較モードに戻す" : "🏆 ランキングにする"}
                        </button>
                      )}
                    </div>
                    {rankingEnabled && (
                      <div style={{ fontSize: 11, color: C.green, marginBottom: 10, padding: "6px 10px", background: `${C.green}11`, borderRadius: 6, lineHeight: 1.6 }}>
                        💡 収益スコア順に自動ランキング：1位に最高報酬商品を配置し、記事内で自然に推薦します
                      </div>
                    )}
                    {(rankingEnabled
                      ? [...compareList].sort((a, b) => (b.profitScore || 0) - (a.profitScore || 0))
                      : compareList
                    ).map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < compareList.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                          {rankingEnabled && (
                            <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0, background: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : i === 2 ? "#CD7F32" : C.borderLight, color: i < 3 ? "#000" : C.textDim }}>
                              {i + 1}
                            </div>
                          )}
                          {item.imageUrl && <img src={item.imageUrl} alt="" style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 4, flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.itemName}</div>
                            <div style={{ fontSize: 11, color: "#bf0000" }}>
                              ¥{item.itemPrice?.toLocaleString()} | スコア: {item.profitScore?.toFixed(1)}
                              {rankingEnabled && i === 0 && <span style={{ marginLeft: 6, color: C.green, fontWeight: 700 }}>← おすすめ</span>}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => setCompareList((prev) => prev.filter((c) => c.itemName !== item.itemName))} style={{ padding: "2px 8px", borderRadius: 4, border: "none", background: `${C.red}22`, color: C.red, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>×</button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      {!rankingEnabled && (
                        <button
                          onClick={() => {
                            compareList.forEach((p) => addProductFromRakuten(p));
                            setComparisonEnabled(true);
                            setGenMode("product");
                            setActiveTab("generate");
                            setCompareList([]);
                          }}
                          disabled={compareList.length < 2}
                          style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: compareList.length >= 2 ? "linear-gradient(135deg, #FFB347, #FF6B9D)" : "#1A1A28", color: compareList.length >= 2 ? "#000" : C.textMuted, fontWeight: 800, fontSize: 13, cursor: compareList.length >= 2 ? "pointer" : "not-allowed" }}
                        >
                          ⚔️ 比較記事を作成
                        </button>
                      )}
                      {rankingEnabled && (
                        <button
                          onClick={() => {
                            // 収益スコア順にソートして追加
                            const sorted = [...compareList].sort((a, b) => (b.profitScore || 0) - (a.profitScore || 0));
                            // 既存の商品をクリアしてから追加
                            setProducts([{ name: "" }]);
                            setTimeout(() => {
                              sorted.forEach((p) => addProductFromRakuten(p));
                              setComparisonEnabled(true);
                              setRankingEnabled(false);
                              setGenMode("product");
                              setActiveTab("generate");
                              setCompareList([]);
                            }, 50);
                          }}
                          disabled={compareList.length < 3}
                          style={{ flex: 1, padding: "12px", borderRadius: 8, border: "none", background: compareList.length >= 3 ? "linear-gradient(135deg, #FFD700, #FF6B9D)" : "#1A1A28", color: compareList.length >= 3 ? "#000" : C.textMuted, fontWeight: 800, fontSize: 13, cursor: compareList.length >= 3 ? "pointer" : "not-allowed" }}
                        >
                          🏆 ランキング記事を作成
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Add / Edit partner button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>提携先データベース</h3>
                <button
                  onClick={() => setEditingPartner({ ...emptyPartner, id: `aff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })}
                  style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: C.green, color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                >
                  + 提携先を追加
                </button>
              </div>

              {/* Filter by theme */}
              <div style={{ marginBottom: 16 }}>
                <select
                  value={affFilterTheme}
                  onChange={(e) => setAffFilterTheme(e.target.value)}
                  style={{ background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 8, padding: "8px 14px", color: C.text, fontSize: 13, outline: "none" }}
                >
                  <option value="all">全テーマ表示</option>
                  {THEMES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Partner list */}
              {partners.length === 0 ? (
                <div style={{ textAlign: "center", padding: "50px 0", color: C.textMuted }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>提携先が登録されていません</div>
                  <div style={{ fontSize: 12 }}>「+ 提携先を追加」からASPのアフィリエイトリンクを登録してください</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {partners
                    .filter((p) => affFilterTheme === "all" || (Array.isArray(p.themeIds) && p.themeIds.includes(affFilterTheme)))
                    .sort((a, b) => b.priority - a.priority)
                    .map((partner) => (
                      <div key={partner.id} style={{ background: C.bgCard, border: `1px solid ${partner.active ? C.border : C.red + "44"}`, borderRadius: 12, padding: "16px 20px", opacity: partner.active ? 1 : 0.6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: partner.tier === "S" ? `${C.orange}33` : partner.tier === "A" ? `${C.green}22` : `${C.accentAlt}22`, color: partner.tier === "S" ? C.orange : partner.tier === "A" ? C.green : C.accentAlt }}>{partner.tier || "B"}-rank</span>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: `${C.accentAlt}22`, color: C.accentAlt }}>{partner.asp}</span>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: partner.commissionType === "cpa" ? `${C.green}22` : `${C.orange}22`, color: partner.commissionType === "cpa" ? C.green : C.orange }}>
                            {partner.commissionType === "cpa" ? "CPA" : partner.commissionType === "cpc" ? "CPC" : "物販%"} {partner.commissionValue}
                          </span>
                          {partner.estimatedCpa > 0 && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: `${C.green}22`, color: C.green }}>推定 ¥{partner.estimatedCpa.toLocaleString()}/件</span>}
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: `${C.accent}22`, color: C.accent }}>優先度: {partner.priority}</span>
                          {!partner.active && <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, fontWeight: 700, background: `${C.red}22`, color: C.red }}>停止中</span>}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{partner.programName || "(名称未設定)"}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                          {partner.themeIds.map((tid) => {
                            const theme = THEMES.find((t) => t.id === tid);
                            return <span key={tid} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#14141F", color: C.textDim }}>{theme?.label || tid}</span>;
                          })}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setEditingPartner({ ...partner })} style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${C.accent}55`, background: "transparent", color: C.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>編集</button>
                          <button onClick={() => savePartners(partners.map((p) => p.id === partner.id ? { ...p, active: !p.active } : p))} style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${C.borderLight}`, background: "transparent", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
                            {partner.active ? "停止" : "有効化"}
                          </button>
                          <button onClick={() => { if (confirm("この提携先を削除しますか？")) savePartners(partners.filter((p) => p.id !== partner.id)); }} style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${C.red}44`, background: "transparent", color: C.red, fontSize: 12, cursor: "pointer" }}>削除</button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Info */}
              <div style={{ marginTop: 20, padding: "14px 18px", background: "#0F1A14", border: `1px solid ${C.green}33`, borderRadius: 12, fontSize: 12, color: C.green, lineHeight: 1.9 }}>
                記事生成時、テーマに紐づく提携先を優先度順に自動選択してプレースホルダーに挿入します<br />
                楽天検索: RAKUTEN_APP_ID / RAKUTEN_AFFILIATE_ID をVercel環境変数に設定してください<br />
                Cron自動生成時: 環境変数 <code style={{ color: C.accentAlt }}>AFFILIATE_DB</code> にJSON形式で登録してください
              </div>
            </div>
          )}

          {/* ====== PARTNER EDIT MODAL ====== */}
          {editingPartner && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 20 }}>
              <div style={{ background: C.bgCard, border: `1px solid ${C.accent}44`, borderRadius: isMobile ? "16px 16px 0 0" : 16, width: "100%", maxWidth: isMobile ? "100%" : 600, maxHeight: isMobile ? "95vh" : "90vh", overflow: "auto", padding: isMobile ? 20 : 28 }}>
                <h3 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 800 }}>
                  {partners.some((p) => p.id === editingPartner.id) ? "提携先を編集" : "提携先を追加"}
                </h3>

                {/* ASP */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>ASP</label>
                  <select value={editingPartner.asp} onChange={(e) => setEditingPartner({ ...editingPartner, asp: e.target.value })} style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none" }}>
                    {["A8.net", "afb", "もしもアフィリエイト", "アクセストレード", "バリューコマース", "TCSアフィリエイト", "Amazonアソシエイト", "楽天アフィリエイト", "その他"].map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>

                {/* Program name */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>プログラム名（クリニック名・商品名）</label>
                  <input value={editingPartner.programName} onChange={(e) => setEditingPartner({ ...editingPartner, programName: e.target.value })} placeholder="例：レジーナクリニック" style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>

                {/* Themes (multi-select via checkboxes) */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>対応テーマ（複数選択可）</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, background: "#14141F", borderRadius: 10, padding: 12, border: `1.5px solid ${C.borderLight}`, maxHeight: 160, overflow: "auto" }}>
                    {THEMES.map((t) => {
                      const themeIds = Array.isArray(editingPartner?.themeIds) ? editingPartner.themeIds : [];
                      const checked = themeIds.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => {
                          const ids = checked ? themeIds.filter((id) => id !== t.id) : [...themeIds, t.id];
                          setEditingPartner({ ...editingPartner, themeIds: ids });
                        }} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${checked ? C.accent : C.borderLight}`, background: checked ? `${C.accent}22` : "transparent", color: checked ? C.accent : C.textDim, fontSize: 11, cursor: "pointer", fontWeight: checked ? 700 : 400 }}>
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Commission */}
                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>報酬タイプ</label>
                    <select value={editingPartner.commissionType} onChange={(e) => setEditingPartner({ ...editingPartner, commissionType: e.target.value as CommissionType })} style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none" }}>
                      <option value="cpa">CPA（成果報酬）</option>
                      <option value="cpc">CPC（クリック報酬）</option>
                      <option value="percent">物販%</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>報酬額</label>
                    <input value={editingPartner.commissionValue} onChange={(e) => setEditingPartner({ ...editingPartner, commissionValue: e.target.value })} placeholder="例：5,000円 / 3%" style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>

                {/* Tier & Estimated CPA */}
                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>収益ティア</label>
                    <select value={editingPartner.tier || "B"} onChange={(e) => setEditingPartner({ ...editingPartner, tier: e.target.value as AffiliateTier })} style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none" }}>
                      <option value="S">S-rank（クリニック予約 ¥7,000-10,000）</option>
                      <option value="A">A-rank（トライアル購入 ¥2,000-2,500）</option>
                      <option value="B">B-rank（EC商品 5%報酬）</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>推定CPA（円/件）</label>
                    <input type="number" min={0} value={editingPartner.estimatedCpa || 0} onChange={(e) => setEditingPartner({ ...editingPartner, estimatedCpa: Number(e.target.value) || 0 })} placeholder="例：7000" style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>

                {/* Priority */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>優先度（1〜100、高いほど記事内で優先的に使用）</label>
                  <input type="number" min={1} max={100} value={editingPartner.priority} onChange={(e) => setEditingPartner({ ...editingPartner, priority: Number(e.target.value) || 50 })} style={{ width: 120, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none" }} />
                </div>

                {/* HTML */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 6, fontWeight: 600 }}>アフィリエイトHTML（ASPからコピー）</label>
                  <textarea value={editingPartner.html} onChange={(e) => setEditingPartner({ ...editingPartner, html: e.target.value })} placeholder={'<a href="https://px.a8.net/..." rel="nofollow">公式サイトはこちら</a>'} rows={5} style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "12px 14px", color: C.text, fontSize: 12, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "monospace" }} />
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => {
                      if (!editingPartner.html.trim() || editingPartner.themeIds.length === 0) {
                        alert("対応テーマとHTMLは必須です");
                        return;
                      }
                      const exists = partners.some((p) => p.id === editingPartner.id);
                      if (exists) {
                        savePartners(partners.map((p) => p.id === editingPartner.id ? editingPartner : p));
                      } else {
                        savePartners([...partners, editingPartner]);
                      }
                      setEditingPartner(null);
                    }}
                    style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.accent},${C.green})`, color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" }}
                  >
                    保存
                  </button>
                  <button onClick={() => setEditingPartner(null)} style={{ padding: "12px 24px", borderRadius: 10, border: `1px solid ${C.borderLight}`, background: "transparent", color: C.textDim, fontSize: 14, cursor: "pointer" }}>
                    キャンセル
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ====== THEMES TAB ====== */}
          {activeTab === "themes" && (
            <div>
              <p style={{ fontSize: 13, color: C.textDim, marginTop: 0, marginBottom: 20 }}>
                Cronは日付ベースで毎日異なるテーマを自動選択します。全{THEMES.length}テーマ × 各3キーワード = {THEMES.length * 3}パターン
              </p>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {THEMES.map((theme) => (
                  <div key={theme.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{theme.label}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {theme.keywords.map((kw) => (
                        <span key={kw} style={{ fontSize: 11, color: C.textDim, padding: "4px 8px", background: "#14141F", borderRadius: 4 }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ====== TRENDS TAB ====== */}
          {activeTab === "trends" && (
            <div>
              {/* Header + Controls */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>美容トレンド収集</h2>
                  {trendLastCollected && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>最終収集: {trendLastCollected}</div>}
                </div>
                <button
                  onClick={collectTrends}
                  disabled={trendLoading}
                  style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: trendLoading ? "#1A1A28" : `linear-gradient(135deg,${C.accent},${C.accentAlt})`, color: trendLoading ? C.textMuted : "#fff", fontWeight: 700, fontSize: 13, cursor: trendLoading ? "not-allowed" : "pointer" }}
                >
                  {trendLoading ? "収集中..." : "トレンド収集を実行"}
                </button>
              </div>

              {/* Search Box */}
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="キーワードで検索..."
                  value={trendFilter.search}
                  onChange={(e) => setTrendFilter((f) => ({ ...f, search: e.target.value }))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bgCard, color: C.text, fontSize: 13, outline: "none" }}
                />
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: C.textMuted, lineHeight: "32px" }}>ソース:</span>
                {["all", "gdelt", "youtube", "pubmed"].map((s) => (
                  <button key={s} onClick={() => setTrendFilter((f) => ({ ...f, source: s }))}
                    style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${trendFilter.source === s ? C.accent : C.border}`, background: trendFilter.source === s ? `${C.accent}22` : "transparent", color: trendFilter.source === s ? C.accent : C.textDim, fontSize: 12, cursor: "pointer" }}>
                    {s === "all" ? "全て" : s === "gdelt" ? "📰 ニュース" : s === "youtube" ? "🎥 YouTube" : "🔬 論文"}
                  </button>
                ))}
                <span style={{ fontSize: 12, color: C.textMuted, lineHeight: "32px", marginLeft: 12 }}>カテゴリ:</span>
                {["all", "美容医療", "スキンケア", "新作コスメ", "ヘアケア", "インナーケア"].map((c) => (
                  <button key={c} onClick={() => setTrendFilter((f) => ({ ...f, category: c }))}
                    style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${trendFilter.category === c ? C.accentAlt : C.border}`, background: trendFilter.category === c ? `${C.accentAlt}22` : "transparent", color: trendFilter.category === c ? C.accentAlt : C.textDim, fontSize: 12, cursor: "pointer" }}>
                    {c === "all" ? "全て" : c}
                  </button>
                ))}
              </div>

              {/* Stats */}
              {trends.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "総トレンド", value: trends.length, color: C.accent },
                    { label: "📰 ニュース", value: trends.filter((t) => t.source === "gdelt").length, color: "#FF9F43" },
                    { label: "🎥 YouTube", value: trends.filter((t) => t.source === "youtube").length, color: "#FF6B6B" },
                    { label: "🔬 論文", value: trends.filter((t) => t.source === "pubmed").length, color: "#48DBFB" },
                  ].map((stat) => (
                    <div key={stat.label} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Trend Cards */}
              {trends.length === 0 && !trendLoading && (
                <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMuted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 14 }}>まだトレンドが収集されていません</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>「トレンド収集を実行」をクリックして開始してください</div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {trends
                  .filter((t) => trendFilter.source === "all" || t.source === trendFilter.source)
                  .filter((t) => trendFilter.category === "all" || t.category === trendFilter.category)
                  .filter((t) => {
                    if (!trendFilter.search.trim()) return true;
                    const q = trendFilter.search.toLowerCase();
                    return (t.titleJa || t.title || "").toLowerCase().includes(q) ||
                      (t.summaryJa || t.summary || "").toLowerCase().includes(q) ||
                      (Array.isArray(t.keywords) && t.keywords.some((k) => (k || "").toLowerCase().includes(q)));
                  })
                  .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
                  .map((trend) => {
                    const scoreColor = trend.combinedScore >= 70 ? C.green : trend.combinedScore >= 40 ? "#FF9F43" : C.red;
                    const sourceIcon = trend.source === "gdelt" ? "📰" : trend.source === "youtube" ? "🎥" : "🔬";
                    const displayTitle = trend.titleJa || trend.title;
                    const displaySummary = trend.summaryJa || trend.summary;

                    return (
                      <div key={trend.id} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: isMobile ? 12 : 16, display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 14, alignItems: isMobile ? "stretch" : "flex-start" }}>
                        {/* Top row: Score + Content */}
                        <div style={{ display: "flex", gap: 10, flex: 1, minWidth: 0 }}>
                          {/* Score badge */}
                          <div style={{ minWidth: 40, textAlign: "center", flexShrink: 0 }}>
                            <div style={{ width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: "50%", background: `${scoreColor}22`, border: `2px solid ${scoreColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 14 : 16, fontWeight: 800, color: scoreColor }}>
                              {trend.combinedScore}
                            </div>
                            <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>{sourceIcon}</div>
                          </div>

                          {/* Content */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: isMobile ? 13 : 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.4, wordBreak: "break-word" }}>
                              {displayTitle}
                            </div>
                            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as any}>
                              {displaySummary}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 10, background: `${C.accentAlt}22`, color: C.accentAlt, fontSize: 10, fontWeight: 600 }}>{trend.category}</span>
                              <span style={{ fontSize: 10, color: C.textMuted }}>{new Date(trend.publishedAt).toLocaleDateString("ja-JP")}</span>
                              {trend.matchedThemeIds.length > 0 && (
                                <span style={{ fontSize: 10, color: C.green }}>テーマ: {trend.matchedThemeIds.join(", ")}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", flexDirection: isMobile ? "row" : "column", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => handleTrendArticleClick(trend)}
                            disabled={!!trendGenerating}
                            style={{ padding: isMobile ? "8px 16px" : "6px 12px", borderRadius: 6, border: "none", background: trendGenerating === trend.id ? "#1A1A28" : trend.used ? C.green : C.accent, color: trendGenerating === trend.id ? C.textMuted : "#fff", fontSize: isMobile ? 12 : 11, fontWeight: 700, cursor: trendGenerating ? "not-allowed" : "pointer", whiteSpace: "nowrap", flex: isMobile ? 1 : undefined }}>
                            {trendGenerating === trend.id ? "生成中..." : trend.used ? "生成済み" : "記事にする"}
                          </button>
                          <a href={trend.sourceUrl} target="_blank" rel="noopener noreferrer"
                            style={{ padding: isMobile ? "8px 16px" : "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, fontSize: isMobile ? 12 : 11, textAlign: "center", textDecoration: "none", cursor: "pointer", flex: isMobile ? 1 : undefined }}>
                            元記事
                          </a>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* YouTube追加情報入力モーダル */}
              {trendModalTarget && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 20 }}>
                  <div style={{ background: C.bgCard, border: `1px solid ${C.accent}44`, borderRadius: isMobile ? "16px 16px 0 0" : 16, width: "100%", maxWidth: isMobile ? "100%" : 600, maxHeight: isMobile ? "90vh" : "80vh", overflow: "auto", padding: isMobile ? 20 : 28 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🎥 YouTube動画から記事を作成</h3>
                      <button onClick={() => setTrendModalTarget(null)} style={{ background: "none", border: "none", color: C.textDim, fontSize: 20, cursor: "pointer" }}>✕</button>
                    </div>

                    <div style={{ background: "#14141F", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{trendModalTarget.titleJa || trendModalTarget.title}</div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>{trendModalTarget.summaryJa || trendModalTarget.summary}</div>
                      <a href={trendModalTarget.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: C.accentAlt, marginTop: 6, display: "inline-block" }}>
                        動画を見る →
                      </a>
                    </div>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>
                        追加情報（文字起こし・メモなど）
                      </label>
                      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
                        動画のスクリーンショットを文字起こしした内容や、気になったポイントを入力してください。空欄の場合は動画の説明文のみで記事を作成します。
                      </div>
                      <textarea
                        value={trendExtraText}
                        onChange={(e) => setTrendExtraText(e.target.value)}
                        placeholder={"例：\n・ビタミンC美容液は朝使うと紫外線で酸化するのは誤解\n・夜だけでなく朝も使ったほうが効果的\n・おすすめはロート製薬のメラノCC\n・価格は1,000円前後でコスパ最強"}
                        style={{ width: "100%", minHeight: 160, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: 14, color: C.text, fontSize: 14, outline: "none", resize: "vertical", lineHeight: 1.6, boxSizing: "border-box" }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={() => setTrendModalTarget(null)}
                        style={{ flex: 1, padding: 14, borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => useTrendForArticle(trendModalTarget, trendExtraText)}
                        style={{ flex: 2, padding: 14, borderRadius: 10, border: "none", background: `linear-gradient(135deg,${C.accent},${C.green})`, color: "#000", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                      >
                        {trendExtraText.trim() ? "追加情報付きで記事を生成" : "そのまま記事を生成"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ====== X SCHEDULE TAB ====== */}
          {activeTab === "x-schedule" && <XScheduleTab isMobile={isMobile} C={C} authToken={getPwd()} />}

          {/* ====== SETTINGS TAB ====== */}
          {activeTab === "settings" && (
            <div style={{ maxWidth: isMobile ? "100%" : 640 }}>
              {/* Blog URL Registration */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>🌐 ブログURL</h3>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>登録するとダッシュボードからワンタップでブログへ飛べます</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    value={blogUrl}
                    onChange={(e) => setBlogUrl(e.target.value)}
                    placeholder="https://your-blog.com"
                    style={{ flex: 1, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  />
                  <button
                    onClick={() => { try { localStorage.setItem("be_blog_url", blogUrl); } catch {} alert("保存しました"); }}
                    style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: C.green, color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    保存
                  </button>
                </div>
              </div>

              {/* Author Balloon Settings */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>💬 吹き出し設定</h3>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>記事内の筆者コメント吹き出しに使うアイコンと名前（WordPressのGravatarを自動取得）</div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  {authorIconUrl && <img src={authorIconUrl} alt="アイコン" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: `2px solid ${C.accent}` }} />}
                  <div>
                    {authorName && <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{authorName}</div>}
                    {authorIconUrl ? <div style={{ fontSize: 11, color: C.green }}>Gravatar取得済み</div> : <div style={{ fontSize: 11, color: C.textMuted }}>未取得</div>}
                  </div>
                </div>
                <button onClick={async () => {
                  try {
                    const res = await authFetch("/api/author-profile");
                    const data = await res.json();
                    if (data.avatarUrl) { setAuthorIconUrl(data.avatarUrl); localStorage.setItem("be_author_icon", data.avatarUrl); }
                    if (data.name) { setAuthorName(data.name); localStorage.setItem("be_author_name", data.name); }
                    alert(`取得完了: ${data.name}`);
                  } catch (e: any) { alert("取得失敗: " + e.message); }
                }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: C.accent, color: "#000", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>WordPressからGravatarを取得</button>
              </div>

              {/* WP Connection Test */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>WordPress接続テスト</h3>
                <button
                  onClick={testWP}
                  disabled={wpTesting}
                  style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: wpTesting ? "#1A1A28" : C.accentAlt, color: wpTesting ? C.textMuted : "#000", fontWeight: 700, fontSize: 13, cursor: wpTesting ? "not-allowed" : "pointer" }}
                >
                  {wpTesting ? "テスト中..." : "接続テスト"}
                </button>
                {wpStatus && (
                  <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 8, background: wpStatus.ok ? `${C.green}11` : `${C.red}11`, border: `1px solid ${wpStatus.ok ? C.green : C.red}44`, fontSize: 13 }}>
                    {wpStatus.ok ? (
                      <span style={{ color: C.green }}>接続成功 — ユーザー: {wpStatus.name}</span>
                    ) : (
                      <span style={{ color: C.red }}>接続失敗: {wpStatus.error}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Environment Variables Guide */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>環境変数（Vercel）</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { key: "APP_PASSWORD", desc: "ダッシュボードのログインパスワード" },
                    { key: "ANTHROPIC_API_KEY", desc: "Claude APIキー" },
                    { key: "WP_URL", desc: "WordPressサイトURL" },
                    { key: "WP_USERNAME", desc: "WPユーザー名" },
                    { key: "WP_APP_PASSWORD", desc: "WP Application Password" },
                    { key: "WP_DEFAULT_STATUS", desc: "draft or publish" },
                    { key: "ACTIVE_GENRE", desc: "beauty / health / gadget" },
                    { key: "CRON_SECRET", desc: "Cron認証用シークレット" },
                  ].map((env) => (
                    <div key={env.key} style={{ display: "flex", alignItems: "center", padding: "10px 14px", background: "#14141F", borderRadius: 8, gap: 12 }}>
                      <code style={{ fontSize: 12, color: C.accentAlt, fontWeight: 700, minWidth: 180 }}>{env.key}</code>
                      <span style={{ fontSize: 12, color: C.textMuted }}>{env.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ====== MOBILE BOTTOM TAB BAR ====== */}
      {isMobile && (
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
          background: C.bgCard, borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-around", alignItems: "center",
          padding: "6px 0 env(safe-area-inset-bottom, 6px)",
        }}>
          {mobileBottomTabs.map((tab) => {
            const isActive = tab.id === "_menu" ? sidebarOpen : activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  if (tab.id === "_menu") {
                    setSidebarOpen(!sidebarOpen);
                  } else {
                    setActiveTab(tab.id);
                    setSidebarOpen(false);
                  }
                }}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                  background: "none", border: "none", cursor: "pointer",
                  color: isActive ? C.accent : C.textMuted,
                  padding: "6px 0", minHeight: 44,
                }}
              >
                <span style={{ fontSize: 20 }}>{tab.icon}</span>
                <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 400 }}>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* ====== PREVIEW MODAL ====== */}
      {previewItem && (
        <PreviewModal
          item={previewItem}
          onClose={() => setPreviewItem(null)}
          onUpdate={(updated) => {
            setPreviewItem(updated);
            setHistory((prev) => prev.map((h) => h.id === updated.id ? updated : h));
            // genResult の articleData も更新
            if (genResult?.articleData) {
              setGenResult({ ...genResult, articleData: { ...genResult.articleData, title: updated.title, htmlContent: updated.htmlContent, metaDescription: updated.metaDescription } });
            }
          }}
          isPendingPublish={genResult?.pendingPublish && previewItem.id === history[0]?.id}
          onPublish={(opts) => handlePublish(opts)}
          publishing={publishing}
          isMobile={isMobile}
          factChecking={factChecking}
          factCheckResult={factCheckResult}
          useImprovedVersion={useImprovedVersion}
          onToggleImproved={setUseImprovedVersion}
        />
      )}
    </div>
  );
}

// ==========================================
// ==========================================
// X Schedule Tab Component
// ==========================================
function XScheduleTab({ isMobile, C, authToken }: { isMobile: boolean; C: Record<string, string>; authToken: string }) {
  const [schedule, setSchedule] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState<string | null>(null);
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newType, setNewType] = useState<"normal" | "thread" | "long">("normal");
  const [threadTexts, setThreadTexts] = useState(["", "", "", "", ""]);
  const [error, setError] = useState("");
  // X単体投稿: パターン選択・AI生成
  const [xStyle, setXStyle] = useState<TweetStyle>("save-list");
  const [xTopic, setXTopic] = useState("");
  const [xAiLoading, setXAiLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "posted" | "long">("all");
  // AIテーマ会議（永続保存・履歴対応）
  const [themes, setThemes] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem("be_x_themes");
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed.themes || [];
      }
    } catch {}
    return [];
  });
  const [themesLoading, setThemesLoading] = useState(false);
  const [themesSeason, setThemesSeason] = useState(() => {
    try {
      const cached = localStorage.getItem("be_x_themes");
      if (cached) return JSON.parse(cached).season || "";
    } catch {}
    return "";
  });
  const [themesDate, setThemesDate] = useState(() => {
    try {
      const cached = localStorage.getItem("be_x_themes");
      if (cached) return JSON.parse(cached).date || "";
    } catch {}
    return "";
  });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` };

  // スケジュール読み込み
  async function loadSchedule() {
    setLoading(true);
    try {
      const res = await fetch("/api/x-schedule", { headers });
      const data = await safeJsonResponse(res);
      if (data.success) {
        setSchedule(data.schedule || []);
      } else {
        setError(data.error || "スケジュール読み込み失敗");
      }
    } catch (e: any) { setError("スケジュール読み込みエラー: " + e.message); }
    setLoading(false);
  }

  useEffect(() => { loadSchedule(); }, []);

  // AI単体投稿生成
  async function generateStandaloneTweet() {
    if (!xTopic.trim()) return;
    setXAiLoading(true); setError("");
    try {
      const res = await fetch("/api/x-ai-tweet", {
        method: "POST", headers,
        body: JSON.stringify({ title: xTopic, content: "", style: xStyle, length: newType === "long" ? "long" : "short" }),
      });
      const data = await safeJsonResponse(res);
      if (data.success && data.text) {
        setNewText(data.text);
      } else {
        setError(data.error || "生成に失敗しました");
      }
    } catch (e: any) { setError(e.message); }
    setXAiLoading(false);
  }

  // AIテーマ会議（X投稿用）
  async function suggestThemes() {
    setThemesLoading(true); setError("");
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 120000);
      const res = await fetch("/api/x-theme-suggest", { method: "POST", headers, signal: controller.signal });
      const rawText = await res.text();
      if (!res.ok) throw new Error(rawText.slice(0, 200) || `サーバーエラー (${res.status})`);
      const trimmed = rawText.trim();
      const jsonMatch = trimmed.match(/\{[^{}]*"(success|error|themes)"[\s\S]*\}/);
      if (!jsonMatch) { setError("AI会議の応答を解析できませんでした"); setThemesLoading(false); return; }
      const data = JSON.parse(jsonMatch[0]);
      if (data.error) {
        setError(data.error);
      } else if (data.themes?.length > 0) {
        setThemes(data.themes);
        setThemesSeason(data.season || "");
        const dateStr = new Date().toLocaleDateString("ja-JP", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
        setThemesDate(dateStr);
        try { localStorage.setItem("be_x_themes", JSON.stringify({ themes: data.themes, season: data.season || "", date: dateStr })); } catch {}
      }
    } catch (e: any) { setError(e.message); }
    setThemesLoading(false);
  }

  // テーマから投稿作成
  function useTheme(theme: any) {
    setXTopic(theme.topic);
    setXStyle(theme.style || "save-list");
    setNewType(theme.length === "long" ? "long" : "normal");
    // 少し待ってからスクロール
    setTimeout(() => {
      document.getElementById("x-create-section")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  // 手動追加
  async function addTweet() {
    if (!newText.trim() || !newDate) return;
    try {
      const body: any = { action: "add", text: newText, scheduledAt: newDate + ":00", type: newType === "long" ? "long" : newType };
      if (newType === "thread") body.threadTexts = threadTexts.filter(t => t.trim());
      const res = await fetch("/api/x-schedule", { method: "POST", headers, body: JSON.stringify(body) });
      const data = await safeJsonResponse(res);
      if (data.success) {
        setNewText(""); setNewDate(""); setThreadTexts(["", "", "", "", ""]); setXTopic("");
        loadSchedule();
      }
    } catch (e: any) { setError(e.message); }
  }

  // AI一括生成
  async function generateWeek() {
    setGenerating(true); setError("");
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 120000); // 2分タイムアウト
      const res = await fetch("/api/x-generate", { method: "POST", headers, body: JSON.stringify({ mode: "week", days: 3 }), signal: controller.signal });
      const rawText = await res.text();
      if (!res.ok) throw new Error(rawText.slice(0, 200) || `サーバーエラー (${res.status})`);
      const trimmed = rawText.trim();
      // ストリーミングレスポンスからJSON部分を抽出（ハートビートスペースを除去）
      const jsonMatch = trimmed.match(/\{[^{}]*"(success|error|tweets)"[\s\S]*\}/);
      if (!jsonMatch) {
        setError("AI生成のレスポンス解析に失敗: " + trimmed.slice(-200));
        setGenerating(false);
        return;
      }
      const data = JSON.parse(jsonMatch[0]);
      if (data.error) {
        setError(data.error);
      } else if (data.tweets?.length > 0) {
        const addRes = await fetch("/api/x-schedule", { method: "POST", headers, body: JSON.stringify({ action: "addBulk", tweets: data.tweets }) });
        const addData = await safeJsonResponse(addRes);
        if (addData.success) {
          setError("");
          loadSchedule();
        } else {
          setError("スケジュールへの保存に失敗しました");
        }
      } else {
        setError("投稿が生成されませんでした");
      }
    } catch (e: any) { setError(e.message); }
    setGenerating(false);
  }

  // 即時投稿
  async function postNow(tweet: any) {
    setPosting(tweet.id);
    try {
      // 直リンク回避：本文にURLを入れず、blogUrlはリプライ投稿用に別送
      const res = await fetch("/api/x-post-now", { method: "POST", headers, body: JSON.stringify({ text: tweet.text, type: tweet.type, threadTexts: tweet.threadTexts, blogUrl: tweet.blogUrl }) });
      const data = await safeJsonResponse(res);
      if (data.success) {
        await fetch("/api/x-schedule", { method: "POST", headers, body: JSON.stringify({ action: "markPosted", id: tweet.id }) });
        loadSchedule();
      } else {
        setError(data.error || "投稿に失敗しました");
      }
    } catch (e: any) { setError(e.message); }
    setPosting(null);
  }

  // 削除
  async function deleteTweet(id: string) {
    await fetch("/api/x-schedule", { method: "POST", headers, body: JSON.stringify({ action: "delete", id }) });
    loadSchedule();
  }

  const filteredSchedule = filter === "all" ? schedule : filter === "long" ? schedule.filter(t => t.type === "long") : schedule.filter(t => t.status === filter);
  const pendingCount = schedule.filter(t => t.status === "pending").length;
  const postedCount = schedule.filter(t => t.status === "posted").length;
  const longCount = schedule.filter(t => t.type === "long").length;

  return (
    <div style={{ maxWidth: isMobile ? "100%" : 800 }}>
      {/* ヘッダー統計 */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "予約中", value: pendingCount, color: C.accent },
          { label: "投稿済み", value: postedCount, color: C.green },
          { label: "合計", value: schedule.length, color: C.accentAlt },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, minWidth: 80, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.textMuted }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* AIテーマ会議 */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>💡 AIテーマ会議</h3>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
          🧴美容プロ × 💰アフィリエイトプロ × 🔥Xプロ の3人が会議して、今最も伸びるテーマを10個提案します
        </div>
        <button onClick={suggestThemes} disabled={themesLoading} style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: themesLoading ? "#1A1A28" : `linear-gradient(135deg, #FFD700, #FF6B9D, #00D4FF)`, color: themesLoading ? C.textMuted : "#000", fontWeight: 800, fontSize: 14, cursor: themesLoading ? "not-allowed" : "pointer", width: "100%" }}>
          {themesLoading ? "🧠 会議中... (約30秒)" : "🧠 3人のプロに聞く"}
        </button>

        {/* テーマ結果 */}
        {themes.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              {themesSeason && <span style={{ fontSize: 11, color: C.accentAlt }}>📅 {themesSeason}</span>}
              {themesDate && <span style={{ fontSize: 10, color: C.textMuted }}>生成: {themesDate}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {themes.map((t: any, i: number) => {
                const total = (t.scores?.beauty || 0) + (t.scores?.affiliate || 0) + (t.scores?.x_viral || 0);
                return (
                  <div key={i} style={{ background: `${C.bg}`, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: isMobile ? 12 : 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: i < 3 ? "#FFD700" : C.textDim, minWidth: 24 }}>#{t.rank || i + 1}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>{t.topic}</span>
                      </div>
                      <span style={{ fontSize: 11, color: C.accentAlt, fontWeight: 700, whiteSpace: "nowrap", marginLeft: 8 }}>{total}/30</span>
                    </div>
                    {/* スコアバー */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 6, fontSize: 11 }}>
                      <span style={{ color: "#FF69B4" }}>🧴{t.scores?.beauty || 0}</span>
                      <span style={{ color: "#FFD700" }}>💰{t.scores?.affiliate || 0}</span>
                      <span style={{ color: "#FF4500" }}>🔥{t.scores?.x_viral || 0}</span>
                      <span style={{ color: C.textMuted }}>
                        {t.length === "long" ? "📄長文" : "短文"} / {TWEET_STYLES.find(s => s.id === t.style)?.label || t.style}
                      </span>
                    </div>
                    {/* 理由 */}
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 6, lineHeight: 1.5 }}>{t.reason}</div>
                    {/* 専門家コメント */}
                    {t.expert_comments && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, fontSize: 10 }}>
                        <span style={{ padding: "2px 6px", borderRadius: 4, background: "#FF69B422", color: "#FF69B4" }}>🧴 {t.expert_comments.misaki}</span>
                        <span style={{ padding: "2px 6px", borderRadius: 4, background: "#FFD70022", color: "#FFD700" }}>💰 {t.expert_comments.ryota}</span>
                        <span style={{ padding: "2px 6px", borderRadius: 4, background: "#FF450022", color: "#FF6B6B" }}>🔥 {t.expert_comments.yuna}</span>
                      </div>
                    )}
                    <button onClick={() => useTheme(t)} style={{ padding: "5px 14px", borderRadius: 6, border: `1px solid ${C.accent}55`, background: "transparent", color: C.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      このテーマで投稿作成 →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* AI一括生成ボタン */}
      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>🤖 AI一括生成</h3>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>3日分のX投稿（1日2回 = 6件）をAIが自動生成します。繰り返し押して追加できます</div>
        <button onClick={generateWeek} disabled={generating} style={{ padding: "12px 24px", borderRadius: 8, border: "none", background: generating ? "#1A1A28" : `linear-gradient(135deg,${C.accent},${C.accentAlt})`, color: generating ? C.textMuted : "#000", fontWeight: 800, fontSize: 14, cursor: generating ? "not-allowed" : "pointer", width: "100%" }}>
          {generating ? "生成中... (約20秒)" : "📅 3日分をAI生成"}
        </button>
        {error && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>⚠ {error}</div>}
      </div>

      {/* X単体投稿作成 */}
      <div id="x-create-section" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: isMobile ? 10 : 14, padding: isMobile ? 16 : 24, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>✏️ 投稿を作成</h3>

        {/* 投稿タイプ選択 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["normal", "long", "thread"] as const).map(t => (
            <button key={t} onClick={() => setNewType(t)} style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${newType === t ? C.accent : C.border}`, background: newType === t ? `${C.accent}22` : "transparent", color: newType === t ? C.accent : C.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {t === "normal" ? "短文 280字" : t === "long" ? "📄 長文 Premium" : "🧵 スレッド"}
            </button>
          ))}
        </div>

        {/* AI生成セクション（スレッド以外） */}
        {newType !== "thread" && (
          <div style={{ background: `${C.accent}08`, border: `1px solid ${C.accent}22`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>🤖 AIで投稿文を生成</div>
            {/* トピック入力 */}
            <input value={xTopic} onChange={(e) => setXTopic(e.target.value)} placeholder="トピック（例: ナイアシンアミドの効果、朝のスキンケア順番）" style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
            {/* パターン選択 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
              {TWEET_STYLES.map((s) => (
                <button key={s.id} onClick={() => setXStyle(s.id)} style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${xStyle === s.id ? C.accentAlt : C.border}`, background: xStyle === s.id ? `${C.accentAlt}22` : "transparent", color: xStyle === s.id ? C.accentAlt : C.textMuted, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  {s.label}
                </button>
              ))}
            </div>
            <button onClick={generateStandaloneTweet} disabled={!xTopic.trim() || xAiLoading} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: !xTopic.trim() || xAiLoading ? "#1A1A28" : `linear-gradient(135deg,${C.accent},${C.accentAlt})`, color: !xTopic.trim() || xAiLoading ? C.textMuted : "#000", fontWeight: 800, fontSize: 13, cursor: !xTopic.trim() || xAiLoading ? "not-allowed" : "pointer" }}>
              {xAiLoading ? "生成中..." : "🤖 AIで生成"}
            </button>
          </div>
        )}

        {/* テキスト入力 */}
        <textarea value={newText} onChange={(e) => setNewText(e.target.value)} placeholder={newType === "thread" ? "スレッド1ツイート目（フック）" : newType === "long" ? "長文投稿テキスト（300-800文字推奨）" : "投稿テキスト（280文字以内）"} rows={newType === "long" ? 8 : 3} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 12, color: C.text, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
        <div style={{ fontSize: 11, marginBottom: 8, color: newType === "long" ? (newText.length > 800 ? C.red : C.textMuted) : (newText.length > 280 ? C.red : C.textMuted) }}>
          {newText.length}/{newType === "long" ? "800" : "280"}文字
          {newType !== "long" && newText.length > 280 && " ⚠ オーバー"}
          {newType === "long" && newText.length > 800 && " ⚠ オーバー"}
        </div>

        {newType === "thread" && (
          <div style={{ marginBottom: 12 }}>
            {threadTexts.map((t, i) => (
              <textarea key={i} value={t} onChange={(e) => { const arr = [...threadTexts]; arr[i] = e.target.value; setThreadTexts(arr); }} placeholder={`${i + 2}/5 のテキスト`} rows={2} style={{ width: "100%", background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 8, color: C.text, fontSize: 12, resize: "none", outline: "none", boxSizing: "border-box", marginBottom: 4 }} />
            ))}
          </div>
        )}

        {/* 日時 + 追加ボタン */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ flex: 1, background: "#14141F", border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none" }} />
          <button onClick={addTweet} disabled={!newText.trim() || !newDate} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: !newText.trim() || !newDate ? "#1A1A28" : C.accent, color: !newText.trim() || !newDate ? C.textMuted : "#000", fontWeight: 700, fontSize: 13, cursor: !newText.trim() || !newDate ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
            予約追加
          </button>
        </div>
      </div>

      {/* フィルター */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([["all", "すべて"], ["pending", "予約中"], ["posted", "投稿済み"], ["long", `📄 長文(${longCount})`]] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${filter === f ? C.accent : C.border}`, background: filter === f ? `${C.accent}22` : "transparent", color: filter === f ? C.accent : C.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            {label}
          </button>
        ))}
        <button onClick={loadSchedule} disabled={loading} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
          {loading ? "..." : "🔄 更新"}
        </button>
      </div>

      {/* スケジュール一覧 */}
      {filteredSchedule.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: C.textMuted, fontSize: 14 }}>
          {loading ? "読み込み中..." : "まだ投稿が予約されていません"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredSchedule.map((tweet) => {
            const d = new Date(tweet.scheduledAt);
            const dateStr = d.toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" });
            const timeStr = d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
            const isPending = tweet.status === "pending";
            const isPosted = tweet.status === "posted";
            const isError = tweet.status === "error";

            return (
              <div key={tweet.id} style={{ background: C.bgCard, border: `1px solid ${isError ? C.red + "55" : isPosted ? C.green + "33" : C.border}`, borderRadius: 10, padding: isMobile ? 12 : 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: isPending ? `${C.accent}22` : isPosted ? `${C.green}22` : `${C.red}22`, color: isPending ? C.accent : isPosted ? C.green : C.red, fontWeight: 700 }}>
                      {isPending ? "予約中" : isPosted ? "投稿済み" : "エラー"}
                    </span>
                    {tweet.type === "thread" && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${C.accentAlt}22`, color: C.accentAlt, fontWeight: 700 }}>🧵 スレッド</span>}
                    {tweet.type === "long" && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#FFD70022", color: "#FFD700", fontWeight: 700 }}>📄 長文</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{dateStr} {timeStr}</div>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: C.text, whiteSpace: "pre-wrap", marginBottom: 8 }}>
                  {tweet.text}
                </div>
                {tweet.blogUrl && (
                  <div style={{ fontSize: 11, color: C.accentAlt, marginBottom: 8 }}>🔗 {tweet.blogUrl}</div>
                )}
                {tweet.type === "thread" && tweet.threadTexts && (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4 }}>
                    {tweet.threadTexts.map((t: string, i: number) => (
                      <div key={i} style={{ fontSize: 11, color: C.textDim, marginBottom: 4, paddingLeft: 12, borderLeft: `2px solid ${C.accentAlt}33` }}>
                        {t}
                      </div>
                    ))}
                  </div>
                )}
                {isError && tweet.error && (
                  <div style={{ fontSize: 11, color: C.red, marginBottom: 8 }}>⚠ {tweet.error}</div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {isPending && (
                    <>
                      <button onClick={() => postNow(tweet)} disabled={posting === tweet.id} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: posting === tweet.id ? "#1A1A28" : C.green, color: posting === tweet.id ? C.textMuted : "#000", fontSize: 12, fontWeight: 700, cursor: posting === tweet.id ? "not-allowed" : "pointer" }}>
                        {posting === tweet.id ? "投稿中..." : "今すぐ投稿"}
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(tweet.blogUrl ? `${tweet.text}\n\n${tweet.blogUrl}` : tweet.text); }} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textDim, fontSize: 12, cursor: "pointer" }}>
                        📋 コピー
                      </button>
                    </>
                  )}
                  <button onClick={() => deleteTweet(tweet.id)} style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.red}33`, background: "transparent", color: C.red, fontSize: 12, cursor: "pointer" }}>
                    削除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// Preview Modal Component (表示/編集切り替え)
// ==========================================
function PreviewModal({ item, onClose, onUpdate, isPendingPublish, onPublish, publishing, isMobile, factChecking, factCheckResult, useImprovedVersion, onToggleImproved }: {
  item: HistoryItem;
  onClose: () => void;
  onUpdate: (updated: HistoryItem) => void;
  isPendingPublish?: boolean;
  isMobile?: boolean;
  onPublish?: (opts: { xText: string; imageUrl?: string; publishStatus?: string; scheduledDate?: string }) => void;
  publishing?: boolean;
  factChecking?: boolean;
  factCheckResult?: any;
  useImprovedVersion?: boolean;
  onToggleImproved?: (v: boolean) => void;
}) {
  // JWTトークン取得ヘルパー
  function getPwd(): string {
    try {
      const t = localStorage.getItem("be_token");
      if (t) return t;
    } catch {}
    return "";
  }
  // 3ステップ: 1=記事 2=X投稿文 3=画像
  const [step, setStep] = useState(1);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editHtml, setEditHtml] = useState(item.htmlContent);
  const [editMeta, setEditMeta] = useState(item.metaDescription);

  // X投稿文 — パターン選択・短文/長文対応
  const [tweetStyle, setTweetStyle] = useState<TweetStyle>("save-list");
  const [tweetLength, setTweetLength] = useState<TweetLength>("short");
  const [aiGenerating, setAiGenerating] = useState(false);

  function generateTweetFromPattern(style: TweetStyle, length: TweetLength): string {
    // 比較記事はcompareパターンをデフォルトに
    const isComparisonArticle = (item.title || "").includes("vs") || (item.title || "").includes("比較") || (item.title || "").includes("どっち");
    const effectiveStyle = style === "auto" && isComparisonArticle ? "compare" : style;
    return buildBookmarkableTweet(item.title || "", "", {
      metaDescription: item.metaDescription || "",
      tags: (item as any).tags,
      style: effectiveStyle,
      length,
      articleSummary: item.metaDescription,
    });
  }

  const [xText, setXText] = useState(() => {
    try { return generateTweetFromPattern("save-list", "short"); } catch { return item.title || ""; }
  });
  const [xEditing, setXEditing] = useState(false);

  function handleStyleChange(style: TweetStyle) {
    setTweetStyle(style);
    if (!xEditing) {
      setXText(generateTweetFromPattern(style, tweetLength));
    }
  }

  function handleLengthChange(length: TweetLength) {
    setTweetLength(length);
    if (!xEditing) {
      setXText(generateTweetFromPattern(tweetStyle, length));
    }
  }

  async function handleAiGenerate() {
    setAiGenerating(true);
    try {
      const pwd = getPwd();
      const res = await fetch("/api/x-ai-tweet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pwd}` },
        body: JSON.stringify({
          title: item.title,
          content: item.htmlContent,
          style: tweetStyle,
          length: tweetLength,
        }),
      });
      const data = await safeJsonResponse(res);
      if (data.success && data.text) {
        setXText(data.text);
      }
    } catch {}
    setAiGenerating(false);
  }

  // 画像
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // 公開方法
  const [publishMode, setPublishMode] = useState<"publish" | "draft" | "future">("publish");
  const [scheduledDate, setScheduledDate] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState("");

  const C = { bg: "#0A0A0F", bgCard: "#0F0F1A", border: "#1E1E30", borderLight: "#2A2A3C", accent: "#FF6B9D", accentAlt: "#00D4FF", green: "#00C896", red: "#FF6B6B", text: "#E8E8F0", textDim: "#888899", textMuted: "#555570" };

  const stepLabels = ["記事確認", "X投稿文", "画像確認"];

  function handleSave() {
    onUpdate({ ...item, title: editTitle, htmlContent: editHtml, metaDescription: editMeta });
    setEditing(false);
  }

  async function generateImage() {
    setImageLoading(true);
    setImageError("");
    try {
      const pwd = getPwd();
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pwd}` },
        body: JSON.stringify({ title: item.title, keyword: item.keyword, themeLabel: item.themeLabel, productNames: (item as any).productNames }),
      });
      const data = await safeJsonResponse(res);
      if (data.success && data.imageUrl) {
        setImageUrl(data.imageUrl);
      } else {
        setImageError(data.error || "画像生成に失敗しました");
      }
    } catch (e: any) {
      setImageError(e.message);
    } finally {
      setImageLoading(false);
    }
  }

  // ステップ2→3に進むとき自動で画像生成
  function goToStep3() {
    setStep(3);
    if (!imageUrl && !imageLoading) generateImage();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 100, padding: isMobile ? 0 : 20 }}>
      <div style={{ background: C.bgCard, border: `1px solid ${C.accent}44`, borderRadius: isMobile ? "16px 16px 0 0" : 16, width: "100%", maxWidth: isMobile ? "100%" : 900, maxHeight: isMobile ? "95vh" : "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Step Indicator */}
        {isPendingPublish && !item.wpPostId && (
          <div style={{ display: "flex", padding: "12px 24px", borderBottom: `1px solid ${C.border}`, gap: 4 }}>
            {stepLabels.map((label, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", padding: "6px 0", borderRadius: 6, fontSize: 12, fontWeight: step === i + 1 ? 800 : 500, color: step === i + 1 ? "#000" : step > i + 1 ? C.green : C.textMuted, background: step === i + 1 ? C.accent : step > i + 1 ? `${C.green}22` : "transparent", cursor: step > i + 1 ? "pointer" : "default", transition: "all 0.2s" }} onClick={() => { if (i + 1 < step) setStep(i + 1); }}>
                {i + 1}. {label} {step > i + 1 ? "✓" : ""}
              </div>
            ))}
          </div>
        )}

        {/* Header */}
        <div style={{ padding: isMobile ? "12px 16px" : "14px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {step === 1 && editing ? (
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: isMobile ? 14 : 16, fontWeight: 800, outline: "none", boxSizing: "border-box" }} />
            ) : (
              <div style={{ fontWeight: 800, fontSize: isMobile ? 14 : 16, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
                {step === 1 ? item.title : step === 2 ? "X（Twitter）投稿内容" : "アイキャッチ画像"}
              </div>
            )}
            {step === 1 && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                {item.themeLabel} · {item.keyword}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: 8, flexShrink: 0 }}>
            {step === 1 && (
              <button onClick={() => { if (editing) { handleSave(); } else { setEditTitle(item.title); setEditHtml(item.htmlContent); setEditMeta(item.metaDescription); setEditing(true); } }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${editing ? C.green : C.accent}55`, background: "transparent", color: editing ? C.green : C.accent, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {editing ? "保存" : "編集"}
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "16px" : "24px 28px" }}>
          {step === 1 && (
            <>
              {editing ? (
                <>
                  <textarea value={editMeta} onChange={(e) => setEditMeta(e.target.value)} rows={2} placeholder="メタディスクリプション" style={{ width: "100%", marginBottom: 12, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 8, padding: "8px 12px", color: C.green, fontSize: 11, outline: "none", resize: "none", boxSizing: "border-box" }} />
                  <textarea value={editHtml} onChange={(e) => setEditHtml(e.target.value)} style={{ width: "100%", minHeight: isMobile ? 300 : 500, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "16px", color: C.text, fontSize: 12, fontFamily: "monospace", lineHeight: 1.6, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                </>
              ) : (
                <>
                  {item.metaDescription && <div style={{ fontSize: 11, color: C.green, marginBottom: 12, padding: "8px 12px", background: `${C.green}11`, borderRadius: 8 }}>META: {item.metaDescription}</div>}
                  <div dangerouslySetInnerHTML={{ __html: item.htmlContent }} style={{ fontSize: 14, lineHeight: 1.9, color: "#333", background: "#fff", borderRadius: 10, padding: isMobile ? "16px" : "28px 32px" }} />
                </>
              )}

              {/* ファクトチェック結果パネル */}
              {factChecking && (
                <div style={{ marginTop: 16, padding: "16px 20px", borderRadius: 10, border: `1px solid ${C.accentAlt}44`, background: `${C.accentAlt}08` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 16, height: 16, border: `2px solid ${C.accentAlt}`, borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: 13, color: C.accentAlt, fontWeight: 700 }}>AIレビュー中...</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>ファクトチェック・薬機法チェック・文章改善を実行しています（15〜30秒）</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
              )}

              {factCheckResult && !factChecking && (
                <div style={{ marginTop: 16, padding: "16px 20px", borderRadius: 10, border: `1px solid ${factCheckResult.success ? C.green : C.red}44`, background: factCheckResult.success ? `${C.green}08` : `${C.red}08` }}>
                  {factCheckResult.success ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>🔍</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>AIレビュー完了</span>
                          <span style={{
                            padding: "2px 10px", borderRadius: 12, fontSize: 12, fontWeight: 800,
                            background: factCheckResult.report.overallScore >= 80 ? `${C.green}22` : factCheckResult.report.overallScore >= 60 ? "#FF9F4322" : `${C.red}22`,
                            color: factCheckResult.report.overallScore >= 80 ? C.green : factCheckResult.report.overallScore >= 60 ? "#FF9F43" : C.red,
                          }}>
                            スコア: {factCheckResult.report.overallScore}/100
                          </span>
                        </div>
                        {/* 改善版/元記事 切り替え */}
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            onClick={() => onToggleImproved?.(true)}
                            style={{
                              padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${useImprovedVersion ? C.green : C.borderLight}`,
                              background: useImprovedVersion ? `${C.green}22` : "transparent",
                              color: useImprovedVersion ? C.green : C.textMuted,
                            }}
                          >
                            改善版を使用
                          </button>
                          <button
                            onClick={() => onToggleImproved?.(false)}
                            style={{
                              padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer",
                              border: `1px solid ${!useImprovedVersion ? C.accent : C.borderLight}`,
                              background: !useImprovedVersion ? `${C.accent}22` : "transparent",
                              color: !useImprovedVersion ? C.accent : C.textMuted,
                            }}
                          >
                            元の記事を使用
                          </button>
                        </div>
                      </div>

                      {/* サマリー */}
                      {factCheckResult.report.summary && (
                        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12, lineHeight: 1.6 }}>
                          {factCheckResult.report.summary}
                        </div>
                      )}

                      {/* コンプライアンス問題 */}
                      {factCheckResult.report.complianceIssues?.length > 0 && (
                        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: `${C.red}11`, border: `1px solid ${C.red}33` }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 4 }}>⚠ コンプライアンス指摘</div>
                          {factCheckResult.report.complianceIssues.map((issue: string, i: number) => (
                            <div key={i} style={{ fontSize: 11, color: C.textDim, padding: "2px 0" }}>• {issue}</div>
                          ))}
                        </div>
                      )}

                      {/* 変更一覧 */}
                      {factCheckResult.report.changes?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>変更一覧（{factCheckResult.report.changes.length}件）</div>
                          {factCheckResult.report.changes.map((change: any, i: number) => (
                            <div key={i} style={{ padding: "8px 10px", marginBottom: 4, borderRadius: 6, background: `${C.bg}88`, border: `1px solid ${C.border}`, fontSize: 11 }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                <span style={{
                                  padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                                  background: change.severity === "high" ? `${C.red}22` : change.severity === "medium" ? "#FF9F4322" : `${C.textMuted}22`,
                                  color: change.severity === "high" ? C.red : change.severity === "medium" ? "#FF9F43" : C.textMuted,
                                }}>
                                  {change.severity === "high" ? "重要" : change.severity === "medium" ? "中" : "軽微"}
                                </span>
                                <span style={{
                                  padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                                  background: `${C.accentAlt}22`, color: C.accentAlt,
                                }}>
                                  {change.type === "factual" ? "事実" : change.type === "compliance" ? "法令" : change.type === "readability" ? "文章" : change.type === "logic" ? "論理" : "SEO"}
                                </span>
                              </div>
                              {change.original && (
                                <div style={{ color: C.red, textDecoration: "line-through", marginBottom: 2, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {change.original}
                                </div>
                              )}
                              {change.improved && (
                                <div style={{ color: C.green, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {change.improved}
                                </div>
                              )}
                              <div style={{ color: C.textMuted, fontSize: 10 }}>{change.reason}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {factCheckResult.report.changes?.length === 0 && (
                        <div style={{ fontSize: 12, color: C.green }}>✓ 問題は見つかりませんでした。元の記事の品質は良好です。</div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: C.red }}>
                      ⚠ ファクトチェックに失敗しました（元の記事を使用します）
                      {factCheckResult.error && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{factCheckResult.error}</div>}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div style={{ maxWidth: 540, margin: "0 auto" }}>
              <div style={{ fontSize: 13, color: C.textDim, marginBottom: 16 }}>
                X（Twitter）に投稿される内容を確認・編集してください。
              </div>

              {/* パターン選択 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>📝 投稿パターン</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {TWEET_STYLES.map((s) => (
                    <button key={s.id} onClick={() => handleStyleChange(s.id)} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${tweetStyle === s.id ? C.accent : C.border}`, background: tweetStyle === s.id ? `${C.accent}22` : "transparent", color: tweetStyle === s.id ? C.accent : C.textDim, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 短文/長文トグル */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>📏 文字数</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {([["short", "短文 280字"], ["long", "長文 Premium"]] as const).map(([len, label]) => (
                    <button key={len} onClick={() => handleLengthChange(len)} style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${tweetLength === len ? C.accentAlt : C.border}`, background: tweetLength === len ? `${C.accentAlt}22` : "transparent", color: tweetLength === len ? C.accentAlt : C.textDim, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* X投稿プレビュー */}
              <div style={{ background: "#000", borderRadius: 16, padding: 20, border: "1px solid #333" }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🌸</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>みおのミハダノート</div>
                    <div style={{ fontSize: 12, color: "#71767b" }}>@miomio_beauty</div>
                  </div>
                </div>
                {xEditing ? (
                  <textarea value={xText} onChange={(e) => setXText(e.target.value)} rows={tweetLength === "long" ? 10 : 6} style={{ width: "100%", background: "#16181C", border: "1px solid #333", borderRadius: 8, padding: 12, color: "#fff", fontSize: 14, lineHeight: 1.6, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                ) : (
                  <div style={{ fontSize: 14, lineHeight: 1.6, color: "#E7E9EA", whiteSpace: "pre-wrap" }}>{xText}</div>
                )}
                <div style={{ marginTop: 12, fontSize: 12, color: "#71767b" }}>
                  {xText.length}/{tweetLength === "long" ? "800" : "280"}文字
                  {tweetLength === "short" && xText.length > 280 && <span style={{ color: C.red, marginLeft: 8 }}>⚠ 文字数オーバー</span>}
                  {tweetLength === "long" && xText.length > 800 && <span style={{ color: C.red, marginLeft: 8 }}>⚠ 文字数オーバー</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "center" }}>
                <button onClick={() => setXEditing(!xEditing)} style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${xEditing ? C.green : C.accent}55`, background: "transparent", color: xEditing ? C.green : C.accent, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {xEditing ? "確定" : "編集する"}
                </button>
                <button onClick={handleAiGenerate} disabled={aiGenerating} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: aiGenerating ? "#1A1A28" : `linear-gradient(135deg,${C.accent},${C.accentAlt})`, color: aiGenerating ? C.textMuted : "#000", fontSize: 13, fontWeight: 700, cursor: aiGenerating ? "not-allowed" : "pointer" }}>
                  {aiGenerating ? "生成中..." : "🤖 AIで最適化"}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 13, color: C.textDim, marginBottom: 16 }}>
                アイキャッチ画像を確認してください。
              </div>
              {imageLoading && (
                <div style={{ padding: 40, color: C.accent }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🎨</div>
                  <div style={{ fontSize: 14 }}>画像を生成中...</div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>約15〜30秒かかります</div>
                </div>
              )}
              {imageError && (
                <div style={{ padding: 20, color: C.red, fontSize: 13 }}>
                  ⚠ {imageError}
                  <br />
                  <button onClick={generateImage} style={{ marginTop: 12, padding: "8px 20px", borderRadius: 8, border: `1px solid ${C.accent}55`, background: "transparent", color: C.accent, fontSize: 13, cursor: "pointer" }}>
                    再生成する
                  </button>
                </div>
              )}
              {imageUrl && !imageLoading && (
                <>
                  <img src={imageUrl} alt="アイキャッチ" style={{ maxWidth: "100%", maxHeight: 400, borderRadius: 12, border: `1px solid ${C.border}` }} />
                  <div style={{ marginTop: 16 }}>
                    <button onClick={generateImage} style={{ padding: "8px 20px", borderRadius: 8, border: `1px solid ${C.accent}55`, background: "transparent", color: C.accent, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      🔄 別の画像を生成
                    </button>
                  </div>
                </>
              )}
              {!imageUrl && !imageLoading && !imageError && (
                <div style={{ padding: 20 }}>
                  <button onClick={generateImage} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: C.accent, color: "#000", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    画像を生成する
                  </button>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                    画像なしで公開することもできます
                  </div>
                </div>
              )}

              {/* 公開方法選択 */}
              <div style={{ marginTop: 24, padding: 16, background: `${C.bg}88`, borderRadius: 10, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>公開方法</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {([
                    { value: "publish" as const, label: "🚀 すぐに公開", desc: "WordPress + X に即時投稿" },
                    { value: "draft" as const, label: "📝 下書き保存", desc: "WordPressに下書きとして保存" },
                    { value: "future" as const, label: "⏰ 予約投稿", desc: "指定日時に自動公開" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setPublishMode(opt.value)}
                      style={{
                        flex: 1, minWidth: isMobile ? "100%" : 140, padding: "10px 12px", borderRadius: 8, textAlign: "left", cursor: "pointer",
                        border: `1.5px solid ${publishMode === opt.value ? (opt.value === "publish" ? C.green : opt.value === "future" ? "#FF9F43" : C.accentAlt) : C.borderLight}`,
                        background: publishMode === opt.value ? `${opt.value === "publish" ? C.green : opt.value === "future" ? "#FF9F43" : C.accentAlt}15` : "transparent",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: publishMode === opt.value ? C.text : C.textDim }}>{opt.label}</div>
                      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
                {publishMode === "future" && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 4 }}>公開日時</label>
                    <input
                      type="datetime-local"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#14141F", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                    />
                    {scheduledDate && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#FF9F43" }}>
                        ⏰ {new Date(scheduledDate).toLocaleString("ja-JP")} に自動公開されます
                      </div>
                    )}
                  </div>
                )}
                {publishMode === "future" && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted }}>
                    ※予約投稿の場合、X投稿は行われません（公開後に手動でX投稿してください）
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "10px 16px" : "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, color: C.textMuted }}>
            {item.wpPostId ? (
              <span style={{ color: C.green }}>WP Post ID: {item.wpPostId} ({item.wpStatus})</span>
            ) : (
              isPendingPublish ? `ステップ ${step}/3` : "WordPress未投稿"
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {item.savedXText && (
              <button
                onClick={() => { navigator.clipboard.writeText(item.savedXText!); alert("X投稿文をコピーしました"); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #1DA1F2", background: "transparent", color: "#1DA1F2", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                𝕏 投稿文をコピー
              </button>
            )}
            {item.wpLink && (
              <a href={item.wpLink} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 16px", borderRadius: 8, background: C.green, color: "#000", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>
                WPで確認
              </a>
            )}
            {isPendingPublish && !item.wpPostId && (
              <>
                {step > 1 && (
                  <button onClick={() => setStep(step - 1)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.borderLight}`, background: "transparent", color: C.textDim, fontSize: 13, cursor: "pointer" }}>
                    ← 戻る
                  </button>
                )}
                {step === 1 && (
                  <button onClick={() => { if (editing) handleSave(); setStep(2); }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: C.accent, color: "#000", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    X投稿文を確認 →
                  </button>
                )}
                {step === 2 && (
                  <button onClick={() => { if (xEditing) setXEditing(false); goToStep3(); }} disabled={xText.length > 280} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: xText.length > 280 ? "#333" : C.accent, color: xText.length > 280 ? C.textMuted : "#000", fontWeight: 800, fontSize: 13, cursor: xText.length > 280 ? "not-allowed" : "pointer" }}>
                    画像を生成 →
                  </button>
                )}
                {step === 3 && (
                  <button
                    onClick={() => onPublish?.({ xText, imageUrl: imageUrl || undefined, publishStatus: publishMode, scheduledDate: publishMode === "future" ? scheduledDate : undefined })}
                    disabled={publishing || imageLoading || (publishMode === "future" && !scheduledDate)}
                    style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: publishing || imageLoading ? "#1A1A28" : publishMode === "draft" ? C.accentAlt : publishMode === "future" ? "#FF9F43" : `linear-gradient(135deg,${C.accent},${C.green})`, color: publishing || imageLoading ? C.textMuted : "#000", fontWeight: 800, fontSize: 13, cursor: publishing || imageLoading ? "not-allowed" : "pointer" }}
                  >
                    {publishing ? "処理中..." : publishMode === "draft" ? "📝 下書き保存" : publishMode === "future" ? "⏰ 予約投稿する" : "🚀 WordPress + X に公開"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

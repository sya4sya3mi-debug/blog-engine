"use client";
import { useState, useEffect } from "react";

// ==========================================
// Types
// ==========================================
interface SubTheme {
  id: string;
  label: string;
  keywords: string[];
}

interface HistoryItem {
  id: number;
  title: string;
  keyword: string;
  themeLabel: string;
  mode: "auto" | "theme" | "product";
  htmlContent: string;
  metaDescription: string;
  wpPostId?: number;
  wpStatus?: string;
  wpLink?: string;
  createdAt: string;
}

// ==========================================
// Themes data (mirror of server config)
// ==========================================
const THEMES: SubTheme[] = [
  { id: "lotion", label: "化粧水", keywords: ["化粧水 おすすめ", "化粧水 ランキング", "化粧水 プチプラ"] },
  { id: "serum", label: "美容液", keywords: ["美容液 おすすめ", "美容液 人気", "美容液 エイジングケア"] },
  { id: "cream", label: "保湿クリーム", keywords: ["保湿クリーム おすすめ", "保湿クリーム 敏感肌", "フェイスクリーム ランキング"] },
  { id: "cleansing", label: "クレンジング", keywords: ["クレンジング おすすめ", "クレンジングオイル 人気", "クレンジングバーム ランキング"] },
  { id: "sunscreen", label: "日焼け止め", keywords: ["日焼け止め おすすめ", "日焼け止め 顔用", "UVケア ランキング"] },
  { id: "foundation", label: "ファンデーション", keywords: ["ファンデーション おすすめ", "ファンデ 崩れない", "ファンデーション 乾燥肌"] },
  { id: "lipstick", label: "リップ・口紅", keywords: ["リップ おすすめ", "口紅 人気色", "リップティント ランキング"] },
  { id: "eyeshadow", label: "アイシャドウ", keywords: ["アイシャドウ おすすめ", "アイシャドウパレット 人気", "アイメイク トレンド"] },
  { id: "mascara", label: "マスカラ", keywords: ["マスカラ おすすめ", "マスカラ にじまない", "マスカラ ロング"] },
  { id: "shampoo", label: "シャンプー", keywords: ["シャンプー おすすめ", "シャンプー 市販", "アミノ酸シャンプー ランキング"] },
  { id: "treatment", label: "トリートメント", keywords: ["トリートメント おすすめ", "ヘアトリートメント 市販", "洗い流さないトリートメント"] },
  { id: "hairdryer", label: "ドライヤー", keywords: ["ドライヤー おすすめ", "ドライヤー 速乾", "高級ドライヤー ランキング"] },
  { id: "bodycare", label: "ボディケア", keywords: ["ボディクリーム おすすめ", "ボディローション 保湿", "ボディケア いい匂い"] },
  { id: "nailcare", label: "ネイルケア", keywords: ["ネイルケア おすすめ", "ジェルネイル セルフ", "ネイルオイル 人気"] },
  { id: "perfume", label: "香水・フレグランス", keywords: ["香水 レディース 人気", "プチプラ 香水 おすすめ", "フレグランス モテ"] },
  { id: "skincare-set", label: "スキンケアセット", keywords: ["スキンケア セット おすすめ", "基礎化粧品 ライン使い", "スキンケア 初心者 セット"] },
  { id: "acne", label: "ニキビケア", keywords: ["ニキビケア おすすめ", "大人ニキビ スキンケア", "ニキビ 洗顔 ランキング"] },
  { id: "aging", label: "エイジングケア", keywords: ["エイジングケア おすすめ", "シワ改善 美容液", "たるみ対策 スキンケア"] },
  { id: "pores", label: "毛穴ケア", keywords: ["毛穴ケア おすすめ", "毛穴 黒ずみ 除去", "毛穴 引き締め 化粧水"] },
  { id: "supplement", label: "美容サプリ", keywords: ["美容サプリ おすすめ", "コラーゲン サプリ 人気", "ビタミンC サプリ 美白"] },
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
  const [loggedIn, setLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Generate state
  const [genMode, setGenMode] = useState<"theme" | "product">("theme");
  const [selectedTheme, setSelectedTheme] = useState(THEMES[0]);
  const [selectedKeyword, setSelectedKeyword] = useState(THEMES[0].keywords[0]);
  const [products, setProducts] = useState<string[]>([""]);
  const [customKeyword, setCustomKeyword] = useState("");
  const [targetAge, setTargetAge] = useState<"10s" | "20s" | "30s">("30s");
  const [postToWP, setPostToWP] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);

  // Preview state
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null);

  // WP test state
  const [wpStatus, setWpStatus] = useState<{ ok?: boolean; name?: string; error?: string } | null>(null);
  const [wpTesting, setWpTesting] = useState(false);

  // ---- Login ----
  async function handleLogin() {
    setLoginError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setLoggedIn(true);
    } else {
      setLoginError("パスワードが違います");
    }
  }

  // ---- Generate ----
  async function handleGenerate() {
    setGenerating(true);
    setGenResult(null);
    try {
      const body: any = { postToWP, targetAge };
      if (genMode === "theme") {
        body.mode = "theme";
        body.themeId = selectedTheme.id;
        body.keyword = selectedKeyword;
      } else {
        body.mode = "product";
        body.products = products.filter((p) => p.trim());
        body.customKeyword = customKeyword || undefined;
      }

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.status === "success") {
        const item: HistoryItem = {
          id: Date.now(),
          title: data.article.title,
          keyword: data.article.keyword,
          themeLabel: data.article.themeLabel,
          mode: genMode,
          htmlContent: data.article.htmlContent,
          metaDescription: data.article.metaDescription,
          wpPostId: data.wordpress?.postId,
          wpStatus: data.wordpress?.status,
          wpLink: data.wordpress?.link,
          createdAt: new Date().toLocaleString("ja-JP"),
        };
        setHistory((prev) => [item, ...prev]);
        setGenResult({ ok: true, title: item.title, wpStatus: item.wpStatus });
      } else {
        setGenResult({ ok: false, error: data.message });
      }
    } catch (e: any) {
      setGenResult({ ok: false, error: e.message });
    }
    setGenerating(false);
  }

  // ---- WP Test ----
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
  function updateProduct(index: number, value: string) {
    setProducts((prev) => prev.map((p, i) => (i === index ? value : p)));
  }
  function addProduct() {
    if (products.length < 10) setProducts((prev) => [...prev, ""]);
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
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 20, padding: "48px 40px", width: 380, textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, background: `linear-gradient(135deg,${C.accent},${C.green})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>BlogEngine</div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 32 }}>v2 — Auto Affiliate Blog System</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="パスワード"
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
    { id: "themes", label: "テーマ一覧", icon: "◎" },
    { id: "settings", label: "設定", icon: "⚙" },
  ];

  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: C.bg, minHeight: "100vh", color: C.text, display: "flex" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: C.bgCard, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, background: `linear-gradient(135deg,${C.accent},${C.green})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>BlogEngine v2</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Auto Affiliate System</div>
        </div>
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 400, background: activeTab === tab.id ? `${C.accent}14` : "transparent", color: activeTab === tab.id ? C.accent : C.textDim, transition: "all 0.15s", marginBottom: 2 }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${C.border}` }}>
          <button onClick={() => setLoggedIn(false)} style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${C.borderLight}`, background: "transparent", color: C.textDim, fontSize: 12, cursor: "pointer" }}>ログアウト</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto" }}>
        <header style={{ padding: "20px 32px", borderBottom: `1px solid ${C.border}`, background: C.bg, position: "sticky", top: 0, zIndex: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
            {tabs.find((t) => t.id === activeTab)?.label}
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: C.textMuted }}>
            {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
          </p>
        </header>

        <div style={{ padding: "28px 32px" }}>
          {/* ====== DASHBOARD TAB ====== */}
          {activeTab === "dashboard" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 28 }}>
                {[
                  { label: "生成記事数", value: history.length, color: C.accent },
                  { label: "WP投稿済み", value: history.filter((h) => h.wpPostId).length, color: C.green },
                  { label: "テーマ数", value: THEMES.length, color: C.accentAlt },
                ].map((kpi, i) => (
                  <div key={i} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 22px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: kpi.color }} />
                    <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{kpi.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Cron info */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, marginBottom: 20 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>Cron自動投稿</h3>
                <div style={{ fontSize: 13, color: C.textDim, lineHeight: 2 }}>
                  <div>Vercel Cronが毎時実行され、日付シードで決まった時刻に記事を自動生成＆投稿します。</div>
                  <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                    <span style={{ padding: "4px 12px", borderRadius: 6, background: `${C.green}18`, color: C.green, fontSize: 12, fontWeight: 600 }}>朝 9-12時</span>
                    <span style={{ padding: "4px 12px", borderRadius: 6, background: `${C.orange}18`, color: C.orange, fontSize: 12, fontWeight: 600 }}>昼 15-18時</span>
                    <span style={{ padding: "4px 12px", borderRadius: 6, background: `${C.accent}18`, color: C.accent, fontSize: 12, fontWeight: 600 }}>夜 19-22時</span>
                  </div>
                </div>
              </div>

              {/* Recent history */}
              {history.length > 0 && (
                <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>最近の生成</h3>
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
            <div style={{ maxWidth: 760 }}>
              {/* Mode switch */}
              <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                {([
                  { id: "theme" as const, label: "テーマ指定", desc: "サブテーマ＆キーワードから生成" },
                  { id: "product" as const, label: "商品指定", desc: "紹介したい商品を直接入力" },
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

              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28 }}>
                {genMode === "theme" ? (
                  <>
                    {/* Theme selector */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>テーマ</label>
                      <select
                        value={selectedTheme.id}
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

                    {/* Keyword selector */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>キーワード</label>
                      <select
                        value={selectedKeyword}
                        onChange={(e) => setSelectedKeyword(e.target.value)}
                        style={{ width: "100%", background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "12px 16px", color: C.text, fontSize: 14, outline: "none" }}
                      >
                        {selectedTheme.keywords.map((kw) => (
                          <option key={kw} value={kw}>{kw}</option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Product inputs */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>紹介する商品（複数可）</label>
                      {products.map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                          <input
                            value={p}
                            onChange={(e) => updateProduct(i, e.target.value)}
                            placeholder={`商品${i + 1}の名前（例：キュレル 潤浸保湿クリーム）`}
                            style={{ flex: 1, background: "#14141F", border: `1.5px solid ${C.borderLight}`, borderRadius: 10, padding: "12px 16px", color: C.text, fontSize: 14, outline: "none" }}
                          />
                          {products.length > 1 && (
                            <button onClick={() => removeProduct(i)} style={{ padding: "0 12px", borderRadius: 8, border: `1px solid ${C.red}44`, background: "transparent", color: C.red, fontSize: 18, cursor: "pointer" }}>-</button>
                          )}
                        </div>
                      ))}
                      <button onClick={addProduct} style={{ padding: "8px 16px", borderRadius: 8, border: `1px dashed ${C.borderLight}`, background: "transparent", color: C.textDim, fontSize: 13, cursor: "pointer" }}>+ 商品を追加</button>
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

                {/* Target age selector */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: C.textDim, display: "block", marginBottom: 8, fontWeight: 600 }}>ターゲット年代</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([
                      { id: "10s" as const, label: "10代向け", desc: "学生時代の体験談ベース" },
                      { id: "20s" as const, label: "20代向け", desc: "20代の頃の体験談ベース" },
                      { id: "30s" as const, label: "30代向け", desc: "今使っている風に" },
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
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>生成後に自動で下書き投稿します</div>
                  </div>
                  <button
                    onClick={() => setPostToWP(!postToWP)}
                    style={{ width: 48, height: 26, borderRadius: 13, border: "none", background: postToWP ? C.green : C.borderLight, cursor: "pointer", position: "relative", transition: "background 0.2s" }}
                  >
                    <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 3, left: postToWP ? 25 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || (genMode === "product" && products.every((p) => !p.trim()))}
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
                        <div style={{ color: C.green, fontWeight: 700, marginBottom: 4 }}>生成完了</div>
                        <div style={{ color: C.textDim }}>{genResult.title}</div>
                        {genResult.wpStatus && <div style={{ color: C.green, marginTop: 4 }}>WordPress: {genResult.wpStatus}</div>}
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

          {/* ====== THEMES TAB ====== */}
          {activeTab === "themes" && (
            <div>
              <p style={{ fontSize: 13, color: C.textDim, marginTop: 0, marginBottom: 20 }}>
                Cronは日付ベースで毎日異なるテーマを自動選択します。全{THEMES.length}テーマ × 各3キーワード = {THEMES.length * 3}パターン
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
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

          {/* ====== SETTINGS TAB ====== */}
          {activeTab === "settings" && (
            <div style={{ maxWidth: 640 }}>
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

      {/* ====== PREVIEW MODAL ====== */}
      {previewItem && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: C.bgCard, border: `1px solid ${C.accent}44`, borderRadius: 16, width: "100%", maxWidth: 860, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{previewItem.title}</div>
                <div style={{ fontSize: 11, color: C.textMuted }}>
                  {previewItem.themeLabel} · {previewItem.keyword} · {previewItem.createdAt}
                </div>
                {previewItem.metaDescription && (
                  <div style={{ fontSize: 11, color: C.green, marginTop: 6 }}>META: {previewItem.metaDescription}</div>
                )}
              </div>
              <button onClick={() => setPreviewItem(null)} style={{ background: "none", border: "none", color: C.textMuted, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 0 }}>x</button>
            </div>
            {/* HTML Preview */}
            <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
              <div
                dangerouslySetInnerHTML={{ __html: previewItem.htmlContent }}
                style={{ fontSize: 14, lineHeight: 1.9, color: "#333", background: "#fff", borderRadius: 10, padding: "28px 32px" }}
              />
            </div>
            {/* Footer */}
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                {previewItem.wpPostId ? (
                  <span style={{ color: C.green }}>WP Post ID: {previewItem.wpPostId} ({previewItem.wpStatus})</span>
                ) : (
                  "WordPress未投稿"
                )}
              </div>
              {previewItem.wpLink && (
                <a href={previewItem.wpLink} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 18px", borderRadius: 8, background: C.green, color: "#000", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                  WordPressで確認
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("パスワードが違います");
      }
    } catch {
      setError("エラーが発生しました");
    }
    setLoading(false);
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP','Hiragino Sans',sans-serif", background: "#0A0A0F", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 400, padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 28, fontWeight: 800, background: "linear-gradient(135deg,#00D4FF,#00C896)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8 }}>● BlogEngine</div>
          <div style={{ fontSize: 13, color: "#555570" }}>Affiliate Automation</div>
        </div>
        <div style={{ background: "#0F0F1A", border: "1px solid #1E1E30", borderRadius: 16, padding: "32px 28px" }}>
          <h1 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 800, color: "#E8E8F0", textAlign: "center" }}>ログイン</h1>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, color: "#888899", fontWeight: 600, marginBottom: 8 }}>パスワード</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                autoFocus
                style={{ width: "100%", background: "#14141F", border: "1.5px solid #2A2A3C", borderRadius: 10, padding: "12px 14px", color: "#E8E8F0", fontSize: 14, outline: "none", boxSizing: "border-box" as const }}
                onFocus={e => e.target.style.borderColor = "#00D4FF"}
                onBlur={e => e.target.style.borderColor = "#2A2A3C"}
              />
            </div>
            {error && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "#FF6B6B22", border: "1px solid #FF6B6B44", borderRadius: 8, fontSize: 12, color: "#FF6B6B" }}>
                ✗ {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !password.trim()}
              style={{ width: "100%", background: loading || !password.trim() ? "#1A1A28" : "linear-gradient(135deg,#00D4FF,#00C896)", border: "none", borderRadius: 10, padding: "13px", color: loading || !password.trim() ? "#444455" : "#000", fontWeight: 800, fontSize: 14, cursor: loading || !password.trim() ? "not-allowed" : "pointer" }}
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

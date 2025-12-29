import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import styles from "../../styles/Auth.module.css";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth(); // Hàm login từ AuthContext
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await api.login(username, password);
    setLoading(false);

    if (result.ok && result.data?.status === "success") {
      // --- ĐOẠN CẦN SỬA Ở ĐÂY ---
      // Lấy dữ liệu trả về từ backend
      const userData = result.data.data;

      // Gọi hàm login của Context và truyền ĐẦY ĐỦ thông tin (bao gồm id)
      login({
        id: userData.id, // QUAN TRỌNG: Phải có dòng này
        username: userData.username, // Lấy từ response backend cho chuẩn
        role: userData.role,
        password: password, // (Tùy chọn: thường không nên lưu password ở client nếu không cần thiết, nhưng code cũ của bạn có dùng)
      });
      // --------------------------
    } else {
      setError(result.data?.message || "Login failed");
    }
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard}>
        <h1 className={styles.authTitle}>Đăng nhập</h1>
        <p className={styles.authSubtitle}>Chào mừng trở lại với thư viện</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.authForm}>
          <div className={styles.formGroup}>
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className={styles.authButton}
            disabled={loading}
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>

        <div className={styles.authFooter}>
          Chưa có tài khoản? <Link href="/auth/register">Đăng ký ngay</Link>
        </div>
      </div>
    </div>
  );
}

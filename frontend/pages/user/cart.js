import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../../context/AuthContext";
import Layout from "../../components/Layout";
import { api } from "../../lib/api";
import styles from "../../styles/Cart.module.css";

export default function Cart() {
  const { user } = useAuth();
  const router = useRouter();
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    if (!user || user.role !== "user") {
      router.push("/auth/login");
      return;
    }
    loadCart();
  }, [user]);

  const loadCart = async () => {
    setLoading(true);
    
    // Lấy book IDs từ localStorage
    const cartKey = `cart_${user.id}`;
    let bookIds = [];
    try {
      const stored = localStorage.getItem(cartKey);
      if (stored) bookIds = JSON.parse(stored);
    } catch (e) {
      console.error("Error loading cart:", e);
    }

    // Load thông tin chi tiết từng sách
    const items = [];
    for (const bookId of bookIds) {
      try {
        const result = await api.getBook(bookId);
        if (result.ok && result.data?.status === "success") {
          items.push(result.data.data);
        }
      } catch (e) {
        console.error(`Error loading book ${bookId}:`, e);
      }
    }
    
    setCartItems(items);
    setLoading(false);
  };

  const handleRemove = (bookId) => {
    if (!confirm("Xóa sách này khỏi giỏ mượn?")) return;

    const cartKey = `cart_${user.id}`;
    try {
      let cart = [];
      const stored = localStorage.getItem(cartKey);
      if (stored) cart = JSON.parse(stored);
      
      cart = cart.filter(id => id !== bookId);
      localStorage.setItem(cartKey, JSON.stringify(cart));
      
      setMessage({ type: "success", text: "Đã xóa khỏi giỏ" });
      setTimeout(() => {
        setMessage({ type: "", text: "" });
        loadCart();
      }, 1500);
    } catch (e) {
      setMessage({ type: "error", text: "Không thể xóa" });
    }
  };

  const handleSubmit = async () => {
    if (cartItems.length === 0) {
      alert("Giỏ mượn trống!");
      return;
    }

    setSubmitting(true);
    setMessage({ type: "", text: "" });

    const bookIds = cartItems.map(book => book.id);
    const result = await api.submitCartBatch(
      { username: user.username, password: user.password },
      bookIds
    );
    setSubmitting(false);

    if (result.ok && result.data?.status === "success") {
      // Xóa giỏ sau khi submit thành công
      const cartKey = `cart_${user.id}`;
      localStorage.removeItem(cartKey);
      
      setMessage({
        type: "success",
        text: `Đã gửi yêu cầu mượn ${cartItems.length} sách!`,
      });
      setTimeout(() => {
        router.push("/user/borrowed");
      }, 1500);
    } else {
      setMessage({
        type: "error",
        text: result.data?.message || "Có lỗi xảy ra",
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className={styles.loading}>Đang tải...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={styles.cartPage}>
        <div className={styles.header}>
          <h1>Giỏ mượn sách ({cartItems.length})</h1>
          <p>Kiểm tra và gửi yêu cầu mượn sách của bạn</p>
        </div>

        {message.text && (
          <div className={`${styles.message} ${styles[message.type]}`}>
            {message.text}
          </div>
        )}

        {cartItems.length === 0 ? (
          <div className={styles.emptyCart}>
            <div className={styles.emptyIcon}>🛒</div>
            <h2>Giỏ mượn trống</h2>
            <p>Hãy thêm sách vào giỏ từ trang Dashboard</p>
            <button onClick={() => router.push("/user/dashboard")}>
              Về Dashboard
            </button>
          </div>
        ) : (
          <>
            <div className={styles.cartList}>
              {cartItems.map((item) => (
                <div key={item.id} className={styles.cartItem}>
                  <img
                    src={
                      item.url_image ||
                      "https://picsum.photos/seed/default/400/600"
                    }
                    alt={item.title}
                    className={styles.bookCover}
                  />
                  <div className={styles.bookInfo}>
                    <h3>{item.title}</h3>
                    <p className={styles.author}>Tác giả: {item.author}</p>
                    <p className={styles.availability}>
                      {item.available > 0 ? (
                        <span className={styles.available}>
                          ✓ Còn {item.available} cuốn
                        </span>
                      ) : (
                        <span className={styles.unavailable}>
                          ⚠ Hết sách
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemove(item.id)}
                  >
                    ✕ Xóa
                  </button>
                </div>
              ))}
            </div>

            <div className={styles.cartActions}>
              <button
                className={styles.btnBack}
                onClick={() => router.push("/user/dashboard")}
              >
                ← Thêm sách
              </button>
              <button
                className={styles.btnSubmit}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Đang gửi..." : `Gửi yêu cầu (${cartItems.length} sách)`}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

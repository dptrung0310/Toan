import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useAuth } from "../../context/AuthContext";
import Layout from "../../components/Layout";
import { api } from "../../lib/api";
import styles from "../../styles/Dashboard.module.css";

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) {
      router.push("/auth/login");
      return;
    }
    loadBooks();
  }, [user]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = books.filter(
        (book) =>
          book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          book.author.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredBooks(filtered.slice(0, 5));
    } else {
      setFilteredBooks(books);
    }
  }, [searchQuery, books]);

  const loadBooks = async () => {
    setLoading(true);
    const result = await api.searchBooks();
    setLoading(false);

    if (result.ok && result.data?.status === "success") {
      setBooks(result.data.data || []);
      setFilteredBooks(result.data.data || []);
    } else {
      setError("Không thể tải danh sách sách");
    }
  };

  const handleBorrow = () => {
    if (!selectedBook) return;
    if (!user || !user.id) {
      alert("Vui lòng đăng nhập lại để thực hiện chức năng này.");
      router.push("/auth/login");
      return;
    }

    // Lấy giỏ hiện tại từ localStorage
    const cartKey = `cart_${user.id}`;
    let cart = [];
    try {
      const stored = localStorage.getItem(cartKey);
      if (stored) cart = JSON.parse(stored);
    } catch (e) {
      console.error("Error loading cart:", e);
    }

    // Kiểm tra trùng
    if (cart.includes(selectedBook.id)) {
      alert("Sách này đã có trong giỏ mượn của bạn");
      return;
    }

    // Thêm vào giỏ
    cart.push(selectedBook.id);
    localStorage.setItem(cartKey, JSON.stringify(cart));
    alert("✅ Đã thêm vào giỏ mượn sách!");
  };

  return (
    <Layout>
      <div className={styles.dashboard}>
        <div className={styles.leftPanel}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              type="text"
              placeholder="Tìm kiếm sách theo tên hoặc tác giả..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className={styles.bookList}>
            {loading && <div className={styles.loading}>Đang tải...</div>}
            {!loading && filteredBooks.length === 0 && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📚</div>
                <div>Không tìm thấy sách nào</div>
              </div>
            )}
            {filteredBooks.map((book) => (
              <div
                key={book.id}
                className={`${styles.bookCard} ${
                  selectedBook?.id === book.id ? styles.active : ""
                }`}
                onClick={() => setSelectedBook(book)}
              >
                <img
                  src={
                    book.url_image ||
                    "https://picsum.photos/seed/default/400/600"
                  }
                  alt={book.title}
                  className={styles.bookCover}
                />
                <div className={styles.bookInfo}>
                  <div className={styles.bookTitle}>{book.title}</div>
                  <div className={styles.bookAuthor}>{book.author}</div>
                  <div className={styles.bookMeta}>
                    <span
                      className={`${styles.bookBadge} ${
                        book.available > 0 ? styles.available : ""
                      }`}
                    >
                      {book.available > 0
                        ? `Còn ${book.available}`
                        : "Hết sách"}
                    </span>
                    <span className={styles.bookBadge}>ID: {book.id}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.rightPanel}>
          {!selectedBook && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>👈</div>
              <div>Chọn một cuốn sách từ danh sách bên trái</div>
            </div>
          )}

          {selectedBook && (
            <>
              {error && <div className={styles.error}>{error}</div>}
              
              <div className={styles.detailContent}>
                <img
                  src={
                    selectedBook.url_image ||
                    "https://picsum.photos/seed/default/400/600"
                  }
                  alt={selectedBook.title}
                  className={styles.detailCover}
                />
                
                <div className={styles.detailInfo}>
                  <h1 className={styles.detailTitle}>{selectedBook.title}</h1>
                  <div className={styles.detailAuthor}>
                    Tác giả: {selectedBook.author}
                  </div>

                  <div className={styles.detailSection}>
                    <h3>Mô tả</h3>
                    <p className={styles.detailDescription}>
                      {selectedBook.description || "Chưa có mô tả"}
                    </p>
                  </div>

                  <div className={styles.detailSection}>
                    <h3>Thông tin</h3>
                    <div className={styles.detailStats}>
                      <div className={styles.statItem}>
                        <span className={styles.statLabel}>Tổng số</span>
                        <span className={styles.statValue}>
                          {selectedBook.quantity}
                        </span>
                      </div>
                      <div className={styles.statItem}>
                        <span className={styles.statLabel}>Còn lại</span>
                        <span className={styles.statValue}>
                          {selectedBook.available}
                        </span>
                      </div>
                      <div className={styles.statItem}>
                        <span className={styles.statLabel}>Book ID</span>
                        <span className={styles.statValue}>{selectedBook.id}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.detailActions}>
                <button
                  onClick={handleBorrow}
                  disabled={selectedBook.available === 0}
                >
                  ➕ Thêm vào giỏ
                </button>
                <Link href={`/books/${selectedBook.id}`}>
                  <button className={styles.btnSecondary}>Xem chi tiết</button>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import styles from '../../styles/Dashboard.module.css';

export default function BorrowedBooks() {
  const { user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState([]);
  const [books, setBooks] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    loadBorrowedBooks();
  }, [user]);

  const loadBorrowedBooks = async () => {
    setLoading(true);
    const result = await api.listBorrowRequests();
    
    if (result.ok && result.data?.status === 'success') {
      const allRequests = result.data.data || [];
      const userRequests = allRequests.filter((req) => req.user_id === getUserId());
      setRequests(userRequests);

      // Load book details
      const bookIds = [...new Set(userRequests.map((req) => req.book_id))];
      const bookData = {};
      for (const id of bookIds) {
        const bookResult = await api.getBook(id);
        if (bookResult.ok && bookResult.data?.status === 'success') {
          bookData[id] = bookResult.data.data;
        }
      }
      setBooks(bookData);
    }
    setLoading(false);
  };

  const getUserId = () => {
    // In a real app, this would come from auth context or API
    // For now, we'll use a workaround by checking username
    const req = requests.find((r) => r.user_id);
    return req?.user_id || 1;
  };

  const handleReturn = async () => {
    if (!selectedRequest) return;
    setReturning(true);
    setError('');

    const result = await api.requestReturn(
      { username: user.username, password: user.password },
      selectedRequest.id
    );
    setReturning(false);

    if (result.ok && result.data?.status === 'success') {
      alert('Đã gửi yêu cầu trả sách!');
      loadBorrowedBooks();
    } else {
      setError(result.data?.message || 'Không thể gửi yêu cầu trả sách');
    }
  };

  const getStatusText = (status) => {
    const statusMap = {
      pending: 'Đang chờ duyệt',
      approved: 'Đã duyệt',
      return_requested: 'Đang chờ xác nhận trả',
      returned: 'Đã trả',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status) => {
    const colorMap = {
      pending: '#f59e0b',
      approved: '#10b981',
      return_requested: '#3b82f6',
      returned: '#6b7280',
    };
    return colorMap[status] || '#6b7280';
  };

  const selectedBook = selectedRequest ? books[selectedRequest.book_id] : null;

  return (
    <Layout>
      <div className={styles.dashboard}>
        <div className={styles.leftPanel}>
          <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>Sách đã mượn</h2>

          <div className={styles.bookList}>
            {loading && <div className={styles.loading}>Đang tải...</div>}
            {!loading && requests.length === 0 && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📚</div>
                <div>Bạn chưa mượn sách nào</div>
              </div>
            )}
            {requests.map((request) => {
              const book = books[request.book_id];
              if (!book) return null;

              return (
                <div
                  key={request.id}
                  className={`${styles.bookCard} ${
                    selectedRequest?.id === request.id ? styles.active : ''
                  }`}
                  onClick={() => setSelectedRequest(request)}
                >
                  <img
                    src={book.url_image || 'https://picsum.photos/seed/default/400/600'}
                    alt={book.title}
                    className={styles.bookCover}
                  />
                  <div className={styles.bookInfo}>
                    <div className={styles.bookTitle}>{book.title}</div>
                    <div className={styles.bookAuthor}>{book.author}</div>
                    <div className={styles.bookMeta}>
                      <span
                        className={styles.bookBadge}
                        style={{ background: getStatusColor(request.status) }}
                      >
                        {getStatusText(request.status)}
                      </span>
                      <span className={styles.bookBadge}>Req ID: {request.id}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.rightPanel}>
          {!selectedRequest && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>👈</div>
              <div>Chọn một yêu cầu mượn từ danh sách bên trái</div>
            </div>
          )}

          {selectedRequest && selectedBook && (
            <>
              {error && <div className={styles.error}>{error}</div>}
              <img
                src={selectedBook.url_image || 'https://picsum.photos/seed/default/400/600'}
                alt={selectedBook.title}
                className={styles.detailCover}
              />
              <h1 className={styles.detailTitle}>{selectedBook.title}</h1>
              <div className={styles.detailAuthor}>Tác giả: {selectedBook.author}</div>

              <div className={styles.detailSection}>
                <h3>Trạng thái</h3>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: getStatusColor(selectedRequest.status),
                    color: 'white',
                    fontWeight: 500,
                  }}
                >
                  {getStatusText(selectedRequest.status)}
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3>Mô tả</h3>
                <p className={styles.detailDescription}>
                  {selectedBook.description || 'Chưa có mô tả'}
                </p>
              </div>

              <div className={styles.detailSection}>
                <h3>Thông tin yêu cầu</h3>
                <div className={styles.detailStats}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Request ID</span>
                    <span className={styles.statValue}>{selectedRequest.id}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Book ID</span>
                    <span className={styles.statValue}>{selectedBook.id}</span>
                  </div>
                  {selectedRequest.rating && (
                    <div className={styles.statItem}>
                      <span className={styles.statLabel}>Đánh giá</span>
                      <span className={styles.statValue}>⭐ {selectedRequest.rating}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.detailActions}>
                {selectedRequest.status === 'approved' && (
                  <button onClick={handleReturn} disabled={returning}>
                    {returning ? 'Đang xử lý...' : 'Yêu cầu trả sách'}
                  </button>
                )}
                {selectedRequest.status === 'return_requested' && (
                  <button disabled>Đang chờ xác nhận trả</button>
                )}
                {selectedRequest.status === 'returned' && (
                  <button disabled>Đã trả sách</button>
                )}
                {selectedRequest.status === 'pending' && (
                  <button disabled>Đang chờ duyệt</button>
                )}
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

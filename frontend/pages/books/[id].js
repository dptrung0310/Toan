import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import styles from '../../styles/BookDetail.module.css';

export default function BookDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Rating form state
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Mock reviews (since we don't have a reviews list API)
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    if (id) {
      loadBook();
    }
  }, [user, id]);

  const loadBook = async () => {
    setLoading(true);
    const result = await api.getBook(id);
    setLoading(false);

    if (result.ok && result.data?.status === 'success') {
      setBook(result.data.data);
    } else {
      setError('Không thể tải thông tin sách');
    }
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!rating) {
      alert('Vui lòng chọn số sao đánh giá');
      return;
    }

    setSubmitting(true);
    const result = await api.rateBook(
      { username: user.username, password: user.password },
      id,
      rating,
      comment
    );
    setSubmitting(false);

    if (result.ok && result.data?.status === 'success') {
      alert('Đánh giá thành công!');
      // Add review to local state
      setReviews([
        {
          id: Date.now(),
          user: user.username,
          rating,
          comment,
        },
        ...reviews,
      ]);
      setRating(0);
      setComment('');
    } else {
      alert(result.data?.message || 'Không thể gửi đánh giá');
    }
  };

  const renderStars = (count) => {
    return '⭐'.repeat(count);
  };

  if (loading) {
    return (
      <Layout>
        <div className={styles.loading}>Đang tải...</div>
      </Layout>
    );
  }

  if (error || !book) {
    return (
      <Layout>
        <div className={styles.error}>
          <h2>{error || 'Không tìm thấy sách'}</h2>
          <Link href="/user/dashboard">
            <button style={{ marginTop: '16px' }}>Quay lại trang chủ</button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className={styles.bookDetail}>
        <Link href="/user/dashboard" className={styles.backButton}>
          ← Quay lại
        </Link>

        <div className={styles.bookContent}>
          <div className={styles.bookCoverSection}>
            <img
              src={book.url_image || 'https://picsum.photos/seed/default/400/600'}
              alt={book.title}
            />
          </div>

          <div className={styles.bookInfoSection}>
            <h1>{book.title}</h1>
            <div className={styles.bookAuthor}>Tác giả: {book.author}</div>

            <div className={styles.bookStats}>
              <div className={styles.statBox}>
                <div className={styles.label}>Tổng số</div>
                <div className={styles.value}>{book.quantity}</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.label}>Còn lại</div>
                <div className={styles.value}>{book.available}</div>
              </div>
              <div className={styles.statBox}>
                <div className={styles.label}>Book ID</div>
                <div className={styles.value}>{book.id}</div>
              </div>
            </div>

            <div className={styles.bookDescription}>
              <h2>Mô tả</h2>
              <p>{book.description || 'Chưa có mô tả cho cuốn sách này.'}</p>
            </div>
          </div>
        </div>

        <div className={styles.reviewsSection}>
          <div className={styles.reviewsHeader}>
            <h2>Đánh giá & Nhận xét</h2>
          </div>

          <div className={styles.ratingForm}>
            <h3>Viết đánh giá của bạn</h3>
            <form onSubmit={handleSubmitReview}>
              <div className={styles.formGroup}>
                <label>Đánh giá</label>
                <div className={styles.starRating}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      className={`${styles.star} ${
                        star <= (hoverRating || rating) ? styles.filled : styles.empty
                      }`}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                    >
                      ⭐
                    </span>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="comment">Nhận xét</label>
                <textarea
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Chia sẻ suy nghĩ của bạn về cuốn sách..."
                  rows={4}
                />
              </div>

              <button type="submit" disabled={submitting || !rating}>
                {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
              </button>
            </form>
          </div>

          <div className={styles.reviewsList}>
            {reviews.length === 0 && (
              <div className={styles.emptyReviews}>
                <div className={styles.icon}>💬</div>
                <div>Chưa có đánh giá nào. Hãy là người đầu tiên đánh giá!</div>
              </div>
            )}

            {reviews.map((review) => (
              <div key={review.id} className={styles.reviewCard}>
                <div className={styles.reviewHeader}>
                  <span className={styles.reviewUser}>{review.user}</span>
                  <span className={styles.reviewRating}>
                    {renderStars(review.rating)}
                  </span>
                </div>
                <p className={styles.reviewComment}>{review.comment}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}

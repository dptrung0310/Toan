import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import styles from '../../styles/ManageBooks.module.css';

export default function ManageBooks() {
  const { user } = useAuth();
  const router = useRouter();
  const { edit } = router.query;

  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    title: '',
    author: '',
    description: '',
    url_image: '',
    quantity: '',
    available: '',
  });

  useEffect(() => {
    if (!user || user.role !== 'librarian') {
      router.push('/auth/login');
      return;
    }

    if (edit) {
      setIsEditMode(true);
      loadBook(edit);
    }
  }, [user, edit]);

  const loadBook = async (id) => {
    setLoading(true);
    const result = await api.getBook(id);
    setLoading(false);

    if (result.ok && result.data?.status === 'success') {
      const book = result.data.data;
      setFormData({
        title: book.title || '',
        author: book.author || '',
        description: book.description || '',
        url_image: book.url_image || '',
        quantity: book.quantity || '',
        available: book.available || '',
      });
    } else {
      setMessage({ type: 'error', text: 'Không thể tải thông tin sách' });
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setSubmitting(true);

    const creds = { username: user.username, password: user.password };

    let result;
    if (isEditMode) {
      // Update book
      const fields = {};
      if (formData.title) fields.title = formData.title;
      if (formData.author) fields.author = formData.author;
      if (formData.description) fields.description = formData.description;
      if (formData.url_image) fields.url_image = formData.url_image;
      if (formData.quantity) fields.quantity = Number(formData.quantity);
      if (formData.available !== '') fields.available = Number(formData.available);

      result = await api.updateBook(creds, edit, fields);
    } else {
      // Create book
      result = await api.createBook(
        creds,
        formData.title,
        formData.author,
        formData.description,
        formData.url_image,
        Number(formData.quantity) || 1
      );
    }

    setSubmitting(false);

    if (result.ok && result.data?.status === 'success') {
      setMessage({
        type: 'success',
        text: isEditMode ? 'Cập nhật sách thành công!' : 'Thêm sách thành công!',
      });

      if (!isEditMode) {
        // Reset form for create mode
        setFormData({
          title: '',
          author: '',
          description: '',
          url_image: '',
          quantity: '',
          available: '',
        });
      }

      setTimeout(() => {
        router.push('/librarian/dashboard');
      }, 1500);
    } else {
      setMessage({ type: 'error', text: result.data?.message || 'Có lỗi xảy ra' });
    }
  };

  const handleCancel = () => {
    router.push('/librarian/dashboard');
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
      <div className={styles.managePage}>
        <div className={styles.pageHeader}>
          <h1>{isEditMode ? 'Chỉnh sửa sách' : 'Thêm sách mới'}</h1>
          <p>
            {isEditMode
              ? 'Cập nhật thông tin sách trong thư viện'
              : 'Thêm một cuốn sách mới vào thư viện'}
          </p>
        </div>

        <div className={styles.formContainer}>
          {message.text && (
            <div className={`${styles.message} ${styles[message.type]}`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label htmlFor="title">Tên sách *</label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="author">Tác giả *</label>
                <input
                  id="author"
                  name="author"
                  type="text"
                  value={formData.author}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label htmlFor="description">Mô tả</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                />
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label htmlFor="url_image">URL ảnh bìa</label>
                <input
                  id="url_image"
                  name="url_image"
                  type="url"
                  placeholder="https://example.com/book-cover.jpg"
                  value={formData.url_image}
                  onChange={handleChange}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="quantity">Số lượng {isEditMode ? '' : '*'}</label>
                <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={handleChange}
                  required={!isEditMode}
                />
              </div>

              {isEditMode && (
                <div className={styles.formGroup}>
                  <label htmlFor="available">Số lượng còn lại</label>
                  <input
                    id="available"
                    name="available"
                    type="number"
                    min="0"
                    value={formData.available}
                    onChange={handleChange}
                  />
                </div>
              )}
            </div>

            <div className={styles.formActions}>
              <button type="button" onClick={handleCancel} className={styles.btnCancel}>
                Hủy
              </button>
              <button type="submit" disabled={submitting}>
                {submitting
                  ? 'Đang xử lý...'
                  : isEditMode
                  ? 'Cập nhật sách'
                  : 'Thêm sách'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

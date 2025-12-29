import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/Layout.module.css';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return <>{children}</>;

  const isLibrarian = user.role === 'librarian';

  return (
    <div className={styles.layout}>
      <nav className={styles.navbar}>
        <div className={styles.navContent}>
          <div className={styles.navBrand}>📚 Thư viện</div>
          <div className={styles.navRight}>
            <div className={styles.navLinks}>
              {isLibrarian ? (
                <>
                  <Link
                    href="/librarian/dashboard"
                    className={router.pathname === '/librarian/dashboard' ? styles.active : ''}
                  >
                    Tất cả sách
                  </Link>
                  <Link
                    href="/librarian/manage-books"
                    className={router.pathname === '/librarian/manage-books' ? styles.active : ''}
                  >
                    Quản lý sách
                  </Link>
                  <Link
                    href="/librarian/requests"
                    className={router.pathname === '/librarian/requests' ? styles.active : ''}
                  >
                    Yêu cầu mượn/trả
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/user/dashboard"
                    className={router.pathname === '/user/dashboard' ? styles.active : ''}
                  >
                    Tất cả sách
                  </Link>
                  <Link
                    href="/user/borrowed"
                    className={router.pathname === '/user/borrowed' ? styles.active : ''}
                  >
                    Sách đã mượn
                  </Link>
                </>
              )}
            </div>
            <div className={styles.userInfo}>
              <span>{user.username}</span>
              <span className={styles.userBadge}>{user.role}</span>
            </div>
            <button onClick={logout} className={styles.logoutBtn}>
              Đăng xuất
            </button>
          </div>
        </div>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('library_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('library_user', JSON.stringify(userData));
    if (userData.role === 'librarian') {
      router.push('/librarian/dashboard');
    } else {
      router.push('/user/dashboard');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('library_user');
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

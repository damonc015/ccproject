import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { Gallery } from './pages/Gallery';
import { EditorPage } from './pages/EditorPage';
import './styles.css';

function Protected({ children }: { children: JSX.Element }) {
  return useAuth().user ? children : <Navigate to="/login" replace />;
}

// HashRouter keeps deep links working on S3/CloudFront without rewrite rules.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Gallery /></Protected>} />
          <Route path="/doc/:documentId" element={<Protected><EditorPage /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  </React.StrictMode>,
);

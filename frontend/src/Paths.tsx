import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import BookmarksPage from '@components/BookmarksPage';
import NotFoundPage from '@components/NotFoundPage';

export type PathList = {
  path: string;
  element: ReactNode;
  children?: PathList[];
};

export const paths: PathList[] = [
  { path: '/', element: <BookmarksPage /> },
  { path: '/404', element: <NotFoundPage /> },
  { path: '*', element: <Navigate to="/404" /> },
];

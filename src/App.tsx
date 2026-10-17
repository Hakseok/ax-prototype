import { Navigate, RouterProvider, createHashRouter, useLocation } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { Catalog } from './dev/Catalog';
import { Login } from './screens/Login';
import { Shell } from './shell/Shell';
import { ScreenHost } from './shell/ScreenHost';
import { homeOf } from './shell/menu';
import { useApp } from './shell/AppContext';

function RootRedirect() {
  const { search } = useLocation();
  const { siteSelection, user } = useApp();
  const params = new URLSearchParams(search);
  params.set('site', siteSelection);
  return <Navigate to={`/${homeOf(user.role)}?${params.toString()}`} replace />;
}

// Every screen lives at #/<screen id>, e.g. #/EXE-010?site=ASN. The root opens the user's role home.
// Hash routing lets the build run from any static host or sub-path without server rewrites.
const router = createHashRouter([
  { path: '/_catalog', element: <Catalog /> },
  // COM-040 stands outside the shell (no menu before sign-in).
  { path: '/COM-040', element: <Login /> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <RootRedirect /> },
      { path: ':screenId', element: <ScreenHost /> }
    ]
  }
]);

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

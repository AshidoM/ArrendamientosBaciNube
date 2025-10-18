import { Navigate, Outlet } from 'react-router-dom';
import { getUser } from '../auth';

export default function PrivateRoute() {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

import { isEntraIdConfigured } from '@/auth'
import AdminDashboard from './AdminDashboard'

export default function AdminPage() {
  return <AdminDashboard entraIdConfigured={isEntraIdConfigured} />
}

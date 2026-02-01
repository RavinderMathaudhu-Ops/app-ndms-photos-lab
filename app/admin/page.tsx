'use client'

import { useState } from 'react'
import { Copy, Plus, LogOut, Lock, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function AdminDashboard() {
  const [adminToken, setAdminToken] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [pins, setPins] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (!adminToken) {
      setError('Admin token is required')
      return
    }
    setIsAuthenticated(true)
    setError('')
    setAdminToken('')
  }

  const createPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch('/api/auth/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken || '',
        },
        body: JSON.stringify({ teamName: teamName || 'Team ' + Date.now() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create PIN')
      }

      const data = await res.json()
      setPins([data, ...pins])
      setSuccess(`PIN created: ${data.pin}`)
      setTeamName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create PIN')
    } finally {
      setLoading(false)
    }
  }

  const copyPin = (pin: string) => {
    navigator.clipboard.writeText(pin)
    setSuccess(`Copied PIN: ${pin}`)
    setTimeout(() => setSuccess(''), 2000)
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-aspr-blue-dark to-aspr-blue-primary flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">NDMS Admin</CardTitle>
            <CardDescription>PIN Management Portal</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="token" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Admin Token
                </label>
                <Input
                  id="token"
                  type="password"
                  value={adminToken}
                  onChange={(e) => setAdminToken(e.target.value)}
                  placeholder="Enter ADMIN_TOKEN from .env.local"
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" size="lg">
                Login as Admin
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-600 text-center">
                <strong>Local Testing:</strong> Use the ADMIN_TOKEN value from your .env.local file.
              </p>
              <p className="text-xs text-gray-500 text-center mt-2">
                <code className="bg-gray-100 px-2 py-1 rounded">ADMIN_TOKEN=your-secret-token</code>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-aspr-blue-dark to-aspr-blue-primary text-white p-4 sticky top-0 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="w-6 h-6" />
            <h1 className="text-2xl font-bold">PIN Management</h1>
          </div>
          <Button
            variant="ghost"
            onClick={() => setIsAuthenticated(false)}
            className="text-white hover:bg-white/20"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Create PIN Card */}
        <Card>
          <CardHeader>
            <CardTitle>Create New PIN</CardTitle>
            <CardDescription>Generate a new PIN for field teams</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createPin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="teamName" className="text-sm font-semibold text-gray-700">
                  Team Name (Optional)
                </label>
                <Input
                  id="teamName"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Team A, Urban Search & Rescue, Medical Team 1"
                />
                <p className="text-xs text-gray-500">Leave blank for auto-generated name</p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert variant="success">
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                <Plus className="w-4 h-4 mr-2" />
                {loading ? 'Creating PIN...' : 'Create PIN'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* PINs List */}
        {pins.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Active PINs</CardTitle>
              <CardDescription>{pins.length} PIN(s) created</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pins.map((pin) => (
                  <div
                    key={pin.id}
                    className="border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:border-aspr-blue-primary transition"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="bg-aspr-blue-light px-4 py-2 rounded font-mono font-bold text-aspr-blue-dark text-lg">
                          {pin.pin}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{pin.team_name}</p>
                          <p className="text-xs text-gray-500">
                            ID: {pin.id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyPin(pin.pin)}
                      title="Copy PIN to clipboard"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Alert className="mt-4">
                <AlertDescription className="text-xs">
                  Click the copy icon to copy PIN to clipboard. Share with team members via secure channel. PINs expire after 7 days.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {pins.length === 0 && !loading && (
          <Alert variant="success" className="text-center">
            <AlertDescription>
              Create a PIN above to get started.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}

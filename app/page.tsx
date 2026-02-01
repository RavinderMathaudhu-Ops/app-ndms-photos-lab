'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertCircle, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/validate-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Invalid PIN')
      }

      const { token, sessionId, teamName } = await res.json()

      sessionStorage.setItem('ndms_token', token)
      sessionStorage.setItem('ndms_session_id', sessionId)
      sessionStorage.setItem('ndms_team', teamName)

      router.push('/upload')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-aspr-blue-dark to-aspr-blue-primary flex flex-col items-center justify-center p-4">
      {/* HHS Logo */}
      <div className="mb-8">
        <a href="https://www.hhs.gov" target="_blank" rel="noopener noreferrer" title="HHS Official">
          <img
            src="/hhs_longlogo_white.png"
            alt="HHS - U.S. Department of Health and Human Services"
            style={{ height: '100px', width: 'auto' }}
            className="drop-shadow-lg hover:opacity-80 transition"
          />
        </a>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          {/* Logos */}
          <div className="flex items-center justify-center gap-8 px-4">
            <a href="https://aspr.hhs.gov" target="_blank" rel="noopener noreferrer" title="ASPR">
              <img
                src="/aspr-logo-blue.png"
                alt="ASPR Logo"
                style={{ height: '68px', width: 'auto' }}
                className="hover:opacity-80 transition"
              />
            </a>
            <a href="https://aspr.hhs.gov" target="_blank" rel="noopener noreferrer" title="NDMS">
              <img
                src="/ndms-logo.webp"
                alt="NDMS Logo"
                style={{ height: '68px', width: 'auto' }}
                className="hover:opacity-80 transition"
              />
            </a>
          </div>

          <div>
            <CardTitle className="text-3xl">NDMS Photo Repository</CardTitle>
            <CardDescription className="text-base mt-2">
              Secure photo upload for disaster response
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Authentication Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="pin" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Enter PIN
              </label>
              <Input
                id="pin"
                type="number"
                inputMode="numeric"
                maxLength={6}
                min="0"
                max="999999"
                value={pin}
                onChange={(e) => setPin(e.target.value.slice(0, 6).replace(/[^0-9]/g, ''))}
                placeholder="000000"
                autoComplete="off"
                className="text-center text-2xl tracking-widest font-mono"
              />
              <p className="text-xs text-gray-500">
                6-digit PIN provided by your incident commander
              </p>
            </div>

            <Button
              type="submit"
              disabled={pin.length !== 6 || loading}
              className="w-full h-11 text-base"
              size="lg"
            >
              {loading ? 'Verifying PIN...' : 'Access Portal'}
            </Button>
          </form>

          <div className="pt-4 border-t border-gray-200 space-y-1 text-xs text-gray-600">
            <p className="font-semibold">National Disaster Medical System</p>
            <p>Administration for Strategic Preparedness and Response</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

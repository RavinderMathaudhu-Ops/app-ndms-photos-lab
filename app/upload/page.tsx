'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, MapPin, LogOut, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function UploadPage() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)

  // Form state
  const [notes, setNotes] = useState('')
  const [incidentId, setIncidentId] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationName, setLocationName] = useState('')

  // Session state
  const [token, setToken] = useState('')
  const [teamName, setTeamName] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check authentication on mount
  useEffect(() => {
    const storedToken = sessionStorage.getItem('ndms_token')
    const storedTeam = sessionStorage.getItem('ndms_team')

    if (!storedToken) {
      router.push('/')
      return
    }

    setToken(storedToken)
    setTeamName(storedTeam || 'Anonymous')
  }, [router])

  // Get user location
  const getLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not available on this device')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setLocationName(
          `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
        )
      },
      (err) => {
        setError(`Location error: ${err.message}`)
      }
    )
  }

  // Handle photo selection
  const handlePhotoSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image')
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('File is too large (max 50MB)')
      return
    }

    setUploading(true)
    setError('')
    setSuccess(false)

    try {
      const formData = new FormData()
      formData.append('photo', file)
      formData.append('notes', notes)
      formData.append('incidentId', incidentId)
      if (location) {
        formData.append('latitude', location.lat.toString())
        formData.append('longitude', location.lng.toString())
      }
      formData.append('locationName', locationName)

      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await response.json()

      setSuccess(true)
      setNotes('')
      setIncidentId('')
      setLocationName('')
      setProgress(0)

      // Reset after 2 seconds
      setTimeout(() => {
        setSuccess(false)
        fileInputRef.current?.click() // Prompt for next photo
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.clear()
    router.push('/')
  }

  if (!token) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-aspr-blue-light to-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-aspr-blue-dark to-aspr-blue-primary text-white p-4 sticky top-0 shadow-md">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Photo Upload</h1>
            <p className="text-sm opacity-90">Team: {teamName}</p>
          </div>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-white hover:bg-white/20"
            size="sm"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-md mx-auto p-4 space-y-4 py-6">
        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Upload Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success */}
        {success && (
          <Alert variant="success" className="animate-pulse">
            <AlertTitle>Photo uploaded successfully</AlertTitle>
            <AlertDescription>Ready for another photo...</AlertDescription>
          </Alert>
        )}

        {/* Camera/Upload Button */}
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full h-20 text-lg"
          size="lg"
        >
          <Camera className="w-6 h-6 mr-3" />
          {uploading ? `Uploading... ${progress}%` : 'Take or Select Photo'}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            if (file) handlePhotoSelect(file)
          }}
          className="hidden"
        />

        {/* Form Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Photo Details</CardTitle>
            <CardDescription>Optional but helpful for organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Incident ID */}
            <div className="space-y-2">
              <label htmlFor="incident" className="text-sm font-semibold text-gray-700">
                Incident ID (Optional)
              </label>
              <Input
                id="incident"
                type="text"
                value={incidentId}
                onChange={(e) => setIncidentId(e.target.value)}
                placeholder="e.g., HU-2024-001"
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-700">Location</label>
                <Button
                  onClick={getLocation}
                  disabled={uploading}
                  variant="outline"
                  size="sm"
                  className="h-8"
                >
                  <MapPin className="w-4 h-4 mr-1" />
                  Get Location
                </Button>
              </div>
              {location ? (
                <div className="text-sm font-semibold p-3 bg-aspr-blue-primary text-white rounded">
                  {locationName}
                </div>
              ) : (
                <p className="text-xs text-gray-500 italic">No location captured</p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label htmlFor="notes" className="text-sm font-semibold text-gray-700">
                Notes (Optional)
              </label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe what's in the photo..."
                className="resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="bg-aspr-blue-light border-aspr-blue-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="w-5 h-5" />
              Photography Tips
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-aspr-blue-dark">
              <li className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span>Use good lighting for clear photos</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span>Include incident ID for organization</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span>Add location for mapping</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold">•</span>
                <span>Add notes to describe context</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

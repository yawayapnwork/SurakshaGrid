'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, MapPin, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { VoiceToTextInput } from '@/components/VoiceToTextInput';
import { ImageCompressorInput } from '@/components/ImageCompressorInput';
import { ConfirmNearbyModal } from '@/components/ConfirmNearbyModal';
import { createSOSReport, fetchNearbySOSReports } from '@/services/api';
import { SOSReport, SOSSeverity } from '@/types';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

const SEVERITY_OPTIONS: { key: SOSSeverity; label: string; desc: string }[] = [
  { key: 'LOW', label: 'Low', desc: 'Ankle deep water' },
  { key: 'MEDIUM', label: 'Medium', desc: 'Knee deep water' },
  { key: 'HIGH', label: 'High', desc: 'Waist deep / property damage' },
  { key: 'CRITICAL_TRAPPED', label: 'Critical', desc: 'Trapped on roof / danger to life' },
];

export default function CitizenReportPage() {
  // 1. Location State
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>('Detecting your GPS location...');
  const [isGeoAccurate, setIsGeoAccurate] = useState(false);
  const [isManualLocation, setIsManualLocation] = useState(false);

  // 2. Form State
  const [severity, setSeverity] = useState<SOSSeverity>('HIGH');
  const [voiceTranscript, setVoiceTranscript] = useState<string>('');
  const [compressedImage, setCompressedImage] = useState<Blob | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedReport, setSubmittedReport] = useState<SOSReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 3. Nearby Reports State for Confirmation
  const [nearbyReports, setNearbyReports] = useState<SOSReport[]>([]);

  // Auto-trigger Geolocation capture on page load
  useEffect(() => {
    if (!navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reporting unsupported browser capability, no render-time alternative
      setGeoStatus('Browser geolocation is not supported');
      // Default to Chennai coordinates
      setLatitude(13.0827);
      setLongitude(80.2707);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setIsGeoAccurate(true);
        setGeoStatus(`GPS locked (${pos.coords.accuracy.toFixed(0)}m accuracy)`);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setGeoStatus('GPS permission denied or unavailable. Set location manually below.');
        setIsManualLocation(true);
        setLatitude(13.0827);
        setLongitude(80.2707);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Query active SOS reports within 5km radius using PostGIS ST_DWithin spatial index
  useEffect(() => {
    if (latitude === null || longitude === null) return;
    fetchNearbySOSReports(latitude, longitude)
      .then((reports) => setNearbyReports(reports))
      .catch((err) => console.error('Error fetching nearby SOS reports:', err));
  }, [latitude, longitude]);

  // Submit SOS Report to backend POST /api/v1/sos via shared createSOSReport service
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (latitude === null || longitude === null) {
      setErrorMessage('Location coordinates are required before submitting.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const reportData = await createSOSReport({
        latitude,
        longitude,
        severity,
        voice_transcript: voiceTranscript || undefined,
        image: compressedImage || undefined,
      });

      setSubmittedReport(reportData);

      // Add to nearby reports for display
      setNearbyReports((prev) => [reportData, ...prev]);
    } catch (err) {
      console.error('Submission error:', err);
      const message = err instanceof Error ? err.message : 'Failed to submit report. Please try again.';
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm Nearby Report handler
  const handleConfirmReport = async (sosId: string) => {
    const res = await fetch(`${API_BASE_URL}/api/v1/sos/${sosId}/confirm`, {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error('Failed to confirm report');
    }
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col items-center justify-start p-4 sm:p-6 font-sans">
      {/* Header Bar */}
      <header className="w-full max-w-lg flex items-center justify-between py-3 mb-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="bg-red-600 text-white p-2 rounded-xl shadow-sm shadow-red-600/20">
            <AlertTriangle className="w-4.5 h-4.5" />
          </div>
          <div>
            <h1 className="font-bold text-[15px] tracking-tight text-slate-900">
              SurakshaGrid Citizen SOS
            </h1>
            <p className="text-[11px] text-slate-400">Emergency Flood Assistance Reporting</p>
          </div>
        </div>

        <Link
          href="/"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 transition-colors"
        >
          Console Map &rarr;
        </Link>
      </header>

      {/* Main Container */}
      <div className="w-full max-w-lg space-y-6">
        {/* Submission Success State */}
        {submittedReport ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-5 text-center">
            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-900">Emergency Report Submitted</h2>
              <p className="text-xs text-slate-500 mt-1">
                Your SOS report has been recorded and broadcast to emergency dispatch units.
              </p>
            </div>

            {/* Report Reference Card */}
            <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/70 text-left space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Report ID:</span>
                <span className="font-mono text-slate-700">{submittedReport.id.slice(0, 8)}...</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">Severity:</span>
                <span className="font-semibold text-red-600">{submittedReport.severity}</span>
              </div>

              {/* OpenCV Water Verification Score Badge */}
              {submittedReport.visual_confidence_score !== null &&
                submittedReport.visual_confidence_score !== undefined && (
                  <div className="bg-white border border-slate-200 p-2.5 rounded-lg flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                      <Sparkles className="w-4 h-4 text-slate-400" /> OpenCV Water Verification
                    </span>
                    <span className="font-semibold text-slate-900">
                      {Math.round(submittedReport.visual_confidence_score * 100)}% Confidence
                    </span>
                  </div>
                )}
            </div>

            <button
              onClick={() => setSubmittedReport(null)}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
            >
              Submit Another Report
            </button>
          </div>
        ) : (
          /* SOS Reporting Form */
          <form onSubmit={handleSubmit} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-5">
            {/* 1. Geolocation Badge */}
            <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <MapPin className="w-4 h-4 text-slate-400" /> Location Coordinates
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                    isGeoAccurate
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {geoStatus}
                </span>
              </div>

              {isManualLocation ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={latitude || 13.0827}
                      onChange={(e) => setLatitude(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={longitude || 80.2707}
                      onChange={(e) => setLongitude(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-900"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 bg-white p-2 rounded-lg border border-slate-200">
                  <span>Lat: {latitude?.toFixed(6) || '--'}</span>
                  <span>Lon: {longitude?.toFixed(6) || '--'}</span>
                  <button
                    type="button"
                    onClick={() => setIsManualLocation(true)}
                    className="text-[10px] text-slate-600 hover:underline font-sans font-semibold"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* 2. Urgency Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-slate-400" /> Urgency / Severity Level
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SEVERITY_OPTIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSeverity(item.key)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      severity === item.key
                        ? item.key === 'CRITICAL_TRAPPED'
                          ? 'bg-red-50 border-red-300 text-red-900'
                          : 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className={`text-[10px] mt-0.5 ${severity === item.key ? 'opacity-80' : 'text-slate-400'}`}>
                      {item.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Multilingual Voice-to-Text */}
            <VoiceToTextInput
              value={voiceTranscript}
              onChange={setVoiceTranscript}
            />

            {/* 4. Photo Attachment with Client Compression */}
            <ImageCompressorInput
              onImageCompressed={setCompressedImage}
            />

            {/* Error Message */}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl">
                {errorMessage}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2"
            >
              <Send className="w-4 h-4" />
              {isSubmitting ? 'Submitting SOS report…' : 'Send Emergency SOS Report'}
            </button>
          </form>
        )}

        {/* 5. Community Confirmation Component */}
        <ConfirmNearbyModal
          reports={nearbyReports}
          onConfirmReport={handleConfirmReport}
        />
      </div>
    </main>
  );
}

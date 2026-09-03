'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Crosshair, MapPin, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { VoiceToTextInput } from '@/components/VoiceToTextInput';
import { ImageCompressorInput } from '@/components/ImageCompressorInput';
import { ConfirmNearbyModal } from '@/components/ConfirmNearbyModal';
import { SOSReport, SOSSeverity } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

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
        setGeoStatus(`GPS Locked (${pos.coords.accuracy.toFixed(0)}m accuracy)`);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setGeoStatus('GPS detection failed. Using manual coordinates fallback.');
        setLatitude(13.0827);
        setLongitude(80.2707);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Submit SOS Report to backend POST /api/v1/sos
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (latitude === null || longitude === null) {
      setErrorMessage('Location coordinates are required before submitting.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());
      formData.append('severity', severity);
      if (voiceTranscript) {
        formData.append('voice_transcript', voiceTranscript);
      }
      if (compressedImage) {
        formData.append('image', compressedImage, 'standing_water.jpg');
      }

      const res = await fetch(`${API_BASE_URL}/api/v1/sos`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned status ${res.status}`);
      }

      const reportData: SOSReport = await res.json();
      setSubmittedReport(reportData);

      // Add to nearby reports for display
      setNearbyReports((prev) => [reportData, ...prev]);
    } catch (err: any) {
      console.error('Submission error:', err);
      setErrorMessage(err.message || 'Failed to submit report. Please try again.');
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
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-start p-4 sm:p-6 font-sans">
      {/* Header Bar */}
      <header className="w-full max-w-lg flex items-center justify-between py-3 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="bg-red-500/20 text-red-400 p-2 rounded-xl border border-red-500/30">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-wide text-white">
              SurakshaGrid Citizen SOS
            </h1>
            <p className="text-[11px] text-slate-400">Emergency Flood Assistance Reporting</p>
          </div>
        </div>

        <Link
          href="/"
          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-800 transition-colors"
        >
          Console Map &rarr;
        </Link>
      </header>

      {/* Main Container */}
      <div className="w-full max-w-lg space-y-6">
        {/* Submission Success State */}
        {submittedReport ? (
          <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 shadow-2xl space-y-5 text-center animate-fade-in">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-white">Emergency Report Submitted</h2>
              <p className="text-xs text-slate-400 mt-1">
                Your SOS report has been recorded and broadcast to emergency dispatch units.
              </p>
            </div>

            {/* Report Reference Card */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Report ID:</span>
                <span className="font-mono text-slate-200">{submittedReport.id.slice(0, 8)}...</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Severity:</span>
                <span className="font-bold text-red-400">{submittedReport.severity}</span>
              </div>

              {/* OpenCV Water Verification Score Badge */}
              {submittedReport.visual_confidence_score !== null &&
                submittedReport.visual_confidence_score !== undefined && (
                  <div className="bg-sky-500/10 border border-sky-500/30 p-2.5 rounded-lg flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-sky-300 font-semibold">
                      <Sparkles className="w-4 h-4 text-sky-400" /> OpenCV Water Verification
                    </span>
                    <span className="font-extrabold text-sky-400">
                      {Math.round(submittedReport.visual_confidence_score * 100)}% Confidence
                    </span>
                  </div>
                )}
            </div>

            <button
              onClick={() => setSubmittedReport(null)}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
            >
              Submit Another Report
            </button>
          </div>
        ) : (
          /* SOS Reporting Form */
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5">
            {/* 1. Geolocation Badge */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <MapPin className="w-4 h-4 text-sky-400" /> Location Coordinates
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isGeoAccurate
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {geoStatus}
                </span>
              </div>

              {isManualLocation ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] text-slate-400 block">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={latitude || 13.0827}
                      onChange={(e) => setLatitude(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={longitude || 80.2707}
                      onChange={(e) => setLongitude(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-white"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                  <span>Lat: {latitude?.toFixed(6) || '--'}</span>
                  <span>Lon: {longitude?.toFixed(6) || '--'}</span>
                  <button
                    type="button"
                    onClick={() => setIsManualLocation(true)}
                    className="text-[10px] text-sky-400 hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* 2. Urgency Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-red-400" /> Urgency / Severity Level
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'LOW', label: 'LOW', desc: 'Ankle deep water' },
                  { key: 'MEDIUM', label: 'MEDIUM', desc: 'Knee deep water' },
                  { key: 'HIGH', label: 'HIGH', desc: 'Waist deep / Property damage' },
                  { key: 'CRITICAL_TRAPPED', label: 'CRITICAL TRAPPED', desc: 'Trapped on roof / Danger to life' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSeverity(item.key as SOSSeverity)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      severity === item.key
                        ? item.key === 'CRITICAL_TRAPPED'
                          ? 'bg-red-600/30 border-red-500 text-white shadow-lg'
                          : 'bg-sky-600/30 border-sky-500 text-white shadow-lg'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{item.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
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
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
                {errorMessage}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-black text-xs tracking-wider uppercase flex items-center justify-center gap-2 shadow-xl shadow-red-900/30 transition-all disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${isSubmitting ? 'animate-bounce' : ''}`} />
              {isSubmitting ? 'Submitting SOS Report...' : 'Transmit Emergency SOS Report'}
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

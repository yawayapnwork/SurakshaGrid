#!/usr/bin/env python3
"""SurakshaGrid Production End-to-End Smoke Test Script.

Executes comprehensive verification across backend health, What-If risk simulator,
OpenCV water verification engine, and SciPy Hungarian dispatch assignment optimizer.
"""

import sys
import os
import argparse
import numpy as np
import cv2
import httpx


def create_synthetic_water_image_bytes() -> bytes:
    """Generates synthetic BGR image bytes with strong blue/cyan water hues."""
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    # BGR water color (High Blue=180, Medium Green=120, Low Red=40)
    img[:, :] = (180, 120, 40)
    success, buffer = cv2.imencode(".jpg", img)
    if not success:
        raise RuntimeError("Failed to encode synthetic JPEG image")
    return buffer.tobytes()


def run_smoke_test(base_url: str) -> None:
    base_url = base_url.rstrip("/")
    print(f"🚀 Starting SurakshaGrid E2E Production Smoke Test target: {base_url}\n")

    client = httpx.Client(timeout=15.0)

    try:
        # Step 1: Health check /healthz
        print("1️⃣ Testing Health Check (/healthz)...")
        health_resp = client.get(f"{base_url}/healthz")
        assert health_resp.status_code == 200, f"Health check failed with status {health_resp.status_code}: {health_resp.text}"
        health_data = health_resp.json()
        assert health_data.get("status") == "ok", f"Unexpected health response: {health_data}"
        print(f"   ✅ Health Check Passed: {health_data}\n")

        # Step 2: Authenticate Admin/Officer via /api/v1/auth/login
        print("2️⃣ Authenticating Officer Credentials (/api/v1/auth/login)...")
        admin_username = os.environ.get("ADMIN_USERNAME", "admin")
        admin_password = os.environ.get("ADMIN_PASSWORD", "SurakshaAdmin2026!")
        login_resp = client.post(
            f"{base_url}/api/v1/auth/login",
            json={"username": admin_username, "password": admin_password},
        )
        assert login_resp.status_code == 200, f"Auth login failed with status {login_resp.status_code}: {login_resp.text}"
        auth_data = login_resp.json()
        token = auth_data.get("access_token")
        assert token, "Access token missing in login response"
        auth_headers = {"Authorization": f"Bearer {token}"}
        print("   ✅ Auth Login Passed: JWT Bearer Access Token acquired\n")

        # Step 3: Simulate rainfall at 75% via /api/v1/risk-scores/simulate?rainfall=75
        print("3️⃣ Testing What-If Risk Simulator (/api/v1/risk-scores/simulate?rainfall=75)...")
        risk_resp = client.get(f"{base_url}/api/v1/risk-scores/simulate?rainfall=75")
        assert risk_resp.status_code == 200, f"Risk simulation failed with status {risk_resp.status_code}: {risk_resp.text}"
        risk_data = risk_resp.json()
        assert risk_data.get("type") == "FeatureCollection", "Expected GeoJSON FeatureCollection"
        features = risk_data.get("features", [])
        assert len(features) > 0, "Expected non-empty risk grid features"
        rainfall_impact = features[0]["properties"]["breakdown"]["rainfall_impact"]
        assert abs(rainfall_impact - 0.75) < 1e-4, f"Expected rainfall_impact 0.75, got {rainfall_impact}"
        print(f"   ✅ Risk Simulator Passed: {len(features)} risk grid cells returned (Rainfall Impact: {rainfall_impact})\n")

        # Step 4: Post SOS report with synthetic water image (Public Endpoint)
        print("4️⃣ Testing SOS Report Submission with OpenCV Photo Evidence (/api/v1/sos)...")
        image_bytes = create_synthetic_water_image_bytes()
        sos_payload = {
            "latitude": "13.0827",
            "longitude": "80.2707",
            "severity": "CRITICAL_TRAPPED",
            "voice_transcript": "E2E Smoke test: Water rising above entrance!",
        }
        files = {
            "image": ("standing_water.jpg", image_bytes, "image/jpeg")
        }
        sos_resp = client.post(f"{base_url}/api/v1/sos", data=sos_payload, files=files)
        assert sos_resp.status_code == 201, f"SOS creation failed with status {sos_resp.status_code}: {sos_resp.text}"
        sos_data = sos_resp.json()
        sos_id = sos_data.get("id")
        visual_confidence = sos_data.get("visual_confidence_score")
        print(f"   ✅ SOS Created Successfully! ID: {sos_id}")

        # Step 5: Verify visual_confidence_score > 0
        assert visual_confidence is not None, "visual_confidence_score should not be None"
        assert visual_confidence > 0, f"Expected visual_confidence_score > 0, got {visual_confidence}"
        print(f"   ✅ OpenCV Water Verification Passed: Visual Confidence Score = {visual_confidence * 100:.1f}%\n")

        # Step 6: Call guarded /api/v1/dispatch/run endpoint with Bearer token
        print("6️⃣ Testing SciPy Hungarian Dispatch Optimizer (/api/v1/dispatch/run)...")
        dispatch_resp = client.post(f"{base_url}/api/v1/dispatch/run", headers=auth_headers)
        assert dispatch_resp.status_code == 200, f"Dispatch optimizer failed with status {dispatch_resp.status_code}: {dispatch_resp.text}"
        assignments = dispatch_resp.json()
        assert isinstance(assignments, list), "Expected list response from dispatch optimizer"
        print(f"   ✅ SciPy Dispatch Optimizer Passed: {len(assignments)} assignments computed!\n")

        print("🎉 ALL END-TO-END SMOKE TESTS PASSED SUCCESSFULLY!")

    except Exception as exc:
        print(f"\n❌ E2E SMOKE TEST FAILED: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SurakshaGrid E2E Smoke Test")
    parser.add_argument(
        "--url",
        default=os.environ.get("TARGET_URL", "http://localhost:8000"),
        help="Target base URL of the deployed FastAPI backend",
    )
    args = parser.parse_args()
    run_smoke_test(args.url)

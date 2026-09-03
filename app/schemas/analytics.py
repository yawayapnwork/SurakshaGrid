from pydantic import BaseModel, Field


class LiveAnalyticsResponse(BaseModel):
    monitored_area_km2: float = Field(..., description="Total monitored geographic area in square kilometers")
    total_sos_logged: int = Field(..., description="Total SOS reports logged in system")
    total_sos_confirmed: int = Field(..., description="Total SOS reports confirmed by citizens/inspectors")
    total_sos_resolved: int = Field(..., description="Total SOS reports resolved")
    active_sos_count: int = Field(..., description="Currently active unresolved SOS reports")
    critical_sos_count: int = Field(..., description="Number of critical trapped reports")
    dispatched_units_count: int = Field(..., description="Number of rescue units currently dispatched")
    available_units_count: int = Field(..., description="Number of rescue units currently available")
    total_units_count: int = Field(..., description="Total number of registered rescue units")
    avg_eta_minutes: float = Field(..., description="Average computed route ETA in minutes")

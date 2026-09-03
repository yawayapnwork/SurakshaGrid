import enum


class SOSStatus(str, enum.Enum):
    PENDING = "PENDING"
    ASSIGNED = "ASSIGNED"
    RESOLVED = "RESOLVED"


class SOSSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL_TRAPPED = "CRITICAL_TRAPPED"


class RescueUnitType(str, enum.Enum):
    BOAT = "BOAT"
    AMBULANCE = "AMBULANCE"
    DRONE = "DRONE"


class RescueUnitStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    DISPATCHED = "DISPATCHED"
    MAINTENANCE = "MAINTENANCE"

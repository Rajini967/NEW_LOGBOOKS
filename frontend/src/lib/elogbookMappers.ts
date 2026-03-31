export type PumpStatus = "ON" | "OFF";

export const encodePumpPair = (p1: PumpStatus, p2: PumpStatus) => `P1:${p1};P2:${p2}`;

export const decodePumpPair = (
  value?: string | null,
): { p1: PumpStatus; p2: PumpStatus } | null => {
  if (!value) return null;
  const match = value.match(/P1:(ON|OFF);P2:(ON|OFF)/i);
  if (!match) return null;
  return {
    p1: match[1].toUpperCase() as PumpStatus,
    p2: match[2].toUpperCase() as PumpStatus,
  };
};

export const encodeFanTriple = (f1: PumpStatus, f2: PumpStatus, f3: PumpStatus) =>
  `F1:${f1};F2:${f2};F3:${f3}`;

export const decodeFanTriple = (
  value?: string | null,
): { f1: PumpStatus; f2: PumpStatus; f3: PumpStatus } | null => {
  if (!value) return null;
  const match = value.match(/F1:(ON|OFF);F2:(ON|OFF);F3:(ON|OFF)/i);
  if (!match) return null;
  return {
    f1: match[1].toUpperCase() as PumpStatus,
    f2: match[2].toUpperCase() as PumpStatus,
    f3: match[3].toUpperCase() as PumpStatus,
  };
};

export const formatBlowdownInputValue = (minutes?: number | null): string => {
  if (minutes == null || Number.isNaN(minutes)) return "";
  const totalSeconds = Math.max(0, Math.round(Number(minutes) * 60));
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};

export const parseBlowdownToMinutes = (raw: string): number | null | "invalid" => {
  const value = (raw || "").trim();
  if (!value) return null;
  if (value.toUpperCase() === "N/A") return null;
  const timeMatch = value.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (timeMatch) {
    const hh = Number(timeMatch[1]);
    const mm = Number(timeMatch[2]);
    const ss = Number(timeMatch[3]);
    return (hh * 3600 + mm * 60 + ss) / 60;
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber) && asNumber >= 0) return asNumber;
  return "invalid";
};

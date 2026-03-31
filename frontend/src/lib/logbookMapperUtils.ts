import { format } from "date-fns";

type ApprovalNames = {
  approvedByName?: string | null;
  secondaryApprovedByName?: string | null;
};

export function toDateTime(timestampValue: string) {
  const timestamp = new Date(timestampValue);
  return {
    timestamp,
    date: format(timestamp, "yyyy-MM-dd"),
    time: format(timestamp, "HH:mm:ss"),
  };
}

export function resolveApprovedBy(
  status: string,
  names: ApprovalNames,
  preferSecondary = false,
) {
  if (status !== "approved") return "";
  if (preferSecondary) {
    return names.secondaryApprovedByName || names.approvedByName || "";
  }
  return names.approvedByName || "";
}

export function resolveRejectedBy(status: string, approvedByName?: string | null) {
  return status === "rejected" || status === "pending_secondary_approval"
    ? approvedByName || ""
    : "";
}

import { toast as sonnerToast } from "sonner";

const coerceToastMessage = (value: unknown): string => {
  if (value == null) return "Something went wrong";
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return "Something went wrong";
    // Some API layers surface JSON as string (e.g. {"detail":["..."]}); decode it.
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try {
        return coerceToastMessage(JSON.parse(text));
      } catch {
        // Keep original text when not valid JSON.
      }
    }
    return text;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => coerceToastMessage(item))
      .map((item) => item.trim())
      .filter(Boolean);
    return parts.length ? parts.join(", ") : "Something went wrong";
  }
  if (typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (typeof data.message === "string" && data.message.trim()) return data.message.trim();
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail.trim();

    const values = Object.values(data)
      .map((item) => coerceToastMessage(item))
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length ? values.join(", ") : "Something went wrong";
  }
  return String(value);
};

const withCleanMessage = (method: (message: string, ...args: any[]) => any) => {
  return (message: unknown, ...args: any[]) => method(coerceToastMessage(message), ...args);
};

const wrappedToast = Object.assign(
  (message: unknown, ...args: any[]) => sonnerToast(coerceToastMessage(message), ...args),
  sonnerToast,
  {
    message: withCleanMessage(sonnerToast.message),
    success: withCleanMessage(sonnerToast.success),
    info: withCleanMessage(sonnerToast.info),
    warning: withCleanMessage(sonnerToast.warning),
    error: withCleanMessage(sonnerToast.error),
    loading: withCleanMessage(sonnerToast.loading),
  },
);

export const toast = wrappedToast as typeof sonnerToast;
export { coerceToastMessage };

import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, ArrowLeft } from "lucide-react";
import { toast } from "@/lib/toast";
import { PasswordRequirementHints } from "@/components/PasswordRequirementHints";

const schema = z
  .object({
    new_password: z.string().min(8, "Password must be at least 8 characters long."),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match.",
  });

type ResetPasswordForm = z.infer<typeof schema>;

const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [isValidating, setIsValidating] = React.useState(true);
  const [isTokenValid, setIsTokenValid] = React.useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(schema),
  });

  const newPasswordValue = watch("new_password", "");

  React.useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setIsTokenValid(false);
        setIsValidating(false);
        return;
      }
      try {
        await authAPI.validatePasswordResetToken(token);
        setIsTokenValid(true);
      } catch {
        setIsTokenValid(false);
      } finally {
        setIsValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const onSubmit = async (data: ResetPasswordForm) => {
    try {
      await authAPI.resetPassword({
        token,
        new_password: data.new_password,
        confirm_password: data.confirm_password,
      });
      toast.success("Your password has been reset. Please sign in with your new password.");
      navigate("/login");
    } catch (error: any) {
      const message =
        error?.data?.detail ||
        error?.data?.message ||
        error?.data?.error ||
        error?.message ||
        "Unable to reset password. The link may be invalid or expired.";
      toast.error(message);
    }
  };

  const renderContent = () => {
    if (!token) {
      return (
        <Alert>
          <AlertDescription>This password reset link is invalid.</AlertDescription>
        </Alert>
      );
    }

    if (isValidating) {
      return <p className="text-sm text-muted-foreground">Validating reset link...</p>;
    }

    if (!isTokenValid) {
      return (
        <Alert>
          <AlertDescription>
            This password reset link is invalid or has expired. Please request a new reset link.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new_password">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              className="pl-10"
              {...register("new_password")}
            />
          </div>
          <PasswordRequirementHints password={newPasswordValue || ""} className="mt-2" />
          {errors.new_password && <p className="text-sm text-destructive">{errors.new_password.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm_password">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              className="pl-10"
              {...register("confirm_password")}
            />
          </div>
          {errors.confirm_password && (
            <p className="text-sm text-destructive">{errors.confirm_password.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Resetting password..." : "Reset password"}
        </Button>
      </form>
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg">
          <CardHeader>
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to login
            </button>
            <CardTitle>Reset password</CardTitle>
            <CardDescription>Choose a strong new password for your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">{renderContent()}</CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPasswordPage;


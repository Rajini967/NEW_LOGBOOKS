import React from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "@/lib/toast";

const schema = z.object({
  email: z.string().email("Please enter a valid email address."),
});

type ForgotPasswordForm = z.infer<typeof schema>;

const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    try {
      await authAPI.requestPasswordReset(data.email);
      setSubmitted(true);
      toast.success("If the email exists, we sent a reset link.");
    } catch (error) {
      // Always show generic message to avoid email enumeration.
      setSubmitted(true);
      toast.success("If the email exists, we sent a reset link.");
    }
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
            <CardTitle>Forgot password</CardTitle>
            <CardDescription>
              Enter your email address and we&apos;ll send you instructions to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {submitted && (
              <Alert>
                <AlertDescription>
                  If an account with that email exists, we&apos;ve sent password reset instructions.
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    className="pl-10"
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Sending reset link..." : "Send reset link"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;


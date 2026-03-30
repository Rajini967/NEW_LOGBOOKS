import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Tags, FilePlus2, ArrowLeft, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const FilterLogBookSettingsPage: React.FC = () => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  const isFilterAdmin =
    user && (user.role === "admin" || user.role === "super_admin");

  if (!isLoading && !isFilterAdmin) {
    return <Navigate to="/e-log-book/filter/entry" replace />;
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Filter Log Book Settings"
        subtitle="Select an option to configure filter registration and schedules"
      />

      <div className="px-6 pt-2">
        <button
          type="button"
          onClick={() => navigate("/e-log-book/filter")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </button>
      </div>

      <main className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <button
            type="button"
            className={cn(
              "bg-card rounded-lg border border-border p-6",
              "hover:border-accent hover:shadow-lg",
              "transition-all duration-200",
              "text-left group",
              "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            )}
            onClick={() => navigate("/e-log-book/filter/settings/categories")}
          >
            <div className="flex flex-col items-start gap-4">
              <div
                className={cn(
                  "w-16 h-16 rounded-lg flex items-center justify-center",
                  "group-hover:scale-110 transition-transform duration-200",
                  "bg-teal-500",
                  "text-white"
                )}
              >
                <Tags className="w-8 h-8" />
              </div>

              <div className="flex-1 w-full">
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                  Filter Categories
                </h3>
                <p className="text-sm text-muted-foreground">
                  Managed from Equipment Master categories and used in Filter Register.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            className={cn(
              "bg-card rounded-lg border border-border p-6",
              "hover:border-accent hover:shadow-lg",
              "transition-all duration-200",
              "text-left group",
              "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            )}
            onClick={() => navigate("/e-log-book/filter/settings/register")}
          >
            <div className="flex flex-col items-start gap-4">
              <div
                className={cn(
                  "w-16 h-16 rounded-lg flex items-center justify-center",
                  "group-hover:scale-110 transition-transform duration-200",
                  "bg-slate-600",
                  "text-white"
                )}
              >
                <FilePlus2 className="w-8 h-8" />
              </div>

              <div className="flex-1 w-full">
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                  Filter Register
                </h3>
                <p className="text-sm text-muted-foreground">
                  Register new filters including make, model, serial number, size, micron rating and
                  certificate attachments.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            className={cn(
              "bg-card rounded-lg border border-border p-6",
              "hover:border-accent hover:shadow-lg",
              "transition-all duration-200",
              "text-left group",
              "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            )}
            onClick={() => navigate("/e-log-book/filter/settings/schedules")}
          >
            <div className="flex flex-col items-start gap-4">
              <div
                className={cn(
                  "w-16 h-16 rounded-lg flex items-center justify-center",
                  "group-hover:scale-110 transition-transform duration-200",
                  "bg-indigo-600",
                  "text-white"
                )}
              >
                <ClipboardCheck className="w-8 h-8" />
              </div>

              <div className="flex-1 w-full">
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                  Schedule Approvals
                </h3>
                <p className="text-sm text-muted-foreground">
                  Approve replacement, cleaning, and integrity schedules to start maintenance tracking.
                </p>
              </div>
            </div>
          </button>
        </div>
      </main>
    </div>
  );
};

export default FilterLogBookSettingsPage;


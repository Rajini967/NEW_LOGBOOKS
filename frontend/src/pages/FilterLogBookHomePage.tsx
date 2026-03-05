import React from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { NotebookText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const FilterLogBookHomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <Header
        title="Filter Log Book"
        subtitle="Select an option to manage filter logs and settings"
      />

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <button
            type="button"
            onClick={() => navigate("/e-log-book/filter/entry")}
            className={cn(
              "bg-card rounded-lg border border-border p-6",
              "hover:border-accent hover:shadow-lg",
              "transition-all duration-200",
              "text-left group",
              "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            )}
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
                <NotebookText className="w-8 h-8" />
              </div>

              <div className="flex-1 w-full">
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                  Filter Log Book Entry
                </h3>
                <p className="text-sm text-muted-foreground">
                  Manage filter installation, integrity, cleaning and replacement logs.
                </p>
              </div>

              <div className="w-full flex items-center justify-between text-sm text-accent group-hover:text-accent/80">
                <span className="font-medium">Open Entries</span>
                <span className="group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate("/e-log-book/filter/settings")}
            className={cn(
              "bg-card rounded-lg border border-border p-6",
              "hover:border-accent hover:shadow-lg",
              "transition-all duration-200",
              "text-left group",
              "focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
            )}
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
                <Settings className="w-8 h-8" />
              </div>

              <div className="flex-1 w-full">
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                  Filter Log Book Settings
                </h3>
                <p className="text-sm text-muted-foreground">
                  Configure filter categories, registration and future schedules.
                </p>
              </div>

              <div className="w-full flex items-center justify-between text-sm text-accent group-hover:text-accent/80">
                <span className="font-medium">Open Settings</span>
                <span className="group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterLogBookHomePage;


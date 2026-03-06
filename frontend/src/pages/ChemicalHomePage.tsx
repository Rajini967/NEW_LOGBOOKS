import React from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { Package, Link2, NotebookText } from "lucide-react";
import { cn } from "@/lib/utils";

const ChemicalHomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <Header
        title="Chemical Log Book"
        subtitle="Select an option to manage chemical stock, equipment assignments, and log entries"
      />

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <button
            type="button"
            onClick={() => navigate("/e-log-book/chemical/stock")}
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
                  "bg-amber-500",
                  "text-white"
                )}
              >
                <Package className="w-8 h-8" />
              </div>

              <div className="flex-1 w-full">
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                  Stock details
                </h3>
                <p className="text-sm text-muted-foreground">
                  View and manage chemical stock details.
                </p>
              </div>

              <div className="w-full flex items-center justify-between text-sm text-accent group-hover:text-accent/80">
                <span className="font-medium">Open</span>
                <span className="group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate("/e-log-book/chemical/assignment")}
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
                  "bg-indigo-500",
                  "text-white"
                )}
              >
                <Link2 className="w-8 h-8" />
              </div>

              <div className="flex-1 w-full">
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                  Equipment assignment
                </h3>
                <p className="text-sm text-muted-foreground">
                  Assign chemicals to equipment.
                </p>
              </div>

              <div className="w-full flex items-center justify-between text-sm text-accent group-hover:text-accent/80">
                <span className="font-medium">Open</span>
                <span className="group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate("/e-log-book/chemical/entry")}
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
                  "bg-green-500",
                  "text-white"
                )}
              >
                <NotebookText className="w-8 h-8" />
              </div>

              <div className="flex-1 w-full">
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-accent transition-colors">
                  Chemical log book entry
                </h3>
                <p className="text-sm text-muted-foreground">
                  Record and review chemical preparation details.
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
        </div>
      </div>
    </div>
  );
};

export default ChemicalHomePage;
